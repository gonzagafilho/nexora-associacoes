const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getEncryptionKey() {
  const secret =
    process.env.CREDENTIALS_ENCRYPTION_KEY ||
    process.env.APP_SECRET ||
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY ou APP_SECRET não configurado");
  }

  return crypto.createHash("sha256").update(String(secret)).digest();
}

function encryptSecret(value) {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

function decryptSecret(payload) {
  if (!payload) return "";
  const [version, ivValue, tagValue, encryptedValue] = String(payload).split(":");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Credencial criptografada inválida");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivValue, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function maskSecret(value) {
  const secret = String(value || "");
  if (!secret) return "";
  const prefix = secret.startsWith("APP_USR-") ? "APP_USR-" : secret.slice(0, Math.min(4, secret.length));
  const suffix = secret.slice(-4);
  return `${prefix}****${suffix}`;
}

module.exports = { decryptSecret, encryptSecret, maskSecret };
