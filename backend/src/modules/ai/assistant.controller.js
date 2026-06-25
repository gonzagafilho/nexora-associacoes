const { answerQuestion, HELP_QUESTIONS } = require("../../services/intelligence/aiAssistantService");
const { buildSmartContext } = require("../../services/ai/aiContextService");
const { getOrCreateConversation, appendMessages, updateConversationState, listHistory } = require("../../services/ai/aiConversationService");
const { identifyIntent } = require("../../services/ai/aiIntentService");
const { buildPlan, applyAnswerToPayload, confirmationText } = require("../../services/ai/aiPlannerService");
const { executeAction } = require("../../services/ai/aiExecutionService");
const { buildEventContext, publishOsEvent } = require("../../os/osEventPublisher");

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
}

function acceptedConfirmation(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["sim", "s", "confirmar", "confirmo", "yes", "y", "ok"].includes(raw);
}

function deniedConfirmation(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["nao", "não", "n", "cancelar", "no"].includes(raw);
}

async function publishAiEventSafe(req, eventName, data = {}) {
  try {
    await publishOsEvent(eventName, {
      module: "ai",
      action: data.action || "message",
      entityId: data.entityId,
      entityType: data.entityType || "AiConversation",
      payload: data.payload || {}
    }, buildEventContext(req));
  } catch (_error) {
    // never break primary flow
  }
}

async function resolveConversationSafe({ tenantId, userId, conversationId }) {
  try {
    return await getOrCreateConversation({ tenantId, userId, conversationId });
  } catch (_error) {
    return null;
  }
}

async function appendMessagesSafe(payload) {
  if (!payload?.conversation) return;
  try {
    await appendMessages(payload);
  } catch (_error) {
    // best-effort persistence
  }
}

async function updateConversationStateSafe(conversation, state) {
  if (!conversation) return;
  try {
    await updateConversationState(conversation, state);
  } catch (_error) {
    // best-effort persistence
  }
}

async function getContext(req, res) {
  try {
    const context = await buildSmartContext({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      userName: req.user.name || req.user.email?.split("@")[0] || "usuário"
    });
    return res.json({ ok: true, ...context });
  } catch (error) {
    console.error("[ai:assistant:context]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar contexto inteligente." });
  }
}

async function getLegacyContext(req, res) {
  try {
    const context = await buildSmartContext({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      userName: req.user.name || req.user.email?.split("@")[0] || "usuário"
    });
    return res.json({ ok: true, context: context.context, supportedQuestions: HELP_QUESTIONS });
  } catch (error) {
    console.error("[ai:assistant:legacy-context]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar contexto inteligente." });
  }
}

async function getHistory(req, res) {
  try {
    const items = await listHistory({ tenantId: req.user.tenantId, userId: req.user.id, limit: req.query.limit || 30 });
    return res.json({ ok: true, conversations: items });
  } catch (error) {
    console.error("[ai:assistant:history]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao carregar histórico." });
  }
}

