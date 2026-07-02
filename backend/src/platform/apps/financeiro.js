module.exports = {
  id: "financeiro",
  name: "NEXORA Financeiro",
  version: "4.2.0",
  icon: "receipt",
  description: "App financeiro especializado com skills de cobrança e conciliação.",
  permissions: ["module:core", "module:financial", "module:memberbilling"],
  enabled: true,
  routes: ["/financeiro", "/mensalidades"],
  modules: ["core", "financial", "memberbilling", "notifications"],
  agentProfile: {
    primary: ["finance", "report", "notification"],
    fallback: "assistant"
  }
};
