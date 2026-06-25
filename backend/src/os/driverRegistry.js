const driverTypes = new Map();

function ensureType(type) {
  const normalizedType = String(type || "").toLowerCase().trim();
  if (!normalizedType) {
    throw new Error("driverRegistry requer um type válido.");
  }
  if (!driverTypes.has(normalizedType)) {
    driverTypes.set(normalizedType, {
      drivers: new Map(),
      defaultName: null
    });
  }
  return { normalizedType, bucket: driverTypes.get(normalizedType) };
}

function registerDriver(type, name, driver = {}, options = {}) {
  const normalizedName = String(name || "").toLowerCase().trim();
  if (!normalizedName) {
    throw new Error("driverRegistry.registerDriver requer name válido.");
  }

  const { normalizedType, bucket } = ensureType(type);
  bucket.drivers.set(normalizedName, {
    type: normalizedType,
    name: normalizedName,
    ...driver
  });

  if (options.default || !bucket.defaultName) {
    bucket.defaultName = normalizedName;
  }

  return bucket.drivers.get(normalizedName);
}

function getDriver(type, name) {
  const { bucket } = ensureType(type);
  const normalizedName = String(name || "").toLowerCase().trim();
  return bucket.drivers.get(normalizedName) || null;
}

function getDefaultDriver(type) {
  const { bucket } = ensureType(type);
  if (!bucket.defaultName) return null;
  return bucket.drivers.get(bucket.defaultName) || null;
}

function listDrivers() {
  const result = {};
  for (const [type, bucket] of driverTypes.entries()) {
    result[type] = {
      default: bucket.defaultName,
      drivers: [...bucket.drivers.values()].map((driver) => ({ ...driver }))
    };
  }
  return result;
}

registerDriver("payment", "mercadopago", { provider: "mercadopago", status: "placeholder" }, { default: true });
registerDriver("pix", "mercadopago", { provider: "mercadopago", status: "placeholder" }, { default: true });
registerDriver("ai", "internal-rules", { provider: "nexora", status: "placeholder" }, { default: true });
registerDriver("push", "webpush", { provider: "webpush", status: "placeholder" }, { default: true });

module.exports = {
  registerDriver,
  getDriver,
  listDrivers,
  getDefaultDriver
};
