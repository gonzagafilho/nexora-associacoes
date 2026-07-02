const BaseAgent = require("./baseAgent");
const { getEventStats } = require("../os/eventBus");

class SchedulerAgent extends BaseAgent {
  constructor() {
    super({
      id: "scheduler",
      name: "Scheduler Agent",
      description: "Analisa jobs, rotinas, automações agendadas e alertas diários.",
      capabilities: ["job", "jobs", "rotina", "rotinas", "agendada", "agendadas", "scheduler", "alertas diarios"],
      module: "scheduler"
    });
  }

  async execute(_input, _context = {}) {
    const stats = getEventStats();
    return {
      ok: true,
      answer: `Scheduler pronto para inspeção leve. O Event Engine registra ${stats.published} evento(s) publicado(s) e ${stats.subscribers} handler(s) ativo(s).`,
      data: { eventStats: stats }
    };
  }
}

module.exports = SchedulerAgent;
