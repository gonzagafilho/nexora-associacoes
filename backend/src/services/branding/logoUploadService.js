const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/webp", "webp"]
]);

function storageDir() {
  return path.resolve(process.cwd(), "../storage/branding");
}

function sanitize(value) {
  return String(value || "logo").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "logo";
}

function parseMultipart(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] || "");
    const boundaryMatch = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
    if (!boundaryMatch) return reject(Object.assign(new Error("Envie a logo em multipart/form-data."), { statusCode: 400 }));
    const boundary = "--" + (boundaryMatch[1] || boundaryMatch[2]);
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Logo deve ter no máximo 5 MB."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const parts = buffer.toString("latin1").split(boundary).slice(1, -1);
      const fields = {};
      let file = null;
      parts.forEach((raw) => {
        let part = raw;
        if (part.startsWith("\r\n")) part = part.slice(2);
        if (part.endsWith("\r\n")) part = part.slice(0, -2);
        const sep = part.indexOf("\r\n\r\n");
        if (sep < 0) return;
        const header = part.slice(0, sep);
        const body = Buffer.from(part.slice(sep + 4), "latin1");
        const name = /name="([^"]+)"/i.exec(header)?.[1];
        const filename = /filename="([^"]*)"/i.exec(header)?.[1];
        const type = /content-type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim().toLowerCase();
        if (!name) return;
        if (filename !== undefined) file = { fieldname: name, originalName: filename, mimetype: type, buffer: body };
        else fields[name] = body.toString("utf8").trim();
      });
      resolve({ fields, file });
    });
  });
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function parsePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.slice(0, 8).toString("hex") !== signature) throw new Error("PNG inválido.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
    const data = buffer.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("PNG precisa ser 8-bit sem interlace.");
      colorType = data[9];
      if (![2, 6].includes(colorType)) throw new Error("PNG precisa estar em RGB ou RGBA.");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let source = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++];
    const row = Buffer.from(raw.slice(source, source + stride));
    source += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error("Filtro PNG não suportado.");
    }
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      pixels[to] = row[from];
      pixels[to + 1] = row[from + 1];
      pixels[to + 2] = row[from + 2];
      pixels[to + 3] = channels === 4 ? row[from + 3] : 255;
    }
    previous = row;
  }
  return { width, height, pixels };
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const crcTable = pngChunk.crcTable || (pngChunk.crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  Buffer.concat([name, data]).forEach((byte) => { crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); });
  crc = (crc ^ 0xffffffff) >>> 0;
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePng({ width, height, pixels }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(pixels.slice(y * width * 4, (y + 1) * width * 4));
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function removeSimpleBackgroundPng(buffer) {
  const image = parsePng(buffer);
  const { width, height, pixels } = image;
  const samples = [0, (width - 1) * 4, ((height - 1) * width) * 4, ((height - 1) * width + width - 1) * 4];
  const avg = samples.reduce((acc, idx) => {
    acc[0] += pixels[idx]; acc[1] += pixels[idx + 1]; acc[2] += pixels[idx + 2];
    return acc;
  }, [0, 0, 0]).map((v) => Math.round(v / samples.length));
  let changed = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const diff = Math.abs(pixels[i] - avg[0]) + Math.abs(pixels[i + 1] - avg[1]) + Math.abs(pixels[i + 2] - avg[2]);
    if (diff <= 54) {
      pixels[i + 3] = 0;
      changed += 1;
    } else if (diff <= 92) {
      pixels[i + 3] = Math.min(pixels[i + 3], Math.round((diff - 54) / 38 * 255));
      changed += 1;
    }
  }
  if (!changed) throw new Error("Nenhum fundo simples encontrado.");
  return encodePng(image);
}

async function saveUploadedLogo({ tenantId, file, removeBackground }) {
  if (!file?.buffer?.length) {
    const error = new Error("Selecione uma imagem de logo.");
    error.statusCode = 400;
    throw error;
  }
  const ext = ALLOWED_TYPES.get(String(file.mimetype || "").toLowerCase());
  if (!ext) {
    const error = new Error("Formato inválido. Envie PNG, JPG, JPEG ou WEBP.");
    error.statusCode = 400;
    throw error;
  }
  fs.mkdirSync(storageDir(), { recursive: true });
  const safeName = sanitize(file.originalName).replace(/\.(png|jpe?g|webp)$/i, "");
  const token = crypto.randomBytes(6).toString("hex");
  const base = String(tenantId) + "-" + Date.now() + "-" + token + "-" + safeName;
  const originalFilename = base + "." + ext;
  const originalPath = path.join(storageDir(), originalFilename);
  fs.writeFileSync(originalPath, file.buffer);

  let processedPath = "";
  let processedFilename = "";
  let backgroundRemoved = false;
  let warning = "";
  if (removeBackground) {
    try {
      if (ext !== "png") throw new Error("Remoção automática disponível para PNG neste ambiente.");
      const processed = removeSimpleBackgroundPng(file.buffer);
      processedFilename = base + "-transparent.png";
      processedPath = path.join(storageDir(), processedFilename);
      fs.writeFileSync(processedPath, processed);
      backgroundRemoved = true;
    } catch (error) {
      warning = "Não foi possível remover o fundo automaticamente. A logo original foi mantida.";
    }
  }

  return {
    logoOriginalPath: "/storage/branding/" + originalFilename,
    logoProcessedPath: processedFilename ? "/storage/branding/" + processedFilename : "",
    logoFilename: originalFilename,
    uploadedAt: new Date(),
    backgroundRemoved,
    logoUseProcessed: backgroundRemoved,
    warning
  };
}

module.exports = {
  ALLOWED_TYPES,
  parseMultipart,
  removeSimpleBackgroundPng,
  saveUploadedLogo
};
