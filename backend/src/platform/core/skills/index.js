const { registry } = require("../../../modules/ai/skills/registry");

function list(context = {}) {
  return registry.list().map((skill) => ({
    ...skill,
    active: Boolean(skill.active) && registry.validatePermissions({ permissions: skill.permissions }, context)
  }));
}

function execute(skillAction, payload = {}, context = {}) {
  return registry.execute(skillAction, payload, context);
}

module.exports = {
  list,
  execute
};
