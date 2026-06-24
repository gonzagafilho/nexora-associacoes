import { apiRequest } from "./api.js";

const app = document.querySelector("#app");
const toastRoot = document.querySelector("#toast-root");
const state = {
  token: localStorage.getItem("nexora_token") || "",
  user: JSON.parse(localStorage.getItem("nexora_user") || "null"),
  tenant: JSON.parse(localStorage.getItem("nexora_tenant") || "null"),
  branding: JSON.parse(localStorage.getItem("nexora_branding") || "null"),
  me: null,
  route: location.hash.replace("#", "") || "dashboard",
  saasFilters: { q: "", status: "", page: 1, limit: 10 },
  saasPaymentFilters: { q: "", status: "", page: 1, limit: 10 },
  saasAuditFilters: { q: "", scope: "", action: "", status: "", dateFrom: "", dateTo: "", page: 1, limit: 10 },
  financialFilters: { q: "", type: "", status: "", category: "", dateFrom: "", dateTo: "", page: 1, limit: 10 },
  financialReportMonth: new Date().toISOString().slice(0, 7),
  projectFilters: { q: "", status: "", type: "" },
  assetFilters: { q: "", status: "", category: "" },
  protocolFilters: { q: "", status: "", priority: "", type: "", dateFrom: "", dateTo: "", page: 1, limit: 20 },
  saasPayments: [],
  saasAudit: [],
  financialTransactions: []
};

const DEFAULT_BRANDING = Object.freeze({
  primaryColor: "#0ea5e9",
  secondaryColor: "#0284c7",
  documentFooter: "Documento gerado automaticamente pelo Nexora Gestão.",
  activeLogoUrl: "/nexora-logo.png"
});

const REQUIRED_MODULE_CODES = ["core", "financial"];
const FALLBACK_SAAS_MODULES = [
  { code: "core", name: "Core", description: "Plataforma base", monthlyPrice: 49.9, active: true },
  { code: "financial", name: "Financeiro", description: "Fluxo financeiro", monthlyPrice: 0, active: true },
  { code: "associates", name: "Associados", description: "Cadastro de associados", monthlyPrice: 20, active: true },
  { code: "memberbilling", name: "Cobrança de Associados", description: "Mensalidades e cobranças", monthlyPrice: 20, active: true },
  { code: "projects", name: "Projetos", description: "Obras e projetos", monthlyPrice: 20, active: true },
  { code: "assets", name: "Patrimônio", description: "Gestão de ativos", monthlyPrice: 15, active: true },
  { code: "protocols", name: "Protocolos", description: "Fluxos de protocolos", monthlyPrice: 15, active: true },
  { code: "people", name: "Pessoas", description: "Gestão de pessoas", monthlyPrice: 20, active: true },
  { code: "pwa", name: "PWA", description: "App web progressivo", monthlyPrice: 20, active: true }
];

const icons = {
  dashboard: "M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-2-12a4 4 0 0 1 0 7.75",
  calendar: "M3 9h18M7 3v4m10-4v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2V2Zm3 6h6m-6 4h6m-6 4h4",
  card: "M3 5h18v14H3V5Zm0 5h18M7 15h3",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v2m0 15v2m9.5-9.5h-2m-15 0h-2m16.2-6.2-1.4 1.4M6.7 17.3l-1.4 1.4m13.4 0-1.4-1.4M6.7 6.7 5.3 5.3",
  projects: "M3 21h18M5 21V7l7-4 7 4v14M9 10h6M9 14h6",
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
function dateTime(value) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function toast(message, error = false) { const el = document.createElement("div"); el.className = `toast${error ? " error" : ""}`; el.textContent = message; toastRoot.append(el); setTimeout(() => el.remove(), 4200); }
function badge(status) { const labels = { active: "Ativo", inactive: "Inativo", paid: "Pago", pending: "Pendente", overdue: "Vencido", trialing: "Trial", blocked: "Bloqueado", cancelled: "Cancelado", rejected: "Rejeitado", approved: "Aprovado", in_process: "Processando", planning: "Planejamento", paused: "Pausado", completed: "Concluído", maintenance: "Manutenção", stored: "Armazenado", lost: "Perdido", sold: "Vendido", retired: "Baixado", open: "Aberto", waiting: "Aguardando", resolved: "Resolvido", closed: "Fechado" }; const tones = { open: "pending", waiting: "pending", in_progress: "approved", resolved: "active", closed: "inactive", cancelled: "cancelled" }; const tone = tones[status] || status; return `<span class="badge badge-${tone}">${labels[status] || escapeHtml(status)}</span>`; }
function normalizeModuleCode(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function normalizeModuleCodes(values = []) { return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => normalizeModuleCode(item)).filter(Boolean))); }
function tenantEnabledModules() {
  const configured = normalizeModuleCodes(state.me?.tenant?.enabledModules || state.tenant?.enabledModules || []);
  return configured.length ? configured : FALLBACK_SAAS_MODULES.map((item) => item.code);
}
function hasModuleAccess(moduleCode) {
  const normalized = normalizeModuleCode(moduleCode);
  if (!normalized) return true;
  return tenantEnabledModules().includes(normalized);
}
function signupModuleRow(item, checked) {
  const required = REQUIRED_MODULE_CODES.includes(item.code);
  return `<label class="field" style="padding:10px;border:1px solid var(--line);border-radius:10px"><span style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong>${escapeHtml(item.name)}</strong><strong>${money(item.monthlyPrice || 0)}</strong></span><small style="color:var(--muted)">${escapeHtml(item.description || "")}</small><span style="margin-top:8px;display:flex;align-items:center;gap:8px"><input type="checkbox" name="enabledModules" value="${escapeHtml(item.code)}" ${checked ? "checked" : ""} ${required ? "disabled" : ""}>${required ? "Obrigatório" : "Selecionar módulo"}</span></label>`;
}
function readSignupModules(form) {
  const selected = new Set(REQUIRED_MODULE_CODES);
  form.querySelectorAll('input[name="enabledModules"]:checked').forEach((input) => selected.add(normalizeModuleCode(input.value)));
  return Array.from(selected);
}
function calculateSignupTotal(modules, selectedCodes) {
  const selected = new Set(normalizeModuleCodes(selectedCodes));
  return Number(modules.filter((item) => selected.has(normalizeModuleCode(item.code))).reduce((sum, item) => sum + Number(item.monthlyPrice || 0), 0).toFixed(2));
}
function moduleNameByCode(code) {
  const normalized = normalizeModuleCode(code);
  const found = FALLBACK_SAAS_MODULES.find((item) => item.code === normalized);
  return found?.name || normalized || "—";
}
function formatEnabledModules(codes = []) {
  const normalized = normalizeModuleCodes(codes);
  if (!normalized.length) return "Todos";
  return normalized.map((code) => moduleNameByCode(code)).join(", ");
}
function field(name, label, value = "", type = "text", required = false, extra = "") { return `<label class="field"><span>${label}</span><input class="input" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${extra}></label>`; }
function selectField(name, label, options, value) { return `<label class="field"><span>${label}</span><select class="select" name="${name}">${options.map(([key, text]) => `<option value="${key}" ${key === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>`; }
function statusFilter(value = "") { return `<select class="select" data-filter-status style="max-width:190px"><option value="">Todos os status</option><option value="pending" ${value === "pending" ? "selected" : ""}>Pendentes</option><option value="paid" ${value === "paid" ? "selected" : ""}>Pagas</option><option value="overdue" ${value === "overdue" ? "selected" : ""}>Vencidas</option><option value="cancelled" ${value === "cancelled" ? "selected" : ""}>Canceladas</option></select>`; }
function projectTypeOptions(value = "projeto") { return `<label class="field"><span>Tipo</span><select class="select" name="type"><option value="obra" ${value === "obra" ? "selected" : ""}>Obra</option><option value="projeto" ${value === "projeto" ? "selected" : ""}>Projeto</option><option value="evento" ${value === "evento" ? "selected" : ""}>Evento</option><option value="campanha" ${value === "campanha" ? "selected" : ""}>Campanha</option><option value="outro" ${value === "outro" ? "selected" : ""}>Outro</option></select></label>`; }
function projectStatusOptions(value = "planning") { return `<label class="field"><span>Status</span><select class="select" name="status"><option value="planning" ${value === "planning" ? "selected" : ""}>Planejamento</option><option value="active" ${value === "active" ? "selected" : ""}>Ativo</option><option value="paused" ${value === "paused" ? "selected" : ""}>Pausado</option><option value="completed" ${value === "completed" ? "selected" : ""}>Concluído</option><option value="cancelled" ${value === "cancelled" ? "selected" : ""}>Cancelado</option></select></label>`; }

function normalizeColor(value, fallback) { const color = String(value || "").trim(); return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback; }
function currentTenantName() { return state.tenant?.name || state.me?.tenant?.name || "Nexora Gestão"; }
function resolveBranding(source = state.me?.branding || state.branding || {}) { const branding = source || {}; return { ...DEFAULT_BRANDING, ...branding, primaryColor: normalizeColor(branding.primaryColor, DEFAULT_BRANDING.primaryColor), secondaryColor: normalizeColor(branding.secondaryColor, DEFAULT_BRANDING.secondaryColor), activeLogoUrl: branding.activeLogoUrl || branding.logoOriginalPath || branding.logoUrl || DEFAULT_BRANDING.activeLogoUrl, organizationName: currentTenantName() }; }
function applyBrandingTheme(branding = resolveBranding()) { document.documentElement.style.setProperty("--primary", branding.primaryColor); document.documentElement.style.setProperty("--secondary", branding.secondaryColor); }
function persistBranding(branding) { state.branding = resolveBranding(branding); localStorage.setItem("nexora_branding", JSON.stringify(state.branding)); applyBrandingTheme(state.branding); }
function syncSessionBranding(payload = {}) { if (payload.tenant) { state.tenant = { ...(state.tenant || {}), ...payload.tenant }; localStorage.setItem("nexora_tenant", JSON.stringify(state.tenant)); } if (payload.branding) persistBranding(payload.branding); }
function brandLogoHtml(branding = resolveBranding(), height = 40, className = "") { const src = branding.activeLogoUrl || DEFAULT_BRANDING.activeLogoUrl; return `<img class="${className}" src="${escapeHtml(src)}" style="height:${height}px;width:auto" alt="${escapeHtml(branding.organizationName || "Nexora Gestão")}">`; }
function logoPreviewOption(mode, label, src, active, hint = "") { return `<label class="logo-option${active ? " active" : ""}"><input type="radio" name="logoMode" value="${mode}" ${active ? "checked" : ""}><div class="logo-preview"><div class="logo-preview-head"><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ""}</div><div class="logo-preview-body">${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}">` : '<div class="logo-preview-fallback">Sem arquivo</div>'}</div></div></label>`; }

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
  if (payload.branding) persistBranding(payload.branding);
}
function logout() {
  localStorage.removeItem("nexora_token"); localStorage.removeItem("nexora_user"); localStorage.removeItem("nexora_tenant"); localStorage.removeItem("nexora_branding");
  state.token = ""; state.user = null; state.tenant = null; state.branding = null; state.me = null; location.hash = ""; applyBrandingTheme(DEFAULT_BRANDING); renderLogin();
}

