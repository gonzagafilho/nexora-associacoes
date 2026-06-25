const { buildExecutiveContext } = require("./executiveService");
const { getOsEventsDashboard } = require("../system/osEventLogService");

const HELP_QUESTIONS = [
  "Quanto entrou este mês?",
  "Quanto saiu este mês?",
  "Qual meu saldo?",
  "Quantos protocolos estão abertos?",
  "Quais projetos estão atrasados?",
  "Quais patrimônios estão em manutenção?",
  "Quantos associados existem?",
  "Quais cobranças estão vencidas?",
  "Como está meu financeiro?",
  "Existem alertas críticos?",
  "Quais eventos aconteceram hoje?",
  "O que é o NEXORA Runtime?",
  "O que é o Event Engine?",
  "O que é o NEXORA OS?",
  "O que é o Kernel do NEXORA OS?"
];

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[?!.:,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function identifyIntent(question) {
  const text = normalize(question);
  if (!text) return "help";
  if (text.includes("nexora runtime") || (text.includes("runtime") && text.includes("nexora"))) return "nexora_runtime";
  if (text.includes("event engine")) return "event_engine";
  if (text.includes("eventos") && text.includes("hoje")) return "events_today";
  if (text.includes("kernel") && text.includes("nexora os")) return "nexora_kernel";
  if (text.includes("nexora os")) return "nexora_os";
  if (text.includes("bi executivo") || text.includes("indicadores") || text.includes("resumo executivo")) return "executive_bi";
  if (text.includes("financeiro") || text.includes("como esta meu financeiro")) return "financial_overview";
  if (text.includes("fluxo") || text.includes("caixa")) return "cash_flow";
  if (text.includes("alerta") && (text.includes("critico") || text.includes("criticos"))) return "critical_alerts";
  if (text.includes("entrou") || text.includes("receita") || text.includes("entrada")) return "monthly_income";
  if (text.includes("saiu") || text.includes("despesa") || text.includes("saida")) return "monthly_expense";
  if (text.includes("saldo")) return "balance";
  if (text.includes("protocolo") && (text.includes("aberto") || text.includes("abertos") || text.includes("existem") || text.includes("existe"))) return "open_protocols";
  if (text.includes("projeto") && (text.includes("atrasado") || text.includes("atrasados"))) return "delayed_projects";
  if ((text.includes("patrimonio") || text.includes("patrimonios")) && text.includes("manutencao")) return "assets_maintenance";
  if (text.includes("associado") || text.includes("associados")) return "associates";
  if ((text.includes("cobranca") || text.includes("cobrancas") || text.includes("mensalidade")) && (text.includes("vencida") || text.includes("vencidas") || text.includes("vencido"))) return "overdue_invoices";
  return "unknown";
}

function listNames(items, field = "name") {
  if (!items.length) return "Nenhum registro encontrado.";
  return items.map((item) => item[field] || item.description || item.assetCode || "Sem identificação").join(", ");
}

async function answerQuestion({ tenantId, userId, question }) {
  const intent = identifyIntent(question);

  if (intent === "event_engine") {
    return {
      ok: true,
      intent,
      answer: "O Event Engine do NEXORA OS é o barramento interno que registra e distribui eventos entre os módulos da plataforma, permitindo automações, auditoria, notificações e integrações sem acoplamento direto entre os módulos.",
      data: {},
      help: HELP_QUESTIONS
    };
  }

  if (intent === "nexora_runtime") {
    return {
      ok: true,
      intent,
      answer: "O NEXORA Runtime é a camada de execução do NEXORA OS. Ele organiza contexto, cache, sessões, serviços, drivers, métricas e integração entre Kernel, Event Engine, Workflow Studio e NEXORA IA.",
      data: {},
      help: HELP_QUESTIONS
    };
  }

  const context = await buildExecutiveContext({ tenantId, userId });
  let answer;
  let data = {};

  if (intent === "executive_bi") {
    data = {
      receitaMes: context.receitaMes,
      despesaMes: context.despesaMes,
      saldo: context.saldo,
      inadimplencia: context.inadimplencia,
      protocolosAbertos: context.protocolosAbertos,
      projetosAtrasados: context.projetosAtrasados,
      alertasCriticos: context.alertasCriticos
    };
    answer = `Resumo executivo: receita do mês ${money(context.receitaMes)}, despesa do mês ${money(context.despesaMes)}, saldo ${money(context.saldo)}, ${context.protocolosAbertos} protocolo(s) aberto(s), ${context.projetosAtrasados} projeto(s) atrasado(s) e ${context.alertasCriticos} alerta(s) crítico(s).`;
  } else if (intent === "events_today") {
    const dashboard = await getOsEventsDashboard({ tenantId });
    const topModules = (dashboard.byModule || [])
      .slice(0, 3)
      .map((item) => `${item.module} (${item.total})`)
      .join(", ");
    data = {
      todayEvents: dashboard.todayEvents,
      totalEvents: dashboard.totalEvents,
      byModule: dashboard.byModule
    };
    answer = `Hoje foram registrados ${dashboard.todayEvents} evento(s), com ${dashboard.totalEvents} no total. Principais módulos: ${topModules || "sem eventos relevantes"}.`;
  } else if (intent === "financial_overview") {
    data = { receitaMes: context.receitaMes, despesaMes: context.despesaMes, saldo: context.saldo, inadimplencia: context.inadimplencia };
    answer = `Financeiro do mês: entrou ${money(context.receitaMes)}, saiu ${money(context.despesaMes)} e o saldo atual é ${money(context.saldo)}. Inadimplência: ${context.inadimplencia.count} cobrança(s), totalizando ${money(context.inadimplencia.total)}.`;
  } else if (intent === "cash_flow") {
    data = { receitaMes: context.receitaMes, despesaMes: context.despesaMes, saldo: context.saldo };
    answer = `Fluxo de caixa: entradas do mês ${money(context.receitaMes)}, saídas do mês ${money(context.despesaMes)} e saldo atual ${money(context.saldo)}.`;
  } else if (intent === "critical_alerts") {
    data = { alertasCriticos: context.alertasCriticos, notificacoesNaoLidas: context.notificacoesNaoLidas };
    answer = `Existem ${context.alertasCriticos} alerta(s) crítico(s) e ${context.notificacoesNaoLidas} notificação(ões) não lida(s).`;
  } else if (intent === "monthly_income") {
    data = { receitaMes: context.receitaMes };
    answer = `Entrou ${money(context.receitaMes)} neste mês.`;
  } else if (intent === "monthly_expense") {
    data = { despesaMes: context.despesaMes };
    answer = `Saiu ${money(context.despesaMes)} neste mês.`;
  } else if (intent === "balance") {
    data = { saldo: context.saldo };
    answer = `Seu saldo atual é ${money(context.saldo)}.`;
  } else if (intent === "open_protocols") {
    data = { protocolosAbertos: context.protocolosAbertos };
    answer = `Existem ${context.protocolosAbertos} protocolo(s) aberto(s).`;
  } else if (intent === "delayed_projects") {
    data = { projetosAtrasados: context.listas.projetosAtrasados };
    answer = context.listas.projetosAtrasados.length
      ? `Projetos atrasados: ${listNames(context.listas.projetosAtrasados)}.`
      : "Não há projetos atrasados.";
  } else if (intent === "assets_maintenance") {
    data = { patrimoniosManutencao: context.listas.patrimoniosManutencao };
    answer = context.listas.patrimoniosManutencao.length
      ? `Patrimônios em manutenção: ${listNames(context.listas.patrimoniosManutencao)}.`
      : "Não há patrimônios em manutenção.";
  } else if (intent === "associates") {
    data = { associados: context.associados };
    answer = `Existem ${context.associados} associado(s) cadastrados.`;
  } else if (intent === "overdue_invoices") {
    data = { cobrancasVencidas: context.listas.cobrancasVencidas };
    answer = context.listas.cobrancasVencidas.length
      ? `Cobranças vencidas: ${listNames(context.listas.cobrancasVencidas, "description")}.`
      : "Não há cobranças vencidas.";
  } else if (intent === "nexora_kernel") {
    answer = "O Kernel do NEXORA OS é o núcleo técnico da plataforma. Ele conecta eventos, permissões, auditoria, notificações, automações, workflows, drivers e a NEXORA IA, permitindo que os módulos trabalhem juntos com segurança.";
  } else if (intent === "nexora_os") {
    answer = "O NEXORA OS é o núcleo operacional da plataforma NEXORA Gestão. Ele conecta os módulos ativos da sua organização, como financeiro, projetos, patrimônio, protocolos, notificações e NEXORA IA, sempre respeitando permissões e isolamento por tenant.";
  } else {
    answer = "Ainda não sei responder essa pergunta. Posso ajudar com: " + HELP_QUESTIONS.join(" ");
  }

  return {
    ok: true,
    intent,
    answer,
    data,
    help: HELP_QUESTIONS
  };
}

module.exports = {
  HELP_QUESTIONS,
  answerQuestion,
  identifyIntent,
  normalize
};
