const Tenant = require("../../models/Tenant");
const { normalizeModuleCode, normalizeModuleCodes } = require("../subscription/subscriptionPricingService");

const OS_MODULES = [
  { code: "financial", name: "Financeiro", description: "Entradas, saídas, saldo e prestação de contas." },
  { code: "associates", name: "Associados", description: "Cadastro e gestão de associados." },
  { code: "memberbilling", name: "Cobranças", description: "Mensalidades, boletos e cobrança recorrente." },
  { code: "projects", name: "Projetos", description: "Projetos, obras e acompanhamento de execução." },
  { code: "assets", name: "Patrimônio", description: "Ativos, manutenção e inventário patrimonial." },
  { code: "protocols", name: "Protocolos", description: "Solicitações, histórico e resolução de demandas." },
  { code: "notifications", name: "Notificações", description: "Alertas, comunicados e central de avisos." },
  { code: "alerts", name: "Alertas", description: "Regras inteligentes e sinais de risco operacional." },
  { code: "aiCopilot", name: "NEXORA IA", description: "Assistente inteligente da plataforma." },
  { code: "pwa", name: "PWA", description: "Experiência de aplicativo progressivo." },
  { code: "push", name: "Push", description: "Notificações push em tempo real." },
  { code: "saas", name: "SaaS Modular", description: "Camada de assinatura e monetização modular." }
];

const ALWAYS_ON_MODULES = new Set(["notifications", "alerts", "aicopilot", "pwa", "push", "saas"]);

function buildCapabilities() {
  return {
    multiTenant: true,
    modularBilling: true,
    pwa: true,
    push: true,
    smartAlerts: true,
    aiCopilot: true,
    audit: true
  };
}

function resolveModuleState(enabledModules = []) {
  const enabledSet = new Set(normalizeModuleCodes(enabledModules));
  return OS_MODULES.map((module) => {
    const normalizedCode = normalizeModuleCode(module.code);
    const enabled = ALWAYS_ON_MODULES.has(normalizedCode) || enabledSet.has(normalizedCode);
    return {
      code: module.code,
      name: module.name,
      enabled,
      status: enabled ? "active" : "inactive",
      description: module.description
    };
  });
}

async function buildSystemOs({ tenantId, enabledModules } = {}) {
  let tenantEnabledModules = enabledModules;

  if (!tenantEnabledModules && tenantId) {
    const tenant = await Tenant.findById(tenantId).select("enabledModules status").lean();
    tenantEnabledModules = Array.isArray(tenant?.enabledModules) ? tenant.enabledModules : [];
  }

  return {
    name: "NEXORA OS",
    product: "NEXORA Gestão",
    assistant: "NEXORA IA",
    version: "3.1",
    description: "Sistema operacional inteligente para gestão modular.",
    modules: resolveModuleState(tenantEnabledModules),
    capabilities: buildCapabilities(),
    future: ["NEXORA OS Modules", "NEXORA OS Health", "NEXORA OS Automations", "NEXORA OS Agents", "NEXORA OS Marketplace"]
  };
}

module.exports = {
  ALWAYS_ON_MODULES,
  OS_MODULES,
  buildSystemOs,
  buildCapabilities,
  resolveModuleState
};