function renderLogin() {
  const branding = resolveBranding(); applyBrandingTheme(branding);
  app.innerHTML = `<main class="login-page"><section class="login-hero"><div class="brand brand-hero">${brandLogoHtml(branding, 96, "brand-logo-lg")}<div><small>PLATAFORMA MULTI-TENANT</small><strong>${escapeHtml(branding.organizationName)}</strong></div></div><h1>Gestão inteligente para associações.</h1><p>Cobranças, associados e financeiro em um só lugar.</p><div class="hero-points"><div class="hero-point"><span>✓</span><strong>PIX automático</strong></div><div class="hero-point"><span>✓</span><strong>Boleto e lotérica</strong></div><div class="hero-point"><span>✓</span><strong>Baixa automática</strong></div><div class="hero-point"><span>✓</span><strong>Portal do associado</strong></div><div class="hero-point"><span>✓</span><strong>Multi-tenant</strong></div><div class="hero-point"><span>✓</span><strong>Mercado Pago integrado</strong></div><div class="hero-point"><span>✓</span><strong>PDF Premium</strong></div><div class="hero-point"><span>✓</span><strong>Relatórios financeiros</strong></div></div><div class="pricing-card"><small>Plano Modular</small><strong>7 dias grátis</strong><span>Core a partir de R$ 49,90/mês</span></div><footer class="login-footer"><strong>NEXORA © 2026</strong><span>Plataforma de Gestão Inteligente</span></footer></section><section class="login-panel"><form class="login-card" data-login><div class="brand brand-card">${brandLogoHtml(branding, 72, "brand-logo-card")}<div><small>NEXORA GESTÃO</small><strong>${escapeHtml(branding.organizationName)}</strong></div></div><h2>Bem-vindo</h2><p>Acesse o painel administrativo da sua organização.</p>${field("email", "E-mail", "", "email", true, 'autocomplete="email"')}${field("password", "Senha", "", "password", true, 'autocomplete="current-password"')}<button class="button button-primary button-block" type="submit">Entrar</button><button class="button button-secondary button-block" data-create-tenant type="button" style="margin-top:12px">Criar Associação</button><div class="login-trial-note">Plano Modular • 7 dias grátis • Valor conforme módulos contratados</div><div class="mp-feedback" data-login-error></div></form></section></main>`;
  app.querySelector("[data-create-tenant]")?.addEventListener("click", openTenantSignupModal);
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

async function openTenantSignupModal() {
  let catalog = { modules: FALLBACK_SAAS_MODULES, requiredModuleCodes: REQUIRED_MODULE_CODES };
  try {
    catalog = await apiRequest("/api/public/saas-modules", { method: "GET" });
  } catch (error) {
    toast("Catálogo indisponível no momento. Usando módulos padrão.");
  }

  const requiredCodes = normalizeModuleCodes(catalog.requiredModuleCodes || REQUIRED_MODULE_CODES);
  const modules = (catalog.modules || FALLBACK_SAAS_MODULES)
    .map((item) => ({ ...item, code: normalizeModuleCode(item.code), monthlyPrice: Number(item.monthlyPrice || 0) }))
    .filter((item) => item.code);

  openModal("Criar Associação", `<form data-tenant-form><div class="form-grid">${field("associationName", "Nome da Associação", "", "text", true)}${field("ownerName", "Nome do Responsável", "", "text", true)}${field("phone", "Telefone", "", "tel", true)}${field("email", "E-mail", "", "email", true)}${field("password", "Senha", "", "password", true)}<div class="field span-2"><span>Módulos contratados</span><div class="form-grid">${modules.map((item) => signupModuleRow(item, requiredCodes.includes(item.code))).join("")}</div></div><div class="detail-item span-2" data-signup-total><small>Total mensal</small>${money(calculateSignupTotal(modules, requiredCodes))}</div><div class="detail-item span-2"><small>Trial</small>7 dias com status trialing</div></div></form>`, async () => {
    const form = document.querySelector("[data-tenant-form]");
    if (!form.reportValidity()) return false;
    const data = Object.fromEntries(new FormData(form));
    data.enabledModules = readSignupModules(form);
    const result = await apiRequest("/api/public/signup", {
      method: "POST",
      body: JSON.stringify(data)
    });
    saveSession(result);
    state.route = "dashboard";
    location.hash = "dashboard";
    await renderShell();
  }, "Cancelar", "Criar minha associação");

  const form = document.querySelector("[data-tenant-form]");
  const totalEl = document.querySelector("[data-signup-total]");
  const refreshTotal = () => {
    totalEl.innerHTML = `<small>Total mensal</small>${money(calculateSignupTotal(modules, readSignupModules(form)))}`;
  };
  form?.querySelectorAll('input[name="enabledModules"]').forEach((input) => {
    if (!input.disabled) input.addEventListener("change", refreshTotal);
  });
}

const navItems = [
  ["dashboard", "Dashboard", "dashboard", "core"],
  ["associados", "Associados", "users", "associates"],
  ["mensalidades", "Mensalidades", "calendar", "memberbilling"],
  ["cobrancas", "Cobranças", "receipt", "memberbilling"],
  ["projetos", "Projetos", "projects", "projects"],
  ["patrimonio", "Patrimônio", "projects", "assets"],
  ["protocolos", "Protocolos", "receipt", "protocols"],
  ["financeiro", "Financeiro", "card", "financial"],
  ["mercadopago", "Mercado Pago", "card", "financial"],
  ["saas", "SaaS", "saas", "core"],
  ["assinatura", "Assinatura", "star", "core"],
  ["configuracoes", "Configurações", "settings", "core"]
];
function visibleNavItems() { return navItems.filter(([, , , moduleCode]) => hasModuleAccess(moduleCode)); }
function shellHtml() {
  const branding = resolveBranding(); applyBrandingTheme(branding);
  return `<div class="app-shell"><aside class="sidebar" data-sidebar><div class="brand brand-shell">${brandLogoHtml(branding, 38, "brand-logo-shell")}<div><span>${escapeHtml(currentTenantName())}</span><small>Nexora Gestão</small></div></div><nav class="nav">${visibleNavItems().map(([route, label, glyph]) => `<a class="nav-item ${state.route === route ? "active" : ""}" href="#${route}" data-route="${route}">${icon(glyph)}<span>${label}</span></a>`).join("")}</nav><div class="sidebar-foot"><strong>NEXORA © 2026</strong><span>Plataforma de Gestão Inteligente</span></div></aside><section class="main"><header class="topbar"><div class="topbar-left"><button class="mobile-toggle" data-menu>${icon("menu")}</button><div class="topbar-brand">${brandLogoHtml(branding, 30, "brand-logo-topbar")}<div><div class="tenant-name">${escapeHtml(currentTenantName())}</div><small>${escapeHtml(branding.organizationName)}</small></div></div></div><div class="user-menu"><div class="user-meta"><strong>${escapeHtml(state.user?.name || "Usuário")}</strong><small>${escapeHtml(state.user?.role || "")}</small></div><div class="avatar">${escapeHtml((state.user?.name || "N")[0].toUpperCase())}</div><button class="button button-ghost button-sm" data-logout>${icon("logout")} Sair</button></div></header><main class="content" data-content></main><footer class="app-footer"><strong>${escapeHtml(currentTenantName())}</strong><span>NEXORA © 2026 • Plataforma de Gestão Inteligente</span></footer></section></div>`;
}
async function renderShell() {
  if (!state.token) return renderLogin();
  app.innerHTML = shellHtml();
  app.querySelector("[data-logout]").addEventListener("click", logout);
  app.querySelector("[data-menu]").addEventListener("click", () => app.querySelector("[data-sidebar]").classList.toggle("open"));
  await renderRoute();
}
function setRoute(route) { state.route = route; document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.route === route)); const sidebar = app.querySelector("[data-sidebar]"); if (sidebar) sidebar.classList.remove("open"); }
window.addEventListener("hashchange", async () => {
  if (!state.token) return;
  const target = location.hash.replace("#", "") || "dashboard";
  const visibleRoutes = new Set(visibleNavItems().map(([route]) => route));
  setRoute(visibleRoutes.has(target) ? target : "dashboard");
  if (state.route === "dashboard" && target !== "dashboard") location.hash = "dashboard";
  await renderRoute();
});
function content() { return app.querySelector("[data-content]"); }
function loading() { content().innerHTML = `<div class="metrics"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`; }
function pageHead(title, subtitle, actions = "") { return `<header class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></header>`; }

async function renderRoute() {
  loading();
  try {
    const routes = { dashboard: renderDashboard, associados: renderAssociates, mensalidades: renderInvoices, cobrancas: renderCharges, projetos: renderProjects, patrimonio: renderAssets, protocolos: renderProtocols, financeiro: renderFinancial, mercadopago: renderMercadoPago, saas: renderSaasDashboard, assinatura: renderSubscription, configuracoes: renderSettings };
    const visibleRoutes = new Set(visibleNavItems().map(([route]) => route));
    if (!visibleRoutes.has(state.route)) {
      setRoute("dashboard");
      location.hash = "dashboard";
    }
    await (routes[state.route] || renderDashboard)();
  } catch (error) { content().innerHTML = `<div class="card empty">Não foi possível carregar esta tela.<br><small>${escapeHtml(error.message)}</small></div>`; toast(error.message, true); }
}

