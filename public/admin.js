const $=s=>document.querySelector(s);const loginScreen=$('#loginScreen'),dashboard=$('#dashboard'),feedback=$('#feedback');async function api(path,options={}){const response=await fetch(path,{credentials:'same-origin',...options,headers:{...(options.body instanceof FormData?{}:{'content-type':'application/json'}),...(options.headers||{})}});const data=await response.json().catch(()=>({error:'Resposta inválida do servidor.'}));if(!response.ok)throw new Error(data.error||'Falha na operação.');return data}function showDashboard(){loginScreen.hidden=true;dashboard.hidden=false;loadArticles();loadAiNews()}async function checkSession(){try{const r=await api('/api/session');if(r.authenticated)showDashboard()}catch{}}$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginMessage').textContent='Verificando acesso...';try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});$('#password').value='';showDashboard()}catch(err){$('#loginMessage').textContent=err.message}});$('#logout').addEventListener('click',async()=>{await api('/api/logout',{method:'POST'}).catch(()=>{});dashboard.hidden=true;loginScreen.hidden=false});$('#hamb').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));document.querySelectorAll('.side-link').forEach(a=>a.addEventListener('click',()=>$('#sidebar').classList.remove('open')));const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const statusLabel=s=>({published:'Publicada',draft:'Rascunho',review:'Em revisão'}[s]||s);async function loadArticles(){try{const data=await api('/api/admin/news');const rows=data.articles||[];$('#totalCount').textContent=rows.length;$('#publishedCount').textContent=rows.filter(x=>x.status==='published').length;$('#draftCount').textContent=rows.filter(x=>x.status==='draft').length;$('#reviewCount').textContent=rows.filter(x=>x.status==='review').length;$('#articleRows').innerHTML=rows.length?rows.map(x=>'<tr><td><b>'+esc(x.title)+'</b><small>'+esc(x.author||'Redação RADAR 360')+'</small></td><td>'+esc(x.category)+'</td><td><span class="status '+(x.status==='published'?'published':'draft')+'">'+statusLabel(x.status)+'</span></td><td>'+esc((x.updated_at||'').slice(0,10))+'</td><td><button class="table-action" data-edit="'+x.id+'">Editar</button> <button class="table-action danger" data-delete="'+x.id+'">Excluir</button></td></tr>').join(''):'<tr><td colspan="5">Nenhuma matéria cadastrada.</td></tr>';$('#tableMessage').textContent='Dados carregados do banco de dados.';window.radarArticles=rows}catch(e){$('#tableMessage').textContent=e.message;$('#articleRows').innerHTML='<tr><td colspan="5">Não foi possível carregar. Verifique se o banco D1 foi configurado.</td></tr>'}}$('#refresh').addEventListener('click',loadArticles);$('#articleRows').addEventListener('click',async e=>{const edit=e.target.dataset.edit,del=e.target.dataset.delete;if(edit){const a=(window.radarArticles||[]).find(x=>String(x.id)===edit);if(!a)return;$('#articleId').value=a.id;$('#title').value=a.title;$('#summary').value=a.summary||'';$('#category').value=a.category;$('#status').value=a.status;$('#author').value=a.author||'Redação RADAR 360';$('#bodyText').value=a.body;$('#formHeading').textContent='Editar matéria';location.hash='#nova'}if(del&&confirm('Excluir esta matéria permanentemente?')){try{await api('/api/admin/news/'+del,{method:'DELETE'});loadArticles()}catch(err){alert(err.message)}}});$('#articleForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('#articleId').value;const payload={title:$('#title').value,summary:$('#summary').value,category:$('#category').value,status:$('#status').value,author:$('#author').value,body:$('#bodyText').value};const selectedImage=$('#cover').files[0];const button=$('#saveArticle');button.disabled=true;feedback.textContent='Salvando...';try{if(selectedImage){const fd=new FormData();fd.append('image',selectedImage);const upload=await api('/api/admin/upload',{method:'POST',body:fd});payload.cover_image=upload.key}if(id)await api('/api/admin/news/'+id,{method:'PUT',body:JSON.stringify(payload)});else await api('/api/admin/news',{method:'POST',body:JSON.stringify(payload)});feedback.textContent='Matéria salva no banco de dados.';resetForm();await loadArticles()}catch(err){feedback.textContent=err.message}finally{button.disabled=false}});function resetForm(){$('#articleForm').reset();$('#articleId').value='';$('#author').value='Redação RADAR 360';$('#formHeading').textContent='Nova matéria';$('#coverMessage').textContent=''}$('#cancelEdit').addEventListener('click',resetForm);
async function loadAiNews(){
 try{
  const [status,data]=await Promise.all([api('/api/admin/ai/status'),api('/api/admin/ai/candidates')]);
  $('#aiPending').textContent=status.pending;
  $('#aiLastRun').textContent=status.latest?.started_at?new Date(status.latest.started_at).toLocaleString('pt-BR'):'—';
  $('#aiLastStatus').textContent=status.latest?.status||'Nenhuma execução';
  $('#aiCandidates').innerHTML=(data.candidates||[]).length?data.candidates.map(c=>{
   let sources=[];try{sources=JSON.parse(c.sources_json||'[]')}catch{}
   return '<article class="ai-candidate"><div class="ai-candidate-head"><span class="category">'+esc(c.category)+'</span><small>'+new Date(c.created_at).toLocaleString('pt-BR')+'</small></div><h3>'+esc(c.title)+'</h3><p>'+esc(c.summary)+'</p><details><summary>Ler matéria e fontes</summary><div class="ai-body">'+esc(c.body)+'</div><ul>'+sources.map(s=>'<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+'</a></li>').join('')+'</ul></details><div class="ai-image-preview">'+(sources.find(s=>s.image&&s.image.startsWith('http'))?'<img src="'+esc(sources.find(s=>s.image&&s.image.startsWith('http')).image)+'" alt="Prévia da imagem da notícia">':'<small>O feed não forneceu imagem. Confira a fonte original.</small>')+</div><div class="ai-actions"><button class="primary" data-ai-approve="'+c.id+'">Aprovar e publicar</button><button class="secondary" data-ai-reject="'+c.id+'">Rejeitar</button></div></article>';
  }).join(''):'<p class="table-note">Nenhuma pauta pendente. Clique em “Buscar notícias agora” ou aguarde a próxima coleta automática.</p>';
 }catch(e){$('#aiMessage').textContent=e.message}
}
$('#runAi')?.addEventListener('click',async()=>{
 const b=$('#runAi');b.disabled=true;$('#aiMessage').textContent='Coletando pautas de fontes RSS gratuitas. Aguarde...';
 try{const r=await api('/api/admin/ai/run',{method:'POST'});$('#aiMessage').textContent='Concluído: '+r.found+' pautas recebidas; '+r.review+' novas pautas aguardam sua apuração. Nenhuma foi publicada.';await loadAiNews()}
 catch(e){$('#aiMessage').textContent=e.message}
 finally{b.disabled=false}
});
$('#aiCandidates')?.addEventListener('click',async e=>{
 const approve=e.target.dataset.aiApprove,reject=e.target.dataset.aiReject,id=approve||reject;if(!id)return;
 const action=approve?'approve':'reject';
 if(approve&&!confirm('Publicar esta matéria no portal RADAR 360?'))return;
 if(reject&&!confirm('Rejeitar e arquivar esta pauta?'))return;
 try{await api('/api/admin/ai/candidates/'+id+'/'+action,{method:'POST'});$('#aiMessage').textContent=approve?'Matéria publicada no portal.':'Pauta rejeitada.';await loadAiNews();await loadArticles()}
 catch(err){$('#aiMessage').textContent=err.message}
});

const generateMissingImages=$('#generateMissingImages');
generateMissingImages?.addEventListener('click',async()=>{
 generateMissingImages.disabled=true;
 const status=$('#imageAiMessage');
 let generated=0,remaining=null;
 try{
  status.textContent='Preparando geração das capas. Isso pode levar alguns instantes...';
  for(let i=0;i<20;i++){
   const result=await api('/api/admin/images/generate-missing',{method:'POST'});
   remaining=Number(result.remaining||0);
   if(!result.generated){status.textContent=result.message||'Todas as matérias já têm imagem.';break;}
   generated++;
   status.textContent='Imagem criada: '+result.title+'. '+generated+' concluída(s); '+remaining+' restante(s).';
   await loadArticles();
   if(remaining===0){status.textContent='Concluído! '+generated+' imagem(ns) editorial(is) criada(s).';break;}
  }
  if(remaining>0&&generated>=20)status.textContent+=' Ainda faltam '+remaining+'. Clique novamente para continuar.';
 }catch(error){status.textContent='A geração foi interrompida: '+error.message+(generated?' Imagens já criadas: '+generated+'.':'');}
 finally{generateMissingImages.disabled=false;}
});

checkSession();