const BaseAgent = require("./baseAgent");
const Protocol = require("../models/Protocol");
const { OPEN_PROTOCOL_STATUSES } = require("../services/intelligence/executiveService");

class ProtocolAgent extends BaseAgent {
  constructor() {
    super({
      id: "protocols",
      name: "Protocol Agent",
      description: "Analisa protocolos, SLA, urgentes, vencidos e responsáveis.",
      capabilities: ["protocolo", "protocolos", "sla", "urgente", "urgentes", "vencido", "vencidos", "responsavel"],
      module: "protocols"
    });
  }

  async execute(input, context = {}) {
    const text = BaseAgent.normalize(input);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [open, overdue, urgent] = await Promise.all([
      Protocol.countDocuments({ tenantId: context.tenantId, status: { $in: OPEN_PROTOCOL_STATUSES } }),
      Protocol.find({ tenantId: context.tenantId, status: { $in: OPEN_PROTOCOL_STATUSES }, dueDate: { $lt: today } }).sort({ dueDate: 1 }).limit(10).lean(),
      Protocol.countDocuments({ tenantId: context.tenantId, status: { $in: OPEN_PROTOCOL_STATUSES }, priority: "urgent" })
    ]);
    if (text.includes("vencid") || text.includes("sla")) {
      return { ok: true, answer: overdue.length ? `Protocolos vencidos: ${BaseAgent.names(overdue, "title")}.` : "Não há protocolos vencidos.", data: { protocolosVencidos: overdue } };
    }
    return { ok: true, answer: `Existem ${open} protocolo(s) aberto(s), sendo ${urgent} urgente(s).`, data: { protocolosAbertos: open, urgentes: urgent, protocolosVencidos: overdue } };
  }
}

module.exports = ProtocolAgent;