async function renderDashboard() {
  const [{ data }, me] = await Promise.all([api("/api/dashboard"), api("/api/me")]); state.me = me; syncSessionBranding(me);
  const max = Math.max(...data.months.map((m) => Math.max(m.received, m.charged)), 1); const delinquency = data.associates ? Math.round((data.overdueInvoices / Math.max(data.pendingInvoices + data.paidInvoices + data.overdueInvoices, 1)) * 100) : 0; const sub = me.subscription || {}; const trialDays = sub.trialEndsAt ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt) - new Date()) / 86400000)) : 0;
  const branding = resolveBranding(me.branding);
  content().innerHTML = `${pageHead("Dashboard", "Visão geral da operação da associação.")}<section class="card brand-banner"><div><small>Identidade ativa</small><h2>${escapeHtml(currentTenantName())}</h2><p>${escapeHtml(me.tenant?.legalDocument || "Documento não informado")}</p></div><div class="brand-banner-logo">${brandLogoHtml(branding, 72, "brand-banner-img")}</div></section><section class="metrics">
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
function tableAssociates(rows) { if (!rows.length) return '<div class="card empty">Nenhum associado encontrado.</div>'; return `<div class="table-wrap"><table class="table"><thead><tr><th>Associado</th><th>Contato</th><th>Localização</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map((a) => `<tr><td><div class="cell-title">${escapeHtml(a.name)}</div><div class="cell-sub">${escapeHtml(a.cpf)}</div></td><td>${escapeHtml(a.phone)}<div class="cell-sub">${escapeHtml(a.email || "—")}</div></td><td>${escapeHtml([a.city, a.state].filter(Boolean).join(" / ") || a.address || "—")}</td><td>${badge(a.status)}</td><td><div class="row-actions"><button class="button button-secondary button-sm" data-edit-associate="${a._id}">Editar</button><button class="button button-secondary button-sm" data-generate-associate-charge="${a._id}">Gerar cobrança</button><button class="button button-ghost button-sm" data-disable-associate="${a._id}">${a.status === "active" ? "Inativar" : "Excluir"}</button></div></td></tr>`).join("")}</tbody></table></div>`; }
function bindAssociateActions(list) { content().querySelectorAll("[data-edit-associate]").forEach((button) => button.addEventListener("click", () => openAssociateModal(list.find((a) => a._id === button.dataset.editAssociate)))); content().querySelectorAll("[data-generate-associate-charge]").forEach((button) => button.addEventListener("click", () => openAssociateChargeModal(list.find((a) => a._id === button.dataset.generateAssociateCharge)))); content().querySelectorAll("[data-disable-associate]").forEach((button) => button.addEventListener("click", async () => { if (!confirm("Deseja inativar este associado?")) return; try { await api(`/api/associates/${button.dataset.disableAssociate}`, { method: "DELETE" }); toast("Associado inativado."); await renderAssociates(); } catch (error) { toast(error.message, true); } })); }
function defaultDueDateInput() { const date = new Date(); date.setMonth(date.getMonth() + 1); return date.toISOString().slice(0, 10); }
function checkboxField(name, label, checked = true) { return '<label class="field checkbox-field"><input name="' + name + '" type="checkbox" ' + (checked ? 'checked' : '') + '><span>' + label + '</span></label>'; }
function openGeneratedChargeResult(result) { const pix = result.pix?.copyPaste || result.pix?.qrCode || ""; openModal("Cobrança gerada", '<div class="detail-grid"><div class="detail-item"><small>Valor</small>' + money(result.amount) + '</div><div class="detail-item"><small>Status</small>' + badge(result.status) + '</div><div class="detail-item"><small>Vencimento</small>' + date(result.dueDate) + '</div></div>' + (pix ? '<div style="margin-top:16px"><div class="pix-code">' + escapeHtml(pix) + '</div><div class="actions" style="margin-top:14px"><button class="button button-primary" type="button" data-copy-generated-pix>Copiar PIX</button></div></div>' : '') + (result.pdfUrl ? '<div class="actions" style="margin-top:14px"><button class="button button-secondary" type="button" data-open-generated-pdf>Abrir PDF</button></div>' : ''), null, "Fechar"); document.querySelector("[data-copy-generated-pix]")?.addEventListener("click", async () => { await navigator.clipboard.writeText(pix); toast("PIX copiado."); }); document.querySelector("[data-open-generated-pdf]")?.addEventListener("click", () => downloadPdf(result.invoiceId)); }
function openAssociateChargeModal(associate = {}) { const dueDate = defaultDueDateInput(); openModal("Gerar cobrança", '<form data-associate-charge-form><div class="form-grid"><div class="detail-item span-2"><small>Associado</small>' + escapeHtml(associate.name || "—") + '</div>' + field("amount", "Valor", "", "number", true, 'step="0.01" min="0.01"') + field("dueDate", "Vencimento", dueDate, "date", true) + field("description", "Descrição", "Mensalidade", "text", true) + checkboxField("generatePix", "Gerar PIX", true) + checkboxField("generatePdf", "Gerar PDF", true) + '</div></form>', async () => { const form = document.querySelector("[data-associate-charge-form]"); if (!form.reportValidity()) return false; const fd = new FormData(form); const result = await api('/api/invoices/admin/associates/' + associate._id + '/generate', { method: "POST", body: JSON.stringify({ amount: Number(fd.get("amount") || 0), dueDate: fd.get("dueDate"), description: fd.get("description"), generatePix: fd.has("generatePix"), generatePdf: fd.has("generatePdf") }) }); toast("Cobrança gerada."); openGeneratedChargeResult(result); await renderAssociates(); }, "Cancelar", "Gerar cobrança"); }
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

function projectTypeLabel(type) { const labels = { obra: "Obra", projeto: "Projeto", evento: "Evento", campanha: "Campanha", outro: "Outro" }; return labels[type] || type || "—"; }
function projectStatusLabel(status) { const labels = { planning: "Planejamento", active: "Ativo", paused: "Pausado", completed: "Concluído", cancelled: "Cancelado" }; return labels[status] || status || "—"; }
function projectBudgetCategoryLabel(category) { const labels = { mao_de_obra: "Mão de obra", material: "Material", servico: "Serviço", equipamento: "Equipamento", deslocamento: "Deslocamento", outro: "Outro" }; return labels[category] || "Outro"; }
function projectTypeFilter(value = "") { return `<select class="select" data-project-type style="max-width:180px"><option value="">Todos os tipos</option><option value="obra" ${value === "obra" ? "selected" : ""}>Obra</option><option value="projeto" ${value === "projeto" ? "selected" : ""}>Projeto</option><option value="evento" ${value === "evento" ? "selected" : ""}>Evento</option><option value="campanha" ${value === "campanha" ? "selected" : ""}>Campanha</option><option value="outro" ${value === "outro" ? "selected" : ""}>Outro</option></select>`; }
function projectStatusFilter(value = "") { return `<select class="select" data-project-status style="max-width:190px"><option value="">Todos os status</option><option value="planning" ${value === "planning" ? "selected" : ""}>Planejamento</option><option value="active" ${value === "active" ? "selected" : ""}>Ativos</option><option value="paused" ${value === "paused" ? "selected" : ""}>Pausados</option><option value="completed" ${value === "completed" ? "selected" : ""}>Concluídos</option><option value="cancelled" ${value === "cancelled" ? "selected" : ""}>Cancelados</option></select>`; }
function projectSelectField(projects = [], selected = "", name = "projectId", label = "Projeto", includeEmpty = true) { return `<label class="field"><span>${label}</span><select class="select" name="${name}">${includeEmpty ? '<option value="">Sem vínculo</option>' : ''}${projects.map((project) => `<option value="${project.id}" ${String(project.id) === String(selected || "") ? "selected" : ""}>${escapeHtml(project.name)} • ${escapeHtml(projectStatusLabel(project.status))}</option>`).join("")}</select></label>`; }
function assetSelectField(assets = [], selected = "", name = "assetId", label = "Patrimônio", includeEmpty = true) { return `<label class="field"><span>${label}</span><select class="select" name="${name}">${includeEmpty ? '<option value="">Sem vínculo</option>' : ''}${assets.map((asset) => `<option value="${asset.id}" ${String(asset.id) === String(selected || "") ? "selected" : ""}>${escapeHtml(asset.assetCode || '—')} • ${escapeHtml(asset.name || 'Sem nome')}</option>`).join("")}</select></label>`; }
function associateSelectField(associates = [], selected = "", name = "associateId", label = "Associado", includeEmpty = true) { return `<label class="field"><span>${label}</span><select class="select" name="${name}">${includeEmpty ? '<option value="">Sem vínculo</option>' : ''}${associates.map((associate) => `<option value="${associate._id || associate.id}" ${String(associate._id || associate.id) === String(selected || "") ? "selected" : ""}>${escapeHtml(associate.name || 'Sem nome')}</option>`).join("")}</select></label>`; }
function projectBudgetCategorySelect(value = "outro") { return `<select class="select" data-budget-field="category"><option value="mao_de_obra" ${value === "mao_de_obra" ? "selected" : ""}>Mão de obra</option><option value="material" ${value === "material" ? "selected" : ""}>Material</option><option value="servico" ${value === "servico" ? "selected" : ""}>Serviço</option><option value="equipamento" ${value === "equipamento" ? "selected" : ""}>Equipamento</option><option value="deslocamento" ${value === "deslocamento" ? "selected" : ""}>Deslocamento</option><option value="outro" ${value === "outro" ? "selected" : ""}>Outro</option></select>`; }
function projectBudgetNumber(value) { const num = Number(value); return Number.isFinite(num) ? num : 0; }
function normalizeProjectBudgetItem(item = {}) {
  return {
    description: String(item.description || ""),
    category: String(item.category || "outro"),
    quantity: projectBudgetNumber(item.quantity || 0),
    unit: String(item.unit || "unidade"),
    unitMaterialCost: projectBudgetNumber(item.unitMaterialCost || 0),
    unitLaborCost: projectBudgetNumber(item.unitLaborCost || 0),
    salePrice: item.salePrice === "" || item.salePrice === null || item.salePrice === undefined ? null : projectBudgetNumber(item.salePrice),
    notes: String(item.notes || "")
  };
}
function normalizeProjectBudgetItems(items = []) { return Array.isArray(items) ? items.map((item) => normalizeProjectBudgetItem(item)) : []; }
function calculateProjectBudgetTotals(items = []) {
  const totals = (items || []).reduce((acc, raw) => {
    const item = normalizeProjectBudgetItem(raw);
    const material = Number((item.quantity * item.unitMaterialCost).toFixed(2));
    const labor = Number((item.quantity * item.unitLaborCost).toFixed(2));
    const cost = Number((material + labor).toFixed(2));
    const sale = item.salePrice === null ? cost : Number(Number(item.salePrice || 0).toFixed(2));
    const profit = Number((sale - cost).toFixed(2));
    acc.materialTotal += material;
    acc.laborTotal += labor;
    acc.costTotal += cost;
    acc.saleTotal += sale;
    acc.profitTotal += profit;
    return acc;
  }, { materialTotal: 0, laborTotal: 0, costTotal: 0, saleTotal: 0, profitTotal: 0 });
  totals.materialTotal = Number(totals.materialTotal.toFixed(2));
  totals.laborTotal = Number(totals.laborTotal.toFixed(2));
  totals.costTotal = Number(totals.costTotal.toFixed(2));
  totals.saleTotal = Number(totals.saleTotal.toFixed(2));
  totals.profitTotal = Number(totals.profitTotal.toFixed(2));
  totals.profitMarginPercent = totals.saleTotal > 0 ? Number(((totals.profitTotal / totals.saleTotal) * 100).toFixed(2)) : 0;
  return totals;
}
function projectBudgetItemRow(item, index) {
  return `<tr data-budget-row="${index}"><td><input class="input" data-budget-field="description" value="${escapeHtml(item.description || "")}" placeholder="Descrição"></td><td>${projectBudgetCategorySelect(item.category || "outro")}</td><td><input class="input" type="number" step="0.01" min="0" data-budget-field="quantity" value="${escapeHtml(item.quantity || 0)}"></td><td><input class="input" data-budget-field="unit" value="${escapeHtml(item.unit || "unidade")}" placeholder="unidade"></td><td><input class="input" type="number" step="0.01" min="0" data-budget-field="unitMaterialCost" value="${escapeHtml(item.unitMaterialCost || 0)}"></td><td><input class="input" type="number" step="0.01" min="0" data-budget-field="unitLaborCost" value="${escapeHtml(item.unitLaborCost || 0)}"></td><td><input class="input" type="number" step="0.01" min="0" data-budget-field="salePrice" value="${item.salePrice === null ? "" : escapeHtml(item.salePrice || 0)}" placeholder="Auto = custo"></td><td><input class="input" data-budget-field="notes" value="${escapeHtml(item.notes || "")}" placeholder="Observação"></td><td><button class="button button-ghost button-sm" type="button" data-remove-budget-item="${index}">Remover</button></td></tr>`;
}
function renderProjectBudgetRows(items = []) {
  if (!items.length) return '<tr><td colspan="9"><span class="cell-sub">Nenhum item no orçamento.</span></td></tr>';
  return items.map((item, index) => projectBudgetItemRow(item, index)).join("");
}
function renderProjectBudgetTotals(totals = {}) {
  return `<div class="detail-grid"><div class="detail-item"><small>Material</small>${money(totals.materialTotal || 0)}</div><div class="detail-item"><small>Mão de obra</small>${money(totals.laborTotal || 0)}</div><div class="detail-item"><small>Custo total</small>${money(totals.costTotal || 0)}</div><div class="detail-item"><small>Venda total</small>${money(totals.saleTotal || 0)}</div><div class="detail-item"><small>Lucro</small>${money(totals.profitTotal || 0)}</div><div class="detail-item"><small>Margem</small>${Number(totals.profitMarginPercent || 0).toFixed(2)}%</div></div>`;
}
function collectProjectBudgetItems(form) {
  const rows = Array.from(form.querySelectorAll("[data-budget-row]"));
  return rows.map((row) => normalizeProjectBudgetItem({
    description: row.querySelector('[data-budget-field="description"]')?.value,
    category: row.querySelector('[data-budget-field="category"]')?.value,
    quantity: row.querySelector('[data-budget-field="quantity"]')?.value,
    unit: row.querySelector('[data-budget-field="unit"]')?.value,
    unitMaterialCost: row.querySelector('[data-budget-field="unitMaterialCost"]')?.value,
    unitLaborCost: row.querySelector('[data-budget-field="unitLaborCost"]')?.value,
    salePrice: row.querySelector('[data-budget-field="salePrice"]')?.value,
    notes: row.querySelector('[data-budget-field="notes"]')?.value
  }));
}
function bindProjectBudgetEditor(form, initialItems = []) {
  const body = form.querySelector("[data-budget-body]");
  const totalsEl = form.querySelector("[data-budget-totals]");
  const addButton = form.querySelector("[data-add-budget-item]");
  let items = normalizeProjectBudgetItems(initialItems);

  const render = () => {
    body.innerHTML = renderProjectBudgetRows(items);
    totalsEl.innerHTML = renderProjectBudgetTotals(calculateProjectBudgetTotals(items));
  };
  const syncTotals = () => {
    totalsEl.innerHTML = renderProjectBudgetTotals(calculateProjectBudgetTotals(collectProjectBudgetItems(form)));
  };

  addButton?.addEventListener("click", () => {
    items = collectProjectBudgetItems(form);
    items.push(normalizeProjectBudgetItem({ description: "", category: "outro", quantity: 1, unit: "unidade", unitMaterialCost: 0, unitLaborCost: 0, salePrice: null, notes: "" }));
    render();
  });

  body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-budget-item]");
    if (!button) return;
    const index = Number(button.dataset.removeBudgetItem || -1);
    items = collectProjectBudgetItems(form);
    if (index < 0 || index >= items.length) return;
    items.splice(index, 1);
    render();
  });

  body.addEventListener("input", syncTotals);
  body.addEventListener("change", syncTotals);
  render();
}
function renderProjectBudgetReport(items = []) {
  if (!items.length) return '<div class="card empty">Nenhum item de orçamento cadastrado.</div>';
  return '<div class="table-wrap"><table class="table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Qtd</th><th>Un.</th><th>Material</th><th>Mão de obra</th><th>Custo</th><th>Venda</th><th>Lucro</th></tr></thead><tbody>' +
    items.map((item) => '<tr><td><div class="cell-title">' + escapeHtml(item.description || "—") + '</div><div class="cell-sub">' + escapeHtml(item.notes || "") + '</div></td><td>' + escapeHtml(projectBudgetCategoryLabel(item.category)) + '</td><td>' + Number(item.quantity || 0) + '</td><td>' + escapeHtml(item.unit || "unidade") + '</td><td>' + money(item.totalMaterialCost || 0) + '</td><td>' + money(item.totalLaborCost || 0) + '</td><td>' + money(item.totalCost || 0) + '</td><td>' + money(item.salePrice || 0) + '</td><td>' + money(item.profit || 0) + '</td></tr>').join("") +
    '</tbody></table></div>';
}

async function renderProjects() {
  const [dashboard, list] = await Promise.all([api("/api/projects/dashboard"), api("/api/projects")]);
  let projects = list.projects || [];
  const q = String(state.projectFilters.q || "").toLowerCase();
  const status = state.projectFilters.status || "";
  const type = state.projectFilters.type || "";
  projects = projects.filter((item) => (!status || item.status === status) && (!type || item.type === type) && (!q || `${item.name} ${item.description} ${item.responsibleName} ${item.location}`.toLowerCase().includes(q)));
  content().innerHTML = `${pageHead("Projetos", "Obras, eventos e campanhas por tenant.", '<button class="button button-primary" data-new-project>+ Novo projeto</button>')}<section class="metrics">${metric("Total Projetos", dashboard.totalProjects || 0)}${metric("Ativos", dashboard.activeProjects || 0, "Em execução", true)}${metric("Concluídos", dashboard.completedProjects || 0)}${metric("Pausados", dashboard.pausedProjects || 0)}${metric("Orçamento Total", money(dashboard.totalBudget || 0), "Planejado", true)}${metric("Custo Previsto", money(dashboard.costTotal || 0), "Itens de orçamento")}${metric("Venda Prevista", money(dashboard.saleTotal || 0), "Comercial", true)}${metric("Lucro Previsto", money(dashboard.profitTotal || 0), `${Number(dashboard.profitMarginPercent || 0).toFixed(2)}%`, true)}${metric("Gasto Total", money(dashboard.totalSpent || 0), "Despesas pagas")}</section><section class="card" style="margin-top:16px"><div class="toolbar"><input class="input" data-project-search placeholder="Buscar por nome, responsável ou local" value="${escapeHtml(state.projectFilters.q || "")}">${projectTypeFilter(state.projectFilters.type)}${projectStatusFilter(state.projectFilters.status)}</div><div data-project-table>${renderProjectsTable(projects)}</div></section>`;
  bindProjects(projects);
}

function renderProjectsTable(projects = []) {
  if (!projects.length) return '<div class="card empty">Nenhum projeto encontrado.</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Tipo</th><th>Status</th><th>Responsável</th><th>Orçamento</th><th>Custo previsto</th><th>Venda prevista</th><th>Lucro previsto</th><th>Gasto real</th><th>Início</th><th>Fim</th><th>Ações</th></tr></thead><tbody>${projects.map((project) => `<tr><td><div class="cell-title">${escapeHtml(project.name)}</div><div class="cell-sub">${escapeHtml(project.location || project.description || "—")}</div></td><td>${escapeHtml(projectTypeLabel(project.type))}</td><td>${badge(project.status)}</td><td><div class="cell-title">${escapeHtml(project.responsibleName || "—")}</div><div class="cell-sub">${escapeHtml(project.responsiblePhone || "")}</div></td><td>${money(project.budget)}</td><td>${money(project.costTotal || 0)}</td><td>${money(project.saleTotal || 0)}</td><td><div class="cell-title">${money(project.profitTotal || 0)}</div><div class="cell-sub">${Number(project.profitMarginPercent || 0).toFixed(2)}%</div></td><td>${money(project.spent)}</td><td>${date(project.startDate)}</td><td>${date(project.endDate)}</td><td><div class="row-actions"><button class="button button-secondary button-sm" data-edit-project="${project.id}">Editar</button><button class="button button-secondary button-sm" data-report-project="${project.id}">Relatório</button>${project.status !== "completed" ? `<button class="button button-ghost button-sm" data-complete-project="${project.id}">Concluir</button>` : ""}${project.status !== "cancelled" ? `<button class="button button-ghost button-sm" data-cancel-project="${project.id}">Cancelar</button>` : ""}<button class="button button-danger button-sm" data-delete-project="${project.id}">Excluir</button></div></td></tr>`).join("")}</tbody></table></div>`;
}

function bindProjects(projects = []) {
  content().querySelector("[data-new-project]")?.addEventListener("click", () => openProjectModal());
  content().querySelector("[data-project-search]")?.addEventListener("input", async (event) => { state.projectFilters.q = event.currentTarget.value; await renderProjects(); });
  content().querySelector("[data-project-type]")?.addEventListener("change", async (event) => { state.projectFilters.type = event.currentTarget.value; await renderProjects(); });
  content().querySelector("[data-project-status]")?.addEventListener("change", async (event) => { state.projectFilters.status = event.currentTarget.value; await renderProjects(); });
  content().querySelectorAll("[data-edit-project]").forEach((button) => button.addEventListener("click", async () => { const result = await api(`/api/projects/${button.dataset.editProject}`); openProjectModal(result.project); }));
  content().querySelectorAll("[data-report-project]").forEach((button) => button.addEventListener("click", async () => { const report = await api(`/api/projects/${button.dataset.reportProject}/report`); openProjectReport(report); }));
  content().querySelectorAll("[data-complete-project]").forEach((button) => button.addEventListener("click", async () => { await api(`/api/projects/${button.dataset.completeProject}/complete`, { method: "POST" }); toast("Projeto concluído."); await renderProjects(); }));
  content().querySelectorAll("[data-cancel-project]").forEach((button) => button.addEventListener("click", async () => { await api(`/api/projects/${button.dataset.cancelProject}/cancel`, { method: "POST" }); toast("Projeto cancelado."); await renderProjects(); }));
  content().querySelectorAll("[data-delete-project]").forEach((button) => button.addEventListener("click", async () => { if (!confirm("Deseja excluir este projeto?")) return; await api(`/api/projects/${button.dataset.deleteProject}`, { method: "DELETE" }); toast("Projeto excluído."); await renderProjects(); }));
}

