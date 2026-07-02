const Project = require("../../../models/Project");
const BaseSkill = require("./base.skill");

class ProjectSkill extends BaseSkill {
  constructor() {
    super({
      name: "project",
      description: "Skills de projetos para listagem e detalhes.",
      version: "4.1.0",
      permissions: ["module:projects"],
      confirmationRequired: false,
      active: true
    });
  }

  validate(action, payload = {}) {
    if (!action) {
      const error = new Error("Ação da skill project não informada.");
      error.statusCode = 400;
      throw error;
    }
    if (action === "details" && !payload.projectId && !payload.id) {
      const error = new Error("projectId é obrigatório para project.details.");
      error.statusCode = 400;
      throw error;
    }
    return { ok: true };
  }

  async execute(action, payload = {}, context = {}) {
    this.validate(action, payload, context);

    if (action === "list") return this.list(payload, context);
    if (action === "details") return this.details(payload, context);

    const error = new Error(`Ação project inválida: ${action}`);
    error.statusCode = 404;
    throw error;
  }

  async list(payload, context) {
    const filter = { tenantId: context.tenantId };
    if (payload.status) filter.status = payload.status;
    if (payload.type) filter.type = payload.type;
    const limit = Math.min(Math.max(Number(payload.limit || 20), 1), 200);

    const projects = await Project.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return { skill: "project.list", count: projects.length, projects };
  }

  async details(payload, context) {
    const projectId = payload.projectId || payload.id;
    const project = await Project.findOne({ _id: projectId, tenantId: context.tenantId }).lean();
    if (!project) {
      const error = new Error("Projeto não encontrado.");
      error.statusCode = 404;
      throw error;
    }
    return { skill: "project.details", project };
  }
}

module.exports = ProjectSkill;
