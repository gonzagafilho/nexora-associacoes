const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const PAGE = { width: 595.28, height: 841.89, margin: 36 };
const COLORS = {
  ink: "#172033",
  muted: "#667085",
  line: "#D0D5DD",
  soft: "#F5F7FA",
  white: "#FFFFFF"
};

function text(value, fallback = "Não informado") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function formatDate(value) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(date);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatStatus(status) {
  return {
    pending: "Pendente",
    paid: "Pago",
    overdue: "Vencido",
    cancelled: "Cancelado"
  }[status] || text(status);
}

function getCompetence(invoice) {
  const month = Number(invoice?.metadata?.month);
  const year = Number(invoice?.metadata?.year);
  if (month >= 1 && month <= 12 && year) {
    return `${String(month).padStart(2, "0")}/${year}`;
  }
  return text(invoice.description);
}

function formatCharge(type, value, daily = false) {
  if (type === "percent") {
    return `${Number(value || 0).toLocaleString("pt-BR")}%${daily ? " ao dia" : ""}`;
  }
  return `${formatCurrency(value)}${daily ? " ao dia" : ""}`;
}

function dataUriToBuffer(value) {
  const match = String(value || "").match(/^data:image\/[\w.+-]+;base64,(.+)$/i);
  return match ? Buffer.from(match[1], "base64") : null;
}