function openProjectModal(project = {}) {
  const isEdit = Boolean(project.id);
  const items = normalizeProjectBudgetItems(project.budgetItems || []);
  const totals = calculateProjectBudgetTotals(items);
  openModal(isEdit ? "Editar projeto" : "Novo projeto", `<form data-project-form><div class="form-grid">${field("name", "Nome", project.name || "", "text", true)}${projectTypeOptions(project.type || "projeto")}${projectStatusOptions(project.status || "planning")}${field("responsibleName", "Responsável", project.responsibleName || "")}${field("responsiblePhone", "Telefone", project.responsiblePhone || "", "tel")}${field("location", "Local", project.location || "")}${field("budget", "Orçamento", project.budget ?? "", "number", false, 'step="0.01" min="0"')}${field("startDate", "Data início", inputDateValue(project.startDate), "date")}${field("endDate", "Data fim", inputDateValue(project.endDate), "date")}<label class="field span-2"><span>Descrição</span><textarea class="textarea" name="description">${escapeHtml(project.description || "")}</textarea></label><label class="field span-2"><span>Observações</span><textarea class="textarea" name="notes">${escapeHtml(project.notes || "")}</textarea></label><section class="field span-2"><div class="saas-list-head" style="margin-bottom:8px"><div><h3>Orçamento</h3><p>Itens comerciais e operacionais do projeto.</p></div><button class="button button-secondary button-sm" type="button" data-add-budget-item>Adicionar item</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Quantidade</th><th>Unidade</th><th>Material unitário</th><th>Mão de obra unitária</th><th>Preço de venda</th><th>Observação</th><th>Ação</th></tr></thead><tbody data-budget-body>${renderProjectBudgetRows(items)}</tbody></table></div><div data-budget-totals style="margin-top:10px">${renderProjectBudgetTotals(totals)}</div></section></div></form>`, async () => { const form = document.querySelector("[data-project-form]"); if (!form.reportValidity()) return false; const fd = new FormData(form); const budgetItems = collectProjectBudgetItems(form); const budgetValue = String(fd.get("budget") || "").trim(); await api(isEdit ? `/api/projects/${project.id}` : "/api/projects", { method: isEdit ? "PUT" : "POST", body: JSON.stringify({ name: fd.get("name"), type: fd.get("type"), status: fd.get("status"), responsibleName: fd.get("responsibleName"), responsiblePhone: fd.get("responsiblePhone"), location: fd.get("location"), budget: budgetValue ? Number(budgetValue) : undefined, budgetItems, startDate: fd.get("startDate"), endDate: fd.get("endDate"), description: fd.get("description"), notes: fd.get("notes") }) }); toast(isEdit ? "Projeto atualizado." : "Projeto criado."); await renderProjects(); }, "Cancelar", isEdit ? "Salvar projeto" : "Criar projeto");
  const form = document.querySelector("[data-project-form]");
  if (form) bindProjectBudgetEditor(form, items);
}

function openProjectReport(report) {
  const project = report.project || {};
  const summary = report.summary || {};
  const budgetItems = report.budget?.items || project.budgetItems || [];
  openModal("Relatório do projeto", `<div class="detail-grid"><div class="detail-item"><small>Projeto</small>${escapeHtml(project.name || "—")}</div><div class="detail-item"><small>Tipo</small>${escapeHtml(projectTypeLabel(project.type))}</div><div class="detail-item"><small>Status</small>${badge(project.status || "planning")}</div><div class="detail-item"><small>Orçamento</small>${money(summary.totalBudget || 0)}</div><div class="detail-item"><small>Total material</small>${money(summary.materialTotal || 0)}</div><div class="detail-item"><small>Total mão de obra</small>${money(summary.laborTotal || 0)}</div><div class="detail-item"><small>Custo total</small>${money(summary.costTotal || 0)}</div><div class="detail-item"><small>Valor de venda</small>${money(summary.saleTotal || 0)}</div><div class="detail-item"><small>Lucro previsto</small>${money(summary.profitTotal || 0)}</div><div class="detail-item"><small>Margem prevista</small>${Number(summary.profitMarginPercent || 0).toFixed(2)}%</div><div class="detail-item"><small>Despesas reais vinculadas</small>${money(summary.totalSpent || 0)}</div><div class="detail-item"><small>Lucro estimado x gasto real</small>${money(summary.estimatedProfitVsRealSpend || 0)}</div><div class="detail-item"><small>Diferença custo previsto x real</small>${money(summary.costVarianceVsRealSpend || 0)}</div><div class="detail-item"><small>Despesas pagas</small>${Number(summary.paidExpenses || 0)}</div><div class="detail-item"><small>Despesas pendentes</small>${Number(summary.pendingExpenses || 0)}</div><div class="detail-item"><small>Total despesas</small>${Number(summary.expenseCount || 0)}</div></div><h3 style="margin:16px 0 10px">Orçamento detalhado</h3>${renderProjectBudgetReport(budgetItems)}<h3 style="margin:16px 0 10px">Despesas reais vinculadas</h3>${renderReportTransactions((report.expenses || []).map((item) => ({ ...item, type: "expense" })))}`, null, "Fechar");
}


function assetCategoryLabel(value) { const labels = { veiculo: "Veículo", maquina: "Máquina", ferramenta: "Ferramenta", computador: "Computador", notebook: "Notebook", impressora: "Impressora", camera: "Câmera", radio: "Rádio", roteador: "Roteador", switch: "Switch", fibra: "Fibra", imovel: "Imóvel", estoque: "Estoque", outro: "Outro" }; return labels[value] || value || "—"; }
function assetCategoryFilter(value = "") { return `<select class="select" data-asset-category style="max-width:180px"><option value="">Todas as categorias</option><option value="veiculo" ${value === "veiculo" ? "selected" : ""}>Veículo</option><option value="maquina" ${value === "maquina" ? "selected" : ""}>Máquina</option><option value="ferramenta" ${value === "ferramenta" ? "selected" : ""}>Ferramenta</option><option value="computador" ${value === "computador" ? "selected" : ""}>Computador</option><option value="notebook" ${value === "notebook" ? "selected" : ""}>Notebook</option><option value="impressora" ${value === "impressora" ? "selected" : ""}>Impressora</option><option value="camera" ${value === "camera" ? "selected" : ""}>Câmera</option><option value="radio" ${value === "radio" ? "selected" : ""}>Rádio</option><option value="roteador" ${value === "roteador" ? "selected" : ""}>Roteador</option><option value="switch" ${value === "switch" ? "selected" : ""}>Switch</option><option value="fibra" ${value === "fibra" ? "selected" : ""}>Fibra</option><option value="imovel" ${value === "imovel" ? "selected" : ""}>Imóvel</option><option value="estoque" ${value === "estoque" ? "selected" : ""}>Estoque</option><option value="outro" ${value === "outro" ? "selected" : ""}>Outro</option></select>`; }
function assetStatusFilter(value = "") { return `<select class="select" data-asset-status style="max-width:180px"><option value="">Todos os status</option><option value="active" ${value === "active" ? "selected" : ""}>Ativos</option><option value="maintenance" ${value === "maintenance" ? "selected" : ""}>Manutenção</option><option value="stored" ${value === "stored" ? "selected" : ""}>Armazenados</option><option value="lost" ${value === "lost" ? "selected" : ""}>Perdidos</option><option value="sold" ${value === "sold" ? "selected" : ""}>Vendidos</option><option value="retired" ${value === "retired" ? "selected" : ""}>Baixados</option></select>`; }
function assetCategorySelect(value = "outro") { return selectField("category", "Categoria", [["veiculo", "Veículo"], ["maquina", "Máquina"], ["ferramenta", "Ferramenta"], ["computador", "Computador"], ["notebook", "Notebook"], ["impressora", "Impressora"], ["camera", "Câmera"], ["radio", "Rádio"], ["roteador", "Roteador"], ["switch", "Switch"], ["fibra", "Fibra"], ["imovel", "Imóvel"], ["estoque", "Estoque"], ["outro", "Outro"]], value); }
function renderAssetsTable(items = []) {
  if (!items.length) return '<div class="card empty">Nenhum ativo encontrado.</div>';
  return '<div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Nome</th><th>Categoria</th><th>Responsável</th><th>Projeto</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead><tbody>' +
    items.map((asset) => '<tr><td><div class="cell-title">' + escapeHtml(asset.assetCode) + '</div><div class="cell-sub">' + escapeHtml(asset.serialNumber || '—') + '</div></td><td><div class="cell-title">' + escapeHtml(asset.name) + '</div><div class="cell-sub">' + escapeHtml(asset.location || asset.description || '—') + '</div></td><td>' + escapeHtml(assetCategoryLabel(asset.category)) + '</td><td>' + escapeHtml(asset.responsibleName || '—') + '</td><td>' + escapeHtml(asset.projectName || '—') + '</td><td>' + badge(asset.status) + '</td><td><div class="cell-title">' + money(asset.currentValue || 0) + '</div><div class="cell-sub">Aquisição ' + money(asset.acquisitionValue || 0) + '</div></td><td><div class="row-actions"><button class="button button-secondary button-sm" data-edit-asset="' + asset.id + '">Editar</button><button class="button button-secondary button-sm" data-maintenance-asset="' + asset.id + '">Manutenção</button><button class="button button-ghost button-sm" data-retire-asset="' + asset.id + '">Baixar</button><button class="button button-ghost button-sm" data-sell-asset="' + asset.id + '">Vender</button><button class="button button-danger button-sm" data-delete-asset="' + asset.id + '">Excluir</button></div></td></tr>').join('') +
    '</tbody></table></div>';
}
async function renderAssets() {
  const [dashboard, list] = await Promise.all([api('/api/assets/dashboard'), api('/api/assets')]);
  let assets = list.assets || [];
  const q = String(state.assetFilters.q || '').toLowerCase();
  const status = state.assetFilters.status || '';
  const category = state.assetFilters.category || '';
  assets = assets.filter((item) => (!status || item.status === status) && (!category || item.category === category) && (!q || `${item.assetCode} ${item.name} ${item.serialNumber} ${item.responsibleName} ${item.projectName}`.toLowerCase().includes(q)));
  content().innerHTML = `${pageHead("Patrimônio", "Controle patrimonial multi-tenant integrado a projetos.", '<button class="button button-primary" data-new-asset>+ Novo ativo</button>')}<section class="metrics">${metric("Total de ativos", dashboard.totalAssets || 0)}${metric("Em uso", dashboard.activeAssets || 0, "Ativos", true)}${metric("Em manutenção", dashboard.maintenanceAssets || 0)}${metric("Baixados", dashboard.retiredAssets || 0)}${metric("Valor aquisição", money(dashboard.totalAcquisitionValue || 0), "Investimento", true)}${metric("Valor atual", money(dashboard.totalCurrentValue || 0), "Base patrimonial")}</section><section class="card" style="margin-top:16px"><div class="toolbar"><input class="input" data-asset-search placeholder="Buscar por código, nome, série, responsável ou projeto" value="${escapeHtml(state.assetFilters.q || '')}">${assetCategoryFilter(state.assetFilters.category)}${assetStatusFilter(state.assetFilters.status)}</div><div data-asset-table>${renderAssetsTable(assets)}</div></section>`;
  bindAssets(assets);
}
function bindAssets(assets = []) {
  content().querySelector('[data-new-asset]')?.addEventListener('click', () => openAssetModal());
  content().querySelector('[data-asset-search]')?.addEventListener('input', async (event) => { state.assetFilters.q = event.currentTarget.value; await renderAssets(); });
  content().querySelector('[data-asset-status]')?.addEventListener('change', async (event) => { state.assetFilters.status = event.currentTarget.value; await renderAssets(); });
  content().querySelector('[data-asset-category]')?.addEventListener('change', async (event) => { state.assetFilters.category = event.currentTarget.value; await renderAssets(); });
  content().querySelectorAll('[data-edit-asset]').forEach((button) => button.addEventListener('click', () => openAssetModal(assets.find((item) => item.id === button.dataset.editAsset) || {})));
  content().querySelectorAll('[data-maintenance-asset]').forEach((button) => button.addEventListener('click', () => openAssetActionModal(assets.find((item) => item.id === button.dataset.maintenanceAsset) || {}, 'maintenance', 'Registrar manutenção', 'Registrar manutenção')));
  content().querySelectorAll('[data-retire-asset]').forEach((button) => button.addEventListener('click', () => openAssetActionModal(assets.find((item) => item.id === button.dataset.retireAsset) || {}, 'retire', 'Baixar ativo', 'Confirmar baixa')));
  content().querySelectorAll('[data-sell-asset]').forEach((button) => button.addEventListener('click', () => openAssetActionModal(assets.find((item) => item.id === button.dataset.sellAsset) || {}, 'sell', 'Vender ativo', 'Confirmar venda')));
  content().querySelectorAll('[data-delete-asset]').forEach((button) => button.addEventListener('click', async () => { const asset = assets.find((item) => item.id === button.dataset.deleteAsset) || {}; if (!confirm(`Deseja excluir o ativo ${asset.assetCode || ''}?`)) return; await api(`/api/assets/${button.dataset.deleteAsset}`, { method: 'DELETE', body: JSON.stringify({ notes: asset.notes || '' }) }); toast('Ativo excluído.'); await renderAssets(); }));
}
async function openAssetModal(asset = {}) {
  const isEdit = Boolean(asset.id);
  const projects = (await api('/api/projects')).projects || [];
  openModal(isEdit ? 'Editar ativo' : 'Novo ativo', `<form data-asset-form><div class="form-grid">${field('name', 'Nome', asset.name || '', 'text', true)}${assetCategorySelect(asset.category || 'outro')}${field('serialNumber', 'Número de série', asset.serialNumber || '')}${field('supplier', 'Fornecedor', asset.supplier || '')}${field('acquisitionValue', 'Valor aquisição', asset.acquisitionValue ?? '', 'number', false, 'step="0.01" min="0"')}${field('currentValue', 'Valor atual', asset.currentValue ?? '', 'number', false, 'step="0.01" min="0"')}${field('responsibleName', 'Responsável', asset.responsibleName || '')}${field('location', 'Local', asset.location || '')}${projectSelectField(projects, asset.projectId || '')}${field('acquisitionDate', 'Data aquisição', inputDateValue(asset.acquisitionDate), 'date')}<label class="field span-2"><span>Descrição</span><textarea class="textarea" name="description">${escapeHtml(asset.description || '')}</textarea></label><label class="field span-2"><span>Observações</span><textarea class="textarea" name="notes">${escapeHtml(asset.notes || '')}</textarea></label></div></form>`, async () => { const form = document.querySelector('[data-asset-form]'); if (!form.reportValidity()) return false; const fd = new FormData(form); await api(isEdit ? `/api/assets/${asset.id}` : '/api/assets', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify({ name: fd.get('name'), category: fd.get('category'), serialNumber: fd.get('serialNumber'), supplier: fd.get('supplier'), acquisitionValue: fd.get('acquisitionValue') ? Number(fd.get('acquisitionValue')) : 0, currentValue: fd.get('currentValue') ? Number(fd.get('currentValue')) : 0, responsibleName: fd.get('responsibleName'), location: fd.get('location'), projectId: fd.get('projectId') || undefined, acquisitionDate: fd.get('acquisitionDate') || undefined, description: fd.get('description'), notes: fd.get('notes') }) }); toast(isEdit ? 'Ativo atualizado.' : 'Ativo criado.'); await renderAssets(); }, 'Cancelar', isEdit ? 'Salvar ativo' : 'Criar ativo');
}
function openAssetActionModal(asset = {}, action = 'maintenance', title = 'Atualizar ativo', saveLabel = 'Salvar') {
  const endpoint = action === 'sell' ? 'sell' : action === 'retire' ? 'retire' : 'maintenance';
  openModal(title, `<form data-asset-action-form><div class="form-grid"><div class="detail-item span-2"><small>Ativo</small>${escapeHtml(asset.assetCode || '—')} • ${escapeHtml(asset.name || '—')}</div>${field('currentValue', 'Valor atual', asset.currentValue ?? '', 'number', false, 'step="0.01" min="0"')}${field('responsibleName', 'Responsável', asset.responsibleName || '')}${field('location', 'Local', asset.location || '')}<label class="field span-2"><span>Observações</span><textarea class="textarea" name="notes">${escapeHtml(asset.notes || '')}</textarea></label></div></form>`, async () => { const form = document.querySelector('[data-asset-action-form]'); const fd = new FormData(form); await api(`/api/assets/${asset.id}/${endpoint}`, { method: 'POST', body: JSON.stringify({ currentValue: fd.get('currentValue') ? Number(fd.get('currentValue')) : undefined, responsibleName: fd.get('responsibleName') || undefined, location: fd.get('location') || undefined, notes: fd.get('notes') || '' }) }); toast(action === 'sell' ? 'Ativo vendido.' : action === 'retire' ? 'Ativo baixado.' : 'Manutenção registrada.'); await renderAssets(); }, 'Cancelar', saveLabel);
}

