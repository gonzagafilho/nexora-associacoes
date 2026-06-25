const FIELD_DEFINITIONS = {
  create_associate: {
    module: "Associados",
    fields: [
      { key: "name", label: "nome", question: "Qual o nome completo?" },
      { key: "cpf", label: "cpf", question: "Qual o CPF?" },
      { key: "phone", label: "telefone", question: "Qual o telefone?" },
      { key: "email", label: "email", question: "Qual o e-mail? (opcional)", optional: true }
    ]
  },
  create_asset: {
    module: "Patrimônio",
    fields: [
      { key: "name", label: "nome", question: "Qual o nome do patrimônio?" },
      { key: "category", label: "categoria", question: "Qual a categoria?" },
      { key: "currentValue", label: "valor", question: "Qual o valor atual?" }
    ]
  },
  create_protocol: {
    module: "Protocolos",
    fields: [
      { key: "title", label: "titulo", question: "Qual o título do protocolo?" },
      { key: "description", label: "descricao", question: "Descreva o protocolo." },
      { key: "priority", label: "prioridade", question: "Qual a prioridade? (low, medium, high, urgent)" }
    ]
  },
  create_project: {
    module: "Obras",
    fields: [
      { key: "name", label: "nome", question: "Qual o nome da obra/projeto?" },
      { key: "type", label: "tipo", question: "Qual o tipo? (obra, projeto, evento, campanha, outro)" },
      { key: "budget", label: "orcamento", question: "Qual o orçamento previsto?" }
    ]
  },
  create_expense: {
    module: "Financeiro",
    fields: [
      { key: "category", label: "categoria", question: "Qual a categoria da despesa?" },
      { key: "description", label: "descricao", question: "Qual a descrição?" },
      { key: "amount", label: "valor", question: "Qual o valor?" },
      { key: "dueDate", label: "vencimento", question: "Qual a data de vencimento? (AAAA-MM-DD)" }
    ]
  },
  create_income: {
    module: "Financeiro",
    fields: [
      { key: "category", label: "categoria", question: "Qual a categoria da receita?" },
      { key: "description", label: "descricao", question: "Qual a descrição?" },
      { key: "amount", label: "valor", question: "Qual o valor?" },
      { key: "dueDate", label: "vencimento", question: "Qual a data de vencimento? (AAAA-MM-DD)" }
    ]
  }
};

function numberLike(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPlan(intent, payload = {}) {
  const definition = FIELD_DEFINITIONS[intent];
  if (!definition) {
    return {
      intent,
      module: "NEXORA IA",
      supported: false,
      steps: ["Entender solicitação", "Confirmar com usuário", "Executar com auditoria"],
      missingFields: [],
      nextQuestion: null,
      payload: {}
    };
  }

  const normalizedPayload = { ...payload };
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "amount")) {
    const amount = numberLike(normalizedPayload.amount);
    if (amount !== null) normalizedPayload.amount = amount;
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "currentValue")) {
    const currentValue = numberLike(normalizedPayload.currentValue);
    if (currentValue !== null) normalizedPayload.currentValue = currentValue;
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "budget")) {
    const budget = numberLike(normalizedPayload.budget);
    if (budget !== null) normalizedPayload.budget = budget;
  }

  const missing = definition.fields.filter((field) => !field.optional && !String(normalizedPayload[field.key] || "").trim());
  return {
    intent,
    module: definition.module,
    supported: true,
    steps: ["Pergunta", "Identificação da intenção", "Identificação do módulo", "Plano de execução", "Confirmação", "Execução", "Auditoria"],
    missingFields: missing.map((item) => item.key),
    nextQuestion: missing.length ? missing[0].question : null,
    payload: normalizedPayload
  };
}

function applyAnswerToPayload(intent, payload = {}, answer = "") {
  const plan = buildPlan(intent, payload);
  if (!plan.supported || !plan.missingFields.length) return plan.payload;
  const firstMissing = plan.missingFields[0];
  return { ...plan.payload, [firstMissing]: String(answer || "").trim() };
}

function confirmationText(plan) {
  const entries = Object.entries(plan.payload || {}).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
  const details = entries.length
    ? entries.map(([key, value]) => `- ${key}: ${value}`).join("\n")
    : "- sem campos informados";
  return `Plano pronto para execução no módulo ${plan.module}.\n\nDados:\n${details}\n\nSalvar cadastro?`;
}

module.exports = {
  buildPlan,
  applyAnswerToPayload,
  confirmationText
};
