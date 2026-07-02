const { registry, AppRegistry } = require("./appRegistry");
const contextProvider = require("./contextProvider");
const platformService = require("./platform.service");

const core = {
  ai: require("./core/ai"),
  memory: require("./core/memory"),
  orchestrator: require("./core/orchestrator"),
  skills: require("./core/skills"),
  runtime: require("./core/runtime"),
  events: require("./core/events"),
  auth: require("./core/auth"),
  permissions: require("./core/permissions"),
  audit: require("./core/audit"),
  integrations: require("./core/integrations")
};

module.exports = {
  registry,
  AppRegistry,
  contextProvider,
  platformService,
  core
};
