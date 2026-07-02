const BaseAgent = require("./baseAgent");
const { buildExecutiveContext } = require("../services/intelligence/executiveService");

class ProjectsAgent extends BaseAgent {
  constructor() {
    super({
      id: "projects",
      name: "Projects Agent",
      description: "Analisa projetos, obras, atrasos, orçamento, lucro previsto e gasto real.",
      capabilities: ["projeto", "projetos", "obra", "obras", "atrasado", "atrasados", "orcamento", "custo", "lucro", "gasto"],
      module: "projects"
    });
  }

  async execute(input, context = {}) {
    const text = BaseAgent.normalize(input);
    if (text.includes("crie") || text.includes("criar") || text.includes("edite") || text.includes("editar")) {
      return BaseAgent.planOnly("Posso sugerir um plano de projeto, mas não criarei ou editarei registros nesta fase.");
    }
    const data = await buildExecutiveContext(context);
    const delayed = data.listas.projetosAtrasados || [];
    return {
      ok: true,
      answer: delayed.length
        ? `Projetos atrasados: ${BaseAgent.names(delayed)}.`
        : `Não há projetos atrasados. Existem ${data.projetosAtivos} projeto(s) ativo(s).`,
      data: { projetosAtivos: data.projetosAtivos, projetosAtrasados: delayed }
    };
  }
}

module.exports = ProjectsAgent;
