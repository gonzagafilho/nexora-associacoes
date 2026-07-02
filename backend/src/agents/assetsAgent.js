const BaseAgent = require("./baseAgent");
const { buildExecutiveContext } = require("../services/intelligence/executiveService");

class AssetsAgent extends BaseAgent {
  constructor() {
    super({
      id: "assets",
      name: "Assets Agent",
      description: "Analisa patrimônio, manutenção, itens vendidos, baixados e inventário.",
      capabilities: ["patrimonio", "patrimonios", "ativo", "ativos", "manutencao", "inventario", "vendidos", "baixados"],
      module: "assets"
    });
  }

  async execute(input, context = {}) {
    const text = BaseAgent.normalize(input);
    const data = await buildExecutiveContext(context);
    const maintenance = data.listas.patrimoniosManutencao || [];
    if (text.includes("valor") || text.includes("total")) {
      return {
        ok: true,
        answer: `O patrimônio cadastrado soma ${data.patrimonioTotal.count} item(ns), com valor total de ${BaseAgent.money(data.patrimonioTotal.value)}.`,
        data: { patrimonioTotal: data.patrimonioTotal }
      };
    }
    return {
      ok: true,
      answer: maintenance.length ? `Patrimônios em manutenção: ${BaseAgent.names(maintenance)}.` : "Não há patrimônios em manutenção.",
      data: { patrimonioTotal: data.patrimonioTotal, patrimoniosManutencao: maintenance }
    };
  }
}

module.exports = AssetsAgent;
