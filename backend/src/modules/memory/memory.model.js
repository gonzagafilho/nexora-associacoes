const mongoose = require("mongoose");

const MEMORY_SCOPES = ["global", "organization", "financial", "projects", "assets", "protocols", "workflow", "bi", "notifications", "subscription", "custom"];
const MEMORY_SOURCES = ["manual", "copilot", "agent", "system", "import"];
const MEMORY_VISIBILITIES = ["private", "team", "tenant"];

const tenantMemorySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    scope: { type: String, enum: MEMORY_SCOPES, default: "organization", index: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    tags: { type: [String], default: [], index: true },
    importance: { type: Number, default: 1, min: 1, max: 5, index: true },
    source: { type: String, enum: MEMORY_SOURCES, default: "manual", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    visibility: { type: String, enum: MEMORY_VISIBILITIES, default: "tenant", index: true },
    expiresAt: { type: Date, default: null, index: true },
    metadata: { type: Object, default: {} }
  },
  { timestamps: true }
);

tenantMemorySchema.index({ tenantId: 1, createdAt: -1 });
tenantMemorySchema.index({ tenantId: 1, scope: 1, importance: -1 });
tenantMemorySchema.index({ tenantId: 1, tags: 1 });

module.exports = mongoose.model("TenantMemory", tenantMemorySchema);
module.exports.MEMORY_SCOPES = MEMORY_SCOPES;
module.exports.MEMORY_SOURCES = MEMORY_SOURCES;
module.exports.MEMORY_VISIBILITIES = MEMORY_VISIBILITIES;
