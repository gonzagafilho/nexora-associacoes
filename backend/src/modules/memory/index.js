const routes = require("./memory.routes");
const service = require("./memory.service");
const TenantMemory = require("./memory.model");

module.exports = {
  routes,
  service,
  TenantMemory
};
