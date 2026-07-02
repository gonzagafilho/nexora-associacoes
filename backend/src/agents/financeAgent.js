const BaseAgent = require("./baseAgent");
const { buildExecutiveContext } = require("../services/intelligence/executiveService");

class FinanceAgent extends BaseAgent {
  constructor() {
    super({
      id: "finance",
      name: "Finance Agent",
      description: "Analisa caixa, receitas, despesas, inadimplência, cobranças e fluxo financeiro.",
      capabilities: ["financeiro", "saldo", "caixa", "receita", "receitas", "despesa", "despesas", "inadimplencia", "cobranca", "cobrancas", "fluxo"],
      module: "financial"
    });
  }

  async execute(input, context = {}) {
    const text = BaseAgent.normalize(input);
    const data = await buildExecutiveContext(context);
    const money = BaseAgent.money;
    if (text.includes("entrou") || text.includes("receita") || text.includes("entrada")) {
      return { ok: true, answer: `Entrou ${money(data.receitaMes)} neste mês.`, data: { receitaMes: data.receitaMes } };
    }
    if (text.includes("saiu") || text.includes("despesa") || text.includes("saida")) {
      return { ok: true, answer: `Saiu ${money(data.despesaMes)} neste mês.`, data: { despesaMes: data.despesaMes } };
    }
    if (text.includes("inadimpl") || text.includes("vencid") || text.includes("cobranca")) {
      return {
        ok: true,
        answer: data.listas.cobrancasVencidas.length
          ? `Cobranças vencidas: ${BaseAgent.names(data.listas.cobrancasVencidas, "description")}. Total em aberto: ${money(data.inadimplencia.total)}.`
          : "Não há cobranças vencidas.",
        data: { inadimplencia: data.inadimplencia, cobrancasVencidas: data.listas.cobrancasVencidas }
      };
    }
    return {
      ok: true,
      answer: `Financeiro: entrou ${money(data.receitaMes)}, saiu ${money(data.despesaMes)} e o saldo atual é ${money(data.saldo)}. Inadimplência: ${data.inadimplencia.count} cobrança(s), totalizando ${money(data.inadimplencia.total)}.`,
      data: { receitaMes: data.receitaMes, despesaMes: data.despesaMes, saldo: data.saldo, inadimplencia: data.inadimplencia }
    };
  }
}

module.exports = FinanceAgent;
