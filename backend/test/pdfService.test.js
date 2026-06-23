const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { after, before, test } = require("node:test");
const QRCode = require("qrcode");

const { generateInvoicePdf } = require("../src/services/pdfService");

let outputDir;

before(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "bolepix-pdf-test-"));
});

after(() => {
  fs.rmSync(outputDir, { recursive: true, force: true });
});

function fixtures(id) {
  return {
    invoice: {
      _id: id,
      description: "Mensalidade Premium",
      type: "monthly",
      amountOriginal: 150,
      amountCurrent: 153,
      dueDate: new Date("2026-07-10T12:00:00.000Z"),
      createdAt: new Date("2026-06-23T12:00:00.000Z"),
      status: "pending",
      lateFeeType: "percent",
      lateFeeValue: 2,
      dailyInterestType: "percent",
      dailyInterestValue: 0.033,
      metadata: { month: 7, year: 2026 }
    },
    associate: {
      name: "Maria da Silva",
      cpf: "123.456.789-00",
      phone: "(61) 99999-9999",
      email: "maria@example.com",
      address: "Rua das Flores, 100 - Centro"
    },
    tenant: {
      name: "Associação Nexora",
      legalDocument: "12.345.678/0001-90",
      phone: "(61) 3333-3333",
      email: "contato@nexora.example",
      address: "Avenida Central, 500 - Brasília/DF"
    },
    branding: {
      primaryColor: "#175CD3",
      documentFooter: "Documento emitido pela Associação Nexora."
    },
    billingSettings: {
      defaultLateFeeType: "percent",
      defaultLateFeeValue: 2,
      defaultDailyInterestType: "percent",
      defaultDailyInterestValue: 0.033,
      pdfMessage: "Use o QR Code ou o Pix copia e cola."
    }
  };
}

function assertValidSinglePagePdf(filepath) {
  const pdf = fs.readFileSync(filepath);
  const source = pdf.toString("latin1");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 5000, `PDF muito pequeno: ${pdf.length} bytes`);
  assert.equal((source.match(/\/Type \/Page\b/g) || []).length, 1);
}

test("gera PDF profissional sem Pix", async () => {
  const result = await generateInvoicePdf({
    ...fixtures("pdf-sem-pix"),
    outputDir,
    generatedAt: new Date("2026-06-23T12:00:00.000Z")
  });

  assertValidSinglePagePdf(result.filepath);
  assert.equal(result.relativePath, "/storage/pdfs/invoice-pdf-sem-pix.pdf");
});

test("gera PDF com Pix copia e cola", async () => {
  const data = fixtures("pdf-com-pix");
  const result = await generateInvoicePdf({
    ...data,
    invoicePix: {
      amount: 153,
      expiresAt: data.invoice.dueDate,
      pixCopyPaste: "00020126580014BR.GOV.BCB.PIX0136bolepix-teste-1234567895204000053039865406153.005802BR5920ASSOCIACAO NEXORA6008BRASILIA62070503***6304ABCD"
    },
    outputDir
  });

  assertValidSinglePagePdf(result.filepath);
});

test("gera PDF com QR Code em alta qualidade", async () => {
  const data = fixtures("pdf-com-qr");
  const payload = "00020101021226890014BR.GOV.BCB.PIX2567pix.example/qr/alta-qualidade-9876543215204000053039865406153.005802BR6304ABCD";
  const qrCodeImageUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "H",
    width: 512,
    margin: 2
  });

  const result = await generateInvoicePdf({
    ...data,
    invoicePix: {
      amount: 153,
      expiresAt: data.invoice.dueDate,
      pixCopyPaste: payload,
      qrCodeImageUrl
    },
    outputDir
  });

  assertValidSinglePagePdf(result.filepath);
  assert.ok(fs.statSync(result.filepath).size > 10000);
});

test("gera PDF com tenant e identidade visual personalizados", async () => {
  const data = fixtures("pdf-tenant-personalizado");
  const logoUrl = await QRCode.toDataURL("LOGO-ASSOCIACAO-PERSONALIZADA", {
    width: 256,
    margin: 1
  });

  data.tenant = {
    name: "Instituto Esportivo Aurora",
    legalDocument: "98.765.432/0001-10",
    phone: "(11) 4000-1234",
    email: "financeiro@aurora.example",
    address: "Rua Aurora, 42 - São Paulo/SP"
  };
  data.branding = {
    logoUrl,
    primaryColor: "#7F1D1D",
    documentFooter: "Instituto Esportivo Aurora"
  };
  data.billingSettings.defaultLateFeeValue = 3;

  const result = await generateInvoicePdf({
    ...data,
    outputDir
  });

  assertValidSinglePagePdf(result.filepath);
  assert.ok(fs.statSync(result.filepath).size > 10000);
});

test("gera PDF Premium com seção de boleto sem remover Pix", async () => {
  const data = fixtures("pdf-pix-e-boleto");
  const result = await generateInvoicePdf({
    ...data,
    invoicePix: {
      amount: 153,
      expiresAt: data.invoice.dueDate,
      pixCopyPaste: "000201PIXEBOLETO6304ABCD"
    },
    boletoTransaction: {
      externalId: "boleto-123",
      status: "pending",
      originalAmount: 153,
      feeAmount: 3.49,
      totalAmount: 156.49,
      expiresAt: new Date("2026-07-13T23:59:59.000Z"),
      boletoUrl: "https://www.mercadopago.com.br/payments/boleto-123/ticket",
      barcode: "23790000000000000000000000000000000000000000",
      digitableLine: "23790.00000 00000.000000 00000.000000 0 00000000000000"
    },
    outputDir
  });

  const pdf = fs.readFileSync(result.filepath);
  const source = pdf.toString("latin1");
  assert.equal((source.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.ok(pdf.length > 15000);
});
