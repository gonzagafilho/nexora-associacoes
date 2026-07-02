const BaseAgent = require("./baseAgent");
const WorkflowExecution = require("../workflow/models/WorkflowExecution");

class WorkflowAgent extends BaseAgent {
  constructor() {
    super({
      id: "workflow",
      name: "Workflow Agent",
      description: "Analisa workflows, execuções, falhas, templates e sugestões de automação.",
      capabilities: ["workflow", "workflows", "automacao", "automacoes", "falha", "falharam", "template"],
      module: "workflow"
    });
  }

  async execute(input, context = {}) {
    const text = BaseAgent.normalize(input);
    if (text.includes("crie") || text.includes("criar")) {
      return BaseAgent.planOnly("Sugestão: criar um workflow com gatilho de cobrança vencida, condição por dias em atraso e ação de notificação ao responsável.");
    }
    const failed = await WorkflowExecution.find({ tenantId: context.tenantId, status: "failed" }).sort({ createdAt: -1 }).limit(10).lean();
    return {
      ok: true,
      answer: failed.length ? `Workflows com falha recente: ${failed.map((item) => item.error || String(item.workflowId)).join(", ")}.` : "Não há falhas recentes de workflow registradas.",
      data: { failedExecutions: failed }
    };
  }
}

module.exports = WorkflowAgent;
