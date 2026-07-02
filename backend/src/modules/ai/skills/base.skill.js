class BaseSkill {
  constructor({ name, description, version = "1.0.0", permissions = [], confirmationRequired = false, active = true }) {
    this.name = String(name || "").trim();
    this.description = String(description || "").trim();
    this.version = String(version || "1.0.0").trim();
    this.permissions = Array.isArray(permissions) ? permissions : [];
    this.confirmationRequired = Boolean(confirmationRequired);
    this.active = Boolean(active);
  }

  validate(_action, _payload = {}, _context = {}) {
    return { ok: true };
  }

  async execute(_action, _payload = {}, _context = {}) {
    throw new Error(`Skill ${this.name} não implementa execute().`);
  }

  descriptor() {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      permissions: this.permissions,
      confirmationRequired: this.confirmationRequired,
      active: this.active
    };
  }
}

module.exports = BaseSkill;
