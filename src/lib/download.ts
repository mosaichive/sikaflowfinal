/** Trigger a base64-encoded PDF download in the browser, robust to padding/whitespace. */
export function downloadBase64Pdf(base64: string, filename: string) {
  try {
    const bytes = base64ToBytes(base64);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    console.error("PDF download failed:", e);
    throw new Error("Could not download PDF. Please try again.");
  }
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
