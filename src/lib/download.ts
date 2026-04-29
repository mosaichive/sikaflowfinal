/**
 * Robust PDF download helper.
 * - Tolerates both `{ base64, filename }` and `{ result: { base64, filename } }` shapes.
 * - Falls back to a sane filename if the server didn't provide one.
 * - Validates payload before creating a blob; throws a friendly error otherwise.
 */

export type PdfPayload = {
  base64?: string | null;
  filename?: string | null;
  // Some server-fn responses are wrapped
  result?: { base64?: string | null; filename?: string | null } | null;
};

export function downloadPdfFromServerResult(
  res: PdfPayload | null | undefined,
  fallbackFilename: string,
) {
  const inner = res?.result ?? res ?? null;
  const base64 = inner?.base64 ?? null;
  const rawName = inner?.filename ?? null;
  const filename = sanitizeFilename(rawName, fallbackFilename);

  // Debug — helpful when users report bad downloads
  console.log("[pdf] download", {
    hasResult: !!res?.result,
    base64Length: base64 ? base64.length : 0,
    filename,
  });

  if (!base64 || typeof base64 !== "string" || base64.length < 100) {
    throw new Error("Failed to generate PDF. Please try again.");
  }

  return downloadBase64Pdf(base64, filename);
}

/** Trigger a base64-encoded PDF download in the browser, robust to padding/whitespace. */
export function downloadBase64Pdf(base64: string, filename: string) {
  if (!base64 || typeof base64 !== "string") {
    throw new Error("Failed to generate PDF. Please try again.");
  }
  const safeName = sanitizeFilename(filename, defaultPdfName("Document"));

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch (e) {
    console.error("[pdf] base64 decode failed:", e);
    throw new Error("Failed to generate PDF. Please try again.");
  }

  if (!bytes.length) throw new Error("Failed to generate PDF. Please try again.");

  // Validate PDF magic header: %PDF
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    console.error("[pdf] invalid PDF header bytes:", bytes.slice(0, 8));
    throw new Error("Failed to generate PDF. Please try again.");
  }

  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

/** Build a Blob URL for previewing without triggering a download. Caller must revoke. */
export function pdfBlobUrl(base64: string): string {
  const bytes = base64ToBytes(base64);
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    throw new Error("Invalid PDF data");
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

function sanitizeFilename(name: string | null | undefined, fallback: string): string {
  const candidate =
    typeof name === "string" && name.trim() && name.toLowerCase() !== "undefined"
      ? name.trim()
      : fallback;
  // Ensure .pdf suffix and remove unsafe characters
  const cleaned = candidate.replace(/[/\\?%*:|"<>]+/g, "-");
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

export function defaultPdfName(prefix: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${date}.pdf`;
}

function base64ToBytes(input: string): Uint8Array {
  let s = (input || "").trim();
  // Strip data URL prefix if present
  if (s.startsWith("data:")) {
    const i = s.indexOf(",");
    if (i >= 0) s = s.slice(i + 1);
  }
  // Remove whitespace/newlines
  s = s.replace(/\s+/g, "");
  // Convert URL-safe base64 to standard
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  // Pad
  const pad = s.length % 4;
  if (pad === 2) s += "==";
  else if (pad === 3) s += "=";
  else if (pad === 1) throw new Error("Invalid base64 length");

  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