function protocolTypeLabel(value) { const labels = { solicitacao: 'Solicitação', reclamacao: 'Reclamação', manutencao: 'Manutenção', documento: 'Documento', financeiro: 'Financeiro', compra: 'Compra', patrimonio: 'Patrimônio', projeto: 'Projeto', outro: 'Outro' }; return labels[value] || value || '—'; }
function protocolPriorityLabel(value) { const labels = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' }; return labels[value] || value || '—'; }
function protocolPriorityBadge(value) { const tone = value === 'urgent' ? 'overdue' : value === 'high' ? 'rejected' : value === 'medium' ? 'pending' : 'inactive'; return `<span class="badge badge-${tone}">${escapeHtml(protocolPriorityLabel(value))}</span>`; }
function protocolStatusFilter(value = '') { return `<select class="select" data-protocol-status style="max-width:170px"><option value="">Todos os status</option><option value="open" ${value === 'open' ? 'selected' : ''}>Abertos</option><option value="in_progress" ${value === 'in_progress' ? 'selected' : ''}>Em andamento</option><option value="waiting" ${value === 'waiting' ? 'selected' : ''}>Aguardando</option><option value="resolved" ${value === 'resolved' ? 'selected' : ''}>Resolvidos</option><option value="closed" ${value === 'closed' ? 'selected' : ''}>Fechados</option><option value="cancelled" ${value === 'cancelled' ? 'selected' : ''}>Cancelados</option></select>`; }
function protocolPriorityFilter(value = '') { return `<select class="select" data-protocol-priority style="max-width:160px"><option value="">Todas prioridades</option><option value="urgent" ${value === 'urgent' ? 'selected' : ''}>Urgente</option><option value="high" ${value === 'high' ? 'selected' : ''}>Alta</option><option value="medium" ${value === 'medium' ? 'selected' : ''}>Média</option><option value="low" ${value === 'low' ? 'selected' : ''}>Baixa</option></select>`; }
function protocolTypeFilter(value = '') { return `<select class="select" data-protocol-type style="max-width:170px"><option value="">Todos os tipos</option><option value="solicitacao" ${value === 'solicitacao' ? 'selected' : ''}>Solicitação</option><option value="reclamacao" ${value === 'reclamacao' ? 'selected' : ''}>Reclamação</option><option value="manutencao" ${value === 'manutencao' ? 'selected' : ''}>Manutenção</option><option value="documento" ${value === 'documento' ? 'selected' : ''}>Documento</option><option value="financeiro" ${value === 'financeiro' ? 'selected' : ''}>Financeiro</option><option value="compra" ${value === 'compra' ? 'selected' : ''}>Compra</option><option value="patrimonio" ${value === 'patrimonio' ? 'selected' : ''}>Patrimônio</option><option value="projeto" ${value === 'projeto' ? 'selected' : ''}>Projeto</option><option value="outro" ${value === 'outro' ? 'selected' : ''}>Outro</option></select>`; }
function protocolTypeSelect(value = 'solicitacao') { return selectField('type', 'Tipo', [['solicitacao', 'Solicitação'], ['reclamacao', 'Reclamação'], ['manutencao', 'Manutenção'], ['documento', 'Documento'], ['financeiro', 'Financeiro'], ['compra', 'Compra'], ['patrimonio', 'Patrimônio'], ['projeto', 'Projeto'], ['outro', 'Outro']], value); }
function protocolPrioritySelect(value = 'medium') { return selectField('priority', 'Prioridade', [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['urgent', 'Urgente']], value); }
function protocolStatusSelect(value = 'open') { return selectField('status', 'Status', [['open', 'Aberto'], ['in_progress', 'Em andamento'], ['waiting', 'Aguardando'], ['resolved', 'Resolvido'], ['closed', 'Fechado'], ['cancelled', 'Cancelado']], value); }
function protocolQuery() {
  const params = new URLSearchParams({ page: state.protocolFilters.page, limit: state.protocolFilters.limit });
  ['q', 'status', 'priority', 'type', 'dateFrom', 'dateTo'].forEach((key) => {
    if (state.protocolFilters[key]) params.set(key, state.protocolFilters[key]);
  });
  return params.toString();
}
function protocolActionButtons(protocol) {
  return '<div class="row-actions"><button class="button button-secondary button-sm" data-edit-protocol="' + protocol.id + '">Editar</button><button class="button button-secondary button-sm" data-status-protocol="' + protocol.id + '">Status</button>' +
    (protocol.status !== 'resolved' && protocol.status !== 'closed' && protocol.status !== 'cancelled' ? '<button class="button button-ghost button-sm" data-resolve-protocol="' + protocol.id + '">Resolver</button>' : '') +
    (protocol.status !== 'closed' && protocol.status !== 'cancelled' ? '<button class="button button-ghost button-sm" data-close-protocol="' + protocol.id + '">Fechar</button>' : '') +
    (protocol.status !== 'cancelled' ? '<button class="button button-ghost button-sm" data-cancel-protocol="' + protocol.id + '">Cancelar</button>' : '') +
    '<button class="button button-ghost button-sm" data-history-protocol="' + protocol.id + '">Histórico</button></div>';
}
function renderProtocolsTable(items = []) {
  if (!items.length) return '<div class="card empty">Nenhum protocolo encontrado.</div>';
  return '<div class="table-wrap"><table class="table"><thead><tr><th>Número</th><th>Título</th><th>Tipo</th><th>Prioridade</th><th>Status</th><th>Solicitante</th><th>Responsável</th><th>Vencimento</th><th>Ações</th></tr></thead><tbody>' +
    items.map((protocol) => '<tr><td><div class="cell-title">' + escapeHtml(protocol.protocolNumber || '—') + '</div><div class="cell-sub">Criado em ' + date(protocol.createdAt) + '</div></td><td><div class="cell-title">' + escapeHtml(protocol.title || '—') + '</div><div class="cell-sub">' + escapeHtml(protocol.relatedProjectName || protocol.relatedAssetName || protocol.relatedAssociateName || protocol.description || '—') + '</div></td><td>' + escapeHtml(protocolTypeLabel(protocol.type)) + '</td><td>' + protocolPriorityBadge(protocol.priority) + '</td><td>' + badge(protocol.status) + '</td><td><div class="cell-title">' + escapeHtml(protocol.requesterName || '—') + '</div><div class="cell-sub">' + escapeHtml(protocol.requesterContact || '') + '</div></td><td>' + escapeHtml(protocol.assignedToName || '—') + '</td><td>' + date(protocol.dueDate) + '</td><td>' + protocolActionButtons(protocol) + '</td></tr>').join('') +
    '</tbody></table></div>';
}
async function renderProtocols() {
  const [dashboard, list] = await Promise.all([api('/api/protocols/dashboard'), api(`/api/protocols?${protocolQuery()}`)]);
  const protocols = list.protocols || [];
  content().innerHTML = `${pageHead('Protocolos', 'Solicitações internas e externas com workflow e histórico.', '<button class="button button-primary" data-new-protocol>+ Novo protocolo</button>')}<section class="metrics">${metric('Total', dashboard.totalProtocols || 0)}${metric('Abertos', dashboard.openProtocols || 0, '', true)}${metric('Em andamento', dashboard.inProgressProtocols || 0)}${metric('Aguardando', dashboard.waitingProtocols || 0)}${metric('Resolvidos', dashboard.resolvedProtocols || 0)}${metric('Urgentes', dashboard.urgentProtocols || 0, '', true)}${metric('Atrasados', dashboard.overdueProtocols || 0)}</section><section class="card" style="margin-top:16px"><form class="toolbar" data-protocol-filters><input class="input" name="q" placeholder="Buscar por número, título, solicitante ou observação" value="${escapeHtml(state.protocolFilters.q || '')}">${protocolStatusFilter(state.protocolFilters.status)}${protocolPriorityFilter(state.protocolFilters.priority)}${protocolTypeFilter(state.protocolFilters.type)}<input class="input" type="date" name="dateFrom" value="${escapeHtml(state.protocolFilters.dateFrom || '')}"><input class="input" type="date" name="dateTo" value="${escapeHtml(state.protocolFilters.dateTo || '')}"><button class="button button-secondary" type="submit">Filtrar</button></form><div data-protocol-table>${renderProtocolsTable(protocols)}</div></section>`;
  bindProtocols(protocols);
}
function bindProtocols(protocols = []) {
  content().querySelector('[data-new-protocol]')?.addEventListener('click', () => openProtocolModal());
  content().querySelector('[data-protocol-filters]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.protocolFilters.q = String(form.get('q') || '');
    state.protocolFilters.status = String(form.get('status') || '');
    state.protocolFilters.priority = String(form.get('priority') || '');
    state.protocolFilters.type = String(form.get('type') || '');
    state.protocolFilters.dateFrom = String(form.get('dateFrom') || '');
    state.protocolFilters.dateTo = String(form.get('dateTo') || '');
    state.protocolFilters.page = 1;
    await renderProtocols();
  });
  content().querySelectorAll('[data-edit-protocol]').forEach((button) => button.addEventListener('click', () => openProtocolModal(protocols.find((item) => item.id === button.dataset.editProtocol) || {})));
  content().querySelectorAll('[data-status-protocol]').forEach((button) => button.addEventListener('click', () => openProtocolStatusModal(protocols.find((item) => item.id === button.dataset.statusProtocol) || {})));
  content().querySelectorAll('[data-resolve-protocol]').forEach((button) => button.addEventListener('click', () => openProtocolActionModal(protocols.find((item) => item.id === button.dataset.resolveProtocol) || {}, 'resolve', 'Resolver protocolo', 'Resolver', 'resolved')));
  content().querySelectorAll('[data-close-protocol]').forEach((button) => button.addEventListener('click', () => openProtocolActionModal(protocols.find((item) => item.id === button.dataset.closeProtocol) || {}, 'close', 'Fechar protocolo', 'Fechar', 'closed')));
  content().querySelectorAll('[data-cancel-protocol]').forEach((button) => button.addEventListener('click', () => openProtocolActionModal(protocols.find((item) => item.id === button.dataset.cancelProtocol) || {}, 'cancel', 'Cancelar protocolo', 'Cancelar', 'cancelled')));
  content().querySelectorAll('[data-history-protocol]').forEach((button) => button.addEventListener('click', () => openProtocolHistoryModal(protocols.find((item) => item.id === button.dataset.historyProtocol) || {})));
}
async function openProtocolModal(protocol = {}) {
  const isEdit = Boolean(protocol.id);
  const [projectsResponse, assetsResponse, associatesResponse] = await Promise.all([api('/api/projects'), api('/api/assets'), api('/api/associates?status=active')]);
  const projects = projectsResponse.projects || [];
  const assets = assetsResponse.assets || [];
  const associates = associatesResponse.associates || [];
  openModal(isEdit ? 'Editar protocolo' : 'Novo protocolo', `<form data-protocol-form><div class="form-grid">${field('title', 'Título', protocol.title || '', 'text', true)}${protocolTypeSelect(protocol.type || 'solicitacao')}${protocolPrioritySelect(protocol.priority || 'medium')}${protocolStatusSelect(protocol.status || 'open')}${field('requesterName', 'Solicitante', protocol.requesterName || '', 'text', true)}${field('requesterContact', 'Contato', protocol.requesterContact || '')}${field('assignedToName', 'Responsável', protocol.assignedToName || '')}${field('dueDate', 'Vencimento', inputDateValue(protocol.dueDate), 'date')}${projectSelectField(projects, protocol.relatedProjectId || '', 'relatedProjectId', 'Projeto relacionado')}${assetSelectField(assets, protocol.relatedAssetId || '', 'relatedAssetId', 'Patrimônio relacionado')}${associateSelectField(associates, protocol.relatedAssociateId || '', 'relatedAssociateId', 'Associado relacionado')}<label class="field span-2"><span>Descrição</span><textarea class="textarea" name="description">${escapeHtml(protocol.description || '')}</textarea></label><label class="field span-2"><span>Observações</span><textarea class="textarea" name="notes">${escapeHtml(protocol.notes || '')}</textarea></label></div></form>`, async () => {
    const form = document.querySelector('[data-protocol-form]');
    if (!form.reportValidity()) return false;
    const fd = new FormData(form);
    await api(isEdit ? `/api/protocols/${protocol.id}` : '/api/protocols', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify({ title: fd.get('title'), description: fd.get('description'), type: fd.get('type'), priority: fd.get('priority'), status: fd.get('status'), requesterName: fd.get('requesterName'), requesterContact: fd.get('requesterContact'), assignedToName: fd.get('assignedToName'), dueDate: fd.get('dueDate') || undefined, relatedProjectId: fd.get('relatedProjectId') || undefined, relatedAssetId: fd.get('relatedAssetId') || undefined, relatedAssociateId: fd.get('relatedAssociateId') || undefined, notes: fd.get('notes') }) });
    toast(isEdit ? 'Protocolo atualizado.' : 'Protocolo criado.');
    await renderProtocols();
  }, 'Cancelar', isEdit ? 'Salvar protocolo' : 'Criar protocolo');
}
function openProtocolStatusModal(protocol = {}) {
  openModal('Atualizar status do protocolo', `<form data-protocol-status-form><div class="form-grid"><div class="detail-item span-2"><small>Protocolo</small>${escapeHtml(protocol.protocolNumber || '—')} • ${escapeHtml(protocol.title || '—')}</div>${protocolStatusSelect(protocol.status || 'open')}<label class="field span-2"><span>Mensagem</span><textarea class="textarea" name="message">${escapeHtml(protocol.notes || '')}</textarea></label></div></form>`, async () => {
    const form = document.querySelector('[data-protocol-status-form]');
    const fd = new FormData(form);
    await api(`/api/protocols/${protocol.id}/status`, { method: 'POST', body: JSON.stringify({ status: fd.get('status'), message: fd.get('message') || '' }) });
    toast('Status do protocolo atualizado.');
    await renderProtocols();
  }, 'Cancelar', 'Salvar status');
}
function openProtocolActionModal(protocol = {}, endpoint = 'resolve', title = 'Atualizar protocolo', saveLabel = 'Salvar', finalStatus = '') {
  openModal(title, `<form data-protocol-action-form><div class="form-grid"><div class="detail-item span-2"><small>Protocolo</small>${escapeHtml(protocol.protocolNumber || '—')} • ${escapeHtml(protocol.title || '—')}</div><div class="detail-item"><small>Status atual</small>${badge(protocol.status || 'open')}</div><div class="detail-item"><small>Novo status</small>${badge(finalStatus || protocol.status || 'open')}</div><label class="field span-2"><span>Mensagem</span><textarea class="textarea" name="message">${escapeHtml(protocol.notes || '')}</textarea></label></div></form>`, async () => {
    const form = document.querySelector('[data-protocol-action-form]');
    const fd = new FormData(form);
    await api(`/api/protocols/${protocol.id}/${endpoint}`, { method: 'POST', body: JSON.stringify({ message: fd.get('message') || '' }) });
    toast(endpoint === 'resolve' ? 'Protocolo resolvido.' : endpoint === 'close' ? 'Protocolo fechado.' : 'Protocolo cancelado.');
    await renderProtocols();
  }, 'Cancelar', saveLabel);
}
async function openProtocolHistoryModal(protocol = {}) {
  const result = await api(`/api/protocols/${protocol.id}/history`);
  const history = result.history || [];
  const timeline = history.length
    ? history.map((item) => `<div style="position:relative;padding:0 0 18px 18px;border-left:2px solid var(--line)"><span style="position:absolute;left:-6px;top:3px;width:10px;height:10px;border-radius:999px;background:var(--primary)"></span><div class="cell-title">${escapeHtml(item.action || '—')} ${item.newStatus ? badge(item.newStatus) : ''}</div><div class="cell-sub">${dateTime(item.createdAt)} • ${escapeHtml(item.userEmail || 'Usuário não identificado')}</div><div style="margin-top:6px">${item.oldStatus ? `<small style="display:block;color:var(--muted)">Status anterior: ${escapeHtml(item.oldStatus)}</small>` : ''}${item.newStatus ? `<small style="display:block;color:var(--muted)">Novo status: ${escapeHtml(item.newStatus)}</small>` : ''}${escapeHtml(item.message || 'Sem mensagem adicional.')}</div></div>`).join('')
    : '<div class="card empty">Nenhum histórico registrado.</div>';
  openModal('Histórico do protocolo', `<div class="detail-grid"><div class="detail-item"><small>Número</small>${escapeHtml(result.protocol?.protocolNumber || protocol.protocolNumber || '—')}</div><div class="detail-item"><small>Status</small>${badge(result.protocol?.status || protocol.status || 'open')}</div><div class="detail-item"><small>Vencimento</small>${date(result.protocol?.dueDate || protocol.dueDate)}</div></div><div style="margin-top:18px">${timeline}</div>`, null, 'Fechar');
}

