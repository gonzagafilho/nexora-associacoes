const { searchMemories, normalizeProjectKey } = require("../memory/memory.service");

function formatMemoryContext(memories = []) {
  if (!memories.length) return "";
  return memories
    .slice(0, 5)
    .map((memory, index) => {
      const tags = memory.tags?.length ? ` tags: ${memory.tags.join(", ")}` : "";
      return `${index + 1}. [${memory.scope} / importancia ${memory.importance}] ${memory.title}: ${memory.content}${tags}`;
    })
    .join("\n");
}

async function buildCopilotMemoryContext({ tenantId, projectKey, question, limit = 5 }) {
  const resolvedProjectKey = normalizeProjectKey(projectKey);
  const memories = await searchMemories({ tenantId, projectKey: resolvedProjectKey, q: question, query: { limit } });
  return {
    projectKey: resolvedProjectKey,
    memories,
    promptContext: formatMemoryContext(memories)
  };
}

module.exports = {
  buildCopilotMemoryContext,
  formatMemoryContext
};
