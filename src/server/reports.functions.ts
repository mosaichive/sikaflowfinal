import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { safeEmbedLogo } from "./embed-logo.server";

const Input = z.object({
  fromISO: z.string(),
  toISO: z.string(),
  rangeLabel: z.string(),
});

export const generateReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { fromISO, toISO, rangeLabel } = data;

    const [{ data: profile }, { data: sales }, { data: items }, { data: expenses }, { data: income }] =
      await Promise.all([
        supabase.from("profiles").select("business_name,email,phone,location,currency").eq("id", userId).maybeSingle(),
        supabase.from("sales").select("id,total,cost_total,discount,amount_paid,payment_method,sale_date,customer_name")
          .eq("user_id", userId).gte("sale_date", fromISO).lte("sale_date", toISO).order("sale_date", { ascending: false }),
        supabase.from("sale_items").select("product_name,quantity,unit_price,unit_cost,sale_id")
          .eq("user_id", userId),
        supabase.from("expenses").select("amount,category,note,expense_date")
          .eq("user_id", userId).gte("expense_date", fromISO).lte("expense_date", toISO),
        supabase.from("other_income").select("amount,source,note,income_date")
          .eq("user_id", userId).gte("income_date", fromISO).lte("income_date", toISO),
      ]);

    const currency = profile?.currency || "GHS";
    const fmt = (n: number) =>
      `${currency} ${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const saleIds = new Set((sales ?? []).map((s) => s.id));
    const rangeItems = (items ?? []).filter((i) => saleIds.has(i.sale_id as string));

    const revenue = (sales ?? []).reduce((s, x) => s + Number(x.total), 0);
    const cost = (sales ?? []).reduce((s, x) => s + Number(x.cost_total), 0);
    const totalDiscount = (sales ?? []).reduce((s, x) => s + Number(x.discount || 0), 0);
    const totalExp = (expenses ?? []).reduce((s, x) => s + Number(x.amount), 0);
    const otherInc = (income ?? []).reduce((s, x) => s + Number(x.amount), 0);
    const grossProfit = revenue - cost;
    const netProfit = grossProfit - totalExp + otherInc;
    const txCount = (sales ?? []).length;
    const avgSale = txCount > 0 ? revenue / txCount : 0;

    // Best sellers
    const productMap = new Map<string, { qty: number; revenue: number; profit: number }>();
    for (const it of rangeItems) {
      const key = String(it.product_name);
      const cur = productMap.get(key) || { qty: 0, revenue: 0, profit: 0 };
      const qty = Number(it.quantity);
      const rev = qty * Number(it.unit_price);
      const prof = qty * (Number(it.unit_price) - Number(it.unit_cost));
      productMap.set(key, { qty: cur.qty + qty, revenue: cur.revenue + rev, profit: cur.profit + prof });
    }
    const bestSellers = [...productMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // Payment method breakdown
    const payMap = new Map<string, number>();
    for (const s of sales ?? []) {
      const k = String(s.payment_method || "cash");
      payMap.set(k, (payMap.get(k) || 0) + Number(s.total));
    }

    // Expense category breakdown
    const expMap = new Map<string, number>();
    for (const e of expenses ?? []) {
      const k = String(e.category || "Other");
      expMap.set(k, (expMap.get(k) || 0) + Number(e.amount));
    }

    // ----- PDF -----
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const primary = rgb(0.07, 0.49, 0.96);
    const ink = rgb(0.13, 0.16, 0.22);
    const muted = rgb(0.45, 0.49, 0.55);
    const line = rgb(0.88, 0.9, 0.94);
    const success = rgb(0.13, 0.66, 0.4);
    const danger = rgb(0.86, 0.25, 0.25);

    let page = pdf.addPage([595, 842]);
    const W = 595;

    const addPage = () => {
      page = pdf.addPage([595, 842]);
      return 800;
    };

    // Header band
    page.drawRectangle({ x: 0, y: 782, width: W, height: 60, color: primary });
    page.drawText(profile?.business_name || "SikaFlow Business", {
      x: 40, y: 805, size: 18, font: bold, color: rgb(1, 1, 1),
    });
    page.drawText("REPORT", { x: 490, y: 805, size: 18, font: bold, color: rgb(1, 1, 1) });

    let y = 760;
    page.drawText(rangeLabel, { x: 40, y, size: 11, font: bold, color: ink }); y -= 14;
    page.drawText(`${new Date(fromISO).toLocaleDateString()} – ${new Date(toISO).toLocaleDateString()}`, { x: 40, y, size: 9, font, color: muted }); y -= 12;
    page.drawText(`Generated ${new Date().toLocaleString()}`, { x: 40, y, size: 9, font, color: muted });

    // KPI cards
    const cardY = 700;
    const drawCard = (x: number, label: string, value: string, color = ink) => {
      page.drawRectangle({ x, y: cardY - 56, width: 120, height: 56, borderColor: line, borderWidth: 0.7, color: rgb(0.99, 0.99, 1) });
      page.drawText(label, { x: x + 10, y: cardY - 18, size: 8, font: bold, color: muted });
      page.drawText(value, { x: x + 10, y: cardY - 40, size: 12, font: bold, color });
    };
    drawCard(40, "REVENUE", fmt(revenue), primary);
    drawCard(170, "COST OF GOODS", fmt(cost));
    drawCard(300, "EXPENSES", fmt(totalExp));
    drawCard(430, "NET PROFIT", fmt(netProfit), netProfit >= 0 ? success : danger);

    // Summary block
    let sy = 620;
    page.drawText("SUMMARY", { x: 40, y: sy, size: 10, font: bold, color: muted }); sy -= 14;
    const sumRow = (l: string, v: string, col = ink) => {
      page.drawText(l, { x: 40, y: sy, size: 10, font, color: muted });
      page.drawText(v, { x: 300, y: sy, size: 10, font: bold, color: col });
      sy -= 14;
    };
    sumRow("Transactions", String(txCount));
    sumRow("Average sale", fmt(avgSale));
    sumRow("Discounts given", fmt(totalDiscount));
    sumRow("Other income", fmt(otherInc));
    sumRow("Gross profit (Revenue − COGS)", fmt(grossProfit), grossProfit >= 0 ? success : danger);
    sumRow("Net profit (Gross − Expenses + Other)", fmt(netProfit), netProfit >= 0 ? success : danger);

    // Best sellers table
    sy -= 10;
    page.drawText("TOP PRODUCTS", { x: 40, y: sy, size: 10, font: bold, color: muted }); sy -= 12;
    page.drawRectangle({ x: 40, y: sy - 4, width: 515, height: 20, color: rgb(0.96, 0.97, 0.99) });
    page.drawText("PRODUCT", { x: 50, y: sy + 3, size: 9, font: bold, color: muted });
    page.drawText("QTY", { x: 320, y: sy + 3, size: 9, font: bold, color: muted });
    page.drawText("REVENUE", { x: 380, y: sy + 3, size: 9, font: bold, color: muted });
    page.drawText("PROFIT", { x: 490, y: sy + 3, size: 9, font: bold, color: muted });
    sy -= 18;
    if (bestSellers.length === 0) {
      page.drawText("No products sold in this period.", { x: 50, y: sy, size: 9, font, color: muted });
      sy -= 14;
    } else {
      for (const b of bestSellers) {
        if (sy < 200) { sy = addPage(); }
        page.drawText(b.name.slice(0, 38), { x: 50, y: sy, size: 9, font, color: ink });
        page.drawText(String(b.qty), { x: 320, y: sy, size: 9, font, color: ink });
        page.drawText(fmt(b.revenue), { x: 380, y: sy, size: 9, font, color: ink });
        page.drawText(fmt(b.profit), { x: 490, y: sy, size: 9, font, color: b.profit >= 0 ? success : danger });
        sy -= 14;
        page.drawLine({ start: { x: 40, y: sy + 6 }, end: { x: 555, y: sy + 6 }, thickness: 0.4, color: line });
      }
    }

    // Payment method breakdown
    sy -= 10;
    if (sy < 160) sy = addPage();
    page.drawText("PAYMENT METHODS", { x: 40, y: sy, size: 10, font: bold, color: muted }); sy -= 14;
    if (payMap.size === 0) {
      page.drawText("—", { x: 40, y: sy, size: 9, font, color: muted }); sy -= 12;
    } else {
      for (const [k, v] of payMap) {
        if (sy < 100) sy = addPage();
        page.drawText(k.replace("_", " "), { x: 40, y: sy, size: 10, font, color: ink });
        page.drawText(fmt(v), { x: 490, y: sy, size: 10, font: bold, color: ink });
        sy -= 14;
      }
    }

    // Expense category breakdown
    sy -= 10;
    if (sy < 140) sy = addPage();
    page.drawText("EXPENSES BY CATEGORY", { x: 40, y: sy, size: 10, font: bold, color: muted }); sy -= 14;
    if (expMap.size === 0) {
      page.drawText("No expenses in this period.", { x: 40, y: sy, size: 9, font, color: muted }); sy -= 12;
    } else {
      for (const [k, v] of expMap) {
        if (sy < 80) sy = addPage();
        page.drawText(k, { x: 40, y: sy, size: 10, font, color: ink });
        page.drawText(fmt(v), { x: 490, y: sy, size: 10, font: bold, color: ink });
        sy -= 14;
      }
    }

    // Footer on every page
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: 40, y: 50 }, end: { x: 555, y: 50 }, thickness: 0.5, color: line });
      p.drawText(`SikaFlow · ${profile?.business_name || ""}`, { x: 40, y: 36, size: 8, font, color: muted });
      p.drawText(`Page ${i + 1} of ${pages.length}`, { x: 500, y: 36, size: 8, font, color: muted });
    });

    const bytes = await pdf.save();
    const safeName = (profile?.business_name || "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return {
      filename: `${safeName}-${rangeLabel.toLowerCase().replace(/\s+/g, "-")}.pdf`,
      base64: Buffer.from(bytes).toString("base64"),
      stats: { revenue, cost, totalExp, otherInc, grossProfit, netProfit, txCount, avgSale, totalDiscount },
    };
  });
