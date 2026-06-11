import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import {
  renderSaleDocumentHtml,
  saleDocumentFileName,
  type SaleDocumentRecord,
} from '@/lib/sale-documents';

export type SaleDocumentSize = 'a4' | 'a5' | 'thermal58' | 'thermal80';

export const SALE_DOC_SIZE_LABELS: Record<SaleDocumentSize, string> = {
  a4: 'A4 Document',
  a5: 'A5 Compact Document',
  thermal58: 'Thermal POS Receipt – 58mm',
  thermal80: 'Thermal POS Receipt – 80mm',
};

const SIZE_STORAGE_KEY = 'kuditrack.print.size';

export function getStoredPrintSize(): SaleDocumentSize {
  try {
    const v = localStorage.getItem(SIZE_STORAGE_KEY) as SaleDocumentSize | null;
    if (v && v in SALE_DOC_SIZE_LABELS) return v;
  } catch {}
  return 'a4';
}

export function setStoredPrintSize(size: SaleDocumentSize) {
  try { localStorage.setItem(SIZE_STORAGE_KEY, size); } catch {}
}

type SizeSpec = {
  pageCss: string;
  widthMm: number;
  heightMm?: number; // undefined => auto / continuous
  bodyClass: string;
};

function sizeSpec(size: SaleDocumentSize): SizeSpec {
  switch (size) {
    case 'a4':
      return { pageCss: '@page { size: A4; margin: 12mm; }', widthMm: 210, heightMm: 297, bodyClass: 'size-a4' };
    case 'a5':
      return { pageCss: '@page { size: A5; margin: 8mm; }', widthMm: 148, heightMm: 210, bodyClass: 'size-a5' };
    case 'thermal58':
      return { pageCss: '@page { size: 58mm auto; margin: 0; }', widthMm: 58, heightMm: undefined, bodyClass: 'size-thermal size-thermal-58' };
    case 'thermal80':
      return { pageCss: '@page { size: 80mm auto; margin: 0; }', widthMm: 80, heightMm: undefined, bodyClass: 'size-thermal size-thermal-80' };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderThermalHtml(doc: SaleDocumentRecord, size: SaleDocumentSize) {
  const spec = sizeSpec(size);
  const { snapshot } = doc;
  const date = new Date(snapshot.sale.sale_date).toLocaleString('en-GH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const money = (n: number) => `GHS ${Number(n || 0).toFixed(2)}`;
  const items = snapshot.items.map((it) => `
    <div class="ti">
      <div class="ti-name">${escapeHtml(it.product_name)}</div>
      <div class="ti-row"><span>${it.quantity} × ${money(it.unit_price)}</span><span>${money(it.line_total)}</span></div>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${escapeHtml(doc.document_number)}</title>
<style>
  ${spec.pageCss}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: ${spec.widthMm}mm; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.35; padding: 4mm 3mm; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .lg { font-size: 13px; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .ti { margin-bottom: 4px; }
  .ti-name { font-weight: 700; }
  .ti-row { display: flex; justify-content: space-between; }
  .totals .row { margin: 2px 0; }
  .grand { font-size: 14px; font-weight: 700; }
  .footer { margin-top: 6px; font-size: 10px; }
  @media print {
    html, body { width: ${spec.widthMm}mm; }
  }
</style></head>
<body class="${spec.bodyClass}">
  <div class="center bold lg">${escapeHtml(snapshot.business.name)}</div>
  ${snapshot.business.location ? `<div class="center">${escapeHtml(snapshot.business.location)}</div>` : ''}
  ${snapshot.business.phone ? `<div class="center">${escapeHtml(snapshot.business.phone)}</div>` : ''}
  <div class="sep"></div>
  <div class="center bold">${escapeHtml(doc.kind === 'invoice' ? 'INVOICE' : 'RECEIPT')}</div>
  <div class="row"><span>No.</span><span>${escapeHtml(doc.document_number)}</span></div>
  <div class="row"><span>Date</span><span>${escapeHtml(date)}</span></div>
  <div class="row"><span>Customer</span><span>${escapeHtml(snapshot.customer.name)}</span></div>
  <div class="row"><span>Served by</span><span>${escapeHtml(snapshot.seller.name)}</span></div>
  <div class="sep"></div>
  ${items}
  <div class="sep"></div>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(snapshot.sale.subtotal_ghs)}</span></div>
    ${snapshot.sale.discount_ghs > 0 ? `<div class="row"><span>Discount</span><span>- ${money(snapshot.sale.discount_ghs)}</span></div>` : ''}
    <div class="row grand"><span>TOTAL</span><span>${money(snapshot.sale.amount_ghs)}</span></div>
    <div class="row"><span>Paid</span><span>${money(snapshot.sale.amount_paid_ghs)}</span></div>
    ${snapshot.sale.balance_ghs > 0 ? `<div class="row"><span>Balance</span><span>${money(snapshot.sale.balance_ghs)}</span></div>` : ''}
    ${snapshot.sale.payment_method ? `<div class="row"><span>Method</span><span>${escapeHtml(snapshot.sale.payment_method)}</span></div>` : ''}
  </div>
  <div class="sep"></div>
  <div class="center footer">${escapeHtml(snapshot.sale.notes || 'Thank you for your business!')}</div>
  <div class="center footer">Powered by KudiTrack</div>
</body></html>`;
}

function renderDocumentHtmlForSize(doc: SaleDocumentRecord, size: SaleDocumentSize) {
  if (size === 'thermal58' || size === 'thermal80') {
    return renderThermalHtml(doc, size);
  }
  // A4 / A5 — reuse the full template, inject size-specific @page rule.
  const spec = sizeSpec(size);
  const base = renderSaleDocumentHtml(doc);
  const injected = `<style>${spec.pageCss}
    html, body { background: #fff !important; }
    body { padding: 0 !important; }
    .sheet { box-shadow: none !important; border: 0 !important; max-width: 100% !important; }
    ${size === 'a5' ? `
      .sheet { font-size: 11px; }
      .title { font-size: 28px !important; }
      .brand-name { font-size: 16px !important; }
      .brand-panel, .title-panel, .content, .footer { padding: 12px 16px !important; }
      .items thead th, .items tbody td { padding: 6px 8px !important; font-size: 10px !important; }
      .header { min-height: 0 !important; }
    ` : ''}
  </style>`;
  return base.replace('</head>', `${injected}</head>`);
}

async function withHiddenIframe<T>(html: string, fn: (iframe: HTMLIFrameElement) => Promise<T>): Promise<T> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
    });
    // Wait for images
    const win = iframe.contentWindow;
    if (win) {
      const imgs = Array.from(win.document.images);
      await Promise.all(imgs.map((img) => img.complete
        ? Promise.resolve()
        : new Promise<void>((r) => { img.onload = img.onerror = () => r(); })));
      // small layout settle
      await new Promise((r) => setTimeout(r, 60));
    }
    return await fn(iframe);
  } finally {
    setTimeout(() => iframe.remove(), 500);
  }
}

