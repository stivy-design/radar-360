(() => {
'use strict';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const byId = id => document.getElementById(id);
function init(){
 const today=byId('today'), year=byId('year');
 if(today) today.textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date());
 if(year) year.textContent=new Date().getFullYear();
 const nav=byId('mainNav'),toggle=byId('menuToggle');
 if(nav&&toggle) toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰'});
 if(nav) nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
 const searchOpen=byId('searchOpen'),searchbar=byId('searchbar'),searchInput=byId('searchInput'),searchClear=byId('searchClear');
 if(searchOpen&&searchbar) searchOpen.addEventListener('click',()=>{searchbar.classList.toggle('open');if(searchbar.classList.contains('open'))searchInput?.focus()});
 if(searchClear&&searchbar) searchClear.addEventListener('click',()=>{searchbar.classList.remove('open');if(searchInput)searchInput.value='';filterNews()});
 let active='Todas';
 function filterNews(){
  const term=(searchInput?.value||'').trim().toLocaleLowerCase('pt-BR');
  let count=0;
  document.querySelectorAll('.news-card').forEach(card=>{
   const category=card.dataset.category||'';
   const matches=(active==='Todas'||category===active)&&(!term||(card.innerText+' '+(card.dataset.search||'')).toLocaleLowerCase('pt-BR').includes(term));
   card.hidden=!matches;if(matches)count++;
  });
  const empty=byId('emptyState');if(empty)empty.hidden=count>0;
 }
 document.querySelectorAll('.filter[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{
  active=btn.dataset.filter||'Todas';
  document.querySelectorAll('.filter[data-filter]').forEach(b=>b.classList.toggle('active',b===btn));
  filterNews();
 }));
 if(searchInput)searchInput.addEventListener('input',filterNews);
 document.querySelectorAll('.nav a[data-category]').forEach(a=>a.addEventListener('click',()=>{
  active=a.dataset.category||'Todas';
  document.querySelectorAll('.filter[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===active));
  filterNews();
 }));
 loadPublishedNews(filterNews);
}
async function loadPublishedNews(filterNews){
 const grid=byId('newsGrid'),lead=document.querySelector('.lead-grid');
 if(!grid)return;
 const imageUrl=value=>{
  if(!value)return '';
  if(/^https?:\/\//i.test(value))return value;
  return '/media/'+value.split('/').map(encodeURIComponent).join('/');
 };
 const imageMarkup=(article,cls='news-image')=>{
  const src=imageUrl(article.cover_image);
  if(!src)return '<div class="'+cls+' image-placeholder">IMAGEM NÃO DISPONÍVEL</div>';
  const img='<img src="'+esc(src)+'" alt="Imagem relacionada: '+esc(article.title)+'" loading="lazy">';
  return article.cover_image&&String(article.cover_image).startsWith('ai/')?'<span class="'+cls+' ai-image-frame">'+img+'<small>Ilustração gerada por IA</small></span>':'<img class="'+cls+'" src="'+esc(src)+'" alt="Imagem relacionada: '+esc(article.title)+'" loading="lazy">';
 };
 try{
  const response=await fetch('/api/news',{headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error('Erro HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.articles))throw new Error('Resposta inválida da API');
  const articles=data.articles;
  if(!articles.length){
   grid.innerHTML='<p class="empty-state">Ainda não há notícias publicadas. As pautas em revisão não aparecem no portal.</p>';
   if(lead)lead.innerHTML='<div class="lead-empty"><strong>RADAR 360</strong><h1>As notícias do momento</h1><p>As matérias aprovadas e publicadas aparecerão aqui.</p></div>';
   return;
  }
  if(lead){
   const [main,...side]=articles;
   lead.innerHTML='<article class="lead-card"><div class="lead-image">'+imageMarkup(main,'lead-photo')+'</div><div class="lead-content"><span class="category">'+esc(main.category).toUpperCase()+'</span><h1>'+esc(main.title)+'</h1><p>'+esc(main.summary||'Acompanhe os detalhes desta notícia no RADAR 360.')+'</p><a class="read-link" href="noticia.html?slug='+encodeURIComponent(main.slug)+'">Leia a notícia <span>→</span></a></div></article><div class="side-leads">'+side.slice(0,2).map(a=>'<article class="side-card"><a class="side-image-link" href="noticia.html?slug='+encodeURIComponent(a.slug)+'">'+imageMarkup(a,'side-photo')+'</a><div><span class="category">'+esc(a.category).toUpperCase()+'</span><h2><a href="noticia.html?slug='+encodeURIComponent(a.slug)+'">'+esc(a.title)+'</a></h2><span class="meta">'+esc(a.author||'Redação RADAR 360')+'</span></div></article>').join('')+'</div>';
  }
  grid.innerHTML=articles.map(a=>'<article class="news-card" data-category="'+esc(a.category)+'" data-search="'+esc(a.title+' '+a.summary)+'"><a href="noticia.html?slug='+encodeURIComponent(a.slug)+'">'+imageMarkup(a)+'<div class="news-body"><span class="category">'+esc(a.category).toUpperCase()+'</span><h3>'+esc(a.title)+'</h3><p>'+esc(a.summary)+'</p><span class="meta">'+esc(a.author||'Redação RADAR 360')+' · '+(a.published_at?new Date(a.published_at).toLocaleDateString('pt-BR'):'')+'</span></div></a></article>').join('');
  if(filterNews)filterNews();
 }catch(error){
  console.error('RADAR 360: falha ao carregar notícias',error);
  grid.innerHTML='<p class="empty-state">Não foi possível carregar as notícias. <button id="retryNews" type="button" class="filter active">Tentar novamente</button></p>';
  byId('retryNews')?.addEventListener('click',()=>loadPublishedNews(filterNews));
  if(lead)lead.innerHTML='<div class="lead-empty"><strong>RADAR 360</strong><h1>Estamos atualizando o portal</h1><p>Tente novamente em instantes.</p></div>';
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();