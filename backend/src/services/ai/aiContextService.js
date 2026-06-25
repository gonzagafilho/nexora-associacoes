const FinancialTransaction = require("../../models/FinancialTransaction");
const { buildExecutiveContext, startOfMonth, endOfMonth, toTenantObjectId } = require("../intelligence/executiveService");

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function greetingByHour(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

async function monthlyIncome(tenantId, now = new Date()) {
  const currentStart = startOfMonth(now);
  const currentEnd = endOfMonth(now);
  const previousStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const previousEnd = endOfMonth(previousStart);

  const rows = await FinancialTransaction.aggregate([
    {
      $match: {
        tenantId: toTenantObjectId(tenantId),
        type: "income",
        status: "paid",
        paidAt: { $gte: previousStart, $lte: currentEnd }
      }
    },
    {
      $project: {
        amount: 1,
        bucket: {
          $cond: [{ $gte: ["$paidAt", currentStart] }, "current", "previous"]
        }
      }
    },
    { $group: { _id: "$bucket", total: { $sum: "$amount" } } }
  ]);

  const current = Number(rows.find((item) => item._id === "current")?.total || 0);
  const previous = Number(rows.find((item) => item._id === "previous")?.total || 0);
  const deltaPct = previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : null;
  return { current, previous, deltaPct };
}

function recommendationList(context = {}) {
  const items = [];
  if (Number(context.inadimplencia?.count || 0) > 0) {
    items.push("Existem cobranças vencidas. Deseja enviar cobrança por WhatsApp?");
  }
  if ((context.listas?.patrimoniosManutencao || []).length > 0) {
    items.push("Existem equipamentos há mais de 90 dias em manutenção. Deseja abrir protocolos?");
  }
  if (Number(context.projetosAtrasados || 0) > 0) {
    items.push("Existem obras próximas do vencimento. Deseja visualizar?");
  }
  return items;
}

async function buildSmartContext({ tenantId, userId, userName, now = new Date() }) {
  const context = await buildExecutiveContext({ tenantId, userId, now });
  const income = await monthlyIncome(tenantId, now);
  const explain = income.deltaPct === null
    ? "Ainda não há base suficiente para comparação de receita com o mês anterior."
    : `Sua receita ${income.deltaPct >= 0 ? "aumentou" : "reduziu"} ${Math.abs(income.deltaPct)}% em relação ao mês anterior.`;

  const intro = `${greetingByHour(now)}, ${userName || "usuário"}.`;
  const overview = [
    `Hoje existem ${context.inadimplencia.count} cobrança(s) vencida(s).`,
    `${context.protocolosAbertos} protocolo(s) em aberto.`,
    `${context.projetosAtrasados} projeto(s) atrasado(s).`,
    `Caixa disponível: ${money(context.saldo)}.`,
    `Receita do mês: ${money(context.receitaMes)}.`,
    `Despesas do mês: ${money(context.despesaMes)}.`
  ];

  return {
    intro,
    overview,
    explain,
    suggestions: recommendationList(context),
    context
  };
}

module.exports = {
  buildSmartContext
};
