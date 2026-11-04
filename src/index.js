import { runAiNews } from "./ai-news.js";
const COOKIE = "radar_session";
const SESSION_SECONDS = 60 * 60 * 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
const fail = (message, status = 400) => json({ error: message }, status);
const safeEqual = (a, b) => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
};
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const fromB64url = (value) => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function verifyPassword(password, env) {
  if (!env.ADMIN_PASSWORD_SALT || !env.ADMIN_PASSWORD_HASH) return false;
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt:fromB64url(env.ADMIN_PASSWORD_SALT), iterations:100000, hash:"SHA-256" }, material, 256);
  return safeEqual(b64url(bits), env.ADMIN_PASSWORD_HASH);
}
async function createSession(env) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ exp: Math.floor(Date.now()/1000) + SESSION_SECONDS, role:"admin" })));
  return payload + "." + await hmac(payload, env.SESSION_SECRET);
}
async function isAdmin(request, env) {
  const raw = request.headers.get("Cookie") || "";
  const token = raw.split(";").map(v=>v.trim()).find(v=>v.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  if (!token || !env.SESSION_SECRET) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, await hmac(payload, env.SESSION_SECRET))) return false;
  try { const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))); return data.role === "admin" && data.exp > Date.now()/1000; } catch { return false; }
}
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return origin === new URL(request.url).origin;
}
function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100);
}
async function handleApi(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{"allow":"GET,POST,PUT,DELETE,OPTIONS"}});
  if (path === "/api/health" && request.method === "GET") return json({ok:true,service:"RADAR 360 API"});
  if (path.startsWith("/media/") && request.method === "GET") {
    const key = decodeURIComponent(path.slice(7));
    if (!key || key.includes("..") || key.includes("\\\\")) return fail("Imagem não encontrada.",404);
    const object = await env.IMAGES.get(key);
    if (!object) return fail("Imagem não encontrada.",404);
    const headers = new Headers(); object.writeHttpMetadata(headers);
    headers.set("etag",object.httpEtag); headers.set("cache-control","public, max-age=86400");
    return new Response(object.body,{headers});
  }
  if (path === "/api/login" && request.method === "POST") {
    if (!sameOrigin(request)) return fail("Origem inválida.",403);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const body = await request.json().catch(()=>null);
    if (!body || typeof body.password !== "string" || body.password.length > 200) return fail("Informe a senha.");
    const allowed = await env.DB.prepare("SELECT count(*) AS n FROM login_attempts WHERE ip = ? AND attempted_at > datetime('now','-15 minutes')").bind(ip).first().catch(()=>({n:0}));
    if ((allowed?.n || 0) >= 8) return fail("Muitas tentativas. Aguarde 15 minutos.",429);
    const valid = await verifyPassword(body.password,env);
    await env.DB.prepare("INSERT INTO login_attempts (ip, success) VALUES (?, ?)").bind(ip, valid ? 1 : 0).run().catch(()=>{});
    if (!valid) return fail("Senha incorreta.",401);
    await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run().catch(()=>{});
    const token = await createSession(env);
    return json({ok:true},200,{"set-cookie":COOKIE+"="+token+"; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age="+SESSION_SECONDS});
  }
  if (path === "/api/logout" && request.method === "POST") return json({ok:true},200,{"set-cookie":COOKIE+"=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"});

  if (path === "/api/session" && request.method === "GET") return json({authenticated:await isAdmin(request,env)});
  if (path === "/api/admin/ai/status" && request.method === "GET") {
    if (!await isAdmin(request,env)) return fail("Acesso não autorizado.",401);
    const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM ai_news_candidates WHERE status='review'").first();
    const latest=await env.DB.prepare("SELECT * FROM ai_news_runs ORDER BY id DESC LIMIT 1").first();
    return json({configured:Boolean(env.OPENAI_API_KEY),pending:pending?.n||0,latest});
  }
  if (path === "/api/admin/ai/candidates" && request.method === "GET") {
    if (!await isAdmin(request,env)) return fail("Acesso não autorizado.",401);
    const rows=await env.DB.prepare("SELECT id,title,summary,body,category,confidence,sources_json,status,created_at FROM ai_news_candidates WHERE status='review' ORDER BY created_at DESC LIMIT 50").all();
    return json({candidates:rows.results||[]});
  }
  if (path === "/api/admin/ai/run" && request.method === "POST") {
    if (!await isAdmin(request,env)) return fail("Acesso não autorizado.",401);
    const now=new Date().toISOString();
    const run=await env.DB.prepare("INSERT INTO ai_news_runs(started_at,status) VALUES (?,'running')").bind(now).run();
    try {
      const result=await runAiNews(env);
      await env.DB.prepare("UPDATE ai_news_runs SET finished_at=?,status='completed',found_count=?,review_count=?,published_count=? WHERE id=?")
        .bind(new Date().toISOString(),result.found,result.review,result.published,run.meta.last_row_id).run();
      return json({ok:true,...result});
    } catch(error) {
      await env.DB.prepare("UPDATE ai_news_runs SET finished_at=?,status='failed',error_message=? WHERE id=?")
        .bind(new Date().toISOString(),String(error.message||error).slice(0,500),run.meta.last_row_id).run();
      throw error;
    }
  }
  const aiDecision=path.match(/^\/api\/admin\/ai\/candidates\/(\d+)\/(approve|reject)$/);
  if(aiDecision && request.method==="POST"){
    if(!await isAdmin(request,env)) return fail("Acesso não autorizado.",401);
    const candidate=await env.DB.prepare("SELECT * FROM ai_news_candidates WHERE id=? AND status='review'").bind(Number(aiDecision[1])).first();
    if(!candidate) return fail("Pauta não encontrada ou já processada.",404);
    if(aiDecision[2]==="reject"){
      await env.DB.prepare("UPDATE ai_news_candidates SET status='rejected',updated_at=? WHERE id=?").bind(new Date().toISOString(),candidate.id).run();
      return json({ok:true});
    }
    const slug=slugify(candidate.title)+"-"+crypto.randomUUID().slice(0,8);
    const now=new Date().toISOString();
    const sources=JSON.parse(candidate.sources_json);
    const body=candidate.body+"\\n\\nFontes consultadas:\\n"+sources.map(s=>s.name+": "+s.url).join("\\n");
    const coverImage=sources.find(s=>typeof s.image==="string"&&/^https?:\\/\\//i.test(s.image))?.image||null;
    const inserted=await env.DB.prepare("INSERT INTO articles(title,slug,summary,body,category,status,author,cover_image,created_at,updated_at,published_at) VALUES(?,?,?,?,?,'published','Redação RADAR 360',?,?,?,?)")
      .bind(candidate.title,slug,candidate.summary,body,candidate.category,coverImage,now,now,now).run();
    await env.DB.prepare("UPDATE ai_news_candidates SET status='published',article_id=?,updated_at=? WHERE id=?").bind(inserted.meta.last_row_id,now,candidate.id).run();
    return json({ok:true,slug});
  }
  if (path === "/api/news" && request.method === "GET") {
    const category = url.searchParams.get("category");
    const q = url.searchParams.get("q");
    let query = "SELECT id,title,slug,summary,category,cover_image,author,published_at FROM articles WHERE status='published'";
    const params = [];
    if (category) { query += " AND category = ?"; params.push(category); }
    if (q) { query += " AND (title LIKE ? OR summary LIKE ?)"; params.push("%"+q.slice(0,80)+"%","%"+q.slice(0,80)+"%"); }
    query += " ORDER BY published_at DESC LIMIT 50";
    const result = await env.DB.prepare(query).bind(...params).all();
    return json({articles:result.results || []},200,{"cache-control":"public, max-age=60"});
  }
  const detail = path.match(/^\/api\/news\/([a-z0-9-]+)$/);
  if (detail && request.method === "GET") {
    const article = await env.DB.prepare("SELECT title,slug,summary,body,category,cover_image,author,published_at FROM articles WHERE slug=? AND status='published'").bind(detail[1]).first();
    return article ? json({article},200,{"cache-control":"public, max-age=60"}) : fail("Matéria não encontrada.",404);
  }
  if (path.startsWith("/api/admin/")) {
    if (!await isAdmin(request,env)) return fail("Acesso não autorizado.",401);
    if (!sameOrigin(request)) return fail("Origem inválida.",403);
    if (path === "/api/admin/news" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM articles ORDER BY updated_at DESC LIMIT 200").all();
      return json({articles:rows.results || []});
    }
    if (path === "/api/admin/news" && request.method === "POST") {
      const body = await request.json().catch(()=>null);
      if (!body || typeof body.title !== "string" || body.title.trim().length < 8 || body.title.length > 160) return fail("O título deve ter entre 8 e 160 caracteres.");
      if (typeof body.body !== "string" || body.body.trim().length < 40 || body.body.length > 100000) return fail("O texto da matéria deve ter pelo menos 40 caracteres.");
      const category = String(body.category || "Brasil").slice(0,40);
      const status = ["draft","review","published"].includes(body.status) ? body.status : "draft";
      const slug = slugify(body.title) + "-" + crypto.randomUUID().slice(0,8);
      const author = String(body.author || "Redação RADAR 360").slice(0,80);
      const summary = String(body.summary || "").slice(0,300);
      const now = new Date().toISOString();
      await env.DB.prepare("INSERT INTO articles (title,slug,summary,body,category,status,author,cover_image,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(body.title.trim(),slug,summary,body.body.trim(),category,status,author,body.cover_image||null,now,now,status==="published"?now:null).run();
      return json({ok:true,slug},201);
    }
    const articleId = path.match(/^\/api\/admin\/news\/(\d+)$/);
    if (articleId && request.method === "PUT") {
      const body = await request.json().catch(()=>null);
      if (!body || typeof body.title !== "string" || typeof body.body !== "string") return fail("Dados incompletos.");
      const status = ["draft","review","published"].includes(body.status) ? body.status : "draft";
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE articles SET title=?,summary=?,body=?,category=?,status=?,cover_image=COALESCE(?,cover_image),updated_at=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE NULL END WHERE id=?").bind(body.title.trim().slice(0,160),String(body.summary||"").slice(0,300),body.body.trim().slice(0,100000),String(body.category||"Brasil").slice(0,40),status,body.cover_image||null,now,status,now,Number(articleId[1])).run();
      return json({ok:true});
    }
    if (articleId && request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM articles WHERE id=?").bind(Number(articleId[1])).run();
      return json({ok:true});
    }
    if (path === "/api/admin/upload" && request.method === "POST") {
      const form = await request.formData(), file = form.get("image");
      if (!(file instanceof File) || !ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) return fail("Envie uma imagem JPG, PNG, WebP ou AVIF de até 5 MB.");
      const ext = ({ "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif" })[file.type];
      const key = "news/"+crypto.randomUUID()+"."+ext;
      await env.IMAGES.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:"public, max-age=31536000, immutable"}});
      return json({ok:true,key});
    }
  }
  return fail("Rota não encontrada.",404);
}
export default {
  async scheduled(controller,env,ctx) {
    const now=new Date().toISOString();
    const run=await env.DB.prepare("INSERT INTO ai_news_runs(started_at,status) VALUES (?,'running')").bind(now).run();
    try {
      const result=await runAiNews(env);
      await env.DB.prepare("UPDATE ai_news_runs SET finished_at=?,status='completed',found_count=?,review_count=?,published_count=? WHERE id=?")
        .bind(new Date().toISOString(),result.found,result.review,result.published,run.meta.last_row_id).run();
    } catch(error) {
      console.error("RADAR AI scheduled error",error);
      await env.DB.prepare("UPDATE ai_news_runs SET finished_at=?,status='failed',error_message=? WHERE id=?")
        .bind(new Date().toISOString(),String(error.message||error).slice(0,500),run.meta.last_row_id).run();
    }
  },
  async fetch(request,env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/media/") && request.method === "GET") {
      try {
        const key = decodeURIComponent(url.pathname.slice(7));
        if (!key || key.includes("..") || key.includes("\\\\")) return fail("Imagem não encontrada.",404);
        const object = await env.IMAGES.get(key);
        if (!object) return fail("Imagem não encontrada.",404);
        const headers = new Headers(); object.writeHttpMetadata(headers);
        headers.set("etag",object.httpEtag); headers.set("cache-control","public, max-age=86400");
        return new Response(object.body,{headers});
      } catch (error) { console.error("RADAR media error",error); return fail("Imagem não encontrada.",404); }
    }
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request,env); }
      catch (error) { console.error("RADAR API error",error); return fail("Não foi possível concluir a operação.",500); }
    }
    return env.ASSETS.fetch(request);
  }
};