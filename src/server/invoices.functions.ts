import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { safeEmbedLogo } from "./embed-logo.server";

const Input = z.object({ saleId: z.string().uuid() });

export const generateInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sale, error } = await supabase
      .from("sales")
      .select("id,invoice_number,total,cost_total,discount,amount_paid,payment_method,customer_name,note,sale_date,created_at,user_id")
      .eq("id", data.saleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !sale) throw new Error("Sale not found");

    const { data: items } = await supabase
      .from("sale_items")
      .select("product_name,quantity,unit_price,unit_cost")
      .eq("sale_id", sale.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name,email,phone,location,currency,logo_url")
      .eq("id", userId)
      .maybeSingle();

    const currency = profile?.currency || "GHS";
    const fmt = (n: number) =>
      `${currency} ${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4 portrait
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const primary = rgb(0.07, 0.49, 0.96);
    const ink = rgb(0.13, 0.16, 0.22);
    const muted = rgb(0.45, 0.49, 0.55);
    const line = rgb(0.88, 0.9, 0.94);

    // Header band
    page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: primary });

    // Try to embed the logo at the left of the header
    let textStartX = 40;
    if (profile?.logo_url) {
      try {
        const res = await fetch(profile.logo_url);
        if (res.ok) {
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          const buf = new Uint8Array(await res.arrayBuffer());
          const img = ct.includes("jpeg") || ct.includes("jpg")
            ? await pdf.embedJpg(buf)
            : await pdf.embedPng(buf);
          const targetH = 40;
          const ratio = img.width / img.height;
          const targetW = Math.min(120, targetH * ratio);
          page.drawImage(img, { x: 30, y: 791, width: targetW, height: targetH });
          textStartX = 30 + targetW + 12;
        }
      } catch {
        // ignore — fall back to text-only header
      }
    }

    page.drawText(profile?.business_name || "SikaFlow Business", {
      x: textStartX, y: 805, size: 18, font: bold, color: rgb(1, 1, 1),
    });
    page.drawText("INVOICE", { x: 480, y: 805, size: 18, font: bold, color: rgb(1, 1, 1) });

    // Business meta
    let y = 760;
    if (profile?.email) { page.drawText(profile.email, { x: 40, y, size: 9, font, color: muted }); y -= 12; }
    if (profile?.phone) { page.drawText(profile.phone, { x: 40, y, size: 9, font, color: muted }); y -= 12; }
    if (profile?.location) { page.drawText(profile.location, { x: 40, y, size: 9, font, color: muted }); y -= 12; }

    // Invoice meta box
    page.drawText(`Invoice #`, { x: 400, y: 760, size: 9, font, color: muted });
    page.drawText(sale.invoice_number || sale.id.slice(0, 8), { x: 460, y: 760, size: 10, font: bold, color: ink });
    page.drawText(`Date`, { x: 400, y: 745, size: 9, font, color: muted });
    page.drawText(new Date(sale.sale_date).toLocaleDateString(), { x: 460, y: 745, size: 10, font, color: ink });
    page.drawText(`Payment`, { x: 400, y: 730, size: 9, font, color: muted });
    page.drawText(String(sale.payment_method).replace("_", " "), { x: 460, y: 730, size: 10, font, color: ink });

    // Bill to
    let by = 690;
    page.drawText("BILL TO", { x: 40, y: by, size: 9, font: bold, color: muted });
    by -= 14;
    page.drawText(sale.customer_name || "Walk-in customer", { x: 40, y: by, size: 11, font: bold, color: ink });

    // Table header
    let ty = 640;
    page.drawRectangle({ x: 40, y: ty - 4, width: 515, height: 22, color: rgb(0.96, 0.97, 0.99) });
    page.drawText("ITEM", { x: 50, y: ty + 4, size: 9, font: bold, color: muted });
    page.drawText("QTY", { x: 320, y: ty + 4, size: 9, font: bold, color: muted });
    page.drawText("PRICE", { x: 380, y: ty + 4, size: 9, font: bold, color: muted });
    page.drawText("TOTAL", { x: 490, y: ty + 4, size: 9, font: bold, color: muted });
    ty -= 22;

    for (const it of items ?? []) {
      const lineTotal = Number(it.quantity) * Number(it.unit_price);
      page.drawText(String(it.product_name).slice(0, 40), { x: 50, y: ty + 4, size: 10, font, color: ink });
      page.drawText(String(it.quantity), { x: 320, y: ty + 4, size: 10, font, color: ink });
      page.drawText(fmt(Number(it.unit_price)), { x: 380, y: ty + 4, size: 10, font, color: ink });
      page.drawText(fmt(lineTotal), { x: 490, y: ty + 4, size: 10, font, color: ink });
      ty -= 18;
      page.drawLine({ start: { x: 40, y: ty + 8 }, end: { x: 555, y: ty + 8 }, thickness: 0.5, color: line });
    }

    // Totals box
    const subtotal = (items ?? []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
    const discount = Number(sale.discount || 0);
    const total = Number(sale.total);
    const paid = Number(sale.amount_paid || 0);
    const balance = Math.max(0, total - paid);
    const profit = total - Number(sale.cost_total || 0);

    let by2 = ty - 20;
    const labelX = 380, valueX = 490;
    const row = (label: string, val: string, b = false) => {
      page.drawText(label, { x: labelX, y: by2, size: 10, font: b ? bold : font, color: b ? ink : muted });
      page.drawText(val, { x: valueX, y: by2, size: 10, font: b ? bold : font, color: b ? primary : ink });
      by2 -= 16;
    };
    row("Subtotal", fmt(subtotal));
    if (discount > 0) row("Discount", `- ${fmt(discount)}`);
    row("Total", fmt(total), true);
    row("Amount paid", fmt(paid));
    row("Balance due", fmt(balance), true);

    // Note
    if (sale.note) {
      page.drawText("Note:", { x: 40, y: 120, size: 9, font: bold, color: muted });
      page.drawText(String(sale.note).slice(0, 200), { x: 40, y: 105, size: 9, font, color: ink });
    }

    // Footer
    page.drawLine({ start: { x: 40, y: 70 }, end: { x: 555, y: 70 }, thickness: 0.5, color: line });
    page.drawText("Thank you for your business!", { x: 40, y: 50, size: 9, font: bold, color: primary });
    page.drawText(`Generated by SikaFlow · Profit on this sale: ${fmt(profit)}`, {
      x: 40, y: 36, size: 8, font, color: muted,
    });

    const bytes = await pdf.save();
    return {
      filename: `${sale.invoice_number || "invoice"}.pdf`,
      base64: Buffer.from(bytes).toString("base64"),
    };
  });
