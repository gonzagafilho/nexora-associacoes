const TenantMemory = require("./memory.model");

const { MEMORY_PROJECT_KEYS } = TenantMemory;
const DEFAULT_PROJECT_KEY = "associacoes";

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function normalizeTags(tags = []) {
  const values = Array.isArray(tags) ? tags : String(tags || "").split(",");
  return Array.from(new Set(values.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))).slice(0, 30);
}

function normalizeImportance(value) {
  const number = Number(value || 1);
  if (!Number.isFinite(number)) return 1;
  return Math.min(Math.max(Math.round(number), 1), 5);
}

function normalizeProjectKey(value) {
  const projectKey = String(value || DEFAULT_PROJECT_KEY).trim().toLowerCase() || DEFAULT_PROJECT_KEY;
  if (!MEMORY_PROJECT_KEYS.includes(projectKey)) {
    const error = new Error("Projeto inválido para memória.");
    error.statusCode = 400;
    throw error;
  }
  return projectKey;
}

function projectMemoryClause(projectKey) {
  if (projectKey === DEFAULT_PROJECT_KEY) {
    return {
      $or: [
        { projectKey },
        { projectKey: null },
        { projectKey: "" },
        { projectKey: { $exists: false } }
      ]
    };
  }
  return { projectKey };
}

function tenantProjectFilter(tenantId, projectKey) {
  const filter = { tenantId };
  if (projectKey !== undefined && projectKey !== null && String(projectKey).trim() !== "") {
    filter.$and = [projectMemoryClause(normalizeProjectKey(projectKey))];
  }
  return filter;
}

function activeMemoryFilter(tenantId, projectKey) {
  const filter = tenantProjectFilter(tenantId, projectKey);
  filter.$and = filter.$and || [];
  filter.$and.push({
    $or: [
      { expiresAt: null },
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });
  return filter;
}

function buildListFilter({ tenantId, projectKey, scope, tag, importance, source, visibility }) {
  const filter = activeMemoryFilter(tenantId, projectKey);
  if (scope) filter.scope = String(scope).trim();
  if (tag) filter.tags = String(tag).trim().toLowerCase();
  if (importance !== undefined && importance !== "") filter.importance = normalizeImportance(importance);
  if (source) filter.source = String(source).trim();
  if (visibility) filter.visibility = String(visibility).trim();
  return filter;
}

function buildSearchFilter({ tenantId, projectKey, q, scope, importance }) {
  const filter = buildListFilter({ tenantId, projectKey, scope, importance });
  const query = String(q || "").trim();
  if (!query) return filter;
  const terms = Array.from(new Set(query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)))
    .slice(0, 8);
  const expressions = (terms.length ? terms : [query]).map((term) => new RegExp(escapeRegExp(term), "i"));
  filter.$and = filter.$and || [];
  filter.$and.push({
    $or: expressions.flatMap((regex) => [
      { title: regex },
      { content: regex },
      { tags: regex },
      { scope: regex }
    ])
  });
  return filter;
}

function serialize(memory) {
  if (!memory) return null;
  return {
    id: String(memory._id),
    tenantId: String(memory.tenantId),
    projectKey: memory.projectKey || DEFAULT_PROJECT_KEY,
    scope: memory.scope || "organization",
    title: memory.title || "",
    content: memory.content || "",
    tags: Array.isArray(memory.tags) ? memory.tags : [],
    importance: Number(memory.importance || 1),
    source: memory.source || "manual",
    createdBy: memory.createdBy ? String(memory.createdBy) : null,
    visibility: memory.visibility || "tenant",
    expiresAt: memory.expiresAt || null,
    metadata: memory.metadata || {},
    createdAt: memory.createdAt || null,
    updatedAt: memory.updatedAt || null
  };
}

function buildPayload(input = {}, user = {}) {
  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  if (!title) {
    const error = new Error("Título da memória é obrigatório.");
    error.statusCode = 400;
    throw error;
  }
  if (!content) {
    const error = new Error("Conteúdo da memória é obrigatório.");
    error.statusCode = 400;
    throw error;
  }
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    const error = new Error("Data de expiração inválida.");
    error.statusCode = 400;
    throw error;
  }
  return {
    tenantId: user.tenantId,
    projectKey: normalizeProjectKey(input.projectKey),
    scope: String(input.scope || "organization").trim() || "organization",
    title,
    content,
    tags: normalizeTags(input.tags),
    importance: normalizeImportance(input.importance),
    source: String(input.source || "manual").trim() || "manual",
    createdBy: user.id || undefined,
    visibility: String(input.visibility || "tenant").trim() || "tenant",
    expiresAt,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

async function createMemory({ tenantId, userId, projectKey, data }) {
  const payload = buildPayload({ ...(data || {}), projectKey: projectKey || data?.projectKey }, { tenantId, id: userId });
  const memory = await TenantMemory.create(payload);
  return serialize(memory);
}

async function listMemories({ tenantId, projectKey, query = {} }) {
  const requestedProjectKey = projectKey !== undefined ? projectKey : query.projectKey;
  const useAllProjects = requestedProjectKey === undefined || requestedProjectKey === null || String(requestedProjectKey).trim() === "" || String(requestedProjectKey).trim().toLowerCase() === "all";
  const resolvedProjectKey = useAllProjects ? null : normalizeProjectKey(requestedProjectKey);
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
  const memories = await TenantMemory.find(buildListFilter({ tenantId, ...query, projectKey: resolvedProjectKey })).sort({ importance: -1, createdAt: -1 }).limit(limit).lean();
  return memories.map(serialize);
}

async function searchMemories({ tenantId, projectKey, q = "", query = {} }) {
  const requestedProjectKey = projectKey !== undefined ? projectKey : query.projectKey;
  const useAllProjects = requestedProjectKey === undefined || requestedProjectKey === null || String(requestedProjectKey).trim() === "" || String(requestedProjectKey).trim().toLowerCase() === "all";
  const resolvedProjectKey = useAllProjects ? null : normalizeProjectKey(requestedProjectKey);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const memories = await TenantMemory.find(buildSearchFilter({ tenantId, projectKey: resolvedProjectKey, q, scope: query.scope, importance: query.importance }))
    .sort({ importance: -1, updatedAt: -1 })
    .limit(limit)
    .lean();
  return memories.map(serialize);
}

async function getMemory({ tenantId, projectKey, id }) {
  const memory = await TenantMemory.findOne({ ...activeMemoryFilter(tenantId, projectKey), _id: id }).lean();
  return serialize(memory);
}

async function updateMemory({ tenantId, projectKey, id, data }) {
  const resolvedProjectKey = normalizeProjectKey(projectKey || data?.projectKey);
  const existing = await TenantMemory.findOne({ ...tenantProjectFilter(tenantId, resolvedProjectKey), _id: id });
  if (!existing) return null;
  const payload = buildPayload({ ...serialize(existing), ...data, projectKey: resolvedProjectKey }, { tenantId, id: existing.createdBy });
  delete payload.tenantId;
  delete payload.createdBy;
  Object.assign(existing, payload);
  await existing.save();
  return serialize(existing);
}

async function deleteMemory({ tenantId, projectKey, id }) {
  const deleted = await TenantMemory.findOneAndDelete({ ...tenantProjectFilter(tenantId, projectKey), _id: id }).lean();
  return serialize(deleted);
}

async function getMemoryStats({ tenantId, projectKey }) {
  const requestedProjectKey = projectKey;
  const useAllProjects = requestedProjectKey === undefined || requestedProjectKey === null || String(requestedProjectKey).trim() === "" || String(requestedProjectKey).trim().toLowerCase() === "all";
  const resolvedProjectKey = useAllProjects ? null : normalizeProjectKey(requestedProjectKey);
  const baseFilter = activeMemoryFilter(tenantId, resolvedProjectKey);

  const [total, byProjectRaw, byScopeRaw, recentRaw] = await Promise.all([
    TenantMemory.countDocuments(baseFilter),
    TenantMemory.aggregate([
      { $match: baseFilter },
      { $group: { _id: { $ifNull: ["$projectKey", DEFAULT_PROJECT_KEY] }, total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } }
    ]),
    TenantMemory.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$scope", total: { $sum: 1 } } },
      { $sort: { total: -1, _id: 1 } }
    ]),
    TenantMemory.find(baseFilter).sort({ createdAt: -1 }).limit(10).lean()
  ]);

  return {
    total: Number(total || 0),
    byProject: byProjectRaw.map((item) => ({ projectKey: item?._id || DEFAULT_PROJECT_KEY, total: Number(item?.total || 0) })),
    byScope: byScopeRaw.map((item) => ({ scope: item?._id || "organization", total: Number(item?.total || 0) })),
    recent: recentRaw.map(serialize)
  };
}

module.exports = {
  createMemory,
  listMemories,
  searchMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  getMemoryStats,
  serialize,
  normalizeTags,
  normalizeProjectKey,
  DEFAULT_PROJECT_KEY,
  MEMORY_PROJECT_KEYS
};
