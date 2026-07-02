const Associate = require("../../../models/Associate");
const BaseSkill = require("./base.skill");

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

class AssociateSkill extends BaseSkill {
  constructor() {
    super({
      name: "associate",
      description: "Skills de associados para busca e listagem.",
      version: "4.1.0",
      permissions: ["module:associates"],
      confirmationRequired: false,
      active: true
    });
  }

  validate(action, payload = {}) {
    if (!action) {
      const error = new Error("Ação da skill associate não informada.");
      error.statusCode = 400;
      throw error;
    }
    if (action === "details" && !payload.associateId && !payload.id) {
      const error = new Error("associateId é obrigatório para associate.details.");
      error.statusCode = 400;
      throw error;
    }
    return { ok: true };
  }

  async execute(action, payload = {}, context = {}) {
    this.validate(action, payload, context);

    if (action === "find") return this.find(payload, context);
    if (action === "list") return this.list(payload, context);
    if (action === "details") return this.details(payload, context);

    const error = new Error(`Ação associate inválida: ${action}`);
    error.statusCode = 404;
    throw error;
  }

  async find(payload, context) {
    const q = String(payload.q || payload.query || "").trim();
    const limit = Math.min(Math.max(Number(payload.limit || 20), 1), 100);
    const filter = { tenantId: context.tenantId };
    if (q) {
      const regex = new RegExp(escapeRegExp(q), "i");
      filter.$or = [{ name: regex }, { cpf: regex }, { phone: regex }, { email: regex }];
    }

    const associates = await Associate.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return { skill: "associate.find", count: associates.length, associates };
  }

  async list(payload, context) {
    const limit = Math.min(Math.max(Number(payload.limit || 30), 1), 200);
    const filter = { tenantId: context.tenantId };
    if (payload.status) filter.status = payload.status;
    const associates = await Associate.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return { skill: "associate.list", count: associates.length, associates };
  }

  async details(payload, context) {
    const associateId = payload.associateId || payload.id;
    const associate = await Associate.findOne({ _id: associateId, tenantId: context.tenantId }).lean();
    if (!associate) {
      const error = new Error("Associado não encontrado.");
      error.statusCode = 404;
      throw error;
    }
    return { skill: "associate.details", associate };
  }
}

module.exports = AssociateSkill;
