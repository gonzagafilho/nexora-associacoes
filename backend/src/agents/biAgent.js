const BaseAgent = require("./baseAgent");
const { buildExecutiveContext } = require("../services/intelligence/executiveService");

class BiAgent extends BaseAgent {
  constructor() {
    super({
      id: "bi",
      name: "BI Agent",
      description: "Consolida visão executiva, saúde da empresa e indicadores entre módulos.",
      capabilities: ["empresa", "resumo", "executivo", "bi", "indicadores", "saude", "visao"],
      module: "bi"
    });
  }

  async execute(_input, context = {}) {
    const data = await buildExecutiveContext(context);
    return {
      ok: true,
      answer: `Resumo executivo: saldo ${BaseAgent.money(data.saldo)}, ${data.protocolosAbertos} protocolo(s) aberto(s), ${data.projetosAtrasados} projeto(s) atrasado(s), ${data.alertasCriticos} alerta(s) crítico(s) e patrimônio de ${BaseAgent.money(data.patrimonioTotal.value)}.`,
      data
    };
  }
}

module.exports = BiAgent;
