(() => {
'use strict';
const root=document.getElementById('article');
const year=document.getElementById('year');
if(year)year.textContent=new Date().getFullYear();
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const slug=new URLSearchParams(window.location.search).get('slug');
const imageUrl=value=>{
 if(!value)return '';
 if(/^https?:\/\//i.test(value))return value;
 return '/media/'+value.split('/').map(encodeURIComponent).join('/');
};
function sourceLinks(body){
 const matches=[...String(body||'').matchAll(/(?:Link para conferência|Fonte consultada|Fonte):\s*(https?:\/\/[^\s]+)/gi)];
 return [...new Set(matches.map(m=>m[1].replace(/[),.;]+$/,'')))];
}
async function load(){
 if(!root)return;
 if(!slug){root.innerHTML='<div class="article-error"><h1>Matéria não encontrada</h1><a href="/">Voltar ao portal</a></div>';return;}
 try{
  const response=await fetch('/api/news/'+encodeURIComponent(slug),{headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error('A matéria não foi localizada (HTTP '+response.status+').');
  const payload=await response.json();
  const a=payload.article;
  if(!a)throw new Error('A API não retornou o conteúdo da matéria.');
  document.title=a.title+' — RADAR 360';
  const image=imageUrl(a.cover_image);
  const sources=sourceLinks(a.body);
  const body=String(a.body||'').replace(/\n{3,}/g,'\n\n');
  root.innerHTML=
   '<a class="article-back" href="/">← Voltar às notícias</a>'+
   '<p class="category" style="margin-top:25px">'+esc(a.category).toUpperCase()+'</p>'+
   '<h1>'+esc(a.title)+'</h1>'+
   (a.summary?'<p class="summary">'+esc(a.summary)+'</p>':'')+
   '<div class="article-meta">'+esc(a.author||'Redação RADAR 360')+' · '+(a.published_at?new Date(a.published_at).toLocaleString('pt-BR'):'')+'</div>'+
   (image?'<img class="article-cover" src="'+esc(image)+'" alt="Imagem relacionada: '+esc(a.title)+'" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="image-unavailable" hidden>Imagem original não fornecida pela fonte desta matéria.</div>':'<div class="image-unavailable">Imagem original não fornecida pela fonte desta matéria.</div>')+
   '<div class="article-body">'+esc(body)+'</div>'+
   (sources.length?'<section class="article-sources"><h2>Fontes da notícia</h2>'+sources.map((url,i)=>'<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Consultar fonte '+(i+1)+' ↗</a></p>').join('')+'</section>':'');
 }catch(error){
  console.error('RADAR 360: erro ao abrir matéria',error);
  root.innerHTML='<div class="article-error"><h1>Não foi possível abrir esta matéria</h1><p>'+esc(error.message)+'</p><button id="retryArticle" type="button">Tentar novamente</button><p><a href="/">← Voltar ao portal</a></p></div>';
  document.getElementById('retryArticle')?.addEventListener('click',load);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);else load();
})();