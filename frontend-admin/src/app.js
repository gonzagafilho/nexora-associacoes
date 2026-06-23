import { apiRequest } from "./api.js";

const app = document.querySelector("#app");
const toastRoot = document.querySelector("#toast-root");
const state = {
  token: localStorage.getItem("nexora_token") || "",
  user: JSON.parse(localStorage.getItem("nexora_user") || "null"),
  tenant: JSON.parse(localStorage.getItem("nexora_tenant") || "null"),
  me: null,
  route: location.hash.replace("#", "") || "dashboard",
  saasFilters: { q: "", status: "", page: 1, limit: 10 }
};

const icons = {
  dashboard: "M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-2-12a4 4 0 0 1 0 7.75",
  calendar: "M3 9h18M7 3v4m10-4v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2V2Zm3 6h6m-6 4h6m-6 4h4",
  card: "M3 5h18v14H3V5Zm0 5h18M7 15h3",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v2m0 15v2m9.5-9.5h-2m-15 0h-2m16.2-6.2-1.4 1.4M6.7 17.3l-1.4 1.4m13.4 0-1.4-1.4M6.7 6.7 5.3 5.3",
  logout: "M10 17l5-5-5-5m5 5H3m12-9h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4",
  menu: "M4 6h16M4 12h16M4 18h16",
  saas: "M4 7h16M4 12h16M4 17h10m4-10v10M8 7v10",
  star: "m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6-4.36-4.25 6.03-.88L12 3Z"
};

function icon(name) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[name] || icons.receipt}"/></svg>`;
}
function money(value) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0)); }
function date(value) { return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(value)) : "—"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function toast(message, error = false) { const el = document.createElement("div"); el.className = `toast${error ? " error" : ""}`; el.textContent = message; toastRoot.append(el); setTimeout(() => el.remove(), 4200); }
function badge(status) { const labels = { active: "Ativo", inactive: "Inativo", paid: "Pago", pending: "Pendente", overdue: "Vencido", trialing: "Trial", blocked: "Bloqueado", cancelled: "Cancelado", approved: "Aprovado", in_process: "Processando" }; return `<span class="badge badge-${status}">${labels[status] || escapeHtml(status)}</span>`; }
function field(name, label, value = "", type = "text", required = false, extra = "") { return `<label class="field"><span>${label}</span><input class="input" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${extra}></label>`; }
function selectField(name, label, options, value) { return `<label class="field"><span>${label}</span><select class="select" name="${name}">${options.map(([key, text]) => `<option value="${key}" ${key === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>`; }
function statusFilter(value = "") { return `<select class="select" data-filter-status style="max-width:190px"><option value="">Todos os status</option><option value="pending" ${value === "pending" ? "selected" : ""}>Pendentes</option><option value="paid" ${value === "paid" ? "selected" : ""}>Pagas</option><option value="overdue" ${value === "overdue" ? "selected" : ""}>Vencidas</option><option value="cancelled" ${value === "cancelled" ? "selected" : ""}>Canceladas</option></select>`; }

async function api(path, options = {}) {
  try {
    return await apiRequest(path, { ...options, token: state.token });
  } catch (error) {
    if (/Token inválido|Token não informado|401/.test(error.message)) logout();
    throw error;
  }
}
function saveSession(payload) {
  state.token = payload.token; state.user = payload.user; state.tenant = payload.tenant;
  localStorage.setItem("nexora_token", payload.token);
  localStorage.setItem("nexora_user", JSON.stringify(payload.user));
  localStorage.setItem("nexora_tenant", JSON.stringify(payload.tenant));
}
function logout() {
  localStorage.removeItem("nexora_token"); localStorage.removeItem("nexora_user"); localStorage.removeItem("nexora_tenant");
  state.token = ""; state.user = null; state.tenant = null; state.me = null; location.hash = ""; renderLogin();
}

function renderLogin() {
  app.innerHTML = `<main class="login-page"><section class="login-hero"><div class="brand"><img src="/nexora-logo.png" style="height:140px;width:auto" alt="NEXORA"></div><h1>Gestão inteligente para associações.</h1><p>Cobranças, associados e financeiro em um só lugar.</p><div style="margin-top:24px;line-height:2;font-size:18px"><div>✓ PIX automático</div><div>✓ Boleto e lotérica</div><div>✓ Baixa automática</div><div>✓ Portal do associado</div><div>✓ Gestão completa da associação</div><div>✓ Mercado Pago integrado</div></div></section><section class="login-panel"><form class="login-card" data-login><div class="brand"><img src="/nexora-logo.png" style="height:140px;width:auto" alt="NEXORA"></div><h2>Bem-vindo</h2><p>Acesse o painel administrativo.</p>${field("email", "E-mail", "", "email", true, 'autocomplete="email"')}${field("password", "Senha", "", "password", true, 'autocomplete="current-password"')}<button class="button button-primary button-block" type="submit">Entrar</button><button class="button button-secondary button-block" data-create-tenant type="button" style="margin-top:12px">Criar Associação</button><div style="text-align:center;margin-top:10px;font-size:14px;opacity:.8">Plano Profissional • 30 dias grátis • Depois R$ XX,90/mês</div><div class="mp-feedback" data-login-error></div></form></section></main>`;
  app.querySelector("[data-create-tenant]")?.addEventListener("click", () => openModal("Criar Associação", `<form data-tenant-form><div class="form-grid">${field("associationName", "Nome da Associação", "", "text", true)}${field("ownerName", "Nome do Responsável", "", "text", true)}${field("phone", "Telefone", "", "tel", true)}${field("email", "E-mail", "", "email", true)}${field("password", "Senha", "", "password", true)}<div class="detail-item span-2"><small>Plano</small>Plano Profissional • 30 dias grátis • Depois R$ XX,90/mês</div></div></form>`, async () => {
  const form = document.querySelector("[data-tenant-form]");
  if (!form.reportValidity()) return false;
  const data = Object.fromEntries(new FormData(form));
  const result = await apiRequest("/api/public/signup", {
    method: "POST",
    body: JSON.stringify(data)
  });
  saveSession(result);
  state.route = "dashboard";
  location.hash = "dashboard";
  await renderShell();
}, "Cancelar"));
  app.querySelector("[data-login]").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button"); const errorEl = app.querySelector("[data-login-error]");
    button.disabled = true; button.textContent = "Entrando…"; errorEl.textContent = "";
    try {
      const form = new FormData(event.currentTarget);
      const result = await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      saveSession(result); state.route = "dashboard"; location.hash = "dashboard"; await renderShell();
    } catch (error) { errorEl.className = "mp-feedback is-error"; errorEl.textContent = error.message; }
    finally { button.disabled = false; button.textContent = "Entrar"; }
  });
}

const navItems = [
  ["dashboard", "Dashboard", "dashboard"], ["associados", "Associados", "users"], ["mensalidades", "Mensalidades", "calendar"],
  ["cobrancas", "Cobranças", "receipt"], ["mercadopago", "Mercado Pago", "card"], ["saas", "SaaS", "saas"], ["assinatura", "Assinatura", "star"], ["configuracoes", "Configurações", "settings"]
];
function shellHtml() {
  return `<div class="app-shell"><aside class="sidebar" data-sidebar><div class="brand"><img src="/nexora-logo.png" style="height:40px;width:auto" alt="NEXORA"></div><nav class="nav">${navItems.map(([route, label, glyph]) => `<a class="nav-item ${state.route === route ? "active" : ""}" href="#${route}" data-route="${route}">${icon(glyph)}<span>${label}</span></a>`).join("")}</nav><div class="sidebar-foot">NEXORA • Gestão Inteligente</div></aside><section class="main"><header class="topbar"><div style="display:flex;align-items:center;gap:12px"><button class="mobile-toggle" data-menu>${icon("menu")}</button><div class="tenant-name">${escapeHtml(state.tenant?.name || state.me?.tenant?.name || "Associação")}</div></div><div class="user-menu"><div class="user-meta"><strong>${escapeHtml(state.user?.name || "Usuário")}</strong><small>${escapeHtml(state.user?.role || "")}</small></div><div class="avatar">${escapeHtml((state.user?.name || "N")[0].toUpperCase())}</div><button class="button button-ghost button-sm" data-logout>${icon("logout")} Sair</button></div></header><main class="content" data-content></main></section></div>`;
}
async function renderShell() {
  if (!state.token) return renderLogin();
  app.innerHTML = shellHtml();
  app.querySelector("[data-logout]").addEventListener("click", logout);
  app.querySelector("[data-menu]").addEventListener("click", () => app.querySelector("[data-sidebar]").classList.toggle("open"));
  await renderRoute();
}
function setRoute(route) { state.route = route; document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.route === route)); const sidebar = app.querySelector("[data-sidebar]"); if (sidebar) sidebar.classList.remove("open"); }
window.addEventListener("hashchange", async () => { if (!state.token) return; setRoute(location.hash.replace("#", "") || "dashboard"); await renderRoute(); });
function content() { return app.querySelector("[data-content]"); }
function loading() { content().innerHTML = `<div class="metrics"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`; }
function pageHead(title, subtitle, actions = "") { return `<header class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></header>`; }

async function renderRoute() {
  loading();
  try {
    const routes = { dashboard: renderDashboard, associados: renderAssociates, mensalidades: renderInvoices, cobrancas: renderCharges, mercadopago: renderMercadoPago, saas: renderSaasDashboard, assinatura: renderSubscription, configuracoes: renderSettings };
    await (routes[state.route] || renderDashboard)();
  } catch (error) { content().innerHTML = `<div class="card empty">Não foi possível carregar esta tela.<br><small>${escapeHtml(error.message)}</small></div>`; toast(error.message, true); }
}

async function renderDashboard() {
  const [{ data }, me] = await Promise.all([api("/api/dashboard"), api("/api/me")]); state.me = me;
  const max = Math.max(...data.months.map((m) => Math.max(m.received, m.charged)), 1); const delinquency = data.associates ? Math.round((data.overdueInvoices / Math.max(data.pendingInvoices + data.paidInvoices + data.overdueInvoices, 1)) * 100) : 0; const sub = me.subscription || {}; const trialDays = sub.trialEndsAt ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt) - new Date()) / 86400000)) : 0;
  content().innerHTML = `${pageHead("Dashboard", "Visão geral da operação da associação.")}<section class="metrics">
    ${metric("Plano atual", sub.plan === "professional" ? "Profissional" : (sub.plan || "—"), sub.status === "trialing" ? `${trialDays} dias de teste` : (sub.status || ""), true)}${metric("Total associados", data.associates)}${metric("Ativos", data.activeAssociates)}${metric("Mensalidades pendentes", data.pendingInvoices, "", true)}
    ${metric("Mensalidades pagas", data.paidInvoices)}${metric("Valor a receber", money(data.totalReceber))}${metric("Valor recebido", money(data.totalRecebido), "", true)}${metric("PIX gerados", data.pixGenerated)}${metric("Boletos gerados", data.boletosGenerated)}
  </section><section class="grid-2"><div class="card"><h3>Recebimentos e cobranças — últimos 6 meses</h3><div class="chart">${data.months.map((month) => `<div class="bar-group"><div class="bars"><span class="bar secondary" style="height:${Math.max(3, month.charged / max * 180)}px" title="Cobrado ${money(month.charged)}"></span><span class="bar" style="height:${Math.max(3, month.received / max * 180)}px" title="Recebido ${money(month.received)}"></span></div><span class="bar-label">${month.label}</span></div>`).join("")}</div></div><div class="card"><h3>Inadimplência</h3><div class="donut" style="--value:${delinquency}%" data-label="${delinquency}%"></div><p style="text-align:center;color:var(--muted)">${data.overdueInvoices} mensalidade(s) vencida(s) • ${money(data.totalVencido)}</p></div></section>`;
}
function metric(label, value, note = "", accent = false) { return `<article class="metric${accent ? " accent" : ""}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div>${note ? `<div class="metric-note">${note}</div>` : ""}</article>`; }

async function renderAssociates() {
  const response = await api("/api/associates"); const associates = response.associates || [];
  content().innerHTML = `${pageHead("Associados", "Cadastros e situação dos membros.", '<button class="button button-primary" data-new-associate>+ Novo associado</button>')}<div class="toolbar"><input class="input" data-search placeholder="Buscar por nome, CPF ou telefone"><select class="select" data-associate-status style="max-width:180px"><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></div><div data-associate-table></div>`;
  const draw = () => { const search = content().querySelector("[data-search]").value.toLowerCase(); const status = content().querySelector("[data-associate-status]").value; const rows = associates.filter((a) => (!status || a.status === status) && (!search || `${a.name} ${a.cpf} ${a.phone}`.toLowerCase().includes(search))); content().querySelector("[data-associate-table]").innerHTML = tableAssociates(rows); bindAssociateActions(associates); };
  content().querySelector("[data-search]").addEventListener("input", draw); content().querySelector("[data-associate-status]").addEventListener("change", draw); content().querySelector("[data-new-associate]").addEventListener("click", () => openAssociateModal()); draw();
}
function tableAssociates(rows) { if (!rows.length) return '<div class="card empty">Nenhum associado encontrado.</div>'; return `<div class="table-wrap"><table class="table"><thead><tr><th>Associado</th><th>Contato</th><th>Localização</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map((a) => `<tr><td><div class="cell-title">${escapeHtml(a.name)}</div><div class="cell-sub">${escapeHtml(a.cpf)}</div></td><td>${escapeHtml(a.phone)}<div class="cell-sub">${escapeHtml(a.email || "—")}</div></td><td>${escapeHtml([a.city, a.state].filter(Boolean).join(" / ") || a.address || "—")}</td><td>${badge(a.status)}</td><td><div class="row-actions"><button class="button button-secondary button-sm" data-edit-associate="${a._id}">Editar</button><button class="button button-ghost button-sm" data-disable-associate="${a._id}">${a.status === "active" ? "Inativar" : "Excluir"}</button></div></td></tr>`).join("")}</tbody></table></div>`; }
function bindAssociateActions(list) { content().querySelectorAll("[data-edit-associate]").forEach((button) => button.addEventListener("click", () => openAssociateModal(list.find((a) => a._id === button.dataset.editAssociate)))); content().querySelectorAll("[data-disable-associate]").forEach((button) => button.addEventListener("click", async () => { if (!confirm("Deseja inativar este associado?")) return; try { await api(`/api/associates/${button.dataset.disableAssociate}`, { method: "DELETE" }); toast("Associado inativado."); await renderAssociates(); } catch (error) { toast(error.message, true); } })); }
function openAssociateModal(associate = {}) { openModal(associate._id ? "Editar associado" : "Novo associado", `<form data-associate-form><div class="form-grid">${field("name", "Nome", associate.name, "text", true)}${field("cpf", "CPF", associate.cpf, "text", true)}${field("phone", "Telefone", associate.phone, "tel", true)}${field("email", "E-mail", associate.email, "email")}${field("address", "Endereço", associate.address)}${field("addressNumber", "Número", associate.addressNumber)}${field("neighborhood", "Bairro", associate.neighborhood)}${field("city", "Cidade", associate.city)}${field("state", "UF", associate.state, "text", false, 'maxlength="2"')}${field("zipCode", "CEP", associate.zipCode)}${selectField("status", "Status", [["active", "Ativo"], ["inactive", "Inativo"]], associate.status || "active")}</div></form>`, async () => { const form = document.querySelector("[data-associate-form]"); if (!form.reportValidity()) return false; const data = Object.fromEntries(new FormData(form)); await api(associate._id ? `/api/associates/${associate._id}` : "/api/associates", { method: associate._id ? "PUT" : "POST", body: JSON.stringify(data) }); toast("Associado salvo."); await renderAssociates(); }); }

async function renderInvoices() {
  const response = await api("/api/invoices"); const invoices = response.invoices || [];
  content().innerHTML = `${pageHead("Mensalidades", "Cobranças recorrentes, Pix, boleto e PDF.", '<button class="button button-secondary" data-generate-monthly>Gerar mensalidades</button><button class="button button-primary" data-new-invoice>+ Nova cobrança</button>')}<div class="toolbar">${statusFilter()}<input class="input" data-invoice-search placeholder="Buscar associado ou descrição"></div><div data-invoice-table></div>`;
  const draw = () => { const status = content().querySelector("[data-filter-status]").value; const search = content().querySelector("[data-invoice-search]").value.toLowerCase(); const rows = invoices.filter((i) => (!status || i.status === status) && (!search || `${i.description} ${i.associateId?.name}`.toLowerCase().includes(search))); content().querySelector("[data-invoice-table]").innerHTML = tableInvoices(rows); bindInvoiceActions(rows); };
  content().querySelector("[data-filter-status]").addEventListener("change", draw); content().querySelector("[data-invoice-search]").addEventListener("input", draw); content().querySelector("[data-new-invoice]").addEventListener("click", openInvoiceModal); content().querySelector("[data-generate-monthly]").addEventListener("click", openGenerateMonthly); draw();
}
function tableInvoices(rows) { if (!rows.length) return '<div class="card empty">Nenhuma mensalidade encontrada.</div>'; return `<div class="table-wrap"><table class="table"><thead><tr><th>Cobrança</th><th>Associado</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map((i) => `<tr><td><div class="cell-title">${escapeHtml(i.description)}</div><div class="cell-sub">${escapeHtml(i.type)}</div></td><td>${escapeHtml(i.associateId?.name || "—")}</td><td>${date(i.dueDate)}</td><td>${money(i.amountCurrent)}</td><td>${badge(i.status)}</td><td><div class="row-actions"><button class="button button-secondary button-sm" data-view-invoice="${i._id}">Ver</button><button class="button button-ghost button-sm" data-pdf="${i._id}">PDF</button>${i.status !== "paid" && i.status !== "cancelled" ? `<button class="button button-ghost button-sm" data-pix="${i._id}">PIX</button><button class="button button-ghost button-sm" data-boleto="${i._id}">Boleto</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`; }
function bindInvoiceActions(rows) { content().querySelectorAll("[data-view-invoice]").forEach((b) => b.addEventListener("click", () => viewInvoice(rows.find((i) => i._id === b.dataset.viewInvoice)))); content().querySelectorAll("[data-pdf]").forEach((b) => b.addEventListener("click", () => downloadPdf(b.dataset.pdf))); content().querySelectorAll("[data-pix]").forEach((b) => b.addEventListener("click", () => generatePix(b.dataset.pix))); content().querySelectorAll("[data-boleto]").forEach((b) => b.addEventListener("click", () => generateBoleto(b.dataset.boleto))); }
async function openInvoiceModal() { const associates = (await api("/api/associates?status=active")).associates || []; openModal("Nova cobrança", `<form data-invoice-form><div class="form-grid"><label class="field span-2"><span>Associado</span><select class="select" name="associateId" required><option value="">Selecione</option>${associates.map((a) => `<option value="${a._id}">${escapeHtml(a.name)}</option>`).join("")}</select></label>${field("description", "Descrição", "Mensalidade", "text", true)}${field("amountOriginal", "Valor", "", "number", true, 'step="0.01"')}${field("dueDate", "Vencimento", "", "date", true)}${selectField("type", "Tipo", [["monthly", "Mensalidade"], ["extra", "Extra"], ["event", "Evento"], ["manual", "Manual"]], "monthly")}</div></form>`, async () => { const form = document.querySelector("[data-invoice-form]"); if (!form.reportValidity()) return false; await api("/api/invoices", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }); toast("Cobrança criada."); await renderInvoices(); }); }
function openGenerateMonthly() { const now = new Date(); openModal("Gerar mensalidades", `<form data-monthly-form><div class="form-grid">${field("month", "Mês", now.getMonth() + 1, "number", true, 'min="1" max="12"')}${field("year", "Ano", now.getFullYear(), "number", true)}</div></form>`, async () => { const form = document.querySelector("[data-monthly-form]"); const result = await api("/api/invoices/generate-monthly", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }); toast(`${result.createdCount} mensalidade(s) criada(s).`); await renderInvoices(); }); }
function viewInvoice(invoice) { openModal("Detalhes da cobrança", `<div class="detail-grid"><div class="detail-item"><small>Associado</small>${escapeHtml(invoice.associateId?.name)}</div><div class="detail-item"><small>Status</small>${badge(invoice.status)}</div><div class="detail-item"><small>Valor</small>${money(invoice.amountCurrent)}</div><div class="detail-item"><small>Vencimento</small>${date(invoice.dueDate)}</div><div class="detail-item"><small>Pagamento</small>${escapeHtml(invoice.paymentMethod || "—")}</div><div class="detail-item"><small>Pago em</small>${date(invoice.paidAt)}</div></div>`, null, "Fechar"); }
async function generatePix(id) { try { const result = await api(`/api/pix/invoices/${id}/mercadopago`, { method: "POST" }); const pix = result.invoicePix || result.transaction || result; const code = pix.pixCopyPaste || pix.qrCode || result.transaction?.qrCode || ""; openModal("PIX gerado", `<p>PIX criado com sucesso.</p><div class="pix-code">${escapeHtml(code)}</div><div class="actions" style="margin-top:14px"><button class="button button-primary" data-copy-pix>Copiar PIX</button></div>`, null, "Fechar"); document.querySelector("[data-copy-pix]")?.addEventListener("click", async () => { await navigator.clipboard.writeText(code); toast("PIX copiado."); }); } catch (error) { toast(error.message, true); } }
async function generateBoleto(id) { try { const result = await api(`/api/invoices/${id}/boleto/mercadopago`, { method: "POST" }); const boleto = result.boleto || result.transaction; openModal("Boleto gerado", `<div class="detail-grid"><div class="detail-item"><small>Valor original</small>${money(boleto.originalAmount)}</div><div class="detail-item"><small>Taxa</small>${money(boleto.feeAmount)}</div><div class="detail-item"><small>Total</small>${money(boleto.totalAmount)}</div></div><div class="actions" style="margin-top:18px">${boleto.boletoUrl ? `<a class="button button-primary" target="_blank" href="${escapeHtml(boleto.boletoUrl)}">Abrir boleto</a>` : ""}</div>`, null, "Fechar"); } catch (error) { toast(error.message, true); } }
async function downloadPdf(id) { try { await api(`/api/invoices/${id}/pdf`, { method: "POST" }); const response = await fetch(`/api/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${state.token}` } }); if (!response.ok) throw new Error("Não foi possível baixar o PDF."); const blob = await response.blob(); const url = URL.createObjectURL(blob); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (error) { toast(error.message, true); } }

async function renderCharges() { const response = await api("/api/pix/transactions"); const transactions = response.transactions || []; content().innerHTML = `${pageHead("Cobranças", "Histórico financeiro de PIX e boletos.")}<div class="toolbar"><select class="select" data-charge-method style="max-width:180px"><option value="">Todos os meios</option><option value="pix">PIX</option><option value="boleto">Boleto</option></select><select class="select" data-charge-status style="max-width:180px"><option value="">Todos</option><option value="paid">Pago</option><option value="approved">Aprovado</option><option value="pending">Pendente</option><option value="cancelled">Cancelado</option></select></div><div data-charge-table></div>`; const draw = () => { const method = content().querySelector("[data-charge-method]").value; const status = content().querySelector("[data-charge-status]").value; const rows = transactions.filter((t) => (!method || t.method === method) && (!status || t.status === status)); content().querySelector("[data-charge-table]").innerHTML = tableCharges(rows); }; content().querySelectorAll("select").forEach((el) => el.addEventListener("change", draw)); draw(); }
function tableCharges(rows) { if (!rows.length) return '<div class="card empty">Nenhuma cobrança encontrada.</div>'; return `<div class="table-wrap"><table class="table"><thead><tr><th>Meio</th><th>Associado</th><th>Cobrança</th><th>Valor</th><th>Status</th><th>Pagamento</th></tr></thead><tbody>${rows.map((t) => `<tr><td><div class="cell-title">${String(t.method || "pix").toUpperCase()}</div><div class="cell-sub">${escapeHtml(t.externalId)}</div></td><td>${escapeHtml(t.associateId?.name || "—")}</td><td>${escapeHtml(t.invoiceId?.description || "—")}</td><td>${money(t.totalAmount || t.amount)}</td><td>${badge(t.status)}</td><td>${date(t.paidAt || t.payment?.paidAt)}<div class="cell-sub">${t.payment ? money(t.payment.amountPaid) : ""}</div></td></tr>`).join("")}</tbody></table></div>`; }

async function renderMercadoPago() { const [mp, me] = await Promise.all([api("/api/me/mercadopago-settings"), api("/api/me")]); const s = mp.settings || {}; const b = me.billingSettings || {}; const status = !s.configured ? ["Não configurado", "inactive"] : s.mercadopagoLastTestStatus === "success" ? ["Testado com sucesso", "active"] : s.mercadopagoLastTestStatus === "error" ? ["Erro no teste", "overdue"] : ["Configurado", "pending"]; content().innerHTML = `${pageHead("Mercado Pago", "Credenciais e meios de pagamento desta associação.")}<form class="card" data-mp-form><div class="status-panel"><div><strong>Status da conexão</strong><div class="cell-sub">${escapeHtml(s.mercadopagoAccountHolderName || "Conta ainda não testada")}</div></div>${badge(status[1]).replace(/>[^<]+</, `>${status[0]}<`)}</div><div class="settings-section"><div class="form-grid">${check("mercadopagoEnabled", "Ativar Mercado Pago", s.mercadopagoEnabled)}${check("mercadopagoPixEnabled", "PIX habilitado", s.mercadopagoPixEnabled)}${check("mercadopagoBoletoEnabled", "Boleto habilitado", s.mercadopagoBoletoEnabled)}${selectField("mercadopagoEnvironment", "Ambiente", [["production", "Produção"], ["sandbox", "Sandbox"]], s.mercadopagoEnvironment || "production")}${secret("mercadopagoAccessToken", "Access Token", s.accessTokenMasked)}${secret("mercadopagoPublicKey", "Public Key", s.publicKeyMasked)}${field("mercadopagoClientId", "Client ID", s.mercadopagoClientId)}${secret("mercadopagoClientSecret", "Client Secret", s.clientSecretMasked)}${secret("mercadopagoWebhookSecret", "Webhook Secret", s.webhookSecretMasked)}${field("mercadopagoBoletoMethod", "Método boleto", s.mercadopagoBoletoMethod || "bolbradesco")}${selectField("boletoFeeMode", "Tipo da taxa", [["fixed", "Fixa"], ["percent", "Percentual"]], b.boletoFeeMode || "fixed")}${field("boletoFeeAmount", "Taxa do boleto", b.boletoFeeAmount || 0, "number", false, 'step="0.01"')}</div></div><label class="field"><span>URL do webhook</span><div class="copy-row"><input class="input" readonly value="${escapeHtml(mp.webhookUrl)}" data-webhook><button type="button" class="button button-secondary" data-copy-webhook>Copiar</button></div></label><div class="actions" style="justify-content:flex-end;margin-top:20px"><button type="button" class="button button-secondary" data-test-mp>Testar conexão</button><button class="button button-primary" type="submit">Salvar</button></div></form>`; bindMercadoPago(); }
function check(name, label, checked) { return `<label class="field" style="flex-direction:row;align-items:center;padding:13px;border:1px solid var(--line);border-radius:10px"><input name="${name}" type="checkbox" ${checked ? "checked" : ""}><span>${label}</span></label>`; }
function secret(name, label, masked) { return `<label class="field"><span>${label}</span><div class="secret-row"><input class="input" name="${name}" type="password" placeholder="${escapeHtml(masked || "Não configurado")}"><button type="button" class="button button-secondary button-sm" data-show-secret="${name}">Mostrar</button></div><small style="color:var(--muted)">Vazio mantém o valor salvo.</small></label>`; }
function bindMercadoPago() { const form = content().querySelector("[data-mp-form]"); content().querySelectorAll("[data-show-secret]").forEach((button) => button.addEventListener("click", () => { const input = form.elements[button.dataset.showSecret]; input.type = input.type === "password" ? "text" : "password"; button.textContent = input.type === "password" ? "Mostrar" : "Ocultar"; })); content().querySelector("[data-copy-webhook]").addEventListener("click", async () => { await navigator.clipboard.writeText(content().querySelector("[data-webhook]").value); toast("Webhook copiado."); }); content().querySelector("[data-test-mp]").addEventListener("click", async () => { try { const result = await api("/api/me/mercadopago-settings/test", { method: "POST" }); toast(`${result.message} ${result.accountHolderName || ""}`); await renderMercadoPago(); } catch (error) { toast(error.message, true); } }); form.addEventListener("submit", async (event) => { event.preventDefault(); const fd = new FormData(form); const enabled = (name) => form.elements[name].checked; try { await api("/api/me/mercadopago-settings", { method: "PUT", body: JSON.stringify({ mercadopagoEnabled: enabled("mercadopagoEnabled"), mercadopagoPixEnabled: enabled("mercadopagoPixEnabled"), mercadopagoBoletoEnabled: enabled("mercadopagoBoletoEnabled"), mercadopagoEnvironment: fd.get("mercadopagoEnvironment"), mercadopagoAccessToken: fd.get("mercadopagoAccessToken"), mercadopagoPublicKey: fd.get("mercadopagoPublicKey"), mercadopagoClientId: fd.get("mercadopagoClientId"), mercadopagoClientSecret: fd.get("mercadopagoClientSecret"), mercadopagoWebhookSecret: fd.get("mercadopagoWebhookSecret"), mercadopagoBoletoMethod: fd.get("mercadopagoBoletoMethod") }) }); await api("/api/me/billing-settings/boleto", { method: "PUT", body: JSON.stringify({ boletoEnabled: enabled("mercadopagoBoletoEnabled"), boletoFeeMode: fd.get("boletoFeeMode"), boletoFeeAmount: Number(fd.get("boletoFeeAmount") || 0), boletoDueDays: state.me?.billingSettings?.boletoDueDays || 3, boletoInstructions: state.me?.billingSettings?.boletoInstructions || "" }) }); toast("Mercado Pago salvo."); await renderMercadoPago(); } catch (error) { toast(error.message, true); } }); }


function subscriptionStatusLabel(status) {
  const labels = {
    active: "Ativas",
    trialing: "Em trial",
    overdue: "Inadimplentes",
    blocked: "Bloqueadas",
    cancelled: "Canceladas"
  };
  return labels[status] || status || "—";
}

function planLabel(plan) {
  const labels = { trial: "Trial", professional: "Profissional", enterprise: "Enterprise" };
  return labels[plan] || plan || "—";
}

function metricCard(label, value, note = "", tone = "") {
  return '<article class="saas-card ' + tone + '"><div class="saas-card-label">' + label + '</div><div class="saas-card-value">' + value + '</div>' + (note ? '<div class="saas-card-note">' + note + '</div>' : '') + '</article>';
}

function renderSaasSessionExpired() {
  content().innerHTML = pageHead("SaaS", "Dashboard executivo de assinaturas da plataforma.") + '<section class="card saas-alert"><h2>Sessão expirada</h2><p>Entre novamente para consultar as métricas administrativas de assinaturas.</p><button class="button button-primary" type="button" data-session-login>Fazer login</button></section>';
  content().querySelector("[data-session-login]")?.addEventListener("click", logout);
}

function saasListQuery() {
  const params = new URLSearchParams({ page: state.saasFilters.page, limit: state.saasFilters.limit });
  if (state.saasFilters.q) params.set("q", state.saasFilters.q);
  if (state.saasFilters.status) params.set("status", state.saasFilters.status);
  return params.toString();
}

function renderSaasSubscriptionRows(items) {
  if (!items.length) {
    return '<div class="empty saas-empty">Nenhuma assinatura encontrada.</div>';
  }

  return '<div class="table-wrap saas-table-wrap"><table class="table saas-table"><thead><tr><th>Associação</th><th>Plano</th><th>Status</th><th>Valor</th><th>Próxima cobrança</th><th>Fim do trial</th><th>Último pagamento</th><th>Status último pagamento</th></tr></thead><tbody>' +
    items.map((item) => '<tr><td><div class="cell-title">' + escapeHtml(item.tenantName || "—") + '</div><div class="cell-sub">' + escapeHtml(item.tenantSlug || item.tenantId || "—") + '</div></td><td>' + escapeHtml(planLabel(item.plan)) + '</td><td>' + badge(item.status) + '</td><td>' + money(item.amount) + '</td><td>' + date(item.nextBillingDate) + '</td><td>' + date(item.trialEndsAt) + '</td><td><div class="cell-title">' + date(item.lastPaymentAt) + '</div><div class="cell-sub">' + escapeHtml(item.lastPaymentId || "—") + '</div></td><td>' + (item.lastPaymentStatus ? badge(item.lastPaymentStatus) : '<span class="cell-sub">—</span>') + '</td></tr>').join("") +
    '</tbody></table></div>';
}

function renderSaasPagination(list) {
  if (list.totalPages <= 1) return '';
  const previousDisabled = list.page <= 1 ? ' disabled' : '';
  const nextDisabled = list.page >= list.totalPages ? ' disabled' : '';
  return '<div class="saas-pagination"><button class="button button-secondary button-sm" data-saas-page="' + (list.page - 1) + '"' + previousDisabled + '>Anterior</button><span>Página ' + list.page + ' de ' + list.totalPages + '</span><button class="button button-secondary button-sm" data-saas-page="' + (list.page + 1) + '"' + nextDisabled + '>Próxima</button></div>';
}

function bindSaasDashboard() {
  const form = content().querySelector("[data-saas-filters]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    state.saasFilters.q = String(data.get("q") || "").trim();
    state.saasFilters.status = String(data.get("status") || "");
    state.saasFilters.page = 1;
    await renderSaasDashboard();
  });
  form?.querySelector('[name="status"]')?.addEventListener("change", () => form.requestSubmit());
  content().querySelectorAll("[data-saas-page]").forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    state.saasFilters.page = Number(button.dataset.saasPage || 1);
    await renderSaasDashboard();
  }));
}

async function renderSaasDashboard() {
  try {
    const [data, list] = await Promise.all([
      apiRequest("/api/subscription/admin/dashboard", { token: state.token }),
      apiRequest("/api/subscription/admin/list?" + saasListQuery(), { token: state.token })
    ]);
    const status = state.saasFilters.status;
    content().innerHTML = pageHead("SaaS", "Dashboard executivo de assinaturas da plataforma NEXORA.") + '<section class="saas-hero"><div><span>Assinaturas</span><h2>' + money(data.monthlyRevenue) + '</h2><p>Receita mensal recorrente estimada</p></div><div class="saas-hero-side"><strong>' + money(data.annualRevenue) + '</strong><small>Receita anual projetada</small></div></section><section class="saas-metrics">' +
      metricCard("Assinaturas Ativas", data.activeSubscriptions, subscriptionStatusLabel("active"), "is-good") +
      metricCard("Em Trial", data.trialSubscriptions, subscriptionStatusLabel("trialing"), "is-info") +
      metricCard("Inadimplentes", data.overdueSubscriptions, subscriptionStatusLabel("overdue"), data.overdueSubscriptions > 0 ? "is-danger" : "") +
      metricCard("Vencendo em 7 dias", data.expiringNext7Days, "Próximas renovações", "is-warning") +
      metricCard("Receita Mensal", money(data.monthlyRevenue), "Assinaturas ativas", "is-money") +
      metricCard("Receita Anual", money(data.annualRevenue), "Projeção 12 meses", "is-money") +
      metricCard("Total de Associações", data.totalTenants, "Tenants cadastrados", "is-info") +
    '</section><section class="card saas-list-card"><header class="saas-list-head"><div><h2>Lista de Assinaturas</h2><p>' + list.total + ' assinatura(s) encontrada(s)</p></div></header><form class="toolbar saas-filterbar" data-saas-filters><input class="input" name="q" placeholder="Buscar por associação ou slug" value="' + escapeHtml(state.saasFilters.q) + '"><select class="select" name="status"><option value=""' + (!status ? ' selected' : '') + '>Todos os status</option><option value="trialing"' + (status === 'trialing' ? ' selected' : '') + '>Trialing</option><option value="active"' + (status === 'active' ? ' selected' : '') + '>Active</option><option value="overdue"' + (status === 'overdue' ? ' selected' : '') + '>Overdue</option><option value="cancelled"' + (status === 'cancelled' ? ' selected' : '') + '>Cancelled</option></select><button class="button button-primary" type="submit">Filtrar</button></form>' + renderSaasSubscriptionRows(list.items || []) + renderSaasPagination(list) + '</section>';
    bindSaasDashboard();
  } catch (error) {
    if (error.status === 401 || /Token inválido|Token não informado|401/.test(error.message)) {
      renderSaasSessionExpired();
      return;
    }
    content().innerHTML = pageHead("SaaS", "Dashboard executivo de assinaturas da plataforma.") + '<section class="card empty saas-error"><strong>Não foi possível carregar o Dashboard SaaS.</strong><br><small>' + escapeHtml(error.message) + '</small></section>';
    toast(error.message, true);
  }
}

async function renderSubscription() {
  const me = await api("/api/me");
  const sub = me.subscription || {};
  const plan = sub.plan === "professional" ? "Profissional" : (sub.plan || "—");
  const status = sub.status === "trialing" ? "Teste grátis" : (sub.status || "—");
  const trialUntil = sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString("pt-BR") : "—";
  const now = new Date();
  const end = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
  const daysLeft = end ? Math.max(0, Math.ceil((end - now) / 86400000)) : 0;
  const monthlyAmount = sub.amount || 0;
  const nextBilling = sub.nextBillingAt ? new Date(sub.nextBillingAt).toLocaleDateString("pt-BR") : "Após o período de teste";

  content().innerHTML = `${pageHead("Assinatura", "Plano comercial e cobrança da plataforma NEXORA.")}<section class="metrics">
    ${metric("Plano atual", plan, status, true)}
    ${metric("Status", status)}
    ${metric("Trial até", trialUntil, `${daysLeft} dias restantes`, true)}
    ${metric("Valor mensal", money(monthlyAmount))}
    ${metric("Próxima cobrança", nextBilling, "", true)}
  </section>
  <section class="card">
    <h2>Assinar agora</h2>
    <p>Ao assinar, a associação mantém o acesso ao painel, cobranças, PIX, boleto, PDF premium e baixa automática.</p>
    <div class="actions" style="margin-top:18px">
      <button class="button button-primary" type="button" data-subscribe-now>Assinar Agora</button>
    </div>
  </section>`;
}

