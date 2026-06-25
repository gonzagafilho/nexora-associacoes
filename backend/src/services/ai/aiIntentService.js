const SUPPORTED_MODULES = [
  "Financeiro",
  "Associados",
  "Cobranças",
  "Projetos",
  "Obras",
  "Patrimônio",
  "Protocolos",
  "Usuários",
  "Branding",
  "Relatórios",
  "Push",
  "PWA",
  "SaaS"
];

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[?!.:,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function byRegex(text, expression) {
  return expression.test(text);
}

function identifyIntent(question = "") {
  const text = normalize(question);
  if (!text) {
    return { intent: "help", type: "help", module: "NEXORA IA", action: null, requiresConfirmation: false, critical: false };
  }

  if (byRegex(text, /abrir financeiro/)) return { intent: "open_financial", type: "action", module: "Financeiro", action: "navigate", requiresConfirmation: false, critical: false, route: "financeiro" };
  if (byRegex(text, /abrir patrimonio/)) return { intent: "open_assets", type: "action", module: "Patrimônio", action: "navigate", requiresConfirmation: false, critical: false, route: "patrimonio" };
  if (byRegex(text, /abrir projetos?/)) return { intent: "open_projects", type: "action", module: "Projetos", action: "navigate", requiresConfirmation: false, critical: false, route: "projetos" };

  if (byRegex(text, /(cadastrar|criar) associado/)) return { intent: "create_associate", type: "action", module: "Associados", action: "create", requiresConfirmation: true, critical: true };
  if (byRegex(text, /(cadastrar|criar) cliente/)) return { intent: "create_associate", type: "action", module: "Associados", action: "create", requiresConfirmation: true, critical: true };
  if (byRegex(text, /(cadastrar|criar) patrimonio/)) return { intent: "create_asset", type: "action", module: "Patrimônio", action: "create", requiresConfirmation: true, critical: true };
  if (byRegex(text, /(criar|cadastrar) protocolo/)) return { intent: "create_protocol", type: "action", module: "Protocolos", action: "create", requiresConfirmation: true, critical: true };
  if (byRegex(text, /(criar|cadastrar) obra/)) return { intent: "create_project", type: "action", module: "Obras", action: "create", requiresConfirmation: true, critical: true };
  if (byRegex(text, /cadastrar despesa/)) return { intent: "create_expense", type: "action", module: "Financeiro", action: "create", requiresConfirmation: true, critical: true };
  if (byRegex(text, /cadastrar receita/)) return { intent: "create_income", type: "action", module: "Financeiro", action: "create", requiresConfirmation: true, critical: true };
  if (byRegex(text, /fechar caixa/)) return { intent: "close_cash", type: "action", module: "Financeiro", action: "close", requiresConfirmation: true, critical: true };
  if (byRegex(text, /gerar boletos/)) return { intent: "generate_boleto", type: "action", module: "Cobranças", action: "execute", requiresConfirmation: true, critical: true };

  if (byRegex(text, /consultar inadimplentes/)) return { intent: "overdue_invoices", type: "query", module: "Cobranças", action: null, requiresConfirmation: false, critical: false };
  if (byRegex(text, /consultar saldo/)) return { intent: "balance", type: "query", module: "Financeiro", action: null, requiresConfirmation: false, critical: false };
  if (byRegex(text, /consultar patrimonio/)) return { intent: "assets_maintenance", type: "query", module: "Patrimônio", action: null, requiresConfirmation: false, critical: false };
  if (byRegex(text, /consultar obras/)) return { intent: "delayed_projects", type: "query", module: "Obras", action: null, requiresConfirmation: false, critical: false };
  if (byRegex(text, /consultar protocolos/)) return { intent: "open_protocols", type: "query", module: "Protocolos", action: null, requiresConfirmation: false, critical: false };
  if (byRegex(text, /gerar prestacao de contas/)) return { intent: "financial_overview", type: "query", module: "Relatórios", action: null, requiresConfirmation: false, critical: false };

  return { intent: "unknown", type: "unknown", module: "NEXORA IA", action: null, requiresConfirmation: false, critical: false };
}

module.exports = {
  SUPPORTED_MODULES,
  normalize,
  identifyIntent
};