async function askAssistant(req, res) {
  const startedAt = Date.now();

  try {
    const text = String(req.body?.message || req.body?.question || "").trim();
    if (!text) return res.status(400).json({ ok: false, message: "Pergunta não informada." });

    const conversation = await resolveConversationSafe({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      conversationId: req.body?.conversationId
    });

    const activeExecution = conversation.execution || {};
    const hasPendingFlow = ["awaiting_data", "awaiting_confirmation"].includes(conversation.status);
    const shouldContinueFlow = hasPendingFlow && activeExecution.action;

    const intentInfo = shouldContinueFlow
      ? {
          intent: activeExecution.action,
          type: "action",
          module: activeExecution.plan?.module || conversation.module || "NEXORA IA",
          requiresConfirmation: Boolean(activeExecution.requiredConfirmation),
          critical: true,
          route: activeExecution.plan?.route
        }
      : identifyIntent(text);

    await publishAiEventSafe(req, "ai.message", {
      action: "message",
      entityId: conversation?.conversationId,
      payload: { text, intent: intentInfo.intent, type: intentInfo.type }
    });

    if (intentInfo.type === "query") {
      const query = await answerQuestion({ tenantId: req.user.tenantId, userId: req.user.id, question: text });
      await appendMessagesSafe({ conversation, incoming: text, outgoing: query.answer, meta: { outgoing: { intent: query.intent, module: intentInfo.module } } });
      await updateConversationStateSafe(conversation, {
        intent: query.intent,
        module: intentInfo.module,
        status: "open",
        execution: { action: "", requiredConfirmation: false, confirmed: false, plan: null, payload: null, result: null },
        responseTime: Date.now() - startedAt
      });
      return res.json({ ok: true, conversationId: conversation?.conversationId, intent: query.intent, module: intentInfo.module, answer: query.answer, data: query.data });
    }

    if (intentInfo.type === "action") {
      const initialPayload = shouldContinueFlow ? (activeExecution.payload || {}) : {};
      const payload = shouldContinueFlow ? applyAnswerToPayload(intentInfo.intent, initialPayload, text) : initialPayload;
      const plan = buildPlan(intentInfo.intent, payload);
      const route = intentInfo.route || activeExecution.plan?.route || (intentInfo.module === "Financeiro" ? "financeiro" : undefined);

      if (!plan.supported && intentInfo.action === "navigate") {
        const responseText = `Certo. Vou abrir ${intentInfo.module}.`;
        await appendMessagesSafe({ conversation, incoming: text, outgoing: responseText });
        await updateConversationStateSafe(conversation, {
          intent: intentInfo.intent,
          module: intentInfo.module,
          status: "executed",
          execution: {
            action: intentInfo.intent,
            requiredConfirmation: false,
            confirmed: true,
            plan: { module: intentInfo.module, route },
            payload: {},
            result: { navigated: true, route }
          },
          responseTime: Date.now() - startedAt
        });
        return res.json({ ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: intentInfo.module, answer: responseText, action: { type: "navigate", route } });
      }

      if (conversation.status === "awaiting_confirmation") {
        if (acceptedConfirmation(text)) {
          await publishAiEventSafe(req, "ai.execution_confirmed", {
            action: "execution_confirmed",
            entityId: conversation?.conversationId,
            payload: { command: activeExecution.action }
          });
          const execution = await executeAction({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            userRole: req.user.role,
            ip: clientIp(req),
            command: activeExecution.action,
            intent: activeExecution.action,
            module: conversation.module,
            payload: activeExecution.payload || {},
            plan: activeExecution.plan,
            confirmed: true,
            responseTime: Date.now() - startedAt
          });
          const answer = execution.ok
            ? "Ação executada com sucesso e registrada em auditoria."
            : `Não foi possível executar: ${execution.result?.message || execution.status}.`;
          await appendMessagesSafe({ conversation, incoming: text, outgoing: answer });
          await updateConversationStateSafe(conversation, {
            status: execution.ok ? "executed" : "error",
            responseTime: Date.now() - startedAt,
            execution: {
              ...activeExecution,
              confirmed: true,
              result: execution
            }
          });
          await publishAiEventSafe(req, "ai.execution_completed", {
            action: "execution_completed",
            entityId: conversation?.conversationId,
            payload: {
              command: activeExecution.action,
              status: execution.status,
              ok: execution.ok
            }
          });
          return res.json({ ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: conversation?.module || plan.module, answer, execution });
        }

        if (deniedConfirmation(text)) {
          const answer = "Execução cancelada. Nenhuma ação crítica foi realizada.";
          await appendMessagesSafe({ conversation, incoming: text, outgoing: answer });
          await updateConversationStateSafe(conversation, {
            status: "cancelled",
            responseTime: Date.now() - startedAt,
            execution: {
              ...activeExecution,
              confirmed: false,
              result: { cancelled: true }
            }
          });
          return res.json({ ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: conversation?.module || plan.module, answer });
        }

        const remind = "Por segurança, responda com 'sim' para confirmar ou 'não' para cancelar.";
        await appendMessagesSafe({ conversation, incoming: text, outgoing: remind });
        await updateConversationStateSafe(conversation, { responseTime: Date.now() - startedAt });
        return res.json({ ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: conversation?.module || plan.module, answer: remind });
      }

      if (plan.missingFields.length) {
        await appendMessagesSafe({ conversation, incoming: text, outgoing: plan.nextQuestion });
        await updateConversationStateSafe(conversation, {
          intent: intentInfo.intent,
          module: plan.module,
          status: "awaiting_data",
          responseTime: Date.now() - startedAt,
          execution: {
            action: intentInfo.intent,
            requiredConfirmation: true,
            confirmed: false,
            plan: { ...plan, route },
            payload: plan.payload,
            result: null
          }
        });
        return res.json({ ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: plan.module, answer: plan.nextQuestion, pending: true, plan });
      }

      const confirmation = confirmationText(plan);
      await appendMessagesSafe({ conversation, incoming: text, outgoing: confirmation });
      await updateConversationStateSafe(conversation, {
        intent: intentInfo.intent,
        module: plan.module,
        status: "awaiting_confirmation",
        responseTime: Date.now() - startedAt,
        execution: {
          action: intentInfo.intent,
          requiredConfirmation: true,
          confirmed: false,
          plan: { ...plan, route },
          payload: plan.payload,
          result: null
        }
      });

      await publishAiEventSafe(req, "ai.execution_planned", {
        action: "execution_planned",
        entityId: conversation?.conversationId,
        payload: {
          command: intentInfo.intent,
          module: plan.module,
          missingFields: plan.missingFields,
          requiresConfirmation: true
        }
      });

      return res.json({
        ok: true,
        conversationId: conversation?.conversationId,
        intent: intentInfo.intent,
        module: plan.module,
        answer: confirmation,
        requiresConfirmation: true,
        plan,
        action: route ? { type: "navigate", route } : undefined
      });
    }

    const fallbackAnswer = "Posso ajudar com comandos como: cadastrar associado, cadastrar despesa, abrir financeiro, consultar saldo.";
    await appendMessagesSafe({ conversation, incoming: text, outgoing: fallbackAnswer });
    await updateConversationStateSafe(conversation, {
      intent: "unknown",
      module: "NEXORA IA",
      status: "open",
      responseTime: Date.now() - startedAt
    });

    return res.json({ ok: true, conversationId: conversation?.conversationId, intent: "unknown", module: "NEXORA IA", answer: fallbackAnswer });
  } catch (error) {
    console.error("[ai:assistant:message]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao processar mensagem da NEXORA IA." });
  }
}

