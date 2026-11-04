const FEEDS = [
  ["Brasil","https://news.google.com/rss/search?q=Brasil+not%C3%ADcias&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Política","https://news.google.com/rss/search?q=pol%C3%ADtica+Brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Mundo","https://news.google.com/rss/search?q=not%C3%ADcias+mundo+internacional&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Economia","https://news.google.com/rss/search?q=economia+mercado+Brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Esportes","https://news.google.com/rss/search?q=esportes+futebol&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Tecnologia","https://news.google.com/rss/search?q=tecnologia+intelig%C3%AAncia+artificial&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Entretenimento","https://news.google.com/rss/search?q=entretenimento+cultura&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Saúde e ciência","https://news.google.com/rss/search?q=sa%C3%BAde+ci%C3%AAncia+pesquisa&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Segurança pública","https://news.google.com/rss/search?q=seguran%C3%A7a+p%C3%BAblica+Brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419"],
  ["Educação","https://news.google.com/rss/search?q=educa%C3%A7%C3%A3o+Brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419"]
];

function decodeXml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+name+">","i"));
  return m ? decodeXml(m[1]) : "";
}
async function collectFeeds() {
  const batches = await Promise.all(FEEDS.map(async ([category,url]) => {
    try {
      const res = await fetch(url,{headers:{"user-agent":"RADAR360-NewsBot/1.0"}});
      if (!res.ok) return [];
      const xml = await res.text();
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,5).map(m => ({
        category, title:tag(m[1],"title"), url:tag(m[1],"link"),
        published:tag(m[1],"pubDate"), description:tag(m[1],"description")
      })).filter(x=>x.title && x.url);
    } catch { return []; }
  }));
  const seen = new Set();
  return batches.flat().filter(item=>{
    const key=item.title.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim();
    if(seen.has(key)) return false; seen.add(key); return true;
  }).slice(0,35);
}
function extractOutputText(data) {
  for (const item of data.output || []) {
    if (item.type === "message") for (const c of item.content || []) if (c.type === "output_text") return c.text;
  }
  return "";
}
export async function runAiNews(env) {
  if (!env.OPENAI_API_KEY) throw new Error("Configure o secret OPENAI_API_KEY no Worker.");
  const feeds = await collectFeeds();
  if (!feeds.length) throw new Error("Nenhuma notícia foi recebida dos feeds nesta execução.");
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
  const prompt = "Você é a equipe de apuração do RADAR 360, portal brasileiro. Use a ferramenta de busca na web para investigar as pautas dos feeds abaixo. Só produza matéria se encontrar confirmação independente em pelo menos duas fontes confiáveis, preferindo documentos oficiais e veículos jornalísticos reconhecidos. Se não conseguir confirmar, omita a pauta. Não invente fatos, números, falas, datas ou fontes. Escreva texto jornalístico original em português brasileiro, sem copiar trechos das fontes. Separe fatos confirmados de contexto, informe datas e atribua informações no corpo do texto. Não trate conteúdo opinativo como fato. Não produza acusações não verificadas, rumores, previsões como fatos, nem matérias sobre tragédias com detalhes gráficos. Inclua URLs reais das fontes consultadas. Confidence deve refletir a qualidade da evidência; nunca use 1 por padrão. Gere no máximo 8 matérias realmente distintas. Se não houver confirmação suficiente, retorne stories vazio.\n\nPAUTAS RECEBIDAS (são pistas, não prova):\n"+JSON.stringify(feeds);
  const response = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",headers:{"authorization":"Bearer "+env.OPENAI_API_KEY,"content-type":"application/json"},
    body:JSON.stringify({
      model:env.OPENAI_NEWS_MODEL || "gpt-4.1-mini",
      tools:[{type:"web_search"}],
      input:prompt,
      text:{format:{type:"json_schema",name:"radar360_verified_news",strict:true,schema}}
    })
  });
  if(!response.ok) throw new Error("OpenAI API retornou HTTP "+response.status+": "+(await response.text()).slice(0,500));
  const data=await response.json();
  const output=extractOutputText(data);
  if(!output) throw new Error("A IA não retornou matérias estruturadas.");
  const parsed=JSON.parse(output);
  let saved=0, review=0, published=0;
  for(const story of parsed.stories.slice(0,8)){
    const sources=Array.isArray(story.sources)?story.sources.filter(s=>/^https?:\/\//i.test(s.url)&&s.name):[];
    if(sources.length<2 || story.title.length<12 || story.body.length<300) continue;
    const fingerprint=btoa(unescape(encodeURIComponent(story.title.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim()))).replace(/[^a-zA-Z0-9]/g,"").slice(0,180);
    const now=new Date().toISOString();
    const inserted=await env.DB.prepare("INSERT OR IGNORE INTO ai_news_candidates (fingerprint,title,summary,body,category,confidence,sources_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'review',?,?)")
      .bind(fingerprint,story.title.slice(0,160),story.summary.slice(0,300),story.body.slice(0,100000),story.category,Math.max(0,Math.min(1,Number(story.confidence)||0)),JSON.stringify(sources.slice(0,8)),now,now).run();
    if(inserted.meta?.changes){saved++;review++;}
  }
  return {found:feeds.length,saved,review,published};
}
