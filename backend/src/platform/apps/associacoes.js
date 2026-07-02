module.exports = {
  id: "associacoes",
  name: "NEXORA Associações",
  version: "4.2.0",
  icon: "intelligence",
  description: "Gestão completa de associações, mensalidades e relacionamento com associados.",
  permissions: ["module:core", "module:associates", "module:memberbilling", "module:protocols", "module:financial"],
  enabled: true,
  routes: ["/dashboard", "/associados", "/mensalidades", "/financeiro", "/protocolos"],
  modules: ["core", "associates", "memberbilling", "protocols", "financial", "notifications"],
  agentProfile: {
    primary: ["finance", "protocol", "associate", "notification"],
    fallback: "assistant"
  }
};
