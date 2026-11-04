const $=(s)=>document.querySelector(s);const $$=(s)=>[...document.querySelectorAll(s)];const today=new Date();$('#today').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(today);$('#year').textContent=today.getFullYear();const nav=$('#mainNav'),toggle=$('#menuToggle');toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰'});$$('.nav a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));$('#searchOpen').addEventListener('click',()=>{$('#searchbar').classList.toggle('open');if($('#searchbar').classList.contains('open'))$('#searchInput').focus()});$('#searchClear').addEventListener('click',()=>{$('#searchbar').classList.remove('open');$('#searchInput').value='';filterNews()});let active='Todas';function filterNews(){const term=$('#searchInput').value.trim().toLocaleLowerCase('pt-BR');let count=0;$$('.news-card').forEach(card=>{const category=card.dataset.category;const matchesCategory=active==='Todas'||category===active;const matchesTerm=!term||(card.innerText+' '+(card.dataset.search||'')).toLocaleLowerCase('pt-BR').includes(term);card.hidden=!(matchesCategory&&matchesTerm);if(!card.hidden)count++});$('#emptyState').hidden=count>0}$$('.filter').forEach(btn=>btn.addEventListener('click',()=>{active=btn.dataset.filter;$$('.filter').forEach(b=>b.classList.toggle('active',b===btn));filterNews()}));$('#searchInput').addEventListener('input',filterNews);$$('.nav a[data-category]').forEach(a=>a.addEventListener('click',()=>{const cat=a.dataset.category;active=cat;$$('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===cat));filterNews()}));
async function loadPublishedNews(){
 const grid=document.querySelector('#newsGrid');
 const lead=document.querySelector('.lead-grid');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const imageUrl=value=>{if(!value)return '';try{return value.startsWith('http://')||value.startsWith('https://')?value:'/media/'+value.split('/').map(encodeURIComponent).join('/')}catch{return ''}};
 const imageMarkup=(article,cls='news-image')=>{const src=imageUrl(article.cover_image);return src?'<img class="'+cls+'" src="'+esc(src)+'" alt="Imagem relacionada: '+esc(article.title)+'" loading="lazy" onerror="this.outerHTML=\\'<div class=&quot;'+cls+'&quot; aria-label=&quot;Imagem indisponível&quot;>IMAGEM INDISPONÍVEL</div>\\'">':'<div class="'+cls+' image-placeholder">IMAGEM NÃO DISPONÍVEL</div>'};
 try{
  const response=await fetch('/api/news',{headers:{'accept':'application/json'},cache:'no-store'});
  if(!response.ok){let detail='';try{const err=await response.json();detail=err.error||''}catch{}throw new Error('A API respondeu HTTP '+response.status+(detail?' — '+detail:''))}
  const data=await response.json();
  if(!data||!Array.isArray(data.articles))throw new Error('A resposta da API não contém a lista de notícias.');
  if(!data.articles.length){
   grid.innerHTML='<p class="empty-state">Ainda não há notícias publicadas. As pautas aguardando aprovação não aparecem no portal.</p>';
   if(lead)lead.innerHTML='<div class="lead-empty"><strong>RADAR 360</strong><h1>As notícias do momento</h1><p>As matérias aprovadas e publicadas aparecerão aqui.</p></div>';
   return;
  }
  const articles=data.articles;
  if(lead){
   const [main,...side]=articles;
   lead.innerHTML='<article class="lead-card"><div class="lead-image">'+imageMarkup(main,'lead-photo')+'</div><div class="lead-content"><span class="category">'+esc(main.category).toUpperCase()+'</span><h1>'+esc(main.title)+'</h1><p>'+esc(main.summary||'Acompanhe os detalhes desta notícia no RADAR 360.')+'</p><a class="read-link" href="noticia.html?slug='+encodeURIComponent(main.slug)+'">Leia a notícia <span>→</span></a></div></article><div class="side-leads">'+side.slice(0,2).map(a=>'<article class="side-card"><a class="side-image-link" href="noticia.html?slug='+encodeURIComponent(a.slug)+'">'+imageMarkup(a,'side-photo')+'</a><div><span class="category">'+esc(a.category).toUpperCase()+'</span><h2><a href="noticia.html?slug='+encodeURIComponent(a.slug)+'">'+esc(a.title)+'</a></h2><span class="meta">'+esc(a.author||'Redação RADAR 360')+'</span></div></article>').join('')+'</div>';
  }
  grid.innerHTML=articles.map(a=>'<article class="news-card" data-category="'+esc(a.category)+'" data-search="'+esc(a.title+' '+a.summary)+'"><a href="noticia.html?slug='+encodeURIComponent(a.slug)+'">'+imageMarkup(a)+'<div class="news-body"><span class="category">'+esc(a.category).toUpperCase()+'</span><h3>'+esc(a.title)+'</h3><p>'+esc(a.summary)+'</p><span class="meta">'+esc(a.author||'Redação RADAR 360')+' · '+(a.published_at?new Date(a.published_at).toLocaleDateString('pt-BR'):'')+'</span></div></a></article>').join('');
  filterNews();
 }catch(error){
  console.error('Falha ao carregar notícias do RADAR 360:',error);
  grid.innerHTML='<p class="empty-state">Não foi possível carregar as notícias agora. '+esc(error.message)+'<br><button type="button" id="retryNews" class="filter active">Tentar novamente</button></p>';
  document.querySelector('#retryNews')?.addEventListener('click',loadPublishedNews);
  if(lead)lead.innerHTML='<div class="lead-empty"><strong>RADAR 360</strong><h1>Estamos atualizando o portal</h1><p>Não foi possível consultar as notícias neste momento.</p></div>';
 }
}
loadPublishedNews();
