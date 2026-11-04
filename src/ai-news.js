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
  const batches=await Promise.all(FEEDS.map(async ([category,query])=>{
    const google="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=pt-BR&gl=BR&ceid=BR:pt-419";
    const bing="https://www.bing.com/news/search?q="+encodeURIComponent(query)+"&format=rss&setlang=pt-br&cc=BR";
    const primary=await fetchFeed(google,category,"Google News RSS").catch(e=>({items:[],error:String(e.message||e)}));
    if(primary.items.length)return primary.items;
    const fallback=await fetchFeed(bing,category,"Bing News RSS").catch(e=>({items:[],error:String(e.message||e)}));
    return fallback.items;
  }));
  const seen=new Set();
  return batches.flat().filter(item=>{
    const key=item.title.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,40);
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

export async function runAiNews(env) {
  const feeds=await enrichImages(await collectFeeds());
  if(!feeds.length)throw new Error("Nenhuma notícia foi recebida das fontes RSS (Google News e Bing News). Confira a disponibilidade dos feeds.");
  let saved=0,review=0;
  for(const item of feeds) {
    const cleanTitle=item.title.replace(/\s+/g," ").trim().slice(0,160);
    const cleanSummary=(item.description||"").replace(/\s+/g," ").trim().slice(0,300);
    const summary=cleanSummary||"O feed forneceu apenas o título desta notícia. Abra a fonte para consultar os detalhes.";
    const body=[
      "PAUTA AUTOMÁTICA PARA APURAÇÃO — NÃO É UMA MATÉRIA PRONTA",
      "",
      "O que o feed informa:",
      cleanSummary||"Não foi fornecido resumo pelo feed. Consulte o link original.",
      "",
      "ATENÇÃO EDITORIAL:",
      "Este registro foi criado automaticamente a partir de um feed RSS gratuito. O conteúdo não foi verificado por duas fontes independentes e não foi redigido por inteligência artificial. Não publique como notícia confirmada sem abrir a fonte, conferir a data, apurar os fatos e buscar confirmação independente.",
      "",
      "Fonte inicial: "+item.source,
      "Data informada pelo feed: "+(item.published||"Não informada"),
      "Link para conferência: "+item.url
    ].join("\n");
    const normalized=cleanTitle.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
    const fingerprint=btoa(unescape(encodeURIComponent(normalized))).replace(/[^a-zA-Z0-9]/g,"").slice(0,180);
    const now=new Date().toISOString();
    const source=[{name:item.source,url:item.url,image:item.image||""}];
    const inserted=await env.DB.prepare("INSERT OR IGNORE INTO ai_news_candidates (fingerprint,title,summary,body,category,confidence,sources_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'review',?,?)")
      .bind(fingerprint,cleanTitle,summary,body,item.category,"baixa",JSON.stringify(source),now,now).run();
    if(inserted.meta?.changes){saved++;review++;}
  }
  return {found:feeds.length,saved,review,published:0,mode:"rss_free"};
}
