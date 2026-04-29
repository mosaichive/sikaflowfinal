import type { PDFDocument, PDFImage } from "pdf-lib";

/**
 * Safely fetch a logo URL and embed it into a pdf-lib document.
 * Returns null on any failure (network, content-type, decode) so the PDF
 * can still be generated without crashing.
 *
 * Supports PNG, JPG/JPEG. For WEBP/other types, returns null gracefully.
 */
export async function safeEmbedLogo(
  pdf: PDFDocument,
  logoUrl: string | null | undefined,
): Promise<PDFImage | null> {
  if (!logoUrl || typeof logoUrl !== "string") return null;

  try {
    // Only allow http(s) URLs; never feed arbitrary base64 to atob.
    if (!/^https?:\/\//i.test(logoUrl)) {
      console.warn("safeEmbedLogo: skipping non-http logo url");
      return null;
    }

    const res = await fetch(logoUrl);
    if (!res.ok) {
      console.warn(`safeEmbedLogo: HTTP ${res.status} for logo`);
      return null;
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0) return null;

    // Sniff magic bytes — content-type is sometimes wrong.
    const isPng =
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

    try {
      if (isPng || ct.includes("png")) return await pdf.embedPng(buf);
      if (isJpg || ct.includes("jpeg") || ct.includes("jpg")) return await pdf.embedJpg(buf);
    } catch (e) {
      console.warn("safeEmbedLogo: decode failed, skipping logo", e);
      return null;
    }

    // Unsupported format (e.g. webp/svg/gif) — skip silently.
    console.warn(`safeEmbedLogo: unsupported logo content-type "${ct}", skipping`);
    return null;
  } catch (e) {
    console.warn("safeEmbedLogo: unexpected failure, skipping logo", e);
    return null;
  }
}