async function loadImage(source) {
  if (!source) return null;

  const dataBuffer = dataUriToBuffer(source);
  if (dataBuffer) return dataBuffer;

  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Logo HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  const candidates = [
    source,
    path.resolve(process.cwd(), source.replace(/^\//, "")),
    path.resolve(process.cwd(), "..", source.replace(/^\//, ""))
  ];
  const filepath = candidates.find((candidate) => fs.existsSync(candidate));
  return filepath ? fs.readFileSync(filepath) : null;
}

async function buildQrCode(invoicePix) {
  const image = await loadImage(invoicePix?.qrCodeImageUrl).catch(() => null);
  if (image) return image;

  const payload = invoicePix?.pixCopyPaste || invoicePix?.qrCodeText;
  if (!payload) return null;

  return QRCode.toBuffer(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    type: "png"
  });
}

function drawSectionTitle(doc, title, y) {
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(title.toUpperCase(), PAGE.margin, y);
  doc
    .moveTo(PAGE.margin, y + 15)
    .lineTo(PAGE.width - PAGE.margin, y + 15)
    .strokeColor(COLORS.line)
    .lineWidth(0.7)
    .stroke();
}

function drawField(doc, label, value, x, y, width) {
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(7.5)
    .text(label.toUpperCase(), x, y, { width });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(text(value), x, y + 12, { width, ellipsis: true });
}

function drawLogoFallback(doc, tenant, x, y, size, primaryColor) {
  const initials = text(tenant.name, "A")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  doc.roundedRect(x, y, size, size, 8).fill(primaryColor);
  doc
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(initials, x, y + 16, { width: size, align: "center" });
}

function drawBoletoPage(doc, { invoice, tenant, billingSettings, boletoTransaction, primaryColor }) {
  doc.addPage({ size: "A4", margin: PAGE.margin });
  const contentWidth = PAGE.width - PAGE.margin * 2;

  doc
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("PAGAMENTO POR BOLETO", PAGE.margin, 42, { width: contentWidth });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(`${text(tenant.name)} • Cobrança ${invoice._id}`, PAGE.margin, 70, { width: contentWidth });
  doc.rect(PAGE.margin, 94, contentWidth, 3).fill(primaryColor);

  drawSectionTitle(doc, "Resumo do boleto", 120);
  drawField(doc, "Valor original", formatCurrency(boletoTransaction.originalAmount ?? invoice.amountCurrent), 36, 146, 155);
  drawField(doc, "Taxa do boleto", formatCurrency(boletoTransaction.feeAmount), 210, 146, 155);
  drawField(doc, "Total do boleto", formatCurrency(boletoTransaction.totalAmount ?? boletoTransaction.amount), 384, 146, 175);
  drawField(doc, "Vencimento", formatDate(boletoTransaction.expiresAt || invoice.dueDate), 36, 184, 155);
  drawField(doc, "Status", formatStatus(boletoTransaction.status), 210, 184, 155);
  drawField(doc, "Pagamento Mercado Pago", boletoTransaction.externalId, 384, 184, 175);

  doc
    .roundedRect(PAGE.margin, 238, contentWidth, 118, 8)
    .fillAndStroke(COLORS.soft, COLORS.line);
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("LINHA DIGITÁVEL / CÓDIGO DE BARRAS", 52, 258, { width: contentWidth - 32, align: "center" });
  doc
    .fillColor(COLORS.ink)
    .font("Courier-Bold")
    .fontSize(10)
    .text(text(boletoTransaction.digitableLine || boletoTransaction.barcode, "Disponível no link do boleto."), 58, 290, {
      width: contentWidth - 44,
      align: "center"
    });

  const boletoUrl = boletoTransaction.boletoUrl || boletoTransaction.ticketUrl;
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("LINK PARA ABRIR E IMPRIMIR O BOLETO", PAGE.margin, 390, { width: contentWidth, align: "center" });
  doc
    .roundedRect(96, 414, PAGE.width - 192, 48, 7)
    .fillAndStroke(primaryColor, primaryColor);
  doc
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("ABRIR BOLETO MERCADO PAGO", 110, 430, {
      width: PAGE.width - 220,
      align: "center",
      link: boletoUrl || undefined,
      underline: Boolean(boletoUrl)
    });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(7)
    .text(text(boletoUrl, "Link não disponível."), 58, 478, {
      width: contentWidth - 44,
      align: "center",
      link: boletoUrl || undefined
    });

  drawSectionTitle(doc, "Instruções", 540);
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica")
    .fontSize(9)
    .text(text(billingSettings.boletoInstructions, "Pague em banco, aplicativo bancário, caixa eletrônico ou lotérica até o vencimento."), 36, 568, {
      width: contentWidth,
      align: "left"
    });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Após o pagamento a baixa será realizada automaticamente.", 36, 650, {
      width: contentWidth,
      align: "center"
    });
  doc
    .moveTo(PAGE.margin, 752)
    .lineTo(PAGE.width - PAGE.margin, 752)
    .strokeColor(COLORS.line)
    .lineWidth(0.7)
    .stroke();
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(7.5)
    .text(`${text(tenant.name)} • CNPJ ${text(tenant.legalDocument)}`, 36, 764, { width: contentWidth });
}

async function generateInvoicePdf({
  invoice,
  associate,
  tenant,
  branding = {},
  billingSettings = {},
  invoicePix = null,
  boletoTransaction = null,
  outputDir,
  generatedAt = new Date()
}) {
  const pdfDir = outputDir || path.resolve(process.cwd(), "../storage/pdfs");
  fs.mkdirSync(pdfDir, { recursive: true });

  const filename = `invoice-${invoice._id}.pdf`;
  const filepath = path.join(pdfDir, filename);
  const [logo, qrCode] = await Promise.all([
    loadImage(branding.logoUrl).catch((error) => {
      console.warn("[PDF] logo não carregada", error.message);
      return null;
    }),
    buildQrCode(invoicePix)
  ]);

  const primaryColor = /^#[0-9a-f]{6}$/i.test(branding.primaryColor || "")
    ? branding.primaryColor
    : "#175CD3";
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    compress: false,
    info: {
      Title: `BolePix ${invoice._id}`,
      Author: text(tenant.name, "Nexora Associações"),
      Subject: boletoTransaction ? "Cobrança Pix e boleto" : "Cobrança Pix"
    }
  });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  const contentWidth = PAGE.width - PAGE.margin * 2;

  if (logo) {
    doc.image(logo, PAGE.margin, 34, { fit: [64, 64], align: "center", valign: "center" });
  } else {
    drawLogoFallback(doc, tenant, PAGE.margin, 34, 54, primaryColor);
  }

  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(text(tenant.name, "Associação"), 112, 35, { width: 280 });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8.5)
    .text(`CNPJ: ${text(tenant.legalDocument)}`, 112, 59, { width: 280 })
    .text(text(tenant.address), 112, 73, { width: 280, ellipsis: true })
    .text(`${text(tenant.phone)}  •  ${text(tenant.email)}`, 112, 87, {
      width: 340,
      ellipsis: true
    });

  doc
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text("BOLEPIX", 430, 38, { width: 125, align: "right" });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("COBRANÇA VIA PIX", 430, 62, { width: 125, align: "right" });
  doc.rect(PAGE.margin, 108, contentWidth, 3).fill(primaryColor);

  drawSectionTitle(doc, "Dados do associado", 128);
  drawField(doc, "Nome", associate.name, 36, 152, 245);
  drawField(doc, "CPF", associate.cpf, 300, 152, 120);
  drawField(doc, "Telefone", associate.phone, 435, 152, 124);
  drawField(doc, "E-mail", associate.email, 36, 184, 245);
  drawField(doc, "Endereço", associate.address, 300, 184, 259);

  drawSectionTitle(doc, "Dados da cobrança", 226);
  drawField(doc, "Número", String(invoice._id), 36, 250, 170);
  drawField(doc, "Competência", getCompetence(invoice), 220, 250, 95);
  drawField(doc, "Emissão", formatDate(invoice.createdAt || generatedAt), 330, 250, 95);
  drawField(doc, "Vencimento", formatDate(invoice.dueDate), 440, 250, 119);
  drawField(doc, "Valor original", formatCurrency(invoice.amountOriginal), 36, 284, 170);
  drawField(doc, "Descrição", invoice.description, 220, 284, 205);
  drawField(doc, "Status", formatStatus(invoice.status), 440, 284, 119);

  const pixY = 330;
  doc
    .roundedRect(PAGE.margin, pixY, contentWidth, 252, 10)
    .fillAndStroke(COLORS.soft, COLORS.line);
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(invoicePix ? "PAGUE COM PIX" : "PAGAMENTO PIX", 55, pixY + 18, {
      width: contentWidth - 38,
      align: "center"
    });

  if (qrCode) {
    doc.image(qrCode, 64, pixY + 54, { fit: [158, 158] });
  } else {
    doc
      .roundedRect(64, pixY + 54, 158, 158, 8)
      .fillAndStroke(COLORS.white, COLORS.line);
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(9)
      .text("QR Code Pix\nnão disponível", 82, pixY + 112, {
        width: 122,
        align: "center"
      });
  }

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("VALOR", 254, pixY + 60, { width: 278, align: "center" });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(formatCurrency(invoicePix?.amount ?? invoice.amountCurrent), 254, pixY + 75, {
      width: 278,
      align: "center"
    });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(`Vencimento: ${formatDate(invoicePix?.expiresAt || invoice.dueDate)}`, 254, pixY + 108, {
      width: 278,
      align: "center"
    });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("PIX COPIA E COLA", 254, pixY + 138, { width: 278, align: "center" });
  doc
    .roundedRect(254, pixY + 154, 278, 58, 5)
    .fillAndStroke(COLORS.white, COLORS.line);
  doc
    .fillColor(COLORS.ink)
    .font("Courier")
    .fontSize(6.5)
    .text(text(invoicePix?.pixCopyPaste || invoicePix?.qrCodeText, "Pix ainda não gerado."), 264, pixY + 164, {
      width: 258,
      height: 38,
      align: "center",
      ellipsis: true
    });

  const chargesY = 602;
  drawSectionTitle(doc, "Multa e juros", chargesY);
  const lateFeeType = billingSettings.defaultLateFeeType || invoice.lateFeeType;
  const lateFeeValue = billingSettings.defaultLateFeeValue ?? invoice.lateFeeValue;
  const interestType = billingSettings.defaultDailyInterestType || invoice.dailyInterestType;
  const interestValue = billingSettings.defaultDailyInterestValue ?? invoice.dailyInterestValue;
  drawField(doc, "Multa", formatCharge(lateFeeType, lateFeeValue), 36, chargesY + 25, 245);
  drawField(doc, "Juros", formatCharge(interestType, interestValue, true), 300, chargesY + 25, 259);

  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Após o pagamento a baixa será realizada automaticamente.", 36, 696, {
      width: contentWidth,
      align: "center"
    });
  if (billingSettings.pdfMessage) {
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(7.5)
      .text(billingSettings.pdfMessage, 60, 713, {
        width: contentWidth - 48,
        align: "center",
        ellipsis: true
      });
  }

  doc
    .moveTo(PAGE.margin, 752)
    .lineTo(PAGE.width - PAGE.margin, 752)
    .strokeColor(COLORS.line)
    .lineWidth(0.7)
    .stroke();
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(7.5)
    .text(`${text(tenant.name)} • CNPJ ${text(tenant.legalDocument)}`, 36, 764, {
      width: 350
    })
    .text(`Gerado em ${formatDate(generatedAt)}`, 390, 764, {
      width: 169,
      align: "right"
    });
  if (branding.documentFooter) {
    doc.text(branding.documentFooter, 36, 779, {
      width: contentWidth,
      align: "center",
      ellipsis: true
    });
  }

  if (boletoTransaction) {
    drawBoletoPage(doc, {
      invoice,
      tenant,
      billingSettings,
      boletoTransaction,
      primaryColor
    });
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return {
    filename,
    filepath,
    relativePath: `/storage/pdfs/${filename}`
  };
}

module.exports = {
  generateInvoicePdf,
  formatCurrency,
  formatDate,
  getCompetence
};
