const mongoose = require("mongoose");
const SaasModule = require("../../models/SaasModule");
const Tenant = require("../../models/Tenant");

const REQUIRED_MODULE_CODES = ["core", "financial"];

const DEFAULT_SAAS_MODULES = [
  { code: "core", name: "Core", description: "Plataforma base", monthlyPrice: 49.9, active: true },
  { code: "financial", name: "Financeiro", description: "Fluxo financeiro da associação", monthlyPrice: 0, active: true },
  { code: "associates", name: "Associados", description: "Gestão de associados", monthlyPrice: 20, active: true },
  { code: "memberbilling", name: "Cobrança de Associados", description: "Mensalidades e cobrança", monthlyPrice: 20, active: true },
  { code: "projects", name: "Projetos", description: "Obras e projetos", monthlyPrice: 20, active: true },
  { code: "assets", name: "Patrimônio", description: "Gestão de ativos e patrimônio", monthlyPrice: 15, active: true },
  { code: "protocols", name: "Protocolos", description: "Fluxos de protocolo", monthlyPrice: 15, active: true },
  { code: "people", name: "Pessoas", description: "Gestão ampliada de pessoas", monthlyPrice: 20, active: true },
  { code: "pwa", name: "PWA", description: "Aplicativo web progressivo", monthlyPrice: 20, active: true }
];

const LEGACY_FULL_ACCESS_CODES = DEFAULT_SAAS_MODULES.map((item) => item.code);

function isDatabaseReady() {
  return mongoose.connection?.readyState === 1;
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeModuleCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeModuleCodes(codes = []) {
  const list = Array.isArray(codes) ? codes : [];
  const unique = new Set();
  for (const code of list) {
    const normalized = normalizeModuleCode(code);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

async function ensureSaasModulesSeeded() {
  if (!isDatabaseReady()) return;

  try {
    await Promise.all(DEFAULT_SAAS_MODULES.map((item) =>
      SaasModule.updateOne(
        { code: item.code },
        {
          $setOnInsert: {
            name: item.name,
            description: item.description,
            monthlyPrice: item.monthlyPrice,
            active: item.active
          },
          $set: { active: item.active }
        },
        { upsert: true }
      )
    ));
  } catch (error) {
    // In isolated tests or transient DB failures, use in-memory defaults.
  }
}

async function listActiveSaasModules() {
  if (!isDatabaseReady()) return DEFAULT_SAAS_MODULES;

  try {
    await ensureSaasModulesSeeded();
    const modules = await SaasModule.find({ active: true }).sort({ code: 1 }).lean();
    if (modules.length) return modules;
  } catch (error) {
    // Fall through to default catalog when DB is unavailable.
  }
  return DEFAULT_SAAS_MODULES;
}

function resolveEnabledModules({ tenantEnabledModules, activeModules = [] }) {
  const activeCodes = new Set(activeModules.map((item) => normalizeModuleCode(item.code)).filter(Boolean));
  const normalizedTenant = normalizeModuleCodes(tenantEnabledModules);
  const hasExplicitSelection = Array.isArray(tenantEnabledModules);
  const base = normalizedTenant.length
    ? normalizedTenant
    : (hasExplicitSelection ? REQUIRED_MODULE_CODES : LEGACY_FULL_ACCESS_CODES);
  const required = normalizeModuleCodes(REQUIRED_MODULE_CODES);
  const merged = normalizeModuleCodes([...required, ...base]);
  return merged.filter((code) => activeCodes.has(code));
}

async function calculateTenantSubscription({ tenantId, enabledModules } = {}) {
  const activeModules = await listActiveSaasModules();
  let tenantEnabledModules = enabledModules;

  if (!tenantEnabledModules && tenantId) {
    if (isDatabaseReady()) {
      try {
        const tenantQuery = Tenant.findById(tenantId);
        const selectedQuery = typeof tenantQuery?.select === "function"
          ? tenantQuery.select("enabledModules")
          : tenantQuery;
        const tenant = typeof selectedQuery?.lean === "function"
          ? await selectedQuery.lean()
          : await selectedQuery;
        tenantEnabledModules = Array.isArray(tenant?.enabledModules)
          ? tenant.enabledModules
          : undefined;
      } catch (error) {
        tenantEnabledModules = [];
      }
    } else {
      tenantEnabledModules = [];
    }
  }

  const selectedCodes = resolveEnabledModules({ tenantEnabledModules, activeModules });
  const selectedSet = new Set(selectedCodes);
  const selectedModules = activeModules
    .filter((item) => selectedSet.has(normalizeModuleCode(item.code)))
    .map((item) => ({
      code: normalizeModuleCode(item.code),
      name: item.name,
      description: item.description,
      monthlyPrice: roundMoney(item.monthlyPrice),
      active: Boolean(item.active)
    }));

  const core = selectedModules.find((item) => item.code === "core");
  const baseAmount = roundMoney(core?.monthlyPrice || 0);
  const totalAmount = roundMoney(selectedModules.reduce((sum, item) => sum + Number(item.monthlyPrice || 0), 0));
  const additionalAmount = roundMoney(totalAmount - baseAmount);

  return {
    enabledModules: selectedModules.map((item) => item.code),
    modules: selectedModules,
    requiredModuleCodes: normalizeModuleCodes(REQUIRED_MODULE_CODES),
    baseAmount,
    additionalAmount,
    totalAmount
  };
}

module.exports = {
  DEFAULT_SAAS_MODULES,
  LEGACY_FULL_ACCESS_CODES,
  REQUIRED_MODULE_CODES,
  calculateTenantSubscription,
  ensureSaasModulesSeeded,
  listActiveSaasModules,
  normalizeModuleCode,
  normalizeModuleCodes,
  resolveEnabledModules,
  roundMoney
};
