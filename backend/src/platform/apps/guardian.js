module.exports = {
  id: "guardian",
  name: "Guardian",
  version: "4.2.0",
  icon: "bell",
  description: "App para monitoramento de alertas e eventos críticos por tenant.",
  permissions: ["module:core", "module:notifications", "module:protocols"],
  enabled: true,
  routes: ["/dashboard", "/notificacoes", "/protocolos"],
  modules: ["core", "notifications", "protocols"],
  agentProfile: {
    primary: ["notification", "protocol"],
    fallback: "assistant"
  }
};
