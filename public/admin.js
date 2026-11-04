const $ = (selector) => document.querySelector(selector);
const loginScreen = $("#loginScreen");
const dashboard = $("#dashboard");
const feedback = $("#feedback");

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
  const data = await response.json().catch(() => ({ error: "Resposta inválida do servidor." }));
  if (!response.ok) throw new Error(data.error || "Falha na operação.");
  return data;
}
function showDashboard() {
  loginScreen.hidden = true;
  dashboard.hidden = false;
  loadArticles();
  loadAiNews();
}
async function checkSession() {
  try { const result = await api("/api/session"); if (result.authenticated) showDashboard(); }
  catch (error) { console.error("Falha ao verificar sessão:", error); }
}
$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#loginMessage");
  const button = $("#loginForm button[type='submit']");
  message.textContent = "Verificando acesso...";
  button.disabled = true;
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#password").value }) });
    $("#password").value = "";
    message.textContent = "";
    showDashboard();
  } catch (error) {
    message.textContent = error.message || "Não foi possível entrar. Tente novamente.";
  } finally { button.disabled = false; }
});
$("#logout").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch (error) { console.error(error); }
  dashboard.hidden = true;
  loginScreen.hidden = false;
});
$("#hamb").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
document.querySelectorAll(".side-link").forEach((link) => link.addEventListener("click", () => $("#sidebar").classList.remove("open")));

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));
const statusLabel = (status) => ({ published: "Publicada", draft: "Rascunho", review: "Em revisão" }[status] || status);

async function loadArticles() {
  try {
    const data = await api("/api/admin/news");
    const rows = data.articles || [];
    $("#totalCount").textContent = rows.length;
    $("#publishedCount").textContent = rows.filter((item) => item.status === "published").length;
    $("#draftCount").textContent = rows.filter((item) => item.status === "draft").length;
    $("#reviewCount").textContent = rows.filter((item) => item.status === "review").length;
    $("#articleRows").innerHTML = rows.length ? rows.map((item) =>
      '<tr><td><b>' + esc(item.title) + '</b><small>' + esc(item.author || "Redação RADAR 360") +
      '</small></td><td>' + esc(item.category) + '</td><td><span class="status ' +
      (item.status === "published" ? "published" : "draft") + '">' + esc(statusLabel(item.status)) +
      '</span></td><td>' + esc((item.updated_at || "").slice(0, 10)) +
      '</td><td><button class="table-action" data-edit="' + item.id +
      '">Editar</button> <button class="table-action danger" data-delete="' + item.id +
      '">Excluir</button></td></tr>'
    ).join("") : '<tr><td colspan="5">Nenhuma matéria cadastrada.</td></tr>';
    $("#tableMessage").textContent = "Dados carregados do banco de dados.";
    window.radarArticles = rows;
  } catch (error) {
    $("#tableMessage").textContent = error.message;
    $("#articleRows").innerHTML = '<tr><td colspan="5">Não foi possível carregar as matérias.</td></tr>';
  }
}
$("#refresh").addEventListener("click", loadArticles);
$("#articleRows").addEventListener("click", async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const article = (window.radarArticles || []).find((item) => String(item.id) === editId);
    if (!article) return;
    $("#articleId").value = article.id;
    $("#title").value = article.title || "";
    $("#summary").value = article.summary || "";
    $("#category").value = article.category || "Brasil";
    $("#status").value = article.status || "draft";
    $("#author").value = article.author || "Redação RADAR 360";
    $("#bodyText").value = article.body || "";
    $("#formHeading").textContent = "Editar matéria";
    location.hash = "#nova";
  }
  if (deleteId && confirm("Excluir esta matéria permanentemente?")) {
    try { await api("/api/admin/news/" + deleteId, { method: "DELETE" }); await loadArticles(); }
    catch (error) { alert(error.message); }
  }
});
$("#articleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#articleId").value;
  const payload = {
    title: $("#title").value, summary: $("#summary").value,
    category: $("#category").value, status: $("#status").value,
    author: $("#author").value, body: $("#bodyText").value
  };
  const selectedImage = $("#cover").files[0];
  const button = $("#saveArticle");
  button.disabled = true;
  feedback.textContent = "Salvando...";
  try {
    if (selectedImage) {
      const formData = new FormData();
      formData.append("image", selectedImage);
      const upload = await api("/api/admin/upload", { method: "POST", body: formData });
      payload.cover_image = upload.key;
    }
    if (id) await api("/api/admin/news/" + id, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/admin/news", { method: "POST", body: JSON.stringify(payload) });
    feedback.textContent = "Matéria salva no banco de dados.";
    resetForm();
    await loadArticles();
  } catch (error) { feedback.textContent = error.message; }
  finally { button.disabled = false; }
});
function resetForm() {
  $("#articleForm").reset();
  $("#articleId").value = "";
  $("#author").value = "Redação RADAR 360";
  $("#formHeading").textContent = "Nova matéria";
  $("#coverMessage").textContent = "";
}
$("#cancelEdit").addEventListener("click", resetForm);

