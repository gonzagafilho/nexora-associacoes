const Associate = require("../../models/Associate");
const Asset = require("../../models/Asset");
const AuditLog = require("../../models/AuditLog");
const FinancialTransaction = require("../../models/FinancialTransaction");
const Project = require("../../models/Project");
const Protocol = require("../../models/Protocol");

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

function canExecuteRole(role = "") {
  const allowed = new Set(["owner", "admin", "finance", "operator"]);
  return allowed.has(String(role || "").toLowerCase());
}

async function nextProtocolNumber(tenantId) {
  const last = await Protocol.findOne({ tenantId }).sort({ protocolNumber: -1 }).select("protocolNumber").lean();
  const sequence = Number.parseInt(String(last?.protocolNumber || "").replace(/\D/g, ""), 10) || 0;
  return `PROTO-${String(sequence + 1).padStart(6, "0")}`;
}

async function nextAssetCode(tenantId) {
  const total = await Asset.countDocuments({ tenantId });
  return `ASSET-${String(total + 1).padStart(6, "0")}`;
}

async function registerAudit({ tenantId, userId, command, plan, result, status, responseTime, ip, module }) {
  await AuditLog.create({
    tenantId,
    userId,
    action: "ai.execution",
    entityType: "AiConversation",
    changedFields: ["intent", "plan", "result", "status"],
    metadata: {
      command,
      module,
      plan,
      result,
      status,
      responseTime,
      ip,
      at: new Date().toISOString()
    }
  });
}

async function executeAction({
  tenantId,
  userId,
  userRole,
  ip,
  command,
  intent,
  module,
  payload = {},
  plan,
  confirmed = false,
  responseTime = 0
}) {
  if (!confirmed) {
    return { ok: false, status: "awaiting_confirmation", message: "Confirmação obrigatória para executar esta ação." };
  }
  if (!canExecuteRole(userRole)) {
    return { ok: false, status: "forbidden", message: "Perfil sem permissão para execução pela IA." };
  }

  let result = null;
  let status = "success";

  try {
    if (intent === "create_associate") {
      result = await Associate.create({
        tenantId,
        name: payload.name,
        cpf: payload.cpf,
        phone: payload.phone,
        whatsapp: payload.whatsapp || payload.phone,
        email: payload.email,
        status: "active"
      });
    } else if (intent === "create_asset") {
      result = await Asset.create({
        tenantId,
        assetCode: await nextAssetCode(tenantId),
        name: payload.name,
        category: payload.category || "outro",
        currentValue: normalizeAmount(payload.currentValue),
        acquisitionValue: normalizeAmount(payload.currentValue),
        status: "active"
      });
    } else if (intent === "create_protocol") {
      result = await Protocol.create({
        tenantId,
        protocolNumber: await nextProtocolNumber(tenantId),
        title: payload.title,
        description: payload.description,
        priority: payload.priority || "medium",
        type: "solicitacao",
        status: "open",
        createdBy: userId
      });
    } else if (intent === "create_project") {
      result = await Project.create({
        tenantId,
        name: payload.name,
        type: payload.type || "obra",
        status: "planning",
        budget: normalizeAmount(payload.budget),
        createdBy: userId
      });
    } else if (intent === "create_expense" || intent === "create_income") {
      const type = intent === "create_expense" ? "expense" : "income";
      result = await FinancialTransaction.create({
        tenantId,
        type,
        category: payload.category,
        description: payload.description,
        amount: normalizeAmount(payload.amount),
        dueDate: normalizeDate(payload.dueDate),
        status: "pending",
        paymentMethod: "other",
        referenceType: type === "expense" ? "supplier" : "manual",
        createdBy: userId
      });
    } else {
      status = "unsupported";
      result = { message: "Ação ainda não implementada para execução automática." };
    }
  } catch (error) {
    status = "error";
    result = { message: error.message };
  }

  await registerAudit({
    tenantId,
    userId,
    command,
    module,
    plan,
    result,
    status,
    responseTime,
    ip
  });

  return {
    ok: status === "success",
    status,
    result
  };
}

module.exports = {
  executeAction
};