async function legacyChat(req, res) {
  const startedAt = Date.now();

  try {
    const text = String(req.body?.question || req.body?.message || "").trim();
    if (!text) return res.status(400).json({ ok: false, message: "Pergunta não informada." });

    const conversation = await resolveConversationSafe({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      conversationId: req.body?.conversationId
    });

    const result = await answerQuestion({ tenantId: req.user.tenantId, userId: req.user.id, question: text });
    await publishAiEventSafe(req, "ai.message", {
      action: "message",
      entityId: conversation?.conversationId,
      payload: { text, intent: result.intent, channel: "legacy" }
    });
    await appendMessagesSafe({ conversation, incoming: text, outgoing: result.answer, meta: { outgoing: { intent: result.intent, module: "NEXORA IA" } } });
    await updateConversationStateSafe(conversation, {
      intent: result.intent,
      module: "NEXORA IA",
      status: "open",
      responseTime: Date.now() - startedAt,
      execution: {
        action: "",
        requiredConfirmation: false,
        confirmed: false,
        plan: null,
        payload: null,
        result: null
      }
    });

    return res.json({ ...result, conversationId: conversation?.conversationId });
  } catch (error) {
    console.error("[ai:assistant:legacy-chat]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao consultar o NEXORA." });
  }
}

module.exports = {
  getContext,
  getLegacyContext,
  getHistory,
  askAssistant,
  legacyChat
};