function financialQuery() {
  const params = new URLSearchParams({ page: state.financialFilters.page, limit: state.financialFilters.limit });
  ["q", "type", "status", "category", "dateFrom", "dateTo"].forEach((key) => {
    if (state.financialFilters[key]) params.set(key, state.financialFilters[key]);
  });
  return params.toString();
}
function financialTypeLabel(type) { return type === "income" ? "Entrada" : type === "expense" ? "Saída" : "—"; }
function paymentMethodLabel(method) { const labels = { pix: "PIX", cash: "Dinheiro", bank_transfer: "Transferência", card: "Cartão", boleto: "Boleto", other: "Outro" }; return labels[method] || method || "—"; }
function inputDateValue(value) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function financialPagination(list) {
  if (!list.totalPages || list.totalPages <= 1) return "";
  return '<div class="saas-pagination"><button class="button button-secondary button-sm" data-financial-page="' + (list.page - 1) + '"' + (list.page <= 1 ? ' disabled' : '') + '>Anterior</button><span>Página ' + list.page + ' de ' + list.totalPages + '</span><button class="button button-secondary button-sm" data-financial-page="' + (list.page + 1) + '"' + (list.page >= list.totalPages ? ' disabled' : '') + '>Próxima</button></div>';
}
function renderFinancialRows(items) {
  state.financialTransactions = items || [];
  if (!state.financialTransactions.length) return '<div class="card empty">Nenhuma transação financeira encontrada.</div>';
  return '<div class="table-wrap"><table class="table financial-table"><thead><tr><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Pago em</th><th>Status</th><th>Forma de pagamento</th><th>Ações</th></tr></thead><tbody>' +
    state.financialTransactions.map((item, index) => '<tr><td><div class="cell-title">' + financialTypeLabel(item.type) + '</div></td><td>' + escapeHtml(item.category || "—") + '</td><td><div class="cell-title">' + escapeHtml(item.description || "—") + '</div><div class="cell-sub">' + escapeHtml(item.supplierName || item.notes || "") + '</div></td><td>' + money(item.amount) + '</td><td>' + date(item.dueDate) + '</td><td>' + date(item.paidAt) + '</td><td>' + badge(item.status) + '</td><td>' + escapeHtml(paymentMethodLabel(item.paymentMethod)) + '</td><td><div class="row-actions">' + (item.status !== "paid" && item.status !== "cancelled" ? '<button class="button button-secondary button-sm" type="button" data-pay-financial="' + index + '">Marcar como pago</button><button class="button button-ghost button-sm" type="button" data-cancel-financial="' + index + '">Cancelar</button>' : '<span class="cell-sub">—</span>') + '</div></td></tr>').join("") +
    '</tbody></table></div>';
}

function renderCategorySummary(title, rows) {
  const list = rows || [];
  if (!list.length) return '<div class="detail-item"><small>' + title + '</small>Nenhum lançamento pago</div>';
  return '<div class="report-list"><h3>' + title + '</h3>' + list.map((item) => '<div class="report-row"><span>' + escapeHtml(item.category || "Sem categoria") + '<small>' + Number(item.count || 0) + ' lançamento(s)</small></span><strong>' + money(item.amount) + '</strong></div>').join("") + '</div>';
}
function renderReportTransactions(rows) {
  const list = rows || [];
  if (!list.length) return '<div class="card empty">Nenhum lançamento pago no mês.</div>';
  return '<div class="table-wrap"><table class="table financial-report-table"><thead><tr><th>Pago em</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>' +
    list.map((item) => '<tr><td>' + date(item.paidAt) + '</td><td>' + financialTypeLabel(item.type) + '</td><td>' + escapeHtml(item.category || "—") + '</td><td><div class="cell-title">' + escapeHtml(item.description || "—") + '</div><div class="cell-sub">' + escapeHtml(paymentMethodLabel(item.paymentMethod)) + '</div></td><td>' + money(item.amount) + '</td></tr>').join("") +
    '</tbody></table></div>';
}
function renderFinancialReportSection(report) {
  const totals = report?.totals || {};
  return '<section class="card financial-report-card"><header class="saas-list-head"><div><h2>Prestação de Contas</h2><p>' + escapeHtml(report?.period?.month || state.financialReportMonth) + '</p></div></header><form class="toolbar" data-financial-report-form><input class="input" type="month" name="month" value="' + escapeHtml(state.financialReportMonth) + '" required><button class="button button-primary" type="submit">Gerar relatório</button><button class="button button-secondary" type="button" data-download-financial-report>Baixar PDF</button></form>' +
    '<section class="metrics financial-report-metrics">' +
      metric("Saldo inicial", money(totals.openingBalance), "") +
      metric("Entradas recebidas", money(totals.incomePaid), "", true) +
      metric("Saídas pagas", money(totals.expensePaid), "") +
      metric("Resultado do mês", money(totals.balanceMonth), "", true) +
      metric("Saldo final", money(totals.closingBalance), "") +
      metric("Entradas pendentes", money(totals.incomePending), "", true) +
      metric("Saídas pendentes", money(totals.expensePending), "") +
    '</section><div class="financial-report-grid">' + renderCategorySummary("Receitas por categoria", report?.byCategory?.incomes || []) + renderCategorySummary("Despesas por categoria", report?.byCategory?.expenses || []) + '</div><h3 class="financial-report-subtitle">Lançamentos do mês</h3>' + renderReportTransactions(report?.transactions || []) + '</section>';
}

async function renderFinancial() {
  const [summaryResponse, list, report] = await Promise.all([
    api("/api/financial/summary"),
    api("/api/financial/transactions?" + financialQuery()),
    api("/api/financial/reports/monthly?month=" + encodeURIComponent(state.financialReportMonth))
  ]);
  const s = summaryResponse.summary || {};
  const overdueTotal = Number(s.overdueExpenses || 0) + Number(s.overdueIncomes || 0);
  content().innerHTML = pageHead("Financeiro", "Entradas, saídas e saldo da associação.", '<button class="button button-primary" type="button" data-new-income>Nova entrada</button><button class="button button-secondary" type="button" data-new-expense>Nova saída</button>') +
    '<section class="metrics">' +
      metric("Recebido no mês", money(s.incomePaidMonth), "Entradas pagas", true) +
      metric("Pago no mês", money(s.expensePaidMonth), "Saídas pagas") +
      metric("Saldo do mês", money(s.balanceMonth), "Recebido - pago", true) +
      metric("Saldo em caixa", money(s.cashBalance), "Total pago acumulado") +
      metric("Entradas pendentes", money(s.incomePending)) +
      metric("Saídas pendentes", money(s.expensePending), "", true) +
      metric("Vencidas", money(overdueTotal), "Entradas e saídas") +
    '</section>' + renderFinancialReportSection(report) + '<section class="card" style="margin-top:16px"><form class="toolbar" data-financial-filters><input class="input" name="q" placeholder="Buscar descrição, categoria, fornecedor" value="' + escapeHtml(state.financialFilters.q) + '"><select class="select" name="type" style="max-width:160px"><option value=""' + (!state.financialFilters.type ? ' selected' : '') + '>Todos os tipos</option><option value="income"' + (state.financialFilters.type === 'income' ? ' selected' : '') + '>Entradas</option><option value="expense"' + (state.financialFilters.type === 'expense' ? ' selected' : '') + '>Saídas</option></select><select class="select" name="status" style="max-width:180px"><option value=""' + (!state.financialFilters.status ? ' selected' : '') + '>Todos os status</option><option value="pending"' + (state.financialFilters.status === 'pending' ? ' selected' : '') + '>Pendentes</option><option value="paid"' + (state.financialFilters.status === 'paid' ? ' selected' : '') + '>Pagas</option><option value="cancelled"' + (state.financialFilters.status === 'cancelled' ? ' selected' : '') + '>Canceladas</option><option value="overdue"' + (state.financialFilters.status === 'overdue' ? ' selected' : '') + '>Vencidas</option></select><input class="input" name="category" placeholder="Categoria" value="' + escapeHtml(state.financialFilters.category) + '"><input class="input" type="date" name="dateFrom" value="' + escapeHtml(state.financialFilters.dateFrom) + '"><input class="input" type="date" name="dateTo" value="' + escapeHtml(state.financialFilters.dateTo) + '"><button class="button button-primary" type="submit">Filtrar</button></form>' + renderFinancialRows(list.items || []) + financialPagination(list) + '</section>';
  bindFinancial();
}
function bindFinancial() {
  content().querySelector("[data-new-income]")?.addEventListener("click", () => openFinancialModal("income"));
  content().querySelector("[data-new-expense]")?.addEventListener("click", () => openFinancialModal("expense"));
  content().querySelector("[data-financial-report-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.financialReportMonth = String(data.get("month") || state.financialReportMonth).trim();
    await renderFinancial();
  });
  content().querySelector("[data-download-financial-report]")?.addEventListener("click", async () => {
    await downloadFinancialReport(state.financialReportMonth);
  });
  content().querySelector("[data-financial-filters]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    ["q", "type", "status", "category", "dateFrom", "dateTo"].forEach((key) => { state.financialFilters[key] = String(data.get(key) || "").trim(); });
    state.financialFilters.page = 1;
    await renderFinancial();
  });
  content().querySelectorAll("[data-financial-page]").forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    state.financialFilters.page = Number(button.dataset.financialPage || 1);
    await renderFinancial();
  }));
  content().querySelectorAll("[data-pay-financial]").forEach((button) => button.addEventListener("click", async () => {
    const item = state.financialTransactions[Number(button.dataset.payFinancial)];
    if (!item) return;
    await api("/api/financial/transactions/" + item.id + "/pay", { method: "POST", body: JSON.stringify({ paymentMethod: item.paymentMethod || "other" }) });
    toast("Transação marcada como paga.");
    await renderFinancial();
  }));
  content().querySelectorAll("[data-cancel-financial]").forEach((button) => button.addEventListener("click", async () => {
    const item = state.financialTransactions[Number(button.dataset.cancelFinancial)];
    if (!item || !confirm("Deseja cancelar esta transação?")) return;
    await api("/api/financial/transactions/" + item.id + "/cancel", { method: "POST" });
    toast("Transação cancelada.");
    await renderFinancial();
  }));
}

async function downloadFinancialReport(month) {
  try {
    const result = await api("/api/financial/reports/monthly/pdf?month=" + encodeURIComponent(month));
    const response = await fetch(result.reportUrl, { headers: { Authorization: "Bearer " + state.token } });
    if (!response.ok) throw new Error("Não foi possível baixar o PDF.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast("PDF gerado.");
  } catch (error) {
    toast(error.message, true);
  }
}

async function openFinancialModal(type = "income", transaction = {}) {
  const isExpense = type === "expense";
  const projects = isExpense ? ((await api("/api/projects")).projects || []).filter((item) => item.status !== "cancelled") : [];
  openModal(isExpense ? "Nova saída" : "Nova entrada", '<form data-financial-form><div class="form-grid">' +
    '<input type="hidden" name="type" value="' + escapeHtml(type) + '">' +
    field("category", "Categoria", transaction.category || (isExpense ? "Fornecedores" : "Mensalidades"), "text", true) +
    field("amount", "Valor", transaction.amount || "", "number", true, 'step="0.01" min="0.01"') +
    field("description", "Descrição", transaction.description || "", "text", true) +
    field("dueDate", "Vencimento", inputDateValue(transaction.dueDate) || new Date().toISOString().slice(0, 10), "date", true) +
    selectField("paymentMethod", "Forma de pagamento", [["pix", "PIX"], ["cash", "Dinheiro"], ["bank_transfer", "Transferência"], ["card", "Cartão"], ["boleto", "Boleto"], ["other", "Outro"]], transaction.paymentMethod || "other") +
    (isExpense ? projectSelectField(projects, transaction.projectId) : "") +
    field("supplierName", "Fornecedor", transaction.supplierName || "", "text", false) +
    '<label class="field span-2"><span>Observação</span><textarea class="textarea" name="notes">' + escapeHtml(transaction.notes || "") + '</textarea></label>' +
    '</div></form>', async () => {
      const form = document.querySelector("[data-financial-form]");
      if (!form.reportValidity()) return false;
      const fd = new FormData(form);
      await api("/api/financial/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: fd.get("type"),
          category: fd.get("category"),
          description: fd.get("description"),
          amount: Number(fd.get("amount") || 0),
          dueDate: fd.get("dueDate"),
          paymentMethod: fd.get("paymentMethod"),
          projectId: fd.get("projectId") || "",
          supplierName: fd.get("supplierName"),
          notes: fd.get("notes"),
          referenceType: isExpense ? "supplier" : "manual"
        })
      });
      toast(isExpense ? "Saída criada." : "Entrada criada.");
      await renderFinancial();
    }, "Cancelar", isExpense ? "Criar saída" : "Criar entrada");
}

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

