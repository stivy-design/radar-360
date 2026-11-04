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
  try{
    const response=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 (compatible; RADAR360Bot/1.0)","accept":"text/html"},redirect:"follow",signal:AbortSignal.timeout(5000)});
    if(!response.ok)return "";
    const html=(await response.text()).slice(0,180000);
    const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]);
    for(const tagText of meta){
      const key=(attr(tagText,"property")||attr(tagText,"name")).toLowerCase();
      if(key==="og:image"||key==="twitter:image"){
        const raw=attr(tagText,"content");
        if(raw){const image=new URL(raw,url);if(["http:","https:"].includes(image.protocol))return image.href}
      }
    }
  }catch{}
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
