const Protocol = require("../../../models/Protocol");
const BaseSkill = require("./base.skill");

async function generateNextProtocolNumber(tenantId) {
  const last = await Protocol.findOne({ tenantId }).sort({ protocolNumber: -1 }).select("protocolNumber").lean();
  const sequence = Number.parseInt(String(last?.protocolNumber || "").replace(/\D/g, ""), 10) || 0;
  return `PR-${String(sequence + 1).padStart(6, "0")}`;
}

class ProtocolSkill extends BaseSkill {
  constructor() {
    super({
      name: "protocol",
      description: "Skills de protocolos para abertura e consulta.",
      version: "4.1.0",
      permissions: ["module:protocols"],
      confirmationRequired: false,
      active: true
    });
  }

  validate(action, payload = {}) {
    if (!action) {
      const error = new Error("Ação da skill protocol não informada.");
      error.statusCode = 400;
      throw error;
    }
    if (action === "create" && !String(payload.title || "").trim()) {
      const error = new Error("title é obrigatório para protocol.create.");
      error.statusCode = 400;
      throw error;
    }
    if (action === "details" && !payload.protocolId && !payload.id) {
      const error = new Error("protocolId é obrigatório para protocol.details.");
      error.statusCode = 400;
      throw error;
    }
    return { ok: true };
  }

  async execute(action, payload = {}, context = {}) {
    this.validate(action, payload, context);

    if (action === "create") return this.create(payload, context);
    if (action === "list") return this.list(payload, context);
    if (action === "details") return this.details(payload, context);

    const error = new Error(`Ação protocol inválida: ${action}`);
    error.statusCode = 404;
    throw error;
  }

  async create(payload, context) {
    const protocol = await Protocol.create({
      tenantId: context.tenantId,
      protocolNumber: await generateNextProtocolNumber(context.tenantId),
      title: String(payload.title || "").trim(),
      description: String(payload.description || "").trim(),
      type: payload.type || "solicitacao",
      priority: payload.priority || "medium",
      status: payload.status || "open",
      requesterName: payload.requesterName || context.userEmail || "",
      requesterContact: payload.requesterContact || "",
      assignedToName: payload.assignedToName || "",
      dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
      notes: payload.notes || "",
      createdBy: context.userId || undefined
    });

    return { skill: "protocol.create", protocolId: String(protocol._id), protocolNumber: protocol.protocolNumber, status: protocol.status };
  }

  async list(payload, context) {
    const filter = { tenantId: context.tenantId };
    if (payload.status) filter.status = payload.status;
    if (payload.type) filter.type = payload.type;
    if (payload.priority) filter.priority = payload.priority;
    const limit = Math.min(Math.max(Number(payload.limit || 20), 1), 200);

    const protocols = await Protocol.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return { skill: "protocol.list", count: protocols.length, protocols };
  }

  async details(payload, context) {
    const protocolId = payload.protocolId || payload.id;
    const protocol = await Protocol.findOne({ _id: protocolId, tenantId: context.tenantId }).lean();
    if (!protocol) {
      const error = new Error("Protocolo não encontrado.");
      error.statusCode = 404;
      throw error;
    }
    return { skill: "protocol.details", protocol };
  }
}

module.exports = ProtocolSkill;