function saasPaymentsQuery() {
  const params = new URLSearchParams({ page: state.saasPaymentFilters.page, limit: state.saasPaymentFilters.limit });
  if (state.saasPaymentFilters.q) params.set("q", state.saasPaymentFilters.q);
  if (state.saasPaymentFilters.status) params.set("status", state.saasPaymentFilters.status);
  return params.toString();
}

function saasAuditQuery() {
  const params = new URLSearchParams({ page: state.saasAuditFilters.page, limit: state.saasAuditFilters.limit });
  ["q", "scope", "action", "status", "dateFrom", "dateTo"].forEach((key) => {
    if (state.saasAuditFilters[key]) params.set(key, state.saasAuditFilters[key]);
  });
  return params.toString();
}

function renderSaasTabs(active = "dashboard") {
  return '<div class="tabs saas-tabs"><button class="tab ' + (active === "dashboard" ? "active" : "") + '" type="button" data-saas-tab="dashboard">Dashboard</button><button class="tab ' + (active === "payments" ? "active" : "") + '" type="button" data-saas-tab="payments">Central Financeira</button><button class="tab ' + (active === "audit" ? "active" : "") + '" type="button" data-saas-tab="audit">Auditoria</button></div>';
}

function renderSaasSubscriptionRows(items) {
  if (!items.length) {
    return '<div class="empty saas-empty">Nenhuma assinatura encontrada.</div>';
  }

  return '<div class="table-wrap saas-table-wrap"><table class="table saas-table"><thead><tr><th>Associação</th><th>Plano</th><th>Status</th><th>Valor</th><th>Próxima cobrança</th><th>Fim do trial</th><th>Último pagamento</th><th>Status último pagamento</th><th>Ações</th></tr></thead><tbody>' +
    items.map((item) => '<tr><td><div class="cell-title">' + escapeHtml(item.tenantName || "—") + '</div><div class="cell-sub">' + escapeHtml(item.tenantSlug || item.tenantId || "—") + '</div></td><td>' + escapeHtml(planLabel(item.plan)) + '<div class="cell-sub">' + escapeHtml(formatEnabledModules(item.enabledModules)) + '</div></td><td>' + badge(item.status) + '</td><td><div class="cell-title">' + money(item.amount) + '</div><div class="cell-sub">Base ' + money(item.baseAmount) + ' + Adicional ' + money(item.additionalAmount) + '</div></td><td>' + date(item.nextBillingDate) + '</td><td>' + date(item.trialEndsAt) + '</td><td><div class="cell-title">' + date(item.lastPaymentAt) + '</div><div class="cell-sub">' + escapeHtml(item.lastPaymentId || "—") + '</div></td><td>' + (item.lastPaymentStatus ? badge(item.lastPaymentStatus) : '<span class="cell-sub">—</span>') + '</td><td><button class="button button-secondary button-sm" type="button" data-generate-saas-pix="' + escapeHtml(item.tenantId || "") + '">Gerar novo PIX</button></td></tr>').join("") +
    '</tbody></table></div>';
}

function labelAuditAction(action) { const labels = { saas_checkout: "Checkout SaaS", saas_webhook: "Webhook SaaS", saas_renewal: "Renovação SaaS", saas_manual_pix: "PIX manual SaaS", associate_invoice_manual: "Cobrança associado" }; return labels[action] || action || "—"; }
function labelScope(scope) { const labels = { saas: "SaaS", associate: "Associado" }; return labels[scope] || scope || "—"; }
function badgeNeutral(value) { return '<span class="badge badge-inactive">' + escapeHtml(value || "—") + '</span>'; }
function renderSaasAuditRows(items) {
  state.saasAudit = items || [];
  if (!state.saasAudit.length) return '<div class="empty saas-empty">Nenhum evento de auditoria encontrado.</div>';
  return '<div class="table-wrap saas-table-wrap"><table class="table saas-table saas-audit-table"><thead><tr><th>Data/hora</th><th>Associação</th><th>Usuário</th><th>Tipo</th><th>Ação</th><th>Status</th><th>Valor</th><th>PaymentId</th><th>InvoiceId</th><th>IP</th><th>Mensagem</th></tr></thead><tbody>' +
    state.saasAudit.map((item) => '<tr><td>' + dateTime(item.createdAt) + '</td><td><div class="cell-title">' + escapeHtml(item.tenantName || "—") + '</div><div class="cell-sub">' + escapeHtml(item.tenantId || "—") + '</div></td><td><div class="cell-title">' + escapeHtml(item.userEmail || "—") + '</div><div class="cell-sub">' + escapeHtml(item.userRole || "—") + '</div></td><td>' + badgeNeutral(labelScope(item.scope)) + '</td><td>' + badgeNeutral(labelAuditAction(item.action)) + '</td><td>' + badge(item.status) + '</td><td>' + money(item.amount) + '</td><td>' + escapeHtml(item.gatewayPaymentId || "—") + '</td><td>' + escapeHtml(item.invoiceId || "—") + '</td><td>' + escapeHtml(item.ip || "—") + '</td><td>' + escapeHtml(item.message || "—") + '</td></tr>').join("") +
    '</tbody></table></div>';
}

function renderSaasPaymentRows(items) {
  state.saasPayments = items || [];
  if (!state.saasPayments.length) {
    return '<div class="empty saas-empty">Nenhum pagamento encontrado.</div>';
  }

  return '<div class="table-wrap saas-table-wrap"><table class="table saas-table saas-payments-table"><thead><tr><th>Associação</th><th>Plano</th><th>Valor</th><th>Status</th><th>Gateway</th><th>Payment ID Mercado Pago</th><th>Criado em</th><th>Vencimento</th><th>Pago em</th><th>Ações</th></tr></thead><tbody>' +
    state.saasPayments.map((item, index) => '<tr><td><div class="cell-title">' + escapeHtml(item.tenantName || "—") + '</div><div class="cell-sub">' + escapeHtml(item.tenantSlug || item.tenantId || "—") + '</div></td><td>' + escapeHtml(planLabel(item.plan)) + '</td><td>' + money(item.amount) + '</td><td>' + badge(item.status) + '</td><td>' + escapeHtml(item.gateway || "—") + '</td><td><div class="cell-title">' + escapeHtml(item.gatewayPaymentId || "—") + '</div><div class="cell-sub">' + escapeHtml(item.paymentId || "—") + '</div></td><td>' + date(item.createdAt) + '</td><td>' + date(item.expiresAt) + '</td><td>' + date(item.paidAt) + '</td><td>' + ((item.copyPaste || item.qrCodeBase64) ? '<button class="button button-secondary button-sm" type="button" data-view-saas-pix="' + index + '">Ver PIX</button>' : '<span class="cell-sub">—</span>') + '</td></tr>').join("") +
    '</tbody></table></div>';
}

function renderSaasPagination(list, kind = "subscriptions") {
  if (list.totalPages <= 1) return '';
  const attr = kind === "payments" ? "data-saas-payment-page" : kind === "audit" ? "data-saas-audit-page" : "data-saas-page";
  const previousDisabled = list.page <= 1 ? ' disabled' : '';
  const nextDisabled = list.page >= list.totalPages ? ' disabled' : '';
  return '<div class="saas-pagination"><button class="button button-secondary button-sm" ' + attr + '="' + (list.page - 1) + '"' + previousDisabled + '>Anterior</button><span>Página ' + list.page + ' de ' + list.totalPages + '</span><button class="button button-secondary button-sm" ' + attr + '="' + (list.page + 1) + '"' + nextDisabled + '>Próxima</button></div>';
}

function qrImageSrc(value) {
  const src = String(value || "").trim();
  if (!src) return "";
  return src.startsWith("data:") ? src : "data:image/png;base64," + src;
}

async function generateSaasManualPix(tenantId) {
  try {
    const result = await api('/api/subscription/admin/' + tenantId + '/generate-pix', { method: "POST" });
    openSaasPixModal({ ...result, tenantName: result.reused ? "Cobrança pendente reutilizada" : "Nova cobrança gerada" });
    toast(result.reused ? "Cobrança pendente reutilizada." : "Novo PIX SaaS gerado.");
    await renderSaasDashboard("payments");
  } catch (error) {
    toast(error.message, true);
  }
}

function openSaasPixModal(payment) {
  const pix = payment.copyPaste || payment.qrCode || "";
  const image = qrImageSrc(payment.qrCodeBase64);
  openModal("PIX da assinatura", '<div class="detail-grid"><div class="detail-item"><small>Associação</small>' + escapeHtml(payment.tenantName || "—") + '</div><div class="detail-item"><small>Payment ID Mercado Pago</small>' + escapeHtml(payment.gatewayPaymentId || "—") + '</div><div class="detail-item"><small>Status</small>' + badge(payment.status) + '</div></div>' + (image ? '<div class="saas-pix-qr"><img src="' + escapeHtml(image) + '" alt="QR Code PIX"></div>' : '') + '<div class="pix-code">' + escapeHtml(pix || "PIX copia e cola indisponível.") + '</div><div class="actions" style="margin-top:14px"><button class="button button-primary" type="button" data-copy-saas-pix ' + (!pix ? 'disabled' : '') + '>Copiar Pix copia e cola</button></div>', null, "Fechar");
  document.querySelector("[data-copy-saas-pix]")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(pix);
    toast("PIX copiado.");
  });
}

function bindSaasDashboard() {
  const form = content().querySelector("[data-saas-filters]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    state.saasFilters.q = String(data.get("q") || "").trim();
    state.saasFilters.status = String(data.get("status") || "");
    state.saasFilters.page = 1;
    await renderSaasDashboard("dashboard");
  });
  form?.querySelector('[name="status"]')?.addEventListener("change", () => form.requestSubmit());
  content().querySelectorAll("[data-saas-page]").forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    state.saasFilters.page = Number(button.dataset.saasPage || 1);
    await renderSaasDashboard("dashboard");
  }));
  content().querySelectorAll("[data-generate-saas-pix]").forEach((button) => button.addEventListener("click", () => generateSaasManualPix(button.dataset.generateSaasPix)));
}

function bindSaasAudit() {
  const form = content().querySelector("[data-saas-audit-filters]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    ["q", "scope", "action", "status", "dateFrom", "dateTo"].forEach((key) => { state.saasAuditFilters[key] = String(data.get(key) || "").trim(); });
    state.saasAuditFilters.page = 1;
    await renderSaasDashboard("audit");
  });
  form?.querySelectorAll("select,input[type=date]").forEach((el) => el.addEventListener("change", () => form.requestSubmit()));
  content().querySelectorAll("[data-saas-audit-page]").forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    state.saasAuditFilters.page = Number(button.dataset.saasAuditPage || 1);
    await renderSaasDashboard("audit");
  }));
}

function bindSaasPayments() {
  const form = content().querySelector("[data-saas-payment-filters]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    state.saasPaymentFilters.q = String(data.get("q") || "").trim();
    state.saasPaymentFilters.status = String(data.get("status") || "");
    state.saasPaymentFilters.page = 1;
    await renderSaasDashboard("payments");
  });
  form?.querySelector('[name="status"]')?.addEventListener("change", () => form.requestSubmit());
  content().querySelectorAll("[data-saas-payment-page]").forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    state.saasPaymentFilters.page = Number(button.dataset.saasPaymentPage || 1);
    await renderSaasDashboard("payments");
  }));
  content().querySelectorAll("[data-view-saas-pix]").forEach((button) => button.addEventListener("click", () => {
    openSaasPixModal(state.saasPayments[Number(button.dataset.viewSaasPix)] || {});
  }));
}

function bindSaasTabs() {
  content().querySelectorAll("[data-saas-tab]").forEach((button) => button.addEventListener("click", async () => {
    await renderSaasDashboard(button.dataset.saasTab || "dashboard");
  }));
}

