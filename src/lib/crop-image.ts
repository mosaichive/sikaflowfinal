// Utilities for canvas-based cropping/rotation/contain export.
// Outputs PNG (preserves transparency for logos) or JPEG (smaller for photos).

export type Area = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Crop a region of the source image (after rotation) into a square output canvas.
 * Used for circular avatars and square app/profile previews.
 */
export async function getCroppedBlob(
  src: string,
  pixelArea: Area,
  rotation = 0,
  output: { size?: number; mime?: "image/png" | "image/jpeg"; quality?: number } = {},
): Promise<Blob> {
  const { size = 512, mime = "image/jpeg", quality = 0.92 } = output;
  const image = await loadImage(src);

  // First, rotate the source into an intermediate canvas so we can crop in image coordinates.
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxW = image.width * cos + image.height * sin;
  const bBoxH = image.width * sin + image.height * cos;

  const rotated = document.createElement("canvas");
  rotated.width = bBoxW;
  rotated.height = bBoxH;
  const rctx = rotated.getContext("2d")!;
  rctx.translate(bBoxW / 2, bBoxH / 2);
  rctx.rotate(rad);
  rctx.drawImage(image, -image.width / 2, -image.height / 2);

  // Now crop the requested area from the rotated canvas onto the square output.
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d")!;
  // Solid white background for JPEG (no transparency).
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    rotated,
    pixelArea.x,
    pixelArea.y,
    pixelArea.width,
    pixelArea.height,
    0,
    0,
    size,
    size,
  );

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), mime, quality);
  });
}

/**
 * Fit an entire image into a square canvas (no cropping) with optional padding.
 * Best for business logos that aren't square — keeps full mark intact.
 */
export async function getContainedBlob(
  src: string,
  rotation = 0,
  options: { size?: number; padding?: number; background?: string; mime?: "image/png" | "image/jpeg"; quality?: number } = {},
): Promise<Blob> {
  const {
    size = 512,
    padding = 0.08,
    background = "#ffffff",
    mime = "image/png",
    quality = 0.95,
  } = options;
  const image = await loadImage(src);
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d")!;

  if (mime === "image/jpeg" || background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }

  const rad = (rotation * Math.PI) / 180;
  const safe = size * (1 - padding * 2);
  // Scale to fit inside `safe` square after rotation.
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxW = image.width * cos + image.height * sin;
  const bBoxH = image.width * sin + image.height * cos;
  const scale = Math.min(safe / bBoxW, safe / bBoxH);

  ctx.translate(size / 2, size / 2);
  ctx.rotate(rad);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), mime, quality);
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