export async function printSaleDocumentInline(doc: SaleDocumentRecord, size: SaleDocumentSize): Promise<boolean> {
  const html = renderDocumentHtmlForSize(doc, size);
  try {
    return await withHiddenIframe(html, async (iframe) => {
      const win = iframe.contentWindow;
      if (!win) throw new Error('iframe contentWindow unavailable');
      win.focus();
      win.print();
      return true;
    });
  } catch (err) {
    console.error('[print] failed', { size, doc: doc.document_number, err });
    return false;
  }
}

export async function downloadSaleDocumentPdf(doc: SaleDocumentRecord, size: SaleDocumentSize): Promise<void> {
  const spec = sizeSpec(size);
  const html = renderDocumentHtmlForSize(doc, size);
  try {
    await withHiddenIframe(html, async (iframe) => {
      const win = iframe.contentWindow;
      if (!win) throw new Error('iframe contentWindow unavailable');
      // Size the iframe so html2canvas captures full layout
      const pxPerMm = 96 / 25.4;
      const widthPx = Math.round(spec.widthMm * pxPerMm);
      iframe.style.width = `${widthPx}px`;
      iframe.style.height = `${Math.max(spec.heightMm ? spec.heightMm * pxPerMm : 800, win.document.body.scrollHeight)}px`;
      iframe.style.visibility = 'hidden';
      iframe.style.opacity = '0';
      await new Promise((r) => setTimeout(r, 80));

      const target = win.document.body;
      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: widthPx,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const orientation: 'p' | 'l' = 'p';
      const format = spec.heightMm
        ? [spec.widthMm, spec.heightMm]
        : [spec.widthMm, (canvas.height / canvas.width) * spec.widthMm];
      const pdf = new jsPDF({ orientation, unit: 'mm', format });

      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pdfW) / canvas.width;

      if (spec.heightMm) {
        // Paginate for fixed-height pages (A4/A5)
        let remaining = imgH;
        let position = 0;
        let pageIndex = 0;
        while (remaining > 0) {
          if (pageIndex > 0) pdf.addPage(format as [number, number], orientation);
          pdf.addImage(imgData, 'JPEG', 0, position, pdfW, imgH, undefined, 'FAST');
          remaining -= pdfH;
          position -= pdfH;
          pageIndex += 1;
          if (pageIndex > 50) break; // safety
        }
      } else {
        // Continuous (thermal)
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
      }

      const filename = saleDocumentFileName(doc).replace(/\.pdf$/, `-${size}.pdf`);
      pdf.save(filename);
    });
  } catch (err) {
    console.error('[pdf] download failed', { size, doc: doc.document_number, err });
    throw err instanceof Error ? err : new Error('PDF generation failed');
  }
}
