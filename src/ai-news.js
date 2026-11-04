const FEEDS = [
  ["Brasil","Brasil notícias"],["Política","política Brasil"],["Mundo","notícias mundo internacional"],
  ["Economia","economia mercado Brasil"],["Esportes","esportes futebol"],["Tecnologia","tecnologia inteligência artificial"],
  ["Entretenimento","entretenimento cultura"],["Saúde e ciência","saúde ciência pesquisa"],
  ["Segurança pública","segurança pública Brasil"],["Educação","educação Brasil"]
];
function decodeXml(value) {
  return String(value||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function tag(xml,name) {
  const m=xml.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+name+">","i"));
  return m?decodeXml(m[1]):"";
}
function attr(markup,name) {
  const re=/([a-zA-Z_:][\w:.-]*)\s*=\s*["']([^"']+)["']/g;
  for(const m of markup.matchAll(re)) if(m[1].toLowerCase()===name.toLowerCase()) return m[2];
  return "";
}
function imageFromMarkup(markup,baseUrl) {
  const candidates=[
    markup.match(/<media:content\b[^>]*>/i)?.[0],
    markup.match(/<media:thumbnail\b[^>]*>/i)?.[0],
    [...markup.matchAll(/<enclosure\b[^>]*>/gi)].map(x=>x[0]).find(x=>/image/i.test(attr(x,"type"))),
    markup.match(/<img\b[^>]*>/i)?.[0]
  ].filter(Boolean);
  for(const tagText of candidates){
    const raw=attr(tagText,"url")||attr(tagText,"src");
    if(raw){try{const url=new URL(decodeXml(raw),baseUrl);if(["http:","https:"].includes(url.protocol))return url.href}catch{}}
  }
  return "";
}
function feedItems(xml,category,provider) {
  const rss=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  const atom=[...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map(m=>m[1]);
  return (rss.length?rss:atom).slice(0,6).map(item=>{
    const title=tag(item,"title");
    const link=tag(item,"link")||item.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]||"";
    const url=decodeXml(link);
    const description=tag(item,"description")||tag(item,"summary");
    return {category,title,url,published:tag(item,"pubDate")||tag(item,"published")||tag(item,"updated"),description,source:tag(item,"source")||provider,image:imageFromMarkup(item,url)};
  }).filter(x=>x.title&&/^https?:\/\//i.test(x.url));
}
async function pageImage(url) {
  try {
    const initial = new URL(url);
    if (initial.protocol !== "https:") return "";
    const response = await fetch(initial.href, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; RADAR360Bot/1.0; +https://radar-360.stivy-071.workers.dev)", "accept": "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok || !/html|xml/i.test(response.headers.get("content-type") || "")) return "";
    const finalUrl = new URL(response.url || initial.href);
    if (finalUrl.protocol !== "https:" || /(^|\.)(google|bing)\.com$|news\.google\.com$|bing\.net$/i.test(finalUrl.hostname)) return "";
    const html = (await response.text()).slice(0, 350000);
    const candidates = [];
    for (const tagText of [...html.matchAll(/<meta\b[^>]*>/gi)].map(x => x[0])) {
      const key = (attr(tagText, "property") || attr(tagText, "name")).toLowerCase();
      if (["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(key)) {
        const raw = attr(tagText, "content");
        if (raw) candidates.push(raw);
      }
    }
    const imageLink = html.match(/<link\b[^>]*rel=["'][^"']*image_src[^"']*["'][^>]*>/i)?.[0];
    if (imageLink) candidates.push(attr(imageLink, "href"));
    for (const match of html.matchAll(/"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/gi)) candidates.push(match[1] || match[2]);
    for (const raw of candidates) {
      try {
        const image = new URL(raw.replace(/&amp;/g, "&").replace(/\\u0026/g, "&"), finalUrl);
        if (image.protocol === "https:" && !/\.svg(\?|$)/i.test(image.href)) return image.href;
      } catch {}
    }
  } catch {}
  return "";
}
async function enrichImages(items) {
  const targets=items.slice(0,24);
  for(let i=0;i<targets.length;i+=4){
    await Promise.all(targets.slice(i,i+4).map(async item=>{if(!item.image)item.image=await pageImage(item.url)}));
  }
  return items;
}
async function fetchFeed(url,category,provider) {
  const response=await fetch(url,{headers:{"accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"}});
  if(!response.ok)return {items:[],error:"HTTP "+response.status};
  const xml=await response.text(),items=feedItems(xml,category,provider);
  return {items,error:items.length?null:"feed respondeu sem itens RSS/Atom"};
}
async function collectFeeds() {
  const batches = await Promise.all(FEEDS.map(async ([category, query]) => {
    const google = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
    const bing = "https://www.bing.com/news/search?q=" + encodeURIComponent(query) + "&format=rss&setlang=pt-br&cc=BR";
    const results = await Promise.all([
      fetchFeed(google, category, "Google News RSS").catch(() => ({ items: [] })),
      fetchFeed(bing, category, "Bing News RSS").catch(() => ({ items: [] }))
    ]);
    return results.flatMap(result => result.items);
  }));
  const seen = new Set();
  return batches.flat().filter(item => {
    const key = normalizeHeadline(item.title) + "|" + String(item.source || "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 100);
}
function normalizeHeadline(value) {
  return String(value||"").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
}
export async function findOriginalPublisherImage(title, category) {
  const cleanTitle = String(title || "").replace(/\s+/g, " ").trim().slice(0, 150);
  if (!cleanTitle) return "";
  const queries = [...new Set(['"' + cleanTitle + '"', cleanTitle, cleanTitle + " " + String(category || "")])];
  const feeds = await Promise.all(queries.map(async query => {
    const encoded = encodeURIComponent(query);
    const urls = [
      "https://www.bing.com/news/search?q=" + encoded + "&format=rss&setlang=pt-br&cc=BR",
      "https://news.google.com/rss/search?q=" + encoded + "&hl=pt-BR&gl=BR&ceid=BR:pt-419"
    ];
    const results = await Promise.all(urls.map(async rss => {
      try {
        const response = await fetch(rss, { headers: { "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(5500) });
        if (!response.ok) return [];
        return feedItems(await response.text(), category || "Brasil", "Busca de notícias");
      } catch { return []; }
    }));
    return results.flat();
  }));
  const targetWords = new Set(normalizeHeadline(cleanTitle).split(" ").filter(word => word.length > 2));
  const unique = new Map();
  for (const item of feeds.flat()) {
    const key = item.url || item.title;
    if (!unique.has(key)) unique.set(key, item);
  }
  const ranked = [...unique.values()].map(item => {
    const words = new Set(normalizeHeadline(item.title).split(" ").filter(word => word.length > 2));
    const overlap = [...words].filter(word => targetWords.has(word)).length;
    return { ...item, score: overlap / Math.max(1, Math.min(words.size, targetWords.size)) };
  }).filter(item => item.score >= 0.58).sort((a, b) => b.score - a.score);
  for (const item of ranked.slice(0, 8)) {
    if (!item.url) continue;
    const image = await pageImage(item.url);
    if (image) return image;
  }
  return "";
}

const TRUSTED_PUBLISHERS = [
  "agencia brasil","g1","globo","o globo","folha de s paulo","folha","estadao","estado de s paulo","uol","cnn brasil","bbc","reuters","associated press","ap news","afp","dw","deutsche welle","france 24","poder360","nexo","valor economico","infomoney","exame","veja","carta capital","agencia senado","agencia camara","senado","camara dos deputados","gov.br","ministerio da saude","fiocruz","inpe","ibge","banco central","ge","ge globo","espn","lance","terra","tecmundo","canaltech","olhar digital","techcrunch","wired","nature","science","el pais","the guardian","the new york times","the washington post","al jazeera","sky news","euronews","marca","as"
];
function trustedPublisher(name) {
  const normalized = normalizeHeadline(name);
  if (!normalized || normalized.includes("google news") || normalized.includes("bing news")) return false;
  return TRUSTED_PUBLISHERS.some(known => normalized === known || normalized.includes(known));
}
function storySimilarity(a, b) {
  const stop = new Set(["para","com","uma","das","dos","que","por","sobre","após","entre","the","and","from","this","that","brasil","brasileiro","brasileira","hoje"]);
  const aa = new Set(normalizeHeadline(a).split(" ").filter(w => w.length > 2 && !stop.has(w)));
  const bb = new Set(normalizeHeadline(b).split(" ").filter(w => w.length > 2 && !stop.has(w)));
  if (!aa.size || !bb.size) return 0;
  const common = [...aa].filter(w => bb.has(w)).length;
  return common / Math.max(1, Math.min(aa.size, bb.size));
}
async function writeNewsSummary(env, title, items) {
  const evidence = items.map((item, index) =>
    (index + 1) + ". Veículo: " + item.source + "\nManchete: " + item.title + "\nTrecho do feed: " + String(item.description || "").slice(0, 650)
  ).join("\n\n").slice(0, 6500);
  if (env.AI) {
    try {
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
        messages: [
          { role: "system", content: "Você é editor de um portal jornalístico brasileiro. Escreva em português claro, neutro e objetivo. Use somente fatos explícitos nos trechos fornecidos. Não invente datas, números, nomes, causas, citações ou contexto. Se os trechos não sustentarem uma informação, omita-a. Não transforme alegações em fatos confirmados. Produza um resumo jornalístico de 2 a 3 parágrafos, sem título e sem mencionar inteligência artificial." },
          { role: "user", content: "Manchete principal: " + title + "\n\nRelatos publicados por veículos distintos:\n" + evidence + "\n\nRedija apenas um resumo fiel ao material fornecido." }
        ],
        temperature: 0.1,
        max_tokens: 260
      });
      const text = String(result?.response || "").trim();
      if (text.length >= 100 && text.length <= 1800) return text;
    } catch (error) {
      console.warn("RADAR AI summary fallback:", String(error));
    }
  }
  const excerpts = [...new Set(items.map(item => String(item.description || "").trim()).filter(Boolean))].slice(0, 3);
  return excerpts.length ? excerpts.join("\n\n").slice(0, 1400) : "Os veículos listados publicaram reportagens sobre este assunto. Consulte os links das fontes para obter os detalhes completos.";
}
export async function runAiNews(env) {
  const feeds = await collectFeeds();
  if (!feeds.length) throw new Error("Nenhuma notícia foi recebida dos feeds de Google News e Bing News.");
  const nowMs = Date.now();
  const fresh = feeds.filter(item => {
    const time = Date.parse(item.published || "");
    return Number.isFinite(time) && time <= nowMs + 60 * 60 * 1000 && nowMs - time <= 36 * 60 * 60 * 1000;
  });
  const clusters = [];
  for (const item of fresh) {
    const publisher = String(item.source || "").trim();
    if (!trustedPublisher(publisher)) continue;
    let cluster = clusters.find(group => group.category === item.category && storySimilarity(group.items[0].title, item.title) >= 0.68);
    if (!cluster) {
      cluster = { category: item.category, items: [] };
      clusters.push(cluster);
    }
    if (!cluster.items.some(existing => normalizeHeadline(existing.source) === normalizeHeadline(publisher))) cluster.items.push(item);
  }
  let published = 0, review = 0, saved = 0;
  for (const cluster of clusters) {
    const sources = cluster.items.filter(item => trustedPublisher(item.source));
    const uniquePublishers = new Set(sources.map(item => normalizeHeadline(item.source)));
    if (uniquePublishers.size < 2) continue;
    const lead = sources[0];
    const title = lead.title.replace(/\s+/g, " ").trim().slice(0, 160);
    const summary = await writeNewsSummary(env, title, sources);
    const sourceList = sources.map(item => ({ name: item.source, url: item.url })).filter(source => /^https:\/\//i.test(source.url));
    const uniqueSources = [...new Map(sourceList.map(source => [normalizeHeadline(source.name), source])).values()];
    if (uniqueSources.length < 2) continue;
    const body = [
      summary,
      "",
      "Esta matéria foi preparada a partir de relatos publicados por veículos jornalísticos independentes. A confirmação definitiva dos fatos depende da apuração e das atualizações das fontes.",
      "",
      "Fontes consultadas:",
      ...uniqueSources.map(source => source.name + ": " + source.url)
    ].join("\n");
    const normalized = normalizeHeadline(title);
    const fingerprint = btoa(unescape(encodeURIComponent(normalized))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 180);
    const now = new Date().toISOString();
    const candidate = await env.DB.prepare("INSERT OR IGNORE INTO ai_news_candidates (fingerprint,title,summary,body,category,confidence,sources_json,status,created_at,updated_at) VALUES (?,?,?,?,?,? ,?,'review',?,?)")
      .bind(fingerprint, title, summary.slice(0, 300), body, cluster.category, "alta — duas ou mais fontes editoriais", JSON.stringify(uniqueSources), now, now).run();
    if (!candidate.meta?.changes) continue;
    saved++;
    const slug = normalizeHeadline(title).replace(/\s+/g, "-").slice(0, 90) + "-" + crypto.randomUUID().slice(0, 8);
    const inserted = await env.DB.prepare("INSERT INTO articles(title,slug,summary,body,category,status,author,cover_image,created_at,updated_at,published_at) VALUES(?,?,?,?,?,'published','Redação RADAR 360',NULL,?,?,?)")
      .bind(title, slug, summary.slice(0, 300), body, cluster.category, now, now, now).run();
    await env.DB.prepare("UPDATE ai_news_candidates SET status='published',article_id=?,updated_at=? WHERE id=?")
      .bind(inserted.meta.last_row_id, now, candidate.meta.last_row_id).run();
    published++;
  }
  return { found: feeds.length, saved, review, published, corroborated: published, mode: "automatic_multi_source" };
}
