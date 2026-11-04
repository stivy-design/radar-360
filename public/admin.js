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
    const status = await api("/api/admin/ai/status");
    $("#aiPending").textContent = status.latest?.published_count ?? 0;
    $("#aiLastRun").textContent = status.latest?.started_at ? new Date(status.latest.started_at).toLocaleString("pt-BR") : "Aguardando execução diária";
    $("#aiLastStatus").textContent = status.latest?.status || "Agendada diariamente";
    $("#aiMessage").textContent = status.latest?.error_message || "A publicação automática está ativa. Notícias só entram no portal quando há correspondência entre pelo menos duas fontes editoriais distintas.";
  } catch (error) { $("#aiMessage").textContent = error.message; }
}

$("#runAi")?.addEventListener("click", async () => {
  const button = $("#runAi");
  button.disabled = true;
  $("#aiMessage").textContent = "Coletando pautas de fontes RSS gratuitas. Aguarde...";
  try {
    const result = await api("/api/admin/ai/run", { method: "POST" });
    $("#aiMessage").textContent = "Busca concluída: " + result.found + " notícias analisadas; " + result.published + " matérias publicadas automaticamente após confirmação em fontes independentes.";
    await loadAiNews();
    await loadArticles();
  } catch (error) { $("#aiMessage").textContent = error.message; }
  finally { button.disabled = false; }
});

$("#findMissingImages")?.addEventListener("click", async () => {
  const button = $("#findMissingImages");
  const message = $("#imageSearchMessage");
  if (!button || !message) return;
  button.disabled = true;
  let found = 0;
  let remaining = null;
  message.textContent = "Iniciando busca nas fontes originais. O painel vai verificar as matérias em sequência...";
  try {
    for (let attempt = 0; attempt < 25; attempt++) {
      const result = await api("/api/admin/images/find-missing", { method: "POST" });
      found += Number(result.found || 0);
      remaining = Number(result.remaining || 0);
      message.textContent = result.message || (remaining ? "Verificando próxima matéria..." : "Busca concluída.");
      if (remaining === 0 || Number(result.checked || 0) === 0) break;
    }
    message.textContent = found
      ? "Busca concluída: " + found + " fotografia(s) original(is) encontrada(s). " + (remaining ? remaining + " matéria(s) ainda estão sem foto." : "Todas as matérias foram verificadas.")
      : (remaining ? "Nenhuma fotografia pública foi encontrada nesta rodada. " + remaining + " matéria(s) continuam sem foto." : "Todas as matérias foram verificadas.");
    await loadArticles();
  } catch (error) {
    message.textContent = "Erro ao buscar fotografias: " + (error.message || "falha na comunicação com o servidor.");
  } finally {
    button.disabled = false;
  }
});

checkSession();
