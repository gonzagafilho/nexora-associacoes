const FinanceSkill = require("./finance.skill");
const AssociateSkill = require("./associate.skill");
const ProtocolSkill = require("./protocol.skill");
const ProjectSkill = require("./project.skill");
const WorkflowSkill = require("./workflow.skill");
const NotificationSkill = require("./notification.skill");
const ReportSkill = require("./report.skill");

class SkillsRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(skill) {
    if (!skill?.name) throw new Error("Skill inválida para registro.");
    this.skills.set(skill.name, skill);
    return skill;
  }

  list() {
    return Array.from(this.skills.values()).map((skill) => skill.descriptor());
  }

  findByName(name) {
    return this.skills.get(String(name || "").trim()) || null;
  }

  resolve(skillAction) {
    const full = String(skillAction || "").trim();
    if (!full) {
      const error = new Error("Nome da skill não informado.");
      error.statusCode = 400;
      throw error;
    }

    const [name, ...rest] = full.split(".");
    const action = rest.join(".").trim();
    const skill = this.findByName(name);

    if (!skill) {
      const error = new Error(`Skill não encontrada: ${name}`);
      error.statusCode = 404;
      throw error;
    }

    return { full, name, action, skill };
  }

  validatePermissions(skill, context = {}) {
    const required = Array.isArray(skill.permissions) ? skill.permissions : [];
    if (!required.length) return true;

    const userRole = String(context.userRole || "").toLowerCase();
    if (["owner", "admin"].includes(userRole)) return true;

    const enabledModules = Array.isArray(context.enabledModules)
      ? context.enabledModules.map((item) => String(item || "").trim().toLowerCase())
      : null;

    return required.every((permission) => {
      const value = String(permission || "").trim().toLowerCase();
      if (!value) return true;
      if (value.startsWith("module:")) {
        const moduleCode = value.split(":")[1];
        if (!moduleCode) return true;
        if (!enabledModules) return true;
        return enabledModules.includes(moduleCode);
      }
      if (value.startsWith("role:")) {
        const expectedRole = value.split(":")[1];
        return userRole === expectedRole;
      }
      const permissions = Array.isArray(context.permissions)
        ? context.permissions.map((item) => String(item || "").trim().toLowerCase())
        : [];
      return permissions.includes(value);
    });
  }

  async execute(skillAction, payload = {}, context = {}) {
    const resolved = this.resolve(skillAction);

    if (!resolved.skill.active) {
      const error = new Error(`Skill inativa: ${resolved.name}`);
      error.statusCode = 403;
      throw error;
    }

    if (!this.validatePermissions(resolved.skill, context)) {
      const error = new Error(`Permissão insuficiente para executar ${resolved.full}.`);
      error.statusCode = 403;
      throw error;
    }

    resolved.skill.validate(resolved.action, payload, context);
    const startedAt = Date.now();
    const data = await resolved.skill.execute(resolved.action, payload, context);

    return {
      ok: true,
      skill: resolved.full,
      confirmationRequired: Boolean(resolved.skill.confirmationRequired),
      durationMs: Date.now() - startedAt,
      data
    };
  }
}

const registry = new SkillsRegistry();

registry.register(new FinanceSkill());
registry.register(new AssociateSkill());
registry.register(new ProtocolSkill());
registry.register(new ProjectSkill());
registry.register(new WorkflowSkill());
registry.register(new NotificationSkill());
registry.register(new ReportSkill());

module.exports = {
  SkillsRegistry,
  registry
};
