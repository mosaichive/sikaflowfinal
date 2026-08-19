// Monthly statement PDF + email HTML rendering.
// The PDF layout is a 1:1 port of the in-app Report Slip (src/lib/report-slip.ts)
// so emailed statements look exactly like the ones downloaded from Reports.
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.4?deps=jspdf@2.5.2";
import type { StatementData } from "./statement-data.ts";

const COLORS = {
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  success: [5, 150, 105] as [number, number, number],
  danger: [220, 38, 38] as [number, number, number],
};

const FONT_URL = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf";
const FONT_BOLD_URL = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf";
const LOGO_URL = "https://kuditrack.online/icon-192.png";

let fontCache: { normal: string; bold: string } | null = null;
let logoCache: string | null | undefined;

function toBinary(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return binary;
}

async function loadFonts() {
  if (!fontCache) {
    const [normal, bold] = await Promise.all([
      fetch(FONT_URL).then((r) => r.arrayBuffer()),
      fetch(FONT_BOLD_URL).then((r) => r.arrayBuffer()),
    ]);
    fontCache = { normal: toBinary(normal), bold: toBinary(bold) };
  }
  return fontCache;
}

async function loadLogo(): Promise<string | null> {
  if (logoCache === undefined) {
    try {
      const res = await fetch(LOGO_URL);
      logoCache = res.ok ? `data:image/png;base64,${btoa(toBinary(await res.arrayBuffer()))}` : null;
    } catch {
      logoCache = null;
    }
  }
  return logoCache ?? null;
}

