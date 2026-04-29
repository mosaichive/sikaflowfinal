import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCw, RotateCcw, ZoomIn, ZoomOut, Maximize2, Crop as CropIcon } from "lucide-react";
import { getContainedBlob, getCroppedBlob, type Area } from "@/lib/crop-image";

export type CropMode = "circle" | "square" | "logo";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageSrc: string | null;
  mode: CropMode; // circle = avatar, square = generic square crop, logo = contain-fit with padding
  outputSize?: number;
  title?: string;
  onSave: (blob: Blob) => Promise<void> | void;
};

/**
 * Reusable image-adjustment dialog for avatars and business logos.
 * - Circle/square: crop with zoom + rotate, square output.
 * - Logo: fit-to-frame (no crop) with padding slider; preserves transparency.
 */
export function ImageEditorDialog({
  open, onOpenChange, imageSrc, mode, outputSize = 512, title, onSave,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [padding, setPadding] = useState(0.1); // logo only
  const [pixelArea, setPixelArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  // For logo "fit" mode we still allow toggling to a square crop instead.
  const [logoFit, setLogoFit] = useState<"fit" | "crop">("fit");

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixelArea(areaPixels);
  }, []);

  const reset = () => { setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); setPadding(0.1); setLogoFit("fit"); };

  async function save() {
    if (!imageSrc) return;
    setSaving(true);
    try {
      let blob: Blob;
      if (mode === "logo" && logoFit === "fit") {
        blob = await getContainedBlob(imageSrc, rotation, {
          size: outputSize,
          padding,
          background: "#ffffff",
          mime: "image/png",
          quality: 0.95,
        });
      } else {
        if (!pixelArea) { setSaving(false); return; }
        blob = await getCroppedBlob(imageSrc, pixelArea, rotation, {
          size: outputSize,
          mime: mode === "logo" ? "image/png" : "image/jpeg",
          quality: 0.92,
        });
      }
      await onSave(blob);
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const isCircle = mode === "circle";
  const showFitMode = mode === "logo" && logoFit === "fit";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? "Adjust image"}</DialogTitle>
          <DialogDescription>
            {mode === "circle" && "Drag to reposition, zoom and rotate. Square crop will be saved."}
            {mode === "square" && "Drag to reposition, zoom and rotate. Square crop will be saved."}
            {mode === "logo" && "Fit your full logo inside the frame, or switch to crop mode."}
          </DialogDescription>
        </DialogHeader>

        {imageSrc ? (
          <div className="space-y-4">
            {/* Editor area */}
            <div className="relative h-[320px] w-full overflow-hidden rounded-xl border border-border bg-muted/30">
              {showFitMode ? (
                <FitPreview src={imageSrc} rotation={rotation} padding={padding} />
              ) : (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={1}
                  cropShape={isCircle ? "round" : "rect"}
                  showGrid={!isCircle}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={onCropComplete}
                  restrictPosition={false}
                  objectFit="contain"
                />
              )}
            </div>

            {/* Mode toggle for logo */}
            {mode === "logo" && (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={logoFit === "fit" ? "default" : "outline"} onClick={() => setLogoFit("fit")}>
                  <Maximize2 className="mr-1 h-4 w-4" /> Fit (no crop)
                </Button>
                <Button type="button" size="sm" variant={logoFit === "crop" ? "default" : "outline"} onClick={() => setLogoFit("crop")}>
                  <CropIcon className="mr-1 h-4 w-4" /> Crop
                </Button>
              </div>
            )}

            {/* Controls */}
            {!showFitMode && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ZoomOut className="h-4 w-4 text-muted-foreground" />
                  <Slider min={1} max={4} step={0.01} value={[zoom]} onValueChange={([v]) => setZoom(v)} />
                  <ZoomIn className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            )}
            {showFitMode && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Padding around logo</p>
                <Slider min={0} max={0.3} step={0.01} value={[padding]} onValueChange={([v]) => setPadding(v)} />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setRotation((r) => r - 90)}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setRotation((r) => r + 90)}>
                  <RotateCw className="h-4 w-4" />
                </Button>
                <span className="ml-2 self-center text-xs text-muted-foreground">{rotation % 360}°</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button>
            </div>

            {/* Live previews */}
            <div className="grid gap-3 sm:grid-cols-3">
              <PreviewSlot label="App icon" src={imageSrc} mode={mode} shape="rounded" rotation={rotation} padding={padding} fit={showFitMode} pixelArea={pixelArea} zoom={zoom} crop={crop} />
              <PreviewSlot label={isCircle ? "Profile" : "Dashboard"} src={imageSrc} mode={mode} shape={isCircle ? "circle" : "square"} rotation={rotation} padding={padding} fit={showFitMode} pixelArea={pixelArea} zoom={zoom} crop={crop} />
              <PreviewSlot label="Invoice" src={imageSrc} mode={mode} shape="square" rotation={rotation} padding={padding} fit={showFitMode} pixelArea={pixelArea} zoom={zoom} crop={crop} compact />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || !imageSrc || (!showFitMode && !pixelArea)}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* eslint-disable @typescript-eslint/no-unused-vars */
function FitPreview({ src, rotation, padding }: { src: string; rotation: number; padding: number }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[conic-gradient(at_50%_50%,#f3f4f6_0deg_90deg,#e5e7eb_90deg_180deg,#f3f4f6_180deg_270deg,#e5e7eb_270deg_360deg)] bg-[length:20px_20px]">
      <div
        className="aspect-square w-[260px] rounded-2xl border border-border bg-white shadow-sm"
        style={{ padding: `${padding * 100}%` }}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden">
          <img
            src={src}
            alt="logo preview"
            className="max-h-full max-w-full object-contain"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>
      </div>
    </div>
  );
}

function PreviewSlot({
  label, src, shape, rotation, padding, fit,
}: {
  label: string; src: string; mode: CropMode; shape: "circle" | "square" | "rounded";
  rotation: number; padding: number; fit: boolean;
  pixelArea: Area | null; zoom: number; crop: { x: number; y: number }; compact?: boolean;
}) {
  const radius = shape === "circle" ? "rounded-full" : shape === "rounded" ? "rounded-2xl" : "rounded-md";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={`mx-auto flex h-16 w-16 items-center justify-center overflow-hidden ${radius} bg-white border border-border`}>
        {fit ? (
          <div className="flex h-full w-full items-center justify-center" style={{ padding: `${padding * 100}%` }}>
            <img src={src} alt="" className="max-h-full max-w-full object-contain" style={{ transform: `rotate(${rotation}deg)` }} />
          </div>
        ) : (
          <img src={src} alt="" className="h-full w-full object-cover" style={{ transform: `rotate(${rotation}deg)` }} />
        )}
      </div>
    </div>
  );
}
