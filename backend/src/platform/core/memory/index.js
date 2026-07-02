const memoryService = require("../../../modules/memory/memory.service");

function list({ tenantId, projectKey, query = {} }) {
  return memoryService.listMemories({ tenantId, projectKey, query });
}

function stats({ tenantId, projectKey }) {
  return memoryService.getMemoryStats({ tenantId, projectKey });
}

module.exports = {
  list,
  stats
};