function makeMoney(symbol: string) {
  const space = /[A-Za-z]$/.test(symbol) ? " " : "";
  return (value: number) => {
    const amount = Math.abs(Number.isFinite(value) ? value : 0).toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const sign = (value ?? 0) < 0 ? "-" : "";
    return `${sign}${symbol}${space}${amount}`;
  };
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatGeneratedDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rangeDates(data: StatementData) {
  const from = data.period.start;
  const to = new Date(new Date(data.period.end).getTime() - 86400000).toISOString();
  return { from, to };
}

/** Returns the statement PDF as a base64 string. */
export async function renderStatementPdf(data: StatementData): Promise<string> {
  const fonts = await loadFonts();
  const logo = await loadLogo();
  const money = makeMoney(data.business.currencySymbol || data.business.currency);
  const { from, to } = rangeDates(data);
  const businessName = data.business.name;
  const generatedFor = data.business.ownerName;
  const st = data.statement;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.normal);
  doc.addFont("DejaVuSans.ttf", "NotoSans", "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", "NotoSans", "bold");
  doc.setFont("NotoSans", "normal");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const drawHeader = () => {
    doc.setFillColor(...COLORS.surface);
    doc.rect(0, 0, pageWidth, 60, "F");
    doc.setDrawColor(...COLORS.line);
    doc.line(0, 60, pageWidth, 60);
    if (logo) doc.addImage(logo, "PNG", 40, 15, 28, 28);
    const brandX = logo ? 78 : 40;
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.ink);
    doc.text("KudiTrack", brandX, 28);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text("Financial Statement", brandX, 42);
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.ink);
    doc.text(businessName, pageWidth - 40, 25, { align: "right" });
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text(`${formatShortDate(from)} - ${formatShortDate(to)}`, pageWidth - 40, 40, { align: "right" });
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    doc.setDrawColor(...COLORS.line);
    doc.line(40, pageHeight - 34, pageWidth - 40, pageHeight - 34);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text("Generated by KudiTrack", 40, pageHeight - 18);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 40, pageHeight - 18, { align: "right" });
  };

  const drawValueCard = (
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
    tone?: readonly [number, number, number],
  ) => {
    doc.setDrawColor(...COLORS.line);
    doc.roundedRect(x, y, width, 56, 10, 10);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, x + 12, y + 18);
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...(tone ?? COLORS.ink));
    doc.text(value, x + 12, y + 39);
  };

  drawHeader();

  doc.setFont("NotoSans", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.ink);
  doc.text("Financial Statement", 40, 94);

  doc.setFont("NotoSans", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Business / User: ${businessName} • ${generatedFor}`, 40, 114);
  doc.text(`Statement range: ${formatShortDate(from)} to ${formatShortDate(to)}`, 40, 129);
  doc.text(`Generated: ${formatGeneratedDate(data.generatedAt)}`, 40, 144);

  const detailBoxX = pageWidth - 220;
  doc.setDrawColor(...COLORS.line);
  doc.roundedRect(detailBoxX, 84, 180, 70, 12, 12);
  doc.setFont("NotoSans", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.ink);
  doc.text("Statement Details", detailBoxX + 12, 102);
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text("Money In", detailBoxX + 12, 122);
  doc.text(money(st.totalMoneyIn), detailBoxX + 168, 122, { align: "right" });
  doc.text("Money Out", detailBoxX + 12, 136);
  doc.text(money(st.totalMoneyOut), detailBoxX + 168, 136, { align: "right" });
  doc.text("Closing Balance", detailBoxX + 12, 150);
  doc.text(money(st.closingBalance), detailBoxX + 168, 150, { align: "right" });

  const metricGap = 10;
  const metricWidth = (pageWidth - 80 - metricGap * 3) / 4;
  const metricsTop = 176;
  drawValueCard(40, metricsTop, metricWidth, "Opening Balance", money(st.openingBalance));
  drawValueCard(40 + metricWidth + metricGap, metricsTop, metricWidth, "Total Money In", money(st.totalMoneyIn), COLORS.success);
  drawValueCard(40 + (metricWidth + metricGap) * 2, metricsTop, metricWidth, "Total Money Out", money(st.totalMoneyOut), COLORS.danger);
  drawValueCard(40 + (metricWidth + metricGap) * 3, metricsTop, metricWidth, "Closing Balance", money(st.closingBalance));

  doc.setFont("NotoSans", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.ink);
  doc.text("Transaction Statement", 40, 260);

  const rows = st.rows;
  autoTable(doc, {
    startY: 272,
    margin: { top: 72, right: 40, bottom: 56, left: 40 },
    head: [["Date", "Reference ID", "Transaction Type", "Description", "Money In", "Money Out", "Balance"]],
    body: rows.length
      ? rows.map((row) => [
        new Date(row.date).toLocaleDateString("en-GB"),
        row.reference,
        row.type,
        row.description,
        row.moneyIn > 0 ? money(row.moneyIn) : "—",
        row.moneyOut > 0 ? money(row.moneyOut) : "—",
        money(row.runningBalance),
      ])
      : [["—", "—", "—", "No transactions recorded in this period", "—", "—", money(st.closingBalance)]],
    styles: {
      font: "NotoSans",
      fontSize: 8,
      cellPadding: { top: 6, right: 4, bottom: 6, left: 4 },
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0.3,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: COLORS.ink,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      lineColor: COLORS.ink,
    },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 72 },
      2: { cellWidth: 68 },
      3: { cellWidth: 106 },
      4: { cellWidth: 70, halign: "right" },
      5: { cellWidth: 70, halign: "right" },
      6: { cellWidth: 77, halign: "right" },
    },
    didParseCell: (hookData: any) => {
      if (hookData.section !== "body") return;
      const sourceRow = rows[hookData.row.index];
      if (!sourceRow) return;
      if (hookData.column.index === 4 && sourceRow.moneyIn > 0) hookData.cell.styles.textColor = COLORS.success;
      if (hookData.column.index === 5 && sourceRow.moneyOut > 0) hookData.cell.styles.textColor = COLORS.danger;
      if (hookData.column.index === 6) hookData.cell.styles.fontStyle = "bold";
    },
  });

  let summaryStartY = ((doc as any).lastAutoTable?.finalY ?? 300) + 26;
  if (summaryStartY + 160 > pageHeight - 56) {
    doc.addPage();
    summaryStartY = 92;
  }

  doc.setFont("NotoSans", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.ink);
  doc.text("Statement Summary", 40, summaryStartY);

  autoTable(doc, {
    startY: summaryStartY + 10,
    margin: { left: 40, right: 40 },
    theme: "grid",
    body: [
      ["Total Sales", money(data.money.paidSalesRevenue), "Other Income", money(data.money.otherIncome)],
      ["COGS", money(data.money.cogs), "Total Expenses", money(data.money.expenses)],
      ["Opening Stock", money(st.openingStockValue), "Total Restocks", money(data.money.restockSpending)],
      ["Total Savings", money(data.money.savings), "Total Investments", money(data.money.investments)],
      ["Total Investor Funds", money(data.money.investorFunds), "Stock Value (Cost)", money(data.inventory.closingStockValue)],
      ["Profit", money(data.money.profit), "Available Business Money", money(data.money.availableBusinessMoney)],
      ["Closing Balance", money(st.closingBalance), "", ""],
    ],
    styles: {
      font: "NotoSans",
      fontSize: 9,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      lineColor: COLORS.line,
      lineWidth: 0.3,
      textColor: COLORS.ink,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 120 },
      1: { halign: "right", cellWidth: 110 },
      2: { fontStyle: "bold", cellWidth: 120 },
      3: { halign: "right", cellWidth: 125 },
    },
  });

  const noteY = (((doc as any).lastAutoTable?.finalY ?? summaryStartY + 60) + 16);
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    "Cash movement reflects paid sales, other income, investor funds, savings, investments, and all restocks. Opening Stock is shown separately and does not reduce available business money. Profit uses paid sales revenue minus COGS and operating expenses.",
    40,
    noteY,
    { maxWidth: pageWidth - 80 },
  );

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawHeader();
    drawFooter(page, totalPages);
  }

  return btoa(toBinary(doc.output("arraybuffer") as ArrayBuffer));
}

export function renderStatementEmailHtml(data: StatementData, recipientName?: string | null): string {
  const name = (recipientName || data.business.name || "there").trim();
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#166534;padding:28px 32px;color:#ffffff;">
      <div style="font-size:20px;font-weight:700;">KudiTrack</div>
      <div style="font-size:13px;opacity:.9;margin-top:4px;">Monthly Financial Statement</div>
    </div>
    <div style="padding:28px 32px;color:#111827;font-size:15px;line-height:1.7;">
      <p style="margin:0 0 16px;">Hello ${name},</p>
      <p style="margin:0 0 16px;">Your KudiTrack financial statement for <strong>${data.period.label}</strong> is ready.</p>
      <p style="margin:0 0 16px;">Your financial statement is attached to this email.</p>
      <p style="margin:0 0 16px;">You can also access your financial statements anytime from your KudiTrack account.</p>
      <p style="margin:24px 0 0;">Regards,<br />KudiTrack</p>
    </div>
  </div>
</body></html>`;
}

export function statementFileName(data: StatementData) {
  return `KudiTrack_Financial_Statement_${data.period.label.replace(/\s+/g, "_")}.pdf`;
}

export function statementSubject(data: StatementData) {
  return `Your KudiTrack Financial Statement — ${data.period.label}`;
}