async function renderSettings() { const me = await api("/api/me"); state.me = me; const t = me.tenant || {}, b = me.branding || {}, f = me.billingSettings || {}; content().innerHTML = `${pageHead("Configurações", "Dados da associação, financeiro e aparência.")}<form class="card" data-settings-form><div class="tabs"><button class="tab active" type="button" data-tab="association">Associação</button><button class="tab" type="button" data-tab="financial">Financeiro</button><button class="tab" type="button" data-tab="appearance">Aparência</button></div><section data-panel="association"><div class="form-grid">${field("name", "Nome", t.name, "text", true)}${field("legalDocument", "CNPJ", t.legalDocument)}${field("phone", "Telefone", t.phone)}${field("email", "E-mail", t.email, "email")}${field("address", "Endereço", t.address)}${field("logoUrl", "Logo (URL)", b.logoUrl)}</div></section><section data-panel="financial" hidden><div class="form-grid">${field("defaultMonthlyAmount", "Mensalidade padrão", f.defaultMonthlyAmount || 0, "number", false, 'step="0.01"')}${field("defaultDueDay", "Dia de vencimento", f.defaultDueDay || 10, "number")}${selectField("defaultLateFeeType", "Tipo da multa", [["percent", "Percentual"], ["fixed", "Fixa"]], f.defaultLateFeeType)}${field("defaultLateFeeValue", "Multa", f.defaultLateFeeValue || 0, "number", false, 'step="0.001"')}${selectField("defaultDailyInterestType", "Tipo dos juros", [["percent", "Percentual"], ["fixed", "Fixo"]], f.defaultDailyInterestType)}${field("defaultDailyInterestValue", "Juros ao dia", f.defaultDailyInterestValue || 0, "number", false, 'step="0.001"')}<label class="field span-2"><span>Mensagem do PDF</span><textarea class="textarea" name="pdfMessage">${escapeHtml(f.pdfMessage || "")}</textarea></label><label class="field span-2"><span>Rodapé do PDF</span><textarea class="textarea" name="documentFooter">${escapeHtml(b.documentFooter || "")}</textarea></label></div></section><section data-panel="appearance" hidden><div class="form-grid">${field("primaryColor", "Cor primária", b.primaryColor || "#0ea5e9", "color")}${field("secondaryColor", "Cor secundária", b.secondaryColor || "#0284c7", "color")}</div></section><div class="actions" style="justify-content:flex-end;margin-top:22px"><button class="button button-primary" type="submit">Salvar configurações</button></div></form>`; bindSettings(); }
function bindSettings() { const form = content().querySelector("[data-settings-form]"); content().querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { content().querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === button)); content().querySelectorAll("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== button.dataset.tab); })); form.addEventListener("submit", async (event) => { event.preventDefault(); const fd = new FormData(form); try { const result = await api("/api/me/settings", { method: "PUT", body: JSON.stringify({ tenant: { name: fd.get("name"), legalDocument: fd.get("legalDocument"), phone: fd.get("phone"), email: fd.get("email"), address: fd.get("address") }, branding: { logoUrl: fd.get("logoUrl"), primaryColor: fd.get("primaryColor"), secondaryColor: fd.get("secondaryColor"), documentFooter: fd.get("documentFooter") }, billingSettings: { defaultMonthlyAmount: Number(fd.get("defaultMonthlyAmount") || 0), defaultDueDay: Number(fd.get("defaultDueDay") || 10), defaultLateFeeType: fd.get("defaultLateFeeType"), defaultLateFeeValue: Number(fd.get("defaultLateFeeValue") || 0), defaultDailyInterestType: fd.get("defaultDailyInterestType"), defaultDailyInterestValue: Number(fd.get("defaultDailyInterestValue") || 0), pdfMessage: fd.get("pdfMessage") } }) }); state.tenant = { ...state.tenant, ...result.tenant }; localStorage.setItem("nexora_tenant", JSON.stringify(state.tenant)); app.querySelector(".tenant-name").textContent = result.tenant.name; toast("Configurações salvas."); } catch (error) { toast(error.message, true); } }); }

function openModal(title, body, onSave = null, closeLabel = "Cancelar") { const backdrop = document.createElement("div"); backdrop.className = "modal-backdrop"; backdrop.innerHTML = `<section class="modal"><header class="modal-head"><h2>${title}</h2><button class="modal-close" type="button" aria-label="Fechar">×</button></header><div class="modal-body">${body}</div><footer class="modal-foot"><button class="button button-ghost" type="button" data-cancel>${closeLabel}</button>${onSave ? '<button class="button button-primary" type="button" data-save>Criar minha associação</button>' : ""}</footer></section>`; document.body.append(backdrop); const close = () => backdrop.remove(); backdrop.querySelector(".modal-close").addEventListener("click", close); backdrop.querySelector("[data-cancel]").addEventListener("click", close); backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); }); if (onSave) backdrop.querySelector("[data-save]").addEventListener("click", async () => { const button = backdrop.querySelector("[data-save]"); button.disabled = true; try { const shouldClose = await onSave(); if (shouldClose !== false) close(); } catch (error) { toast(error.message, true); } finally { button.disabled = false; } }); }

if (state.token) renderShell(); else renderLogin();
