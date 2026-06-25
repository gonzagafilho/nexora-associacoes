const crypto = require("crypto");

const AiConversation = require("../../models/AiConversation");

function newConversationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getOrCreateConversation({ tenantId, userId, conversationId }) {
  const cid = String(conversationId || "").trim() || newConversationId();
  const conversation = await AiConversation.findOneAndUpdate(
    { tenantId, userId, conversationId: cid },
    { $setOnInsert: { tenantId, userId, conversationId: cid } },
    { new: true, upsert: true }
  );
  return conversation;
}

function normalizeMessage(role, text, meta = {}) {
  return {
    role,
    text: String(text || "").trim(),
    at: new Date(),
    meta
  };
}

async function appendMessages({ conversation, incoming, outgoing, meta = {} }) {
  const updates = [];
  if (incoming) updates.push(normalizeMessage("user", incoming, meta.incoming || {}));
  if (outgoing) updates.push(normalizeMessage("assistant", outgoing, meta.outgoing || {}));
  if (!updates.length) return conversation;

  conversation.messages = [...(conversation.messages || []), ...updates].slice(-120);
  await conversation.save();
  return conversation;
}

async function updateConversationState(conversation, state = {}) {
  if (!conversation) return null;
  if (state.intent !== undefined) conversation.intent = state.intent;
  if (state.module !== undefined) conversation.module = state.module;
  if (state.execution !== undefined) {
    conversation.execution = {
      ...(conversation.execution || {}),
      ...state.execution
    };
  }
  if (state.status !== undefined) conversation.status = state.status;
  if (state.responseTime !== undefined) conversation.responseTime = Number(state.responseTime || 0);
  await conversation.save();
  return conversation;
}

async function listHistory({ tenantId, userId, limit = 30 }) {
  return AiConversation.find({ tenantId, userId }).sort({ updatedAt: -1 }).limit(Math.max(1, Number(limit || 30))).lean();
}

module.exports = {
  getOrCreateConversation,
  appendMessages,
  updateConversationState,
  listHistory,
  newConversationId
};
