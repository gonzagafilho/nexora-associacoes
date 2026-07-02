const { searchMemories } = require("../memory/memory.service");

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

async function buildCopilotMemoryContext({ tenantId, question, limit = 5 }) {
  const memories = await searchMemories({ tenantId, q: question, query: { limit } });
  return {
    memories,
    promptContext: formatMemoryContext(memories)
  };
}

module.exports = {
  buildCopilotMemoryContext,
  formatMemoryContext
};
