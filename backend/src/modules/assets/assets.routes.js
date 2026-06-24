const express = require("express");
const mongoose = require("mongoose");

const auth = require("../../middlewares/auth");
const requireModule = require("../../middlewares/requireModule");
const Asset = require("../../models/Asset");
const AssetHistory = require("../../models/AssetHistory");
const Project = require("../../models/Project");
const { ASSET_CATEGORIES, ASSET_STATUSES } = require("../../models/Asset");

const router = express.Router();
const assetsAccess = [auth, requireModule("assets")];
const CATEGORY_SET = new Set(ASSET_CATEGORIES);
const STATUS_SET = new Set(ASSET_STATUSES);

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function normalizeObjectId(value) {
  const id = String(value || "").trim();
  return /^[a-f\d]{24}$/i.test(id) ? id : "";
}

function validateDate(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${label} inválida.`);
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function buildAssetPayload(body = {}, existing = {}) {
  const name = String(body.name ?? existing.name ?? "").trim();
  if (!name) {
    const error = new Error("Nome do ativo é obrigatório.");
    error.statusCode = 400;
    throw error;
  }

  const category = String(body.category ?? existing.category ?? "outro").trim() || "outro";
  if (!CATEGORY_SET.has(category)) {
    const error = new Error("Categoria inválida.");
    error.statusCode = 400;
    throw error;
  }

  const status = String(body.status ?? existing.status ?? "active").trim() || "active";
  if (!STATUS_SET.has(status)) {
    const error = new Error("Status inválido.");
    error.statusCode = 400;
    throw error;
  }

  const acquisitionValue = roundMoney(body.acquisitionValue ?? existing.acquisitionValue ?? 0);
  const currentValue = roundMoney(body.currentValue ?? existing.currentValue ?? acquisitionValue);
  if (acquisitionValue < 0 || currentValue < 0) {
    const error = new Error("Valores do ativo não podem ser negativos.");
    error.statusCode = 400;
    throw error;
  }

  const projectId = body.projectId !== undefined
    ? (body.projectId ? normalizeObjectId(body.projectId) : undefined)
    : existing.projectId;
  if (body.projectId && !projectId) {
    const error = new Error("Projeto inválido.");
    error.statusCode = 400;
    throw error;
  }

  return {
    projectId,
    name,
    category,
    description: String(body.description ?? existing.description ?? "").trim(),
    serialNumber: String(body.serialNumber ?? existing.serialNumber ?? "").trim(),
    acquisitionDate: validateDate(body.acquisitionDate ?? existing.acquisitionDate, "Data de aquisição"),
    acquisitionValue,
    currentValue,
    supplier: String(body.supplier ?? existing.supplier ?? "").trim(),
    responsibleName: String(body.responsibleName ?? existing.responsibleName ?? "").trim(),
    location: String(body.location ?? existing.location ?? "").trim(),
    status,
    notes: String(body.notes ?? existing.notes ?? "").trim()
  };
}

async function validateProjectForTenant(tenantId, projectId) {
  if (!projectId) return null;
  const project = await Project.findOne({ _id: projectId, tenantId }).select("name status").lean();
  if (!project) {
    const error = new Error("Projeto não encontrado.");
    error.statusCode = 404;
    throw error;
  }
  return project;
}

async function generateNextAssetCode(tenantId) {
  const last = await Asset.findOne({ tenantId }).sort({ assetCode: -1 }).select("assetCode").lean();
  const sequence = Number.parseInt(String(last?.assetCode || "").replace(/\D/g, ""), 10) || 0;
  return `AST-${String(sequence + 1).padStart(6, "0")}`;
}

function buildQrCode(asset) {
  return JSON.stringify({
    code: asset.assetCode,
    tenantId: String(asset.tenantId),
    assetId: String(asset._id)
  });
}

async function logHistory({ assetId, tenantId, action, req, notes = "" }) {
  return AssetHistory.create({
    assetId,
    tenantId,
    action,
    user: {
      id: req.user?.id || undefined,
      email: req.user?.email || "",
      role: req.user?.role || ""
    },
    date: new Date(),
    notes: String(notes || "").trim()
  });
}

function serializeAsset(asset) {
  const project = asset.projectId && typeof asset.projectId === "object"
    ? asset.projectId
    : null;

  return {
    id: String(asset._id),
    tenantId: String(asset.tenantId),
    projectId: project?._id ? String(project._id) : (asset.projectId ? String(asset.projectId) : null),
    projectName: project?.name || "",
    assetCode: asset.assetCode || "",
    name: asset.name || "",
    category: asset.category || "outro",
    description: asset.description || "",
    serialNumber: asset.serialNumber || "",
    acquisitionDate: asset.acquisitionDate || null,
    acquisitionValue: roundMoney(asset.acquisitionValue || 0),
    currentValue: roundMoney(asset.currentValue || 0),
    supplier: asset.supplier || "",
    responsibleName: asset.responsibleName || "",
    location: asset.location || "",
    status: asset.status || "active",
    notes: asset.notes || "",
    qrCode: asset.qrCode || "",
    createdAt: asset.createdAt || null,
    updatedAt: asset.updatedAt || null
  };
}

function serializeHistory(entry) {
  return {
    id: String(entry._id),
    assetId: String(entry.assetId),
    tenantId: String(entry.tenantId),
    action: entry.action,
    user: entry.user || { email: "", role: "" },
    date: entry.date || entry.createdAt || null,
    notes: entry.notes || ""
  };
}

function buildListQuery(req) {
  const query = { tenantId: req.user.tenantId };
  if (req.query.status) query.status = String(req.query.status).trim();
  if (req.query.category) query.category = String(req.query.category).trim();
  const projectId = normalizeObjectId(req.query.projectId);
  if (projectId) query.projectId = projectId;
  const q = String(req.query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegExp(q), "i");
    query.$or = [
      { assetCode: regex },
      { name: regex },
      { serialNumber: regex },
      { supplier: regex },
      { responsibleName: regex },
      { location: regex }
    ];
  }
  return query;
}

async function findAssetOr404(req, res) {
  const found = await Asset.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  const asset = typeof found?.populate === "function"
    ? await found.populate("projectId", "name status")
    : found;
  if (!asset) {
    res.status(404).json({ ok: false, message: "Ativo não encontrado." });
    return null;
  }
  return asset;
}

router.get("/dashboard", assetsAccess, async (req, res) => {
  const assets = await Asset.find({ tenantId: req.user.tenantId }).lean();
  const summary = assets.reduce((acc, asset) => {
    acc.totalAssets += 1;
    if (asset.status === "active") acc.activeAssets += 1;
    if (asset.status === "maintenance") acc.maintenanceAssets += 1;
    if (asset.status === "retired") acc.retiredAssets += 1;
    acc.totalAcquisitionValue += Number(asset.acquisitionValue || 0);
    acc.totalCurrentValue += Number(asset.currentValue || 0);
    return acc;
  }, {
    totalAssets: 0,
    activeAssets: 0,
    maintenanceAssets: 0,
    retiredAssets: 0,
    totalAcquisitionValue: 0,
    totalCurrentValue: 0
  });

  summary.totalAcquisitionValue = roundMoney(summary.totalAcquisitionValue);
  summary.totalCurrentValue = roundMoney(summary.totalCurrentValue);
  return res.json({ ok: true, ...summary });
});

router.get("/report", assetsAccess, async (req, res) => {
  const assets = await Asset.find({ tenantId: req.user.tenantId }).populate("projectId", "name").sort({ createdAt: -1 }).lean();
  const report = assets.reduce((acc, asset) => {
    acc.totalAssets += 1;
    acc.totalAcquisitionValue += Number(asset.acquisitionValue || 0);
    acc.totalCurrentValue += Number(asset.currentValue || 0);
    if (asset.status === "active") acc.activeAssets += 1;
    if (asset.status === "maintenance") acc.maintenanceAssets += 1;
    if (["retired", "sold"].includes(asset.status)) acc.retiredAssets += 1;
    return acc;
  }, {
    totalAssets: 0,
    totalAcquisitionValue: 0,
    totalCurrentValue: 0,
    activeAssets: 0,
    maintenanceAssets: 0,
    retiredAssets: 0
  });

  report.totalAcquisitionValue = roundMoney(report.totalAcquisitionValue);
  report.totalCurrentValue = roundMoney(report.totalCurrentValue);

  return res.json({
    ok: true,
    summary: report,
    assets: assets.map(serializeAsset)
  });
});

router.get("/", assetsAccess, async (req, res) => {
  const assets = await Asset.find(buildListQuery(req)).populate("projectId", "name status").sort({ createdAt: -1 }).limit(300).lean();
  return res.json({ ok: true, assets: assets.map(serializeAsset) });
});

router.get("/:id", assetsAccess, async (req, res) => {
  const asset = await findAssetOr404(req, res);
  if (!asset) return;
  const history = await AssetHistory.find({ tenantId: req.user.tenantId, assetId: asset._id }).sort({ date: -1, createdAt: -1 }).lean();
  return res.json({ ok: true, asset: serializeAsset(asset), history: history.map(serializeHistory) });
});

router.post("/", assetsAccess, async (req, res) => {
  try {
    const payload = buildAssetPayload(req.body || {});
    const project = await validateProjectForTenant(req.user.tenantId, payload.projectId);
    const assetCode = await generateNextAssetCode(req.user.tenantId);
    const asset = await Asset.create({
      tenantId: req.user.tenantId,
      assetCode,
      ...payload,
      qrCode: ""
    });
    asset.qrCode = buildQrCode(asset);
    await asset.save();
    await logHistory({ assetId: asset._id, tenantId: req.user.tenantId, action: "criacao", req, notes: payload.notes });
    const populated = await Asset.findById(asset._id).populate("projectId", "name status");
    const responseAsset = project
      ? { ...populated, projectId: { _id: payload.projectId, name: project.name, status: project.status } }
      : populated;
    return res.status(201).json({ ok: true, asset: serializeAsset(responseAsset) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, message: "Código patrimonial já existe para este tenant." });
    }
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao criar ativo." });
  }
});

router.put("/:id", assetsAccess, async (req, res) => {
  try {
    const asset = await findAssetOr404(req, res);
    if (!asset) return;
    const payload = buildAssetPayload(req.body || {}, asset);
    const project = await validateProjectForTenant(req.user.tenantId, payload.projectId);
    Object.assign(asset, payload);
    if (project) asset.projectId = { _id: payload.projectId, name: project.name, status: project.status };
    await asset.save();
    await logHistory({ assetId: asset._id, tenantId: req.user.tenantId, action: "edicao", req, notes: req.body?.historyNotes || payload.notes });
    return res.json({ ok: true, asset: serializeAsset(asset) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao atualizar ativo." });
  }
});

router.post("/:id/maintenance", assetsAccess, async (req, res) => {
  try {
    const asset = await findAssetOr404(req, res);
    if (!asset) return;
    asset.status = "maintenance";
    if (req.body?.currentValue !== undefined) asset.currentValue = roundMoney(req.body.currentValue);
    if (req.body?.responsibleName !== undefined) asset.responsibleName = String(req.body.responsibleName || "").trim();
    if (req.body?.location !== undefined) asset.location = String(req.body.location || "").trim();
    if (req.body?.notes !== undefined) asset.notes = String(req.body.notes || "").trim();
    await asset.save();
    await logHistory({ assetId: asset._id, tenantId: req.user.tenantId, action: "manutencao", req, notes: req.body?.historyNotes || req.body?.notes || "" });
    return res.json({ ok: true, asset: serializeAsset(asset) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao registrar manutenção." });
  }
});

router.post("/:id/retire", assetsAccess, async (req, res) => {
  try {
    const asset = await findAssetOr404(req, res);
    if (!asset) return;
    asset.status = "retired";
    if (req.body?.currentValue !== undefined) asset.currentValue = roundMoney(req.body.currentValue);
    if (req.body?.notes !== undefined) asset.notes = String(req.body.notes || "").trim();
    await asset.save();
    await logHistory({ assetId: asset._id, tenantId: req.user.tenantId, action: "baixa", req, notes: req.body?.historyNotes || req.body?.notes || "" });
    return res.json({ ok: true, asset: serializeAsset(asset) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao dar baixa no ativo." });
  }
});

router.post("/:id/sell", assetsAccess, async (req, res) => {
  try {
    const asset = await findAssetOr404(req, res);
    if (!asset) return;
    asset.status = "sold";
    if (req.body?.currentValue !== undefined) asset.currentValue = roundMoney(req.body.currentValue);
    if (req.body?.notes !== undefined) asset.notes = String(req.body.notes || "").trim();
    await asset.save();
    await logHistory({ assetId: asset._id, tenantId: req.user.tenantId, action: "venda", req, notes: req.body?.historyNotes || req.body?.notes || "" });
    return res.json({ ok: true, asset: serializeAsset(asset) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message || "Erro ao vender ativo." });
  }
});

router.delete("/:id", assetsAccess, async (req, res) => {
  const asset = await findAssetOr404(req, res);
  if (!asset) return;
  await logHistory({ assetId: asset._id, tenantId: req.user.tenantId, action: "exclusao", req, notes: req.body?.historyNotes || req.body?.notes || asset.notes || "" });
  await Asset.deleteOne({ _id: asset._id, tenantId: req.user.tenantId });
  return res.json({ ok: true, asset: serializeAsset(asset) });
});

module.exports = router;
