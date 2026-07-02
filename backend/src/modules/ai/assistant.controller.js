const { answerQuestion, HELP_QUESTIONS } = require("../../services/intelligence/aiAssistantService");
const { buildSmartContext } = require("../../services/ai/aiContextService");
const { getOrCreateConversation, appendMessages, updateConversationState, listHistory } = require("../../services/ai/aiConversationService");
const { identifyIntent } = require("../../services/ai/aiIntentService");
const { buildPlan, applyAnswerToPayload, confirmationText } = require("../../services/ai/aiPlannerService");
const { executeAction } = require("../../services/ai/aiExecutionService");
const { buildEventContext, publishOsEvent } = require("../../os/osEventPublisher");
const { supervisor: agentSupervisor } = require("../../agents");
const { buildCopilotMemoryContext } = require("../copilot");
const { normalizeProjectKey } = require("../memory/memory.service");
const aiActivityLogService = require("./aiActivityLog.service");
const { core: platformCore } = require("../../platform");

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

function requestProjectKey(req) {
  return normalizeProjectKey(req.body?.projectKey);
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

async function buildMemoryContextSafe({ tenantId, projectKey, question }) {
  try {
    return await buildCopilotMemoryContext({ tenantId, projectKey, question });
  } catch (_error) {
    return { projectKey, memories: [], promptContext: "" };
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

function safeProjectKey(value) {
  try {
    return normalizeProjectKey(value);
  } catch (_error) {
    return "associacoes";
  }
}

function extractMemoryIds(memoryContext = {}) {
  const memories = Array.isArray(memoryContext.memories) ? memoryContext.memories : [];
  return memories
    .map((item) => String(item?.id || item?._id || "").trim())
    .filter(Boolean)
    .slice(0, 100);
}

function buildMemoryContextPreview(memoryContext = {}) {
  const promptContext = String(memoryContext.promptContext || "").trim();
  if (promptContext) return promptContext.slice(0, 1000);
  const titles = (Array.isArray(memoryContext.memories) ? memoryContext.memories : [])
    .map((item) => String(item?.title || item?.content || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return titles.join(" | ").slice(0, 1000);
}

async function logActivitySafe(payload = {}) {
  try {
    await aiActivityLogService.createActivityLog(payload);
  } catch (_error) {
    // never break assistant flow because of logging
  }
}

async function respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module, action, answer, metadata, payload }) {
  await logActivitySafe({
    tenantId: req.user.tenantId,
    userId: req.user.id,
    projectKey,
    module: module || "NEXORA IA",
    action: action || "assistant.message",
    question: text,
    answer: answer || "",
    memoryIds: extractMemoryIds(memoryContext),
    memoryCount: Array.isArray(memoryContext?.memories) ? memoryContext.memories.length : 0,
    memoryContextPreview: buildMemoryContextPreview(memoryContext),
    status: "success",
    errorMessage: "",
    durationMs: Date.now() - startedAt,
    metadata: metadata && typeof metadata === "object" ? metadata : {}
  });
  return res.json(payload);
}

function resolveSkillCandidate({ text, intentInfo, projectKey }) {
  const lower = String(text || "").trim().toLowerCase();
  if (!lower) return null;

  if (/(criar|gerar).*(bolepix|boleto|pix)|(?:bolepix|boleto|pix).*(criar|gerar)/.test(lower)) {
    return { skill: "finance.createBolePix", payload: { projectKey }, answerPrefix: "Skill finance.createBolePix executada." };
  }
  if (/(listar|listar todas|mostrar).*(fatura|faturas|cobran|mensalidad)/.test(lower)) {
    return { skill: "finance.listInvoices", payload: { projectKey }, answerPrefix: "Skill finance.listInvoices executada." };
  }
  if (/(buscar|encontrar|procurar).*(associad)/.test(lower)) {
    return { skill: "associate.find", payload: { q: text, projectKey }, answerPrefix: "Skill associate.find executada." };
  }
  if (/listar.*associad|associad.*listar/.test(lower)) {
    return { skill: "associate.list", payload: { projectKey }, answerPrefix: "Skill associate.list executada." };
  }
  if (/listar.*protocol|protocol.*abert|protocol.*listar/.test(lower)) {
    return { skill: "protocol.list", payload: { projectKey }, answerPrefix: "Skill protocol.list executada." };
  }
  if (/listar.*projet|projet.*listar/.test(lower)) {
    return { skill: "project.list", payload: { projectKey }, answerPrefix: "Skill project.list executada." };
  }

  if (intentInfo?.intent === "open_protocols") {
    return { skill: "protocol.list", payload: { status: "open", projectKey }, answerPrefix: "Skill protocol.list executada." };
  }
  if (intentInfo?.intent === "associates") {
    return { skill: "associate.list", payload: { projectKey }, answerPrefix: "Skill associate.list executada." };
  }
  if (intentInfo?.intent === "overdue_invoices") {
    return { skill: "finance.listInvoices", payload: { status: "overdue", projectKey }, answerPrefix: "Skill finance.listInvoices executada." };
  }

  return null;
}

function resolveOrchestratorCandidate({ text, intentInfo }) {
  const lower = String(text || "").trim().toLowerCase();
  if (!lower) return null;

  if (/orquestr|orchestr|plano de acoes|plano de ações|multi\s*skill|multi\s*etapa/.test(lower)) {
    return { mode: "explicit" };
  }

  if (/(cobran|bolepix|pix|boleto).*(protocol|protocolo).*(whatsapp|notifica)/.test(lower)) {
    return { mode: "financial_collection" };
  }

  if (/(protocol|protocolo).*(whatsapp|notifica).*(workflow)/.test(lower)) {
    return { mode: "protocol_followup" };
  }

  if (intentInfo?.type === "action" && /workflow|protocol|financeiro|finance/.test(lower) && /(depois|em seguida|tambem|também|e )/.test(lower)) {
    return { mode: "intent_chain" };
  }

  return null;
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
  let text = "";
  let projectKey = safeProjectKey(req.body?.projectKey);
  let memoryContext = { projectKey, memories: [], promptContext: "" };
  let skillAttempted = "";

  try {
    text = String(req.body?.message || req.body?.question || "").trim();
    if (!text) {
      await logActivitySafe({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        projectKey,
        module: "NEXORA IA",
        action: "assistant.message",
        question: "",
        answer: "",
        memoryIds: [],
        memoryCount: 0,
        memoryContextPreview: "",
        status: "error",
        errorMessage: "Pergunta não informada.",
        durationMs: Date.now() - startedAt,
        metadata: { endpoint: "/api/ai/assistant/message" }
      });
      return res.status(400).json({ ok: false, message: "Pergunta não informada." });
    }

    projectKey = requestProjectKey(req);

    memoryContext = await buildMemoryContextSafe({ tenantId: req.user.tenantId, projectKey, question: text });

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

    const orchestratorCandidate = resolveOrchestratorCandidate({ text, intentInfo });
    if (orchestratorCandidate) {
      const planned = await platformCore.ai.planAndMaybeExecute({
        question: text,
        projectKey,
        context: {
          tenantId: req.user.tenantId,
          userId: req.user.id,
          userRole: req.user.role,
          userEmail: req.user.email,
          enabledModules: req.user.enabledModules
        },
        autoExecute: false,
        input: { projectKey }
      });
      const planResult = planned.planResult;

      if (planResult.policy?.blocked) {
        const error = new Error(planResult.policy.reasons?.[0] || "Plano bloqueado pela Policy Engine.");
        error.statusCode = planResult.policy.code || 403;
        throw error;
      }

      const planSteps = (planResult.plan?.steps || []).map((step) => step.skill).join(" -> ");
      const requiresConfirmation = Boolean(planResult.policy?.requiresConfirmation);

      if (requiresConfirmation) {
        const confirmationAnswer = `Plano criado com ${planResult.plan.steps.length} etapa(s): ${planSteps}. Responda 'sim' para executar agora ou 'não' para cancelar.`;

        await appendMessagesSafe({
          conversation,
          incoming: text,
          outgoing: confirmationAnswer,
          meta: {
            outgoing: {
              intent: "orchestrator.plan",
              module: "NEXORA Orchestrator",
              planId: planResult.plan.id,
              memoryContext
            }
          }
        });

        await updateConversationStateSafe(conversation, {
          intent: "orchestrator.execute",
          module: "NEXORA Orchestrator",
          status: "awaiting_confirmation",
          responseTime: Date.now() - startedAt,
          execution: {
            action: "orchestrator.execute",
            requiredConfirmation: true,
            confirmed: false,
            plan: {
              id: planResult.plan.id,
              intent: planResult.plan.intent,
              steps: planResult.plan.steps,
              module: "NEXORA Orchestrator"
            },
            payload: { planId: planResult.plan.id },
            result: null
          }
        });

        const responsePayload = {
          ok: true,
          conversationId: conversation?.conversationId,
          intent: "orchestrator.plan",
          module: "NEXORA Orchestrator",
          answer: confirmationAnswer,
          requiresConfirmation: true,
          orchestratorPlanId: planResult.plan.id,
          plan: planResult.plan,
          policy: planResult.policy
        };

        return respondAssistantSuccess({
          req,
          res,
          startedAt,
          text,
          projectKey,
          memoryContext,
          module: "NEXORA Orchestrator",
          action: "orchestrator.plan",
          answer: confirmationAnswer,
          metadata: {
            conversationId: conversation?.conversationId,
            orchestratorPlanId: planResult.plan.id,
            requiresConfirmation: true
          },
          payload: responsePayload
        });
      }

      const executionResult = await platformCore.orchestrator.execute({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        userRole: req.user.role,
        userEmail: req.user.email,
        enabledModules: req.user.enabledModules,
        planId: planResult.plan.id,
        confirm: false
      });

      const answer = executionResult.execution.success
        ? `Orquestração concluída com sucesso em ${executionResult.execution.totalDurationMs}ms (${executionResult.execution.executedSteps}/${executionResult.execution.totalSteps} skills).`
        : `Orquestração finalizada com falha em ${executionResult.execution.failedStep || "etapa desconhecida"}: ${executionResult.execution.errorMessage || "erro não informado"}.`;

      await appendMessagesSafe({
        conversation,
        incoming: text,
        outgoing: answer,
        meta: {
          outgoing: {
            intent: "orchestrator.execute",
            module: "NEXORA Orchestrator",
            planId: planResult.plan.id,
            memoryContext
          }
        }
      });

      await updateConversationStateSafe(conversation, {
        intent: "orchestrator.execute",
        module: "NEXORA Orchestrator",
        status: executionResult.execution.success ? "executed" : "error",
        responseTime: Date.now() - startedAt,
        execution: {
          action: "orchestrator.execute",
          requiredConfirmation: requiresConfirmation,
          confirmed: true,
          plan: { id: planResult.plan.id, intent: planResult.plan.intent, steps: planResult.plan.steps },
          payload: { planId: planResult.plan.id },
          result: executionResult.execution
        }
      });

      const responsePayload = {
        ok: true,
        conversationId: conversation?.conversationId,
        intent: "orchestrator.execute",
        module: "NEXORA Orchestrator",
        answer,
        orchestratorPlanId: planResult.plan.id,
        execution: executionResult.execution,
        plan: executionResult.plan
      };

      return respondAssistantSuccess({
        req,
        res,
        startedAt,
        text,
        projectKey,
        memoryContext,
        module: "NEXORA Orchestrator",
        action: "orchestrator.execute",
        answer,
        metadata: {
          conversationId: conversation?.conversationId,
          orchestratorPlanId: planResult.plan.id,
          success: Boolean(executionResult.execution.success)
        },
        payload: responsePayload
      });
    }

    const skillCandidate = resolveSkillCandidate({ text, intentInfo, projectKey });
    if (skillCandidate) {
      skillAttempted = skillCandidate.skill;
      const skillStartedAt = Date.now();
      const skillExecution = await platformCore.ai.executeSkill(skillCandidate.skill, skillCandidate.payload || {}, {
        tenantId: req.user.tenantId,
        userId: req.user.id,
        userRole: req.user.role,
        userEmail: req.user.email,
        enabledModules: req.user.enabledModules
      });

      const count = Number(skillExecution?.data?.count || 0);
      const skillAnswer = `${skillCandidate.answerPrefix} Resultado: ${count || 1} item(ns).`;

      await appendMessagesSafe({
        conversation,
        incoming: text,
        outgoing: skillAnswer,
        meta: {
          outgoing: {
            intent: skillExecution.skill,
            module: "NEXORA Skills",
            skillExecuted: skillExecution.skill,
            skillDuration: skillExecution.durationMs,
            skillStatus: "success",
            memoryContext
          }
        }
      });
      await updateConversationStateSafe(conversation, {
        intent: skillExecution.skill,
        module: "NEXORA Skills",
        status: "open",
        execution: { action: "", requiredConfirmation: false, confirmed: false, plan: null, payload: null, result: null },
        responseTime: Date.now() - startedAt
      });

      const responsePayload = {
        ok: true,
        conversationId: conversation?.conversationId,
        intent: skillExecution.skill,
        module: "NEXORA Skills",
        answer: skillAnswer,
        data: {
          skill: skillExecution.skill,
          result: skillExecution.data,
          memoryContext
        },
        skillExecuted: skillExecution.skill,
        skillDuration: skillExecution.durationMs,
        skillStatus: "success"
      };

      return respondAssistantSuccess({
        req,
        res,
        startedAt,
        text,
        projectKey,
        memoryContext,
        module: "NEXORA Skills",
        action: skillExecution.skill,
        answer: skillAnswer,
        metadata: {
          conversationId: conversation?.conversationId,
          skillExecuted: skillExecution.skill,
          skillDuration: Date.now() - skillStartedAt,
          skillStatus: "success"
        },
        payload: responsePayload
      });
    }

    await publishAiEventSafe(req, "ai.message", {
      action: "message",
      entityId: conversation?.conversationId,
      payload: { text, intent: intentInfo.intent, type: intentInfo.type, projectKey }
    });

    if (intentInfo.type === "query") {
      const supervised = await agentSupervisor.execute(text, { tenantId: req.user.tenantId, userId: req.user.id, projectKey, memoryContext });
      let query;
      if (supervised.agentsUsed?.length) {
        query = { ok: true, intent: intentInfo.intent, answer: supervised.answer, data: { ...(supervised.data || {}), memoryContext }, agentsUsed: supervised.agentsUsed, supervisor: true };
      } else {
        const legacyQuery = await answerQuestion({ tenantId: req.user.tenantId, userId: req.user.id, projectKey, question: text });
        query = { ...legacyQuery, data: { ...(legacyQuery.data || {}), memoryContext } };
      }
      await appendMessagesSafe({ conversation, incoming: text, outgoing: query.answer, meta: { outgoing: { intent: query.intent, module: intentInfo.module, agentsUsed: query.agentsUsed || [], supervisor: Boolean(query.supervisor), memoryContext } } });
      await updateConversationStateSafe(conversation, {
        intent: query.intent,
        module: intentInfo.module,
        status: "open",
        execution: { action: "", requiredConfirmation: false, confirmed: false, plan: null, payload: null, result: null },
        responseTime: Date.now() - startedAt
      });
      const responsePayload = { ok: true, conversationId: conversation?.conversationId, intent: query.intent, module: intentInfo.module, answer: query.answer, data: query.data, agentsUsed: query.agentsUsed || [], supervisor: Boolean(query.supervisor) };
      return respondAssistantSuccess({
        req,
        res,
        startedAt,
        text,
        projectKey,
        memoryContext,
        module: intentInfo.module,
        action: query.intent,
        answer: query.answer,
        metadata: { conversationId: conversation?.conversationId, intentType: intentInfo.type, supervisor: Boolean(query.supervisor) },
        payload: responsePayload
      });
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
        const responsePayload = { ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: intentInfo.module, answer: responseText, action: { type: "navigate", route } };
        return respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module: intentInfo.module, action: intentInfo.intent, answer: responseText, metadata: { conversationId: conversation?.conversationId, route, intentType: intentInfo.type }, payload: responsePayload });
      }

      if (conversation.status === "awaiting_confirmation") {
        if (acceptedConfirmation(text)) {
          if (activeExecution.action === "orchestrator.execute") {
            const executionResult = await platformCore.orchestrator.execute({
              tenantId: req.user.tenantId,
              userId: req.user.id,
              userRole: req.user.role,
              userEmail: req.user.email,
              enabledModules: req.user.enabledModules,
              planId: activeExecution.payload?.planId,
              confirm: true
            });

            const answer = executionResult.execution.success
              ? `Plano orquestrado executado com sucesso (${executionResult.execution.executedSteps}/${executionResult.execution.totalSteps} skills).`
              : `Plano orquestrado falhou em ${executionResult.execution.failedStep || "etapa desconhecida"}: ${executionResult.execution.errorMessage || "erro não informado"}.`;

            await appendMessagesSafe({ conversation, incoming: text, outgoing: answer });
            await updateConversationStateSafe(conversation, {
              status: executionResult.execution.success ? "executed" : "error",
              responseTime: Date.now() - startedAt,
              execution: {
                ...activeExecution,
                confirmed: true,
                result: executionResult.execution
              }
            });

            const responsePayload = {
              ok: true,
              conversationId: conversation?.conversationId,
              intent: "orchestrator.execute",
              module: "NEXORA Orchestrator",
              answer,
              orchestratorPlanId: activeExecution.payload?.planId,
              execution: executionResult.execution,
              plan: executionResult.plan
            };

            return respondAssistantSuccess({
              req,
              res,
              startedAt,
              text,
              projectKey,
              memoryContext,
              module: "NEXORA Orchestrator",
              action: "orchestrator.execute",
              answer,
              metadata: {
                conversationId: conversation?.conversationId,
                orchestratorPlanId: activeExecution.payload?.planId,
                success: Boolean(executionResult.execution.success)
              },
              payload: responsePayload
            });
          }

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
          const responsePayload = { ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: conversation?.module || plan.module, answer, execution };
          return respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module: conversation?.module || plan.module, action: intentInfo.intent, answer, metadata: { conversationId: conversation?.conversationId, executionStatus: execution.status }, payload: responsePayload });
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
          const responsePayload = { ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: conversation?.module || plan.module, answer };
          return respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module: conversation?.module || plan.module, action: intentInfo.intent, answer, metadata: { conversationId: conversation?.conversationId, cancelled: true }, payload: responsePayload });
        }

        const remind = "Por segurança, responda com 'sim' para confirmar ou 'não' para cancelar.";
        await appendMessagesSafe({ conversation, incoming: text, outgoing: remind });
        await updateConversationStateSafe(conversation, { responseTime: Date.now() - startedAt });
        const responsePayload = { ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: conversation?.module || plan.module, answer: remind };
        return respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module: conversation?.module || plan.module, action: intentInfo.intent, answer: remind, metadata: { conversationId: conversation?.conversationId, awaitingConfirmation: true }, payload: responsePayload });
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
        const responsePayload = { ok: true, conversationId: conversation?.conversationId, intent: intentInfo.intent, module: plan.module, answer: plan.nextQuestion, pending: true, plan };
        return respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module: plan.module, action: intentInfo.intent, answer: plan.nextQuestion, metadata: { conversationId: conversation?.conversationId, pending: true }, payload: responsePayload });
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

      const responsePayload = {
        ok: true,
        conversationId: conversation?.conversationId,
        intent: intentInfo.intent,
        module: plan.module,
        answer: confirmation,
        requiresConfirmation: true,
        plan,
        action: route ? { type: "navigate", route } : undefined
      };
      return respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module: plan.module, action: intentInfo.intent, answer: confirmation, metadata: { conversationId: conversation?.conversationId, requiresConfirmation: true }, payload: responsePayload });
    }

    const supervisedFallback = await agentSupervisor.execute(text, { tenantId: req.user.tenantId, userId: req.user.id, projectKey, memoryContext });
    if (supervisedFallback.agentsUsed?.length) {
      await appendMessagesSafe({ conversation, incoming: text, outgoing: supervisedFallback.answer, meta: { outgoing: { intent: "agent_supervisor", module: "NEXORA IA", agentsUsed: supervisedFallback.agentsUsed, supervisor: true, memoryContext } } });
      await updateConversationStateSafe(conversation, {
        intent: "agent_supervisor",
        module: "NEXORA IA",
        status: "open",
        responseTime: Date.now() - startedAt,
        execution: { action: "", requiredConfirmation: false, confirmed: false, plan: null, payload: null, result: null }
      });
      const responsePayload = { ok: true, conversationId: conversation?.conversationId, intent: "agent_supervisor", module: "NEXORA IA", answer: supervisedFallback.answer, data: { ...(supervisedFallback.data || {}), memoryContext }, agentsUsed: supervisedFallback.agentsUsed, supervisor: true };
      return respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module: "NEXORA IA", action: "agent_supervisor", answer: supervisedFallback.answer, metadata: { conversationId: conversation?.conversationId, supervisor: true }, payload: responsePayload });
    }

    const fallbackAnswer = "Posso ajudar com comandos como: cadastrar associado, cadastrar despesa, abrir financeiro, consultar saldo.";
    await appendMessagesSafe({ conversation, incoming: text, outgoing: fallbackAnswer });
    await updateConversationStateSafe(conversation, {
      intent: "unknown",
      module: "NEXORA IA",
      status: "open",
      responseTime: Date.now() - startedAt
    });

    const responsePayload = { ok: true, conversationId: conversation?.conversationId, intent: "unknown", module: "NEXORA IA", answer: fallbackAnswer };
    return respondAssistantSuccess({ req, res, startedAt, text, projectKey, memoryContext, module: "NEXORA IA", action: "unknown", answer: fallbackAnswer, metadata: { conversationId: conversation?.conversationId }, payload: responsePayload });
  } catch (error) {
    await logActivitySafe({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      projectKey,
      module: "NEXORA IA",
      action: "assistant.message",
      question: text,
      answer: "",
      memoryIds: extractMemoryIds(memoryContext),
      memoryCount: Array.isArray(memoryContext?.memories) ? memoryContext.memories.length : 0,
      memoryContextPreview: buildMemoryContextPreview(memoryContext),
      status: "error",
      errorMessage: error.message || "Erro ao processar mensagem da NEXORA IA.",
      durationMs: Date.now() - startedAt,
      metadata: {
        endpoint: "/api/ai/assistant/message",
        skillExecuted: skillAttempted,
        skillDuration: Date.now() - startedAt,
        skillStatus: "error"
      }
    });
    console.error("[ai:assistant:message]", error.message);
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao processar mensagem da NEXORA IA." });
  }
}

async function legacyChat(req, res) {
  const startedAt = Date.now();

  try {
    const text = String(req.body?.question || req.body?.message || "").trim();
    if (!text) return res.status(400).json({ ok: false, message: "Pergunta não informada." });

    const projectKey = requestProjectKey(req);

    const memoryContext = await buildMemoryContextSafe({ tenantId: req.user.tenantId, projectKey, question: text });

    const conversation = await resolveConversationSafe({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      conversationId: req.body?.conversationId
    });

    const legacyResult = await answerQuestion({ tenantId: req.user.tenantId, userId: req.user.id, projectKey, question: text });
    const result = { ...legacyResult, data: { ...(legacyResult.data || {}), memoryContext } };
    await publishAiEventSafe(req, "ai.message", {
      action: "message",
      entityId: conversation?.conversationId,
      payload: { text, intent: result.intent, channel: "legacy", projectKey }
    });
    await appendMessagesSafe({ conversation, incoming: text, outgoing: result.answer, meta: { outgoing: { intent: result.intent, module: "NEXORA IA", memoryContext } } });
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
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao consultar o NEXORA." });
  }
}

module.exports = {
  getContext,
  getLegacyContext,
  getHistory,
  askAssistant,
  legacyChat
};
