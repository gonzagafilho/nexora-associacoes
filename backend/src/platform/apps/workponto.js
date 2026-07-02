module.exports = {
  id: "workponto",
  name: "WorkPonto",
  version: "4.2.0",
  icon: "workflow",
  description: "App de jornada e operações com integração ao runtime da plataforma.",
  permissions: ["module:core", "module:projects", "module:notifications"],
  enabled: true,
  routes: ["/dashboard", "/workflow-dashboard"],
  modules: ["core", "workflow", "notifications"],
  agentProfile: {
    primary: ["workflow", "notification"],
    fallback: "assistant"
  }
};
