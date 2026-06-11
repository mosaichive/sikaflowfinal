import { useEffect, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  SALE_DOC_SIZE_LABELS,
  downloadSaleDocumentPdf,
  getStoredPrintSize,
  printSaleDocumentInline,
  setStoredPrintSize,
  type SaleDocumentSize,
} from '@/lib/sale-document-print';
import type { SaleDocumentRecord } from '@/lib/sale-documents';

const SIZE_DESCRIPTIONS: Record<SaleDocumentSize, string> = {
  a4: 'Standard full-page invoice',
  a5: 'Compact half-page invoice',
  thermal58: 'Narrow POS receipt (58mm)',
  thermal80: 'Wider POS receipt (80mm)',
};

export function PrintOptionsDialog({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: SaleDocumentRecord | null;
}) {
  const { toast } = useToast();
  const [size, setSize] = useState<SaleDocumentSize>('a4');
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);

  useEffect(() => {
    if (open) setSize(getStoredPrintSize());
  }, [open]);

  if (!document) return null;

  const persist = (next: SaleDocumentSize) => {
    setSize(next);
    setStoredPrintSize(next);
  };

  const handlePrint = async () => {
    if (!document) return;
    setBusy('print');
    try {
      const ok = await printSaleDocumentInline(document, size);
      if (!ok) {
        toast({
          title: 'Print preview unavailable',
          description: 'Unable to open print preview. You can download the document as PDF instead.',
          variant: 'destructive',
        });
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      console.error('[print] dialog error', err);
      toast({
        title: 'Print preview unavailable',
        description: 'Unable to open print preview. You can download the document as PDF instead.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (!document) return;
    setBusy('pdf');
    try {
      await downloadSaleDocumentPdf(document, size);
      onOpenChange(false);
    } catch (err: any) {
      console.error('[pdf] dialog error', err);
      toast({
        title: 'Could not generate PDF',
        description: err?.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print / Download Options</DialogTitle>
          <DialogDescription>
            Choose a paper size, then print directly or download as PDF.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={size}
          onValueChange={(v) => persist(v as SaleDocumentSize)}
          className="gap-2"
        >
          {(Object.keys(SALE_DOC_SIZE_LABELS) as SaleDocumentSize[]).map((key) => (
            <Label
              key={key}
              htmlFor={`size-${key}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/50"
            >
              <RadioGroupItem id={`size-${key}`} value={key} className="mt-1" />
              <div className="flex-1">
                <div className="text-sm font-medium">{SALE_DOC_SIZE_LABELS[key]}</div>
                <div className="text-xs text-muted-foreground">{SIZE_DESCRIPTIONS[key]}</div>
              </div>
            </Label>
          ))}
        </RadioGroup>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDownload()}
            disabled={busy !== null}
          >
            {busy === 'pdf' ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            Download PDF
          </Button>
          <Button
            type="button"
            onClick={() => void handlePrint()}
            disabled={busy !== null}
          >
            {busy === 'print' ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="mr-1.5 h-3.5 w-3.5" />
            )}
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
