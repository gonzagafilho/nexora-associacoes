const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { formatCurrency, formatDate } = require("../pdfService");

const COLORS = {
  primary: "#0284c7",
  ink: "#172033",
  muted: "#667085",
  line: "#D0D5DD",
  soft: "#F5F7FA",
  white: "#FFFFFF"
};

function sanitizeFilename(value) {
  return String(value || "associacao").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "associacao";
}

function periodLabel(period) {
  const date = new Date(period.start);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(date);
}

function resolveStoragePath(source) {
  const value = String(source || "").trim();
  if (!value || /^https?:\/\//i.test(value) || /^data:/i.test(value)) return value;
  if (value.startsWith("/storage/")) return path.resolve(process.cwd(), "..", value.replace(/^\//, ""));
  return value;
}

async function loadImage(source) {
  const resolved = resolveStoragePath(source);
  if (!resolved) return null;
  if (/^data:image\/[\w.+-]+;base64,/i.test(resolved)) return Buffer.from(resolved.replace(/^data:image\/[\w.+-]+;base64,/i, ""), "base64");
  if (/^https?:\/\//i.test(resolved)) {
    const response = await fetch(resolved, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }
  return fs.existsSync(resolved) ? fs.readFileSync(resolved) : null;
}

function drawLogoFallback(doc, tenant, x, y, size) {
  const initials = String(tenant?.name || "NG").split(/s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  doc.roundedRect(x, y, size, size, 8).fill(COLORS.white);
  doc.fillColor(COLORS.primary).font("Helvetica-Bold").fontSize(16).text(initials, x, y + 15, { width: size, align: "center" });
}

function ensureSpace(doc, y, needed = 40) {
  if (y + needed <= 790) return y;
  doc.addPage();
  return 48;
}

function sectionTitle(doc, title, y) {
  y = ensureSpace(doc, y, 34);
  doc.fillColor(COLORS.primary).font("Helvetica-Bold").fontSize(11).text(title.toUpperCase(), 36, y);
  doc.moveTo(36, y + 17).lineTo(559, y + 17).strokeColor(COLORS.line).lineWidth(0.7).stroke();
  return y + 28;
}

function drawSummaryCard(doc, label, value, x, y, width) {
  doc.roundedRect(x, y, width, 48, 7).fillAndStroke(COLORS.soft, COLORS.line);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text(label.toUpperCase(), x + 10, y + 9, { width: width - 20 });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(11).text(formatCurrency(value), x + 10, y + 25, { width: width - 20 });
}

function drawCategoryRows(doc, rows, y) {
  if (!rows.length) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text("Nenhum lançamento pago no período.", 42, y);
    return y + 22;
  }
  rows.forEach((row) => {
    y = ensureSpace(doc, y, 24);
    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(9).text(row.category, 42, y, { width: 330, ellipsis: true });
    doc.font("Helvetica-Bold").text(formatCurrency(row.amount), 418, y, { width: 110, align: "right" });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(String(row.count) + " lançamento(s)", 42, y + 12, { width: 260 });
    y += 28;
  });
  return y;
}

function paymentMethodLabel(method) {
  return { pix: "PIX", cash: "Dinheiro", bank_transfer: "Transferência", card: "Cartão", boleto: "Boleto", other: "Outro" }[method] || method || "Outro";
}

function drawTransactions(doc, transactions, y) {
  if (!transactions.length) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text("Nenhum lançamento pago no período.", 42, y);
    return y + 22;
  }
  y = ensureSpace(doc, y, 28);
  doc.fillColor(COLORS.white).roundedRect(36, y, 523, 22, 4).fill(COLORS.primary);
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(7.5)
    .text("DATA", 44, y + 8, { width: 55 })
    .text("TIPO", 103, y + 8, { width: 55 })
    .text("CATEGORIA", 162, y + 8, { width: 100 })
    .text("DESCRIÇÃO", 266, y + 8, { width: 155 })
    .text("VALOR", 428, y + 8, { width: 80, align: "right" });
  y += 26;
  transactions.forEach((item) => {
    y = ensureSpace(doc, y, 25);
    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(7.5)
      .text(formatDate(item.paidAt), 44, y, { width: 55 })
      .text(item.type === "income" ? "Entrada" : "Saída", 103, y, { width: 55 })
      .text(item.category || "-", 162, y, { width: 100, ellipsis: true })
      .text(item.description || paymentMethodLabel(item.paymentMethod), 266, y, { width: 155, ellipsis: true })
      .font("Helvetica-Bold")
      .text(formatCurrency(item.amount), 428, y, { width: 80, align: "right" });
    doc.moveTo(42, y + 16).lineTo(548, y + 16).strokeColor(COLORS.line).lineWidth(0.4).stroke();
    y += 23;
  });
  return y;
}

async function generateMonthlyFinancialReportPdf(report, options = {}) {
  const outputDir = options.outputDir || path.resolve(process.cwd(), "../storage/reports");
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = "prestacao-contas-" + sanitizeFilename(report.tenant.slug || report.tenant.name) + "-" + report.period.month + ".pdf";
  const filepath = path.join(outputDir, filename);
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  const generatedAt = options.generatedAt || new Date();
  const primaryColor = /^#[0-9a-f]{6}$/i.test(report.branding?.primaryColor || "") ? report.branding.primaryColor : COLORS.primary;
  const logo = await loadImage(report.branding?.activeLogoUrl).catch(() => null);
  doc.rect(0, 0, 595.28, 104).fill(primaryColor);
  if (logo) {
    doc.image(logo, 36, 24, { fit: [58, 58] });
  } else {
    drawLogoFallback(doc, report.tenant, 36, 24, 58);
  }
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(18).text(report.tenant.name || "Organização", 108, 25, { width: 260, ellipsis: true });
  doc.font("Helvetica").fontSize(8.5).text(report.tenant.legalDocument || "Documento não informado", 108, 50, { width: 260, ellipsis: true });
  doc.font("Helvetica-Bold").fontSize(11).text("Prestação de Contas Mensal", 108, 67, { width: 280 });
  doc.font("Helvetica-Bold").fontSize(9).text("Período", 430, 28, { width: 120, align: "right" });
  doc.font("Helvetica").fontSize(9).text(periodLabel(report.period), 360, 43, { width: 190, align: "right" });
  doc.fontSize(8).text("Emitido em " + formatDate(generatedAt), 360, 60, { width: 190, align: "right" });

  let y = 130;
  y = sectionTitle(doc, "Resumo", y);
  const cards = [
    ["Saldo inicial", report.totals.openingBalance],
    ["Receitas", report.totals.incomePaid],
    ["Despesas", report.totals.expensePaid],
    ["Resultado do mês", report.totals.balanceMonth],
    ["Saldo final", report.totals.closingBalance],
    ["Pendências a receber", report.totals.incomePending],
    ["Pendências a pagar", report.totals.expensePending]
  ];
  cards.forEach((card, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    drawSummaryCard(doc, card[0], card[1], 36 + col * 176, y + row * 58, 160);
  });
  y += 182;

  y = sectionTitle(doc, "Receitas por categoria", y);
  y = drawCategoryRows(doc, report.byCategory.incomes || [], y);
  y += 10;
  y = sectionTitle(doc, "Despesas por categoria", y);
  y = drawCategoryRows(doc, report.byCategory.expenses || [], y);
  y += 10;
  y = sectionTitle(doc, "Lançamentos do mês", y);
  y = drawTransactions(doc, report.transactions || [], y);

  const footerLines = [report.branding?.documentFooter, "Documento gerado automaticamente pelo Nexora Gestão."].filter(Boolean);
  y = ensureSpace(doc, y + 8, 60);
  doc.roundedRect(36, y, 523, 54, 6).fillAndStroke(COLORS.soft, COLORS.line);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text("Rodapé", 50, y + 10, { width: 480 });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(9).text(footerLines[0], 50, y + 23, { width: 480 });
  if (footerLines[1]) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(footerLines[1], 50, y + 36, { width: 480 });
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return {
    filename,
    filepath,
    relativePath: "/storage/reports/" + filename
  };
}

module.exports = { generateMonthlyFinancialReportPdf };
