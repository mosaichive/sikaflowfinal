// Monthly statement PDF + email HTML rendering.
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import type { StatementData } from "./statement-data.ts";

const BRAND = { r: 22, g: 101, b: 52 }; // KudiTrack green
const MUTED = { r: 107, g: 114, b: 128 };

function money(value: number, currency: string) {
  const amount = (Number.isFinite(value) ? value : 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${amount}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Returns the statement PDF as a base64 string. */
export function renderStatementPdf(data: StatementData): string {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const cur = data.business.currency;
  let y = 0;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 70) {
      footer();
      doc.addPage();
      y = margin;
    }
  };

  const footer = () => {
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, pageHeight - 52, pageWidth - margin, pageHeight - 52);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(
      "Generated automatically by KudiTrack - kuditrack.online",
      margin,
      pageHeight - 36,
    );
    doc.text(
      `Generated ${fmtDate(data.generatedAt)}`,
      pageWidth - margin,
      pageHeight - 36,
      { align: "right" },
    );
    doc.setTextColor(0, 0, 0);
  };

  // ---- Header band
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, pageWidth, 96, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("KudiTrack", margin, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Monthly Business Statement", margin, 62);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(data.period.label, pageWidth - margin, 50, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y = 130;

  // ---- Business block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(data.business.name, margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  const meta = [data.business.email, data.business.phone, data.business.location]
    .filter(Boolean)
    .join("  |  ");
  if (meta) {
    doc.text(meta, margin, y);
    y += 14;
  }
  doc.text(
    `Statement period: ${fmtDate(data.period.start)} - ${fmtDate(
      new Date(new Date(data.period.end).getTime() - 86400000).toISOString(),
    )}`,
    margin,
    y,
  );
  doc.setTextColor(0, 0, 0);
  y += 26;

  // ---- Highlight cards
  const cards = [
    { label: "Total sales", value: money(data.sales.total, cur) },
    { label: "Total expenses", value: money(data.money.expenses, cur) },
    { label: "Net profit", value: money(data.money.profit, cur) },
    { label: "Available money", value: money(data.money.availableBusinessMoney, cur) },
  ];
  const cardW = (pageWidth - margin * 2 - 12 * 3) / 4;
  cards.forEach((card, i) => {
    const x = margin + i * (cardW + 12);
    doc.setFillColor(246, 248, 246);
    doc.roundedRect(x, y, cardW, 56, 6, 6, "F");
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(card.label.toUpperCase(), x + 10, y + 20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(card.value, x + 10, y + 40);
    doc.setFont("helvetica", "normal");
  });
  doc.setTextColor(0, 0, 0);
  y += 84;

  const section = (title: string) => {
    ensureSpace(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    doc.text(title, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 8;
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  };

  const row = (label: string, value: string, bold = false) => {
    ensureSpace(20);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.text(label, margin, y);
    doc.text(value, pageWidth - margin, y, { align: "right" });
    y += 17;
    doc.setFont("helvetica", "normal");
  };

  section("Sales summary");
  row("Number of sales", String(data.sales.count));
  row("Total sales value", money(data.sales.total, cur));
  row("Amount received", money(data.sales.paid, cur));
  row("Outstanding / credit", money(data.sales.unpaid, cur));
  if (data.sales.byMethod.length) {
    y += 4;
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.setFontSize(9);
    doc.text("By payment method", margin, y);
    doc.setTextColor(0, 0, 0);
    y += 15;
    for (const m of data.sales.byMethod) {
      row(`  ${m.method} (${m.count})`, money(m.amount, cur));
    }
  }
  y += 10;

  section("Inventory movement");
  row("Restocks recorded", String(data.inventory.restockCount));
  row("Units restocked", String(data.inventory.unitsRestocked));
  row("Units sold", String(data.inventory.unitsSold));
  row("Restock spending", money(data.inventory.restockValue, cur));
  row("Closing stock (units)", String(data.inventory.closingStockUnits));
  row("Closing stock value (cost)", money(data.inventory.closingStockValue, cur));
  row("Products low on stock", String(data.inventory.lowStockCount));
  y += 10;

  section("Money in and out");
  row("Sales revenue received", money(data.money.paidSalesRevenue, cur));
  row("Other income", money(data.money.otherIncome, cur));
  row("Investor funding", money(data.money.investorFunds, cur));
  row("Total money in", money(data.money.totalIncome, cur), true);
  y += 6;
  row("Cost of goods sold", money(data.money.cogs, cur));
  row("Operating expenses", money(data.money.expenses, cur));
  row("Restock spending", money(data.money.restockSpending, cur));
  row("Savings set aside", money(data.money.savings, cur));
  row("Investments made", money(data.money.investments, cur));
  y += 6;
  row("Net profit", money(data.money.profit, cur), true);
  row("Available business money", money(data.money.availableBusinessMoney, cur), true);
  y += 10;

  if (data.money.expensesByCategory.length) {
    section("Expenses by category");
    for (const c of data.money.expensesByCategory.slice(0, 12)) {
      row(c.category, money(c.amount, cur));
    }
    y += 10;
  }

  section("Orders");
  row("Total orders", String(data.orders.total));
  row("Delivered / completed", String(data.orders.delivered));
  row("Still in progress", String(data.orders.pending));
  row("Cancelled", String(data.orders.cancelled));
  row("Order value", money(data.orders.revenue, cur));

  footer();

  const raw = doc.output("arraybuffer") as ArrayBuffer;
  const bytes = new Uint8Array(raw);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function renderStatementEmailHtml(data: StatementData): string {
  const cur = data.business.currency;
  const stat = (label: string, value: string) => `
    <td style="padding:12px 14px;background:#f6f8f6;border-radius:8px;">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">${label}</div>
      <div style="font-size:16px;font-weight:700;color:#111827;margin-top:4px;">${value}</div>
    </td>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#166534;padding:28px 32px;color:#ffffff;">
      <div style="font-size:20px;font-weight:700;">KudiTrack</div>
      <div style="font-size:13px;opacity:.9;margin-top:4px;">Monthly Business Statement</div>
    </div>
    <div style="padding:28px 32px;color:#111827;">
      <p style="margin:0 0 12px;font-size:15px;">Hello ${data.business.name},</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
        Here is your business statement for <strong>${data.period.label}</strong>. The full breakdown is attached as a PDF.
      </p>
      <table width="100%" cellspacing="8" cellpadding="0" style="border-collapse:separate;">
        <tr>${stat("Total sales", money(data.sales.total, cur))}${stat("Expenses", money(data.money.expenses, cur))}</tr>
        <tr>${stat("Net profit", money(data.money.profit, cur))}${stat("Available money", money(data.money.availableBusinessMoney, cur))}</tr>
      </table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#374151;">
        Keep recording your sales and expenses daily so next month's statement stays accurate.
      </p>
      <p style="margin:20px 0 0;">
        <a href="https://kuditrack.online/reports" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;">Open your dashboard</a>
      </p>
    </div>
  </div>
</body></html>`;
}

export function statementFileName(data: StatementData) {
  const safe = data.business.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `kuditrack-statement-${safe || "business"}-${data.period.period}.pdf`;
}
