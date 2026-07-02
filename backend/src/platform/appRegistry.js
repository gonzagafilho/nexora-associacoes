const associacoes = require("./apps/associacoes");
const xpdcnet = require("./apps/xpdcnet");
const guardian = require("./apps/guardian");
const chatbot = require("./apps/chatbot");
const workponto = require("./apps/workponto");
const financeiro = require("./apps/financeiro");
const palpites = require("./apps/palpites");

const APPS = [associacoes, xpdcnet, guardian, chatbot, workponto, financeiro, palpites];

class AppRegistry {
  constructor(items = []) {
    this.apps = new Map();
    items.forEach((item) => this.register(item));
  }

  register(app) {
    if (!app?.id) {
      const error = new Error("App inválido para registro.");
      error.statusCode = 400;
      throw error;
    }

    const normalized = {
      id: String(app.id || "").trim().toLowerCase(),
      name: String(app.name || "").trim(),
      version: String(app.version || "1.0.0").trim(),
      icon: String(app.icon || "intelligence").trim(),
      description: String(app.description || "").trim(),
      permissions: Array.isArray(app.permissions) ? app.permissions : [],
      enabled: Boolean(app.enabled),
      routes: Array.isArray(app.routes) ? app.routes : [],
      modules: Array.isArray(app.modules) ? app.modules : [],
      agentProfile: app.agentProfile && typeof app.agentProfile === "object" ? app.agentProfile : { primary: ["assistant"], fallback: "assistant" }
    };

    this.apps.set(normalized.id, normalized);
    return normalized;
  }

  list() {
    return Array.from(this.apps.values());
  }

  get(appId) {
    return this.apps.get(String(appId || "").trim().toLowerCase()) || null;
  }

  enabled() {
    return this.list().filter((item) => item.enabled);
  }

  modules() {
    const used = new Set();
    this.list().forEach((item) => {
      (item.modules || []).forEach((moduleCode) => used.add(String(moduleCode || "").trim().toLowerCase()));
    });
    return Array.from(used).filter(Boolean).sort();
  }

  stats() {
    const apps = this.list();
    return {
      installedApps: apps.length,
      activeApps: apps.filter((item) => item.enabled).length,
      disabledApps: apps.filter((item) => !item.enabled).length,
      modules: this.modules().length
    };
  }
}

const registry = new AppRegistry(APPS);

module.exports = {
  AppRegistry,
  registry
};
