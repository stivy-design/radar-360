const FEEDS = [
  ["Brasil","Brasil notícias"],
  ["Política","política Brasil"],
  ["Mundo","notícias mundo internacional"],
  ["Economia","economia mercado Brasil"],
  ["Esportes","esportes futebol"],
  ["Tecnologia","tecnologia inteligência artificial"],
  ["Entretenimento","entretenimento cultura"],
  ["Saúde e ciência","saúde ciência pesquisa"],
  ["Segurança pública","segurança pública Brasil"],
  ["Educação","educação Brasil"]
];

function decodeXml(value) {
  return value.replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&#(\\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/<[^>]*>/g," ").replace(/\\s+/g," ").trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp("<"+name+"(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)</"+name+">","i"));
  return m ? decodeXml(m[1]) : "";
}
function feedItems(xml, category) {
  const rss = [...xml.matchAll(/<item(?:\\s[^>]*)?>([\\s\\S]*?)<\\/item>/gi)].map(m=>m[1]);
  const atom = [...xml.matchAll(/<entry(?:\\s[^>]*)?>([\\s\\S]*?)<\\/entry>/gi)].map(m=>m[1]);
  return (rss.length ? rss : atom).slice(0,6).map(item=>{
    const title=tag(item,"title");
    const link=tag(item,"link") || item.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
    return {category,title,url:decodeXml(link),published:tag(item,"pubDate")||tag(item,"published")||tag(item,"updated"),description:tag(item,"description")||tag(item,"summary")};
  }).filter(x=>x.title && /^https?:\\/\\//i.test(x.url));
}
async function fetchFeed(url, category) {
  const response=await fetch(url,{headers:{"accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"}});
  if(!response.ok) return {items:[],error:"HTTP "+response.status};
  const xml=await response.text();
  const items=feedItems(xml,category);
  return {items,error:items.length ? null : "feed respondeu sem itens RSS/Atom"};
}
async function collectFeeds() {
  const batches=await Promise.all(FEEDS.map(async ([category,query])=>{
    const google="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=pt-BR&gl=BR&ceid=BR:pt-419";
    const bing="https://www.bing.com/news/search?q="+encodeURIComponent(query)+"&format=rss&setlang=pt-br&cc=BR";
    const primary=await fetchFeed(google,category).catch(e=>({items:[],error:String(e.message||e)}));
    if(primary.items.length) return primary.items;
    const fallback=await fetchFeed(bing,category).catch(e=>({items:[],error:String(e.message||e)}));
    return fallback.items;
  }));
  const seen=new Set();
  return batches.flat().filter(item=>{
    const key=item.title.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
    if(seen.has(key)) return false; seen.add(key); return true;
  }).slice(0,40);
}
function extractOutputText(data) {
  for (const item of data.output || []) {
    if (item.type === "message") for (const c of item.content || []) if (c.type === "output_text") return c.text;
  }
  return "";
}
export async function runAiNews(env) {
  if (!env.OPENAI_API_KEY) throw new Error("Configure o secret OPENAI_API_KEY no Worker.");
  const feeds=await collectFeeds();
  if(!feeds.length) throw new Error("Nenhuma notícia foi recebida das fontes RSS (Google News e Bing News). A coleta não conseguiu acessar ou interpretar os feeds.");
  const schema = {
    type:"object", additionalProperties:false, required:["stories"],
    properties:{stories:{type:"array",items:{
      type:"object",additionalProperties:false,
      required:["title","summary","body","category","sources","confidence","editorial_note"],
      properties:{
        title:{type:"string"},summary:{type:"string"},body:{type:"string"},
        category:{type:"string",enum:["Brasil","Mundo","Política","Economia","Esportes","Tecnologia","Entretenimento","Saúde e ciência","Segurança pública","Educação"]},
        sources:{type:"array",items:{type:"object",additionalProperties:false,required:["name","url"],properties:{name:{type:"string"},url:{type:"string"}}}},
        confidence:{type:"number"},editorial_note:{type:"string"}
      }
    }}}
  };
  const prompt = "Você é a equipe de apuração do RADAR 360, portal brasileiro. Use a ferramenta de busca na web para investigar as pautas dos feeds abaixo. Só produza matéria se encontrar confirmação independente em pelo menos duas fontes confiáveis, preferindo documentos oficiais e veículos jornalísticos reconhecidos. Se não conseguir confirmar, omita a pauta. Não invente fatos, números, falas, datas ou fontes. Escreva texto jornalístico original em português brasileiro, sem copiar trechos das fontes. Separe fatos confirmados de contexto, informe datas e atribua informações no corpo do texto. Não trate conteúdo opinativo como fato. Não produza acusações não verificadas, rumores, previsões como fatos, nem matérias sobre tragédias com detalhes gráficos. Inclua URLs reais das fontes consultadas. Confidence deve refletir a qualidade da evidência; nunca use 1 por padrão. Gere no máximo 8 matérias realmente distintas. Se não houver confirmação suficiente, retorne stories vazio.\\n\\nPAUTAS RECEBIDAS (são pistas, não prova):\\n"+JSON.stringify(feeds);
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",headers:{"authorization":"Bearer "+env.OPENAI_API_KEY,"content-type":"application/json"},
    body:JSON.stringify({model:env.OPENAI_NEWS_MODEL||"gpt-4.1-mini",tools:[{type:"web_search"}],input:prompt,text:{format:{type:"json_schema",name:"radar360_verified_news",strict:true,schema}})
  });
  if(!response.ok) throw new Error("OpenAI API retornou HTTP "+response.status+": "+(await response.text()).slice(0,500));
  const data=await response.json();
  const output=extractOutputText(data);
  if(!output) throw new Error("A IA não retornou matérias estruturadas.");
  const parsed=JSON.parse(output);
  let saved=0,review=0,published=0;
  for(const story of parsed.stories.slice(0,8)){
    const sources=Array.isArray(story.sources)?story.sources.filter(s=>/^https?:\\/\\//i.test(s.url)&&s.name):[];
    if(sources.length<2||story.title.length<12||story.body.length<300) continue;
    const fingerprint=btoa(unescape(encodeURIComponent(story.title.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim()))).replace(/[^a-zA-Z0-9]/g,"").slice(0,180);
    const now=new Date().toISOString();
    const inserted=await env.DB.prepare("INSERT OR IGNORE INTO ai_news_candidates (fingerprint,title,summary,body,category,confidence,sources_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'review',?,?)")
      .bind(fingerprint,story.title.slice(0,160),story.summary.slice(0,300),story.body.slice(0,100000),story.category,Math.max(0,Math.min(1,Number(story.confidence)||0)),JSON.stringify(sources.slice(0,8)),now,now).run();
    if(inserted.meta?.changes){saved++;review++;}
  }
  return {found:feeds.length,saved,review,published};
}
