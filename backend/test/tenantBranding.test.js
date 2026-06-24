const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const jwt = require("jsonwebtoken");

const Tenant = require("../src/models/Tenant");
const TenantBranding = require("../src/models/TenantBranding");
const AuditLog = require("../src/models/AuditLog");
const logoUploadService = require("../src/services/branding/logoUploadService");

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439012";
const userId = "507f191e810c19729de860ea";

const originals = {
  tenantFindById: Tenant.findById,
  brandingFindOne: TenantBranding.findOne,
  brandingFindOneAndUpdate: TenantBranding.findOneAndUpdate,
  auditCreate: AuditLog.create,
  parseMultipart: logoUploadService.parseMultipart,
  saveUploadedLogo: logoUploadService.saveUploadedLogo
};

afterEach(() => {
  Tenant.findById = originals.tenantFindById;
  TenantBranding.findOne = originals.brandingFindOne;
  TenantBranding.findOneAndUpdate = originals.brandingFindOneAndUpdate;
  AuditLog.create = originals.auditCreate;
  logoUploadService.parseMultipart = originals.parseMultipart;
  logoUploadService.saveUploadedLogo = originals.saveUploadedLogo;
  delete require.cache[require.resolve("../src/modules/tenant/tenant.routes")];
  delete require.cache[require.resolve("../src/app")];
});

function authToken(currentTenantId = tenantId, role = "owner") {
  return jwt.sign(
    { sub: userId, tenantId: currentTenantId, role, email: "owner@nexora.test" },
    process.env.JWT_SECRET || "dev_secret_change_me",
    { expiresIn: "5m" }
  );
}

async function withServer(callback) {
  delete require.cache[require.resolve("../src/app")];
  delete require.cache[require.resolve("../src/modules/tenant/tenant.routes")];
  const app = require("../src/app");
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function lean(value) {
  return { lean: async () => value };
}

test("GET /api/tenant/branding retorna apenas branding do tenant logado", async () => {
  Tenant.findById = (id) => {
    assert.equal(String(id), tenantId);
    return lean({ _id: tenantId, name: "Associação Central", legalDocument: "12.345.678/0001-90" });
  };
  TenantBranding.findOne = (filter) => {
    assert.equal(String(filter.tenantId), tenantId);
    return lean({ tenantId, logoOriginalPath: "/storage/branding/logo.png", logoProcessedPath: "/storage/branding/logo-transparent.png", logoUseProcessed: true, primaryColor: "#0ea5e9" });
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tenant/branding`, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.tenant.name, "Associação Central");
    assert.equal(body.branding.activeLogoUrl, "/storage/branding/logo-transparent.png");
  });
});

test("PUT /api/tenant/branding persiste logoUseProcessed como boolean real", async () => {
  const capture = {};
  Tenant.findById = () => Promise.resolve({ _id: tenantId, name: "Associação Central" });
  Tenant.findOneAndUpdate = async (filter, update) => {
    capture.tenantFilter = filter;
    capture.tenantUpdate = update;
    return { _id: tenantId, name: update.$set.name || "Associação Central", legalDocument: update.$set.legalDocument || "" };
  };
  TenantBranding.findOneAndUpdate = async (filter, update) => {
    capture.brandingFilter = filter;
    capture.brandingUpdate = update;
    return { _id: "507f1f77bcf86cd799439099", tenantId, ...update.$set };
  };
  AuditLog.create = async () => ({ ok: true });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tenant/branding`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken()}`
      },
      body: JSON.stringify({
        tenant: { name: "Associação Central" },
        branding: { primaryColor: "#123456", secondaryColor: "#654321", logoUseProcessed: "false", documentFooter: "Rodapé próprio" }
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.branding.logoUseProcessed, false);
  });

  assert.equal(String(capture.brandingFilter.tenantId), tenantId);
  assert.equal(capture.brandingUpdate.$set.logoUseProcessed, false);
  assert.equal(capture.brandingUpdate.$set.primaryColor, "#123456");
});

test("POST /api/tenant/branding/logo envia logo isolada por tenant", async () => {
  const capture = {};
  logoUploadService.parseMultipart = async () => ({
    fields: { removeBackground: "true" },
    file: { originalName: "logo.png", mimetype: "image/png", buffer: Buffer.from("fake") }
  });
  logoUploadService.saveUploadedLogo = async ({ tenantId: currentTenantId, file, removeBackground }) => {
    capture.saveArgs = { tenantId: currentTenantId, originalName: file.originalName, removeBackground };
    return {
      logoOriginalPath: "/storage/branding/logo-original.png",
      logoProcessedPath: "/storage/branding/logo-transparent.png",
      logoFilename: "logo-original.png",
      uploadedAt: new Date("2026-06-24T12:00:00.000Z"),
      backgroundRemoved: true,
      logoUseProcessed: true,
      warning: ""
    };
  };
  TenantBranding.findOneAndUpdate = async (filter, update) => {
    capture.brandingFilter = filter;
    capture.brandingUpdate = update;
    return { _id: "507f1f77bcf86cd799439100", tenantId, ...update.$set };
  };
  AuditLog.create = async () => ({ ok: true });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tenant/branding/logo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken(otherTenantId)}` },
      body: "ignored"
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.branding.activeLogoUrl, "/storage/branding/logo-transparent.png");
  });

  assert.equal(String(capture.saveArgs.tenantId), otherTenantId);
  assert.equal(capture.saveArgs.originalName, "logo.png");
  assert.equal(capture.saveArgs.removeBackground, true);
  assert.equal(String(capture.brandingFilter.tenantId), otherTenantId);
  assert.equal(capture.brandingUpdate.$set.logoUseProcessed, true);
});
