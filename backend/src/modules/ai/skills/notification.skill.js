const BaseSkill = require("./base.skill");

class NotificationSkill extends BaseSkill {
  constructor() {
    super({
      name: "notification",
      description: "Skill placeholder para envio de notificações omnichannel.",
      version: "4.1.0",
      permissions: ["module:notifications"],
      confirmationRequired: true,
      active: true
    });
  }

  async execute(action, payload = {}) {
    if (!["email", "push", "whatsapp"].includes(action)) {
      const error = new Error(`Ação notification inválida: ${action}`);
      error.statusCode = 404;
      throw error;
    }
    return {
      skill: `notification.${action}`,
      placeholder: true,
      message: "NotificationSkill em modo placeholder nesta versão.",
      payload
    };
  }
}

module.exports = NotificationSkill;
