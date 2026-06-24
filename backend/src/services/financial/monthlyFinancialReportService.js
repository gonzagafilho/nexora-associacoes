const Tenant = require("../../models/Tenant");
const TenantBranding = require("../../models/TenantBranding");
const { toSafeBranding } = require("../branding/tenantBrandingService");
const FinancialTransaction = require("../../models/FinancialTransaction");

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseMonth(month) {
  const value = String(month || "").trim();
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    const error = new Error("Mês obrigatório no formato YYYY-MM.");
    error.statusCode = 400;
    throw error;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    const error = new Error("Mês inválido.");
    error.statusCode = 400;
    throw error;
  }
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { value, year, month: monthIndex + 1, start, end };
}

function inRange(value, start, end) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function before(value, dateLimit) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date < dateLimit;
}

function sum(rows) {
  return roundMoney(rows.reduce((total, item) => total + Number(item.amount || 0), 0));
}

function groupByCategory(rows) {
  const grouped = new Map();
  rows.forEach((item) => {
    const category = item.category || "Sem categoria";
    const current = grouped.get(category) || { category, amount: 0, count: 0 };
    current.amount = roundMoney(current.amount + Number(item.amount || 0));
    current.count += 1;
    grouped.set(category, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

function serializeTransaction(transaction) {
  return {
    id: transaction._id,
    type: transaction.type,
    category: transaction.category || "Sem categoria",
    description: transaction.description || "",
    amount: transaction.amount || 0,
    dueDate: transaction.dueDate || null,
    paidAt: transaction.paidAt || null,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod || "other",
    supplierName: transaction.supplierName || "",
    referenceType: transaction.referenceType || "manual",
    referenceId: transaction.referenceId || null,
    createdAt: transaction.createdAt || null
  };
}

async function buildMonthlyFinancialReport({ tenantId, month }) {
  const period = parseMonth(month);
  const [tenant, branding, transactions] = await Promise.all([
    Tenant.findById(tenantId).lean(),
    TenantBranding.findOne({ tenantId }).lean(),
    FinancialTransaction.find({ tenantId }).lean()
  ]);

  const paid = transactions.filter((item) => item.status === "paid");
  const paidBeforeMonth = paid.filter((item) => before(item.paidAt, period.start));
  const paidInMonth = paid.filter((item) => inRange(item.paidAt, period.start, period.end));
  const pendingInMonth = transactions.filter((item) => item.status === "pending" && inRange(item.dueDate, period.start, period.end));

  const incomePaidRows = paidInMonth.filter((item) => item.type === "income");
  const expensePaidRows = paidInMonth.filter((item) => item.type === "expense");
  const incomePendingRows = pendingInMonth.filter((item) => item.type === "income");
  const expensePendingRows = pendingInMonth.filter((item) => item.type === "expense");
  const openingIncome = sum(paidBeforeMonth.filter((item) => item.type === "income"));
  const openingExpense = sum(paidBeforeMonth.filter((item) => item.type === "expense"));
  const openingBalance = roundMoney(openingIncome - openingExpense);
  const incomePaid = sum(incomePaidRows);
  const expensePaid = sum(expensePaidRows);
  const balanceMonth = roundMoney(incomePaid - expensePaid);

  return {
    tenant: {
      id: tenant?._id || tenantId,
      name: tenant?.name || "Associação",
      slug: tenant?.slug || "",
      legalDocument: tenant?.legalDocument || ""
    },
    branding: toSafeBranding(branding),
    period: {
      month: period.value,
      start: period.start,
      end: period.end
    },
    totals: {
      openingBalance,
      incomePaid,
      expensePaid,
      balanceMonth,
      closingBalance: roundMoney(openingBalance + balanceMonth),
      incomePending: sum(incomePendingRows),
      expensePending: sum(expensePendingRows)
    },
    byCategory: {
      incomes: groupByCategory(incomePaidRows),
      expenses: groupByCategory(expensePaidRows)
    },
    transactions: paidInMonth
      .slice()
      .sort((a, b) => new Date(a.paidAt || a.createdAt || 0) - new Date(b.paidAt || b.createdAt || 0))
      .map(serializeTransaction)
  };
}

module.exports = {
  buildMonthlyFinancialReport,
  parseMonth,
  roundMoney
};
