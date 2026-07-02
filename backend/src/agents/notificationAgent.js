const BaseAgent = require("./baseAgent");
const { buildExecutiveContext } = require("../services/intelligence/executiveService");

class NotificationAgent extends BaseAgent {
  constructor() {
    super({
      id: "notifications",
      name: "Notification Agent",
      description: "Analisa notificações, alertas, push e criticidade.",
      capabilities: ["notificacao", "notificacoes", "alerta", "alertas", "push", "critico", "criticos"],
      module: "notifications"
    });
  }

  async execute(_input, context = {}) {
    const data = await buildExecutiveContext(context);
    return {
      ok: true,
      answer: `Existem ${data.alertasCriticos} alerta(s) crítico(s) e ${data.notificacoesNaoLidas} notificação(ões) não lida(s).`,
      data: { alertasCriticos: data.alertasCriticos, notificacoesNaoLidas: data.notificacoesNaoLidas }
    };
  }
}

module.exports = NotificationAgent;
