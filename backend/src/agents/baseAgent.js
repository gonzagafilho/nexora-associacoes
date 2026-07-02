class BaseAgent {
  constructor({ id, name, description, capabilities = [], module = "core", enabled = true, version = "3.6.0" }) {
    if (!id) throw new Error("BaseAgent requer id.");
    this.id = id;
    this.name = name || id;
    this.description = description || "";
    this.capabilities = capabilities;
    this.module = module;
    this.enabled = enabled;
    this.version = version;
  }

  canHandle(input, context = {}) {
    if (!this.enabled || !input) return false;
    const normalized = BaseAgent.normalize(input);
    return this.capabilities.some((capability) => normalized.includes(BaseAgent.normalize(capability)));
  }

  async execute(_input, _context = {}) {
    throw new Error(`${this.id}.execute precisa ser implementado.`);
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      capabilities: [...this.capabilities],
      module: this.module,
      enabled: this.enabled,
      version: this.version,
      status: this.enabled ? "online" : "disabled"
    };
  }

  getMetrics() {
    return {};
  }

  static normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[?!.:,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  static money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  }

  static names(items = [], field = "name") {
    if (!items.length) return "Nenhum registro encontrado.";
    return items.map((item) => item[field] || item.description || item.assetCode || item.title || "Sem identificação").join(", ");
  }

  static planOnly(message, data = {}) {
    return {
      ok: true,
      action: "plan_only",
      answer: message,
      data: {
        destructiveActionsBlocked: true,
        ...data
      }
    };
  }
}

module.exports = BaseAgent;
