const TenantMemory = require("./memory.model");

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

function activeMemoryFilter(tenantId) {
  return {
    tenantId,
    $or: [
      { expiresAt: null },
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  };
}

function buildListFilter({ tenantId, scope, tag, importance, source, visibility }) {
  const filter = activeMemoryFilter(tenantId);
  if (scope) filter.scope = String(scope).trim();
  if (tag) filter.tags = String(tag).trim().toLowerCase();
  if (importance !== undefined && importance !== "") filter.importance = normalizeImportance(importance);
  if (source) filter.source = String(source).trim();
  if (visibility) filter.visibility = String(visibility).trim();
  return filter;
}

function buildSearchFilter({ tenantId, q, scope, importance }) {
  const filter = buildListFilter({ tenantId, scope, importance });
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
  filter.$and = [
    {
      $or: expressions.flatMap((regex) => [
        { title: regex },
        { content: regex },
        { tags: regex },
        { scope: regex }
      ])
    }
  ];
  return filter;
}

function serialize(memory) {
  if (!memory) return null;
  return {
    id: String(memory._id),
    tenantId: String(memory.tenantId),
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

async function createMemory({ tenantId, userId, data }) {
  const payload = buildPayload(data, { tenantId, id: userId });
  const memory = await TenantMemory.create(payload);
  return serialize(memory);
}

async function listMemories({ tenantId, query = {} }) {
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
  const memories = await TenantMemory.find(buildListFilter({ tenantId, ...query })).sort({ importance: -1, createdAt: -1 }).limit(limit).lean();
  return memories.map(serialize);
}

async function searchMemories({ tenantId, q = "", query = {} }) {
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const memories = await TenantMemory.find(buildSearchFilter({ tenantId, q, scope: query.scope, importance: query.importance }))
    .sort({ importance: -1, updatedAt: -1 })
    .limit(limit)
    .lean();
  return memories.map(serialize);
}

async function getMemory({ tenantId, id }) {
  const memory = await TenantMemory.findOne({ ...activeMemoryFilter(tenantId), _id: id }).lean();
  return serialize(memory);
}

async function updateMemory({ tenantId, id, data }) {
  const existing = await TenantMemory.findOne({ tenantId, _id: id });
  if (!existing) return null;
  const payload = buildPayload({ ...serialize(existing), ...data }, { tenantId, id: existing.createdBy });
  delete payload.tenantId;
  delete payload.createdBy;
  Object.assign(existing, payload);
  await existing.save();
  return serialize(existing);
}

async function deleteMemory({ tenantId, id }) {
  const deleted = await TenantMemory.findOneAndDelete({ tenantId, _id: id }).lean();
  return serialize(deleted);
}

module.exports = {
  createMemory,
  listMemories,
  searchMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  serialize,
  normalizeTags
};
