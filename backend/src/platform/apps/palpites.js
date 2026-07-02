module.exports = {
  id: "palpites",
  name: "Palpites",
  version: "4.2.0",
  icon: "star",
  description: "App de engajamento e campanhas com eventos e notificações.",
  permissions: ["module:core", "module:notifications"],
  enabled: true,
  routes: ["/dashboard", "/notificacoes"],
  modules: ["core", "notifications", "events"],
  agentProfile: {
    primary: ["notification", "workflow"],
    fallback: "assistant"
  }
};
