module.exports = {
  id: "chatbot",
  name: "Chatbot",
  version: "4.2.0",
  icon: "intelligence",
  description: "App conversacional com memória e orquestração multi-skill.",
  permissions: ["module:core", "module:notifications"],
  enabled: true,
  routes: ["/ia-chat", "/dashboard/ai-center"],
  modules: ["core", "ai", "memory", "orchestrator", "skills"],
  agentProfile: {
    primary: ["assistant", "workflow", "notification"],
    fallback: "assistant"
  }
};