async function loadAiNews() {
  try {
    const results = await Promise.all([api("/api/admin/ai/status"), api("/api/admin/ai/candidates")]);
    const status = results[0];
    const data = results[1];
    $("#aiPending").textContent = status.pending;
    $("#aiLastRun").textContent = status.latest?.started_at ? new Date(status.latest.started_at).toLocaleString("pt-BR") : "—";
    $("#aiLastStatus").textContent = status.latest?.status || "Nenhuma execução";
    const candidates = data.candidates || [];
    $("#aiCandidates").innerHTML = candidates.length ? candidates.map((candidate) => {
      let sources = [];
      try { sources = JSON.parse(candidate.sources_json || "[]"); } catch (error) { console.warn(error); }
      const sourceLinks = sources.map((source) =>
        '<li><a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.name) + "</a></li>"
      ).join("");
      const imageSource = sources.find((source) => source.image && source.image.startsWith("http"));
      const imagePreview = imageSource
        ? '<img src="' + esc(imageSource.image) + '" alt="Prévia da imagem da notícia">'
        : "<small>O feed não forneceu imagem. Confira a fonte original.</small>";
      return '<article class="ai-candidate"><div class="ai-candidate-head"><span class="category">' +
        esc(candidate.category) + '</span><small>' + new Date(candidate.created_at).toLocaleString("pt-BR") +
        '</small></div><h3>' + esc(candidate.title) + '</h3><p>' + esc(candidate.summary) +
        '</p><details><summary>Ler matéria e fontes</summary><div class="ai-body">' + esc(candidate.body) +
        '</div><ul>' + sourceLinks + '</ul></details><div class="ai-image-preview">' + imagePreview +
        '</div><div class="ai-actions"><button class="primary" data-ai-approve="' + candidate.id +
        '">Aprovar e publicar</button><button class="secondary" data-ai-reject="' + candidate.id +
        '">Rejeitar</button></div></article>';
    }).join("") : '<p class="table-note">Nenhuma pauta pendente. Clique em “Buscar notícias agora” ou aguarde a próxima coleta automática.</p>';
  } catch (error) { $("#aiMessage").textContent = error.message; }
}
$("#runAi")?.addEventListener("click", async () => {
  const button = $("#runAi");
  button.disabled = true;
  $("#aiMessage").textContent = "Coletando pautas de fontes RSS gratuitas. Aguarde...";
  try {
    const result = await api("/api/admin/ai/run", { method: "POST" });
    $("#aiMessage").textContent = "Concluído: " + result.found + " pautas recebidas; " + result.review + " novas pautas aguardam sua apuração. Nenhuma foi publicada.";
    await loadAiNews();
  } catch (error) { $("#aiMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
$("#aiCandidates")?.addEventListener("click", async (event) => {
  const approveId = event.target.dataset.aiApprove;
  const rejectId = event.target.dataset.aiReject;
  const id = approveId || rejectId;
  if (!id) return;
  if (approveId && !confirm("Publicar esta matéria no portal RADAR 360?")) return;
  if (rejectId && !confirm("Rejeitar e arquivar esta pauta?")) return;
  try {
    await api("/api/admin/ai/candidates/" + id + "/" + (approveId ? "approve" : "reject"), { method: "POST" });
    $("#aiMessage").textContent = approveId ? "Matéria publicada no portal." : "Pauta rejeitada.";
    await loadAiNews();
    await loadArticles();
  } catch (error) { $("#aiMessage").textContent = error.message; }
});
const generateMissingImages = $("#generateMissingImages");
generateMissingImages?.addEventListener("click", async () => {
  generateMissingImages.disabled = true;
  const status = $("#imageAiMessage");
  let generated = 0;
  let remaining = null;
  try {
    status.textContent = "Preparando geração das capas. Isso pode levar alguns instantes...";
    for (let index = 0; index < 20; index++) {
      const result = await api("/api/admin/images/generate-missing", { method: "POST" });
      remaining = Number(result.remaining || 0);
      if (!result.generated) { status.textContent = result.message || "Todas as matérias já têm imagem."; break; }
      generated++;
      status.textContent = "Imagem criada: " + result.title + ". " + generated + " concluída(s); " + remaining + " restante(s).";
      await loadArticles();
      if (remaining === 0) { status.textContent = "Concluído! " + generated + " imagem(ns) editorial(is) criada(s)."; break; }
    }
    if (remaining > 0 && generated >= 20) status.textContent += " Ainda faltam " + remaining + ". Clique novamente para continuar.";
  } catch (error) {
    status.textContent = "A geração foi interrompida: " + error.message + (generated ? " Imagens já criadas: " + generated + "." : "");
  } finally { generateMissingImages.disabled = false; }
});
checkSession();
