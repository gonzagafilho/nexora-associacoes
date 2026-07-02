const memoryService = require("./memory.service");

function bodyProjectKey(req) {
  return req.body?.projectKey;
}

function queryProjectKey(req) {
  return req.query?.projectKey;
}

async function create(req, res) {
  try {
    const memory = await memoryService.createMemory({ tenantId: req.user.tenantId, userId: req.user.id, projectKey: bodyProjectKey(req), data: req.body || {} });
    return res.status(201).json({ ok: true, memory });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao criar memória." });
  }
}

async function list(req, res) {
  try {
    const query = req.query || {};
    const memories = query.q
      ? await memoryService.searchMemories({ tenantId: req.user.tenantId, projectKey: queryProjectKey(req), q: query.q, query })
      : await memoryService.listMemories({ tenantId: req.user.tenantId, projectKey: queryProjectKey(req), query });
    return res.json({ ok: true, memories });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao listar memórias." });
  }
}

async function stats(req, res) {
  try {
    const statsData = await memoryService.getMemoryStats({ tenantId: req.user.tenantId, projectKey: queryProjectKey(req) });
    return res.json({ ok: true, ...statsData });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao carregar resumo de memórias." });
  }
}

async function search(req, res) {
  try {
    const memories = await memoryService.searchMemories({ tenantId: req.user.tenantId, projectKey: queryProjectKey(req), q: req.query.q, query: req.query || {} });
    return res.json({ ok: true, memories });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao buscar memórias." });
  }
}

async function getById(req, res) {
  try {
    const memory = await memoryService.getMemory({ tenantId: req.user.tenantId, projectKey: queryProjectKey(req), id: req.params.id });
    if (!memory) return res.status(404).json({ ok: false, message: "Memória não encontrada." });
    return res.json({ ok: true, memory });
  } catch (error) {
    return res.status(error.statusCode || 404).json({ ok: false, message: error.message || "Memória não encontrada." });
  }
}

async function update(req, res) {
  try {
    const memory = await memoryService.updateMemory({ tenantId: req.user.tenantId, projectKey: bodyProjectKey(req), id: req.params.id, data: req.body || {} });
    if (!memory) return res.status(404).json({ ok: false, message: "Memória não encontrada." });
    return res.json({ ok: true, memory });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao atualizar memória." });
  }
}

async function remove(req, res) {
  try {
    const memory = await memoryService.deleteMemory({ tenantId: req.user.tenantId, projectKey: queryProjectKey(req), id: req.params.id });
    if (!memory) return res.status(404).json({ ok: false, message: "Memória não encontrada." });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(error.statusCode || 404).json({ ok: false, message: error.message || "Memória não encontrada." });
  }
}

module.exports = {
  create,
  list,
  stats,
  search,
  getById,
  update,
  remove
};
