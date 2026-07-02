const { createActionPlan } = require("./actionPlan");

function inferIntent(question = "") {
  const text = String(question || "").trim().toLowerCase();

  if (/(inadimpl|cobran|bolepix|boleto|pix).*(protocol|protocolo|notifica|whatsapp)/.test(text)) {
    return "financial_collection";
  }
  if (/(protocol|protocolo).*(whatsapp|notifica|workflow)/.test(text)) {
    return "protocol_followup";
  }
  if (/workflow|orquestr|orchestr/.test(text)) {
    return "workflow_orchestration";
  }

  return "general_orchestration";
}

function financialCollectionSteps(input = {}) {
  return [
    {
      skill: "finance.createBolePix",
      payload: {
        associateId: input.associateId || "",
        amount: Number(input.amount || 0),
        description: input.description || "Cobrança criada pelo Orchestrator",
        dueDate: input.dueDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        projectKey: input.projectKey || "associacoes"
      },
      requiresConfirmation: true,
      status: "pending"
    },
    {
      skill: "protocol.create",
      payload: {
        title: input.protocolTitle || "Acompanhamento de cobrança",
        description: input.protocolDescription || "Protocolo aberto automaticamente pelo Orchestrator.",
        type: "financeiro",
        priority: "high",
        projectKey: input.projectKey || "associacoes"
      },
      requiresConfirmation: false,
      status: "pending"
    },
    {
      skill: "notification.whatsapp",
      payload: {
        to: input.whatsapp || "",
        message: input.notificationMessage || "Cobrança registrada e protocolo aberto para acompanhamento.",
        projectKey: input.projectKey || "associacoes"
      },
      requiresConfirmation: true,
      status: "pending"
    }
  ];
}

function protocolFollowupSteps(input = {}) {
  return [
    {
      skill: "protocol.create",
      payload: {
        title: input.protocolTitle || "Novo protocolo via Orchestrator",
        description: input.protocolDescription || "Plano multi-skill disparado pelo Assistant.",
        type: input.protocolType || "solicitacao",
        priority: input.priority || "medium",
        projectKey: input.projectKey || "associacoes"
      },
      requiresConfirmation: false,
      status: "pending"
    },
    {
      skill: "notification.whatsapp",
      payload: {
        to: input.whatsapp || "",
        message: input.notificationMessage || "Seu protocolo foi aberto e está em análise.",
        projectKey: input.projectKey || "associacoes"
      },
      requiresConfirmation: true,
      status: "pending"
    },
    {
      skill: "workflow.start",
      payload: {
        workflowKey: input.workflowKey || "protocol-followup",
        projectKey: input.projectKey || "associacoes",
        context: {
          reason: "orchestrator-plan",
          requester: input.userEmail || ""
        }
      },
      requiresConfirmation: false,
      status: "pending"
    }
  ];
}

function generalSteps(input = {}) {
  return [
    {
      skill: "associate.find",
      payload: {
        q: input.question || "",
        limit: 10,
        projectKey: input.projectKey || "associacoes"
      },
      requiresConfirmation: false,
      status: "pending"
    }
  ];
}

function buildPlanFromIntent(intent, input = {}) {
  if (Array.isArray(input.steps) && input.steps.length) return input.steps;
  if (intent === "financial_collection") return financialCollectionSteps(input);
  if (intent === "protocol_followup") return protocolFollowupSteps(input);
  return generalSteps(input);
}

function createPlan(input = {}) {
  const intent = String(input.intent || inferIntent(input.question)).trim();
  const steps = buildPlanFromIntent(intent, input);

  return createActionPlan({
    tenantId: input.tenantId,
    userId: input.userId,
    projectKey: input.projectKey || "associacoes",
    question: input.question,
    intent,
    steps,
    metadata: {
      plannerVersion: "4.2.0",
      source: input.source || "orchestrator.planner"
    }
  });
}

module.exports = {
  inferIntent,
  createPlan
};