async function renderSaasDashboard(activeTab = "dashboard") {
  try {
    const [data, list, payments, audit] = await Promise.all([
      apiRequest("/api/subscription/admin/dashboard", { token: state.token }),
      apiRequest("/api/subscription/admin/list?" + saasListQuery(), { token: state.token }),
      apiRequest("/api/subscription/admin/payments?" + saasPaymentsQuery(), { token: state.token }),
      apiRequest("/api/subscription/admin/audit?" + saasAuditQuery(), { token: state.token })
    ]);
    const status = state.saasFilters.status;
    const paymentStatus = state.saasPaymentFilters.status;
    const dashboardHtml = '<section class="saas-hero"><div><span>Assinaturas</span><h2>' + money(data.monthlyRevenue) + '</h2><p>Receita mensal recorrente estimada</p></div><div class="saas-hero-side"><strong>' + money(data.annualRevenue) + '</strong><small>Receita anual projetada</small></div></section><section class="saas-metrics">' +
      metricCard("Assinaturas Ativas", data.activeSubscriptions, subscriptionStatusLabel("active"), "is-good") +
      metricCard("Em Trial", data.trialSubscriptions, subscriptionStatusLabel("trialing"), "is-info") +
      metricCard("Inadimplentes", data.overdueSubscriptions, subscriptionStatusLabel("overdue"), data.overdueSubscriptions > 0 ? "is-danger" : "") +
      metricCard("Vencendo em 7 dias", data.expiringNext7Days, "Próximas renovações", "is-warning") +
      metricCard("Receita Base", money(data.monthlyRevenueBase), "Módulos obrigatórios", "is-money") +
      metricCard("Receita Adicional", money(data.monthlyRevenueAdditional), "Módulos extras", "is-money") +
      metricCard("Receita Mensal", money(data.monthlyRevenue), "Assinaturas ativas", "is-money") +
      metricCard("Receita Anual", money(data.annualRevenue), "Projeção 12 meses", "is-money") +
      metricCard("Total de Associações", data.totalTenants, "Tenants cadastrados", "is-info") +
    '</section><section class="card saas-list-card"><header class="saas-list-head"><div><h2>Lista de Assinaturas</h2><p>' + list.total + ' assinatura(s) encontrada(s)</p></div></header><form class="toolbar saas-filterbar" data-saas-filters><input class="input" name="q" placeholder="Buscar por associação ou slug" value="' + escapeHtml(state.saasFilters.q) + '"><select class="select" name="status"><option value=""' + (!status ? ' selected' : '') + '>Todos os status</option><option value="trialing"' + (status === 'trialing' ? ' selected' : '') + '>Trialing</option><option value="active"' + (status === 'active' ? ' selected' : '') + '>Active</option><option value="overdue"' + (status === 'overdue' ? ' selected' : '') + '>Overdue</option><option value="cancelled"' + (status === 'cancelled' ? ' selected' : '') + '>Cancelled</option></select><button class="button button-primary" type="submit">Filtrar</button></form>' + renderSaasSubscriptionRows(list.items || []) + renderSaasPagination(list) + '</section>';
    const paymentsHtml = '<section class="card saas-list-card"><header class="saas-list-head"><div><h2>Central Financeira</h2><p>' + payments.total + ' pagamento(s) encontrado(s)</p></div></header><form class="toolbar saas-filterbar" data-saas-payment-filters><input class="input" name="q" placeholder="Buscar por associação, slug ou paymentId" value="' + escapeHtml(state.saasPaymentFilters.q) + '"><select class="select" name="status"><option value=""' + (!paymentStatus ? ' selected' : '') + '>Todos os status</option><option value="pending"' + (paymentStatus === 'pending' ? ' selected' : '') + '>Pending</option><option value="approved"' + (paymentStatus === 'approved' ? ' selected' : '') + '>Approved</option><option value="paid"' + (paymentStatus === 'paid' ? ' selected' : '') + '>Paid</option><option value="rejected"' + (paymentStatus === 'rejected' ? ' selected' : '') + '>Rejected</option><option value="cancelled"' + (paymentStatus === 'cancelled' ? ' selected' : '') + '>Cancelled</option><option value="overdue"' + (paymentStatus === 'overdue' ? ' selected' : '') + '>Overdue</option></select><button class="button button-primary" type="submit">Filtrar</button></form>' + renderSaasPaymentRows(payments.items || []) + renderSaasPagination(payments, "payments") + '</section>';
    const auditStatus = state.saasAuditFilters.status;
    const auditScope = state.saasAuditFilters.scope;
    const auditAction = state.saasAuditFilters.action;
    const auditHtml = '<section class="card saas-list-card"><header class="saas-list-head"><div><h2>Auditoria</h2><p>' + audit.total + ' evento(s) encontrado(s)</p></div></header><form class="toolbar saas-filterbar saas-audit-filterbar" data-saas-audit-filters><input class="input" name="q" placeholder="Buscar por associação, usuário, paymentId ou mensagem" value="' + escapeHtml(state.saasAuditFilters.q) + '"><select class="select" name="scope"><option value=""' + (!auditScope ? ' selected' : '') + '>Todos os tipos</option><option value="saas"' + (auditScope === 'saas' ? ' selected' : '') + '>SaaS</option><option value="associate"' + (auditScope === 'associate' ? ' selected' : '') + '>Associado</option></select><select class="select" name="action"><option value=""' + (!auditAction ? ' selected' : '') + '>Todas as ações</option><option value="saas_checkout"' + (auditAction === 'saas_checkout' ? ' selected' : '') + '>Checkout SaaS</option><option value="saas_webhook"' + (auditAction === 'saas_webhook' ? ' selected' : '') + '>Webhook SaaS</option><option value="saas_renewal"' + (auditAction === 'saas_renewal' ? ' selected' : '') + '>Renovação SaaS</option><option value="saas_manual_pix"' + (auditAction === 'saas_manual_pix' ? ' selected' : '') + '>PIX manual SaaS</option><option value="associate_invoice_manual"' + (auditAction === 'associate_invoice_manual' ? ' selected' : '') + '>Cobrança associado</option></select><select class="select" name="status"><option value=""' + (!auditStatus ? ' selected' : '') + '>Todos os status</option><option value="success"' + (auditStatus === 'success' ? ' selected' : '') + '>Success</option><option value="failed"' + (auditStatus === 'failed' ? ' selected' : '') + '>Failed</option><option value="ignored"' + (auditStatus === 'ignored' ? ' selected' : '') + '>Ignored</option><option value="reused"' + (auditStatus === 'reused' ? ' selected' : '') + '>Reused</option></select><input class="input" type="date" name="dateFrom" value="' + escapeHtml(state.saasAuditFilters.dateFrom) + '"><input class="input" type="date" name="dateTo" value="' + escapeHtml(state.saasAuditFilters.dateTo) + '"><button class="button button-primary" type="submit">Filtrar</button></form>' + renderSaasAuditRows(audit.items || []) + renderSaasPagination(audit, "audit") + '</section>';

    content().innerHTML = pageHead("SaaS", "Dashboard executivo e Central Financeira da plataforma NEXORA.") + renderSaasTabs(activeTab) + (activeTab === "payments" ? paymentsHtml : activeTab === "audit" ? auditHtml : dashboardHtml);
    bindSaasTabs();
    if (activeTab === "payments") bindSaasPayments(); else if (activeTab === "audit") bindSaasAudit(); else bindSaasDashboard();
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
  const enabledModules = normalizeModuleCodes(sub.enabledModules || me.tenant?.enabledModules || []);
  const plan = sub.plan === "professional" ? "Profissional" : (sub.plan || "—");
  const status = sub.status === "trialing" ? "Teste grátis" : (sub.status || "—");
  const trialUntil = sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString("pt-BR") : "—";
  const now = new Date();
  const end = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
  const daysLeft = end ? Math.max(0, Math.ceil((end - now) / 86400000)) : 0;
  const monthlyAmount = Number(sub.amount || 0);
  const baseAmount = Number(sub.baseAmount || 0);
  const additionalAmount = Number(sub.additionalAmount || 0);
  const nextBilling = sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString("pt-BR") : "Após o período de teste";

  content().innerHTML = `${pageHead("Assinatura", "Plano comercial e cobrança da plataforma NEXORA.")}<section class="metrics">
    ${metric("Plano atual", plan, status, true)}
    ${metric("Status", status)}
    ${metric("Trial até", trialUntil, `${daysLeft} dias restantes`, true)}
    ${metric("Base mensal", money(baseAmount))}
    ${metric("Módulos adicionais", money(additionalAmount), enabledModules.length ? formatEnabledModules(enabledModules) : "", true)}
    ${metric("Valor mensal", money(monthlyAmount), "Base + adicionais")}
    ${metric("Próxima cobrança", nextBilling, "", true)}
  </section>
  <section class="card">
    <h2>Assinar agora</h2>
    <p>Ao assinar, a associação mantém o acesso aos módulos ativos e aos recursos contratados (cobranças, PIX, boleto, PDF premium e baixa automática).</p>
    <p><strong>Módulos ativos:</strong> ${escapeHtml(formatEnabledModules(enabledModules))}</p>
    <div class="actions" style="margin-top:18px">
      <button class="button button-primary" type="button" data-subscribe-now>Assinar Agora</button>
    </div>
  </section>`;
}

async function renderSettings() { const me = await api("/api/me"); state.me = me; syncSessionBranding(me); const t = me.tenant || {}, b = resolveBranding(me.branding), f = me.billingSettings || {}; const hasProcessedLogo = Boolean(me.branding?.logoProcessedPath); const useProcessedLogo = Boolean(me.branding?.logoUseProcessed && hasProcessedLogo); content().innerHTML = `${pageHead("Configurações", "Dados da associação, financeiro e branding multi-tenant.")}<form class="card" data-settings-form><div class="tabs"><button class="tab active" type="button" data-tab="association">Associação</button><button class="tab" type="button" data-tab="financial">Financeiro</button><button class="tab" type="button" data-tab="appearance">Branding</button></div><section data-panel="association"><div class="form-grid">${field("name", "Nome da organização", t.name, "text", true)}${field("legalDocument", "Documento (CNPJ/CPF)", t.legalDocument)}${field("phone", "Telefone", t.phone)}${field("email", "E-mail", t.email, "email")}${field("address", "Endereço", t.address)}</div></section><section data-panel="financial" hidden><div class="form-grid">${field("defaultMonthlyAmount", "Mensalidade padrão", f.defaultMonthlyAmount || 0, "number", false, 'step="0.01"')}${field("defaultDueDay", "Dia de vencimento", f.defaultDueDay || 10, "number")}${selectField("defaultLateFeeType", "Tipo da multa", [["percent", "Percentual"], ["fixed", "Fixa"]], f.defaultLateFeeType)}${field("defaultLateFeeValue", "Multa", f.defaultLateFeeValue || 0, "number", false, 'step="0.001"')}${selectField("defaultDailyInterestType", "Tipo dos juros", [["percent", "Percentual"], ["fixed", "Fixo"]], f.defaultDailyInterestType)}${field("defaultDailyInterestValue", "Juros ao dia", f.defaultDailyInterestValue || 0, "number", false, 'step="0.001"')}<label class="field span-2"><span>Mensagem do PDF</span><textarea class="textarea" name="pdfMessage">${escapeHtml(f.pdfMessage || "")}</textarea></label></div></section><section data-panel="appearance" hidden><div class="settings-section"><h3>Identidade visual</h3><div class="form-grid">${field("logoUrl", "Logo legada (URL)", me.branding?.logoUrl || "")}${field("primaryColor", "Cor principal", b.primaryColor, "color")}${field("secondaryColor", "Cor secundária", b.secondaryColor, "color")}<label class="field span-2"><span>Rodapé personalizado</span><textarea class="textarea" name="documentFooter">${escapeHtml(me.branding?.documentFooter || DEFAULT_BRANDING.documentFooter)}</textarea></label></div></div><div class="settings-section branding-upload-card"><div class="section-head"><div><h3>Logo da organização</h3><p>Envie PNG, JPG, JPEG ou WEBP. O sistema mantém a versão original e a tratada para painel, PDFs e impressões.</p></div><button class="button button-secondary" type="button" data-upload-logo>Enviar logo</button></div><div class="form-grid"><label class="field span-2"><span>Arquivo da logo</span><input class="input" name="logoFile" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"></label><label class="field checkbox-field span-2"><input name="removeBackground" type="checkbox"><span>Remover fundo automaticamente</span></label></div><div class="logo-preview-grid">${logoPreviewOption("original", "Logo original", me.branding?.logoOriginalPath || me.branding?.logoUrl || DEFAULT_BRANDING.activeLogoUrl, !useProcessedLogo, me.branding?.uploadedAt ? `Enviada em ${dateTime(me.branding.uploadedAt)}` : "Fallback padrão")}${logoPreviewOption("processed", "Logo tratada", me.branding?.logoProcessedPath || "", useProcessedLogo, hasProcessedLogo ? "Transparente para PDFs e impressões" : "Disponível após tratamento bem-sucedido")}</div><div class="mp-feedback" data-logo-feedback></div></div></section><div class="actions" style="justify-content:flex-end;margin-top:22px"><button class="button button-primary" type="submit">Salvar configurações</button></div></form>`; bindSettings(); }
function bindSettings() { const form = content().querySelector("[data-settings-form]"); const uploadButton = content().querySelector("[data-upload-logo]"); content().querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { content().querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === button)); content().querySelectorAll("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== button.dataset.tab); })); uploadButton?.addEventListener("click", async () => { const file = form.querySelector('[name="logoFile"]').files?.[0]; const feedback = content().querySelector("[data-logo-feedback]"); if (!file) { feedback.className = "mp-feedback is-error"; feedback.textContent = "Selecione uma logo para enviar."; return; } const payload = new FormData(); payload.set("logo", file); if (form.querySelector('[name="removeBackground"]').checked) payload.set("removeBackground", "true"); uploadButton.disabled = true; feedback.className = "mp-feedback"; feedback.textContent = ""; try { const result = await api("/api/tenant/branding/logo", { method: "POST", body: payload }); state.me = { ...(state.me || {}), branding: result.branding }; syncSessionBranding({ branding: result.branding }); toast(result.warning || "Logo enviada com sucesso.", Boolean(result.warning)); await renderSettings(); } catch (error) { feedback.className = "mp-feedback is-error"; feedback.textContent = error.message; } finally { uploadButton.disabled = false; } }); form.addEventListener("submit", async (event) => { event.preventDefault(); const fd = new FormData(form); try { const result = await api("/api/me/settings", { method: "PUT", body: JSON.stringify({ tenant: { name: fd.get("name"), legalDocument: fd.get("legalDocument"), phone: fd.get("phone"), email: fd.get("email"), address: fd.get("address") }, branding: { logoUrl: fd.get("logoUrl"), primaryColor: fd.get("primaryColor"), secondaryColor: fd.get("secondaryColor"), documentFooter: fd.get("documentFooter"), logoUseProcessed: fd.get("logoMode") === "processed" }, billingSettings: { defaultMonthlyAmount: Number(fd.get("defaultMonthlyAmount") || 0), defaultDueDay: Number(fd.get("defaultDueDay") || 10), defaultLateFeeType: fd.get("defaultLateFeeType"), defaultLateFeeValue: Number(fd.get("defaultLateFeeValue") || 0), defaultDailyInterestType: fd.get("defaultDailyInterestType"), defaultDailyInterestValue: Number(fd.get("defaultDailyInterestValue") || 0), pdfMessage: fd.get("pdfMessage") } }) }); state.me = { ...(state.me || {}), tenant: result.tenant, branding: result.branding, billingSettings: result.billingSettings }; syncSessionBranding(result); await renderShell(); toast("Configurações salvas."); } catch (error) { toast(error.message, true); } }); }

function openModal(title, body, onSave = null, closeLabel = "Cancelar", saveLabel = "Salvar") { const backdrop = document.createElement("div"); backdrop.className = "modal-backdrop"; backdrop.innerHTML = `<section class="modal"><header class="modal-head"><h2>${title}</h2><button class="modal-close" type="button" aria-label="Fechar">×</button></header><div class="modal-body">${body}</div><footer class="modal-foot"><button class="button button-ghost" type="button" data-cancel>${closeLabel}</button>${onSave ? '<button class="button button-primary" type="button" data-save>' + saveLabel + '</button>' : ""}</footer></section>`; document.body.append(backdrop); const close = () => backdrop.remove(); backdrop.querySelector(".modal-close").addEventListener("click", close); backdrop.querySelector("[data-cancel]").addEventListener("click", close); backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); }); if (onSave) backdrop.querySelector("[data-save]").addEventListener("click", async () => { const button = backdrop.querySelector("[data-save]"); button.disabled = true; try { const shouldClose = await onSave(); if (shouldClose !== false) close(); } catch (error) { toast(error.message, true); } finally { button.disabled = false; } }); }

applyBrandingTheme(resolveBranding(state.branding || {}));

if (state.token) renderShell(); else renderLogin();
