module.exports = {
  id: "xpdcnet",
  name: "XPDCNET",
  version: "4.2.0",
  icon: "projects",
  description: "App para operações XPDCNET com núcleo compartilhado da plataforma.",
  permissions: ["module:core", "module:projects", "module:assets", "module:financial"],
  enabled: true,
  routes: ["/dashboard", "/projetos", "/patrimonio", "/financeiro"],
  modules: ["core", "projects", "assets", "financial", "notifications"],
  agentProfile: {
    primary: ["project", "asset", "finance"],
    fallback: "assistant"
  }
};
