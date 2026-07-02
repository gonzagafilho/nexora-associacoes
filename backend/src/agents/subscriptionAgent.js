const BaseAgent = require("./baseAgent");
const TenantSubscription = require("../models/TenantSubscription");

class SubscriptionAgent extends BaseAgent {
  constructor() {
    super({
      id: "subscription",
      name: "Subscription Agent",
      description: "Analisa SaaS, módulos, plano, trial, assinatura e vencimento.",
      capabilities: ["saas", "modulo", "modulos", "plano", "trial", "assinatura", "vencimento", "vence"],
      module: "subscription"
    });
  }

  async execute(_input, context = {}) {
    const subscription = await TenantSubscription.findOne({ tenantId: context.tenantId }).lean();
    if (!subscription) return { ok: true, answer: "Nenhuma assinatura SaaS encontrada para este tenant.", data: {} };
    const next = subscription.nextBillingDate || subscription.trialEndsAt || subscription.currentPeriodEnd;
    return {
      ok: true,
      answer: `Plano ${subscription.plan}, status ${subscription.status}. Próximo vencimento: ${next ? new Intl.DateTimeFormat("pt-BR").format(new Date(next)) : "não informado"}.`,
      data: { subscription }
    };
  }
}

module.exports = SubscriptionAgent;
