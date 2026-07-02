const BaseSkill = require("./base.skill");

class ReportSkill extends BaseSkill {
  constructor() {
    super({
      name: "report",
      description: "Skill placeholder para geração e exportação de relatórios.",
      version: "4.1.0",
      permissions: ["module:reports"],
      confirmationRequired: false,
      active: true
    });
  }

  async execute(action, payload = {}) {
    if (!["generatePDF", "exportExcel"].includes(action)) {
      const error = new Error(`Ação report inválida: ${action}`);
      error.statusCode = 404;
      throw error;
    }
    return {
      skill: `report.${action}`,
      placeholder: true,
      message: "ReportSkill em modo placeholder nesta versão.",
      payload
    };
  }
}

module.exports = ReportSkill;
