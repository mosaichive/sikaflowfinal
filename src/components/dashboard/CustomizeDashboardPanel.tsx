import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  WIDGET_MAP,
  sizeLabel,
  type WidgetDef,
  type WidgetLayoutItem,
  type WidgetSize,
} from '@/lib/dashboard-widgets';

export function CustomizeDashboardPanel({
  open,
  onOpenChange,
  layout,
  allowed,
  saving,
  onSave,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: WidgetLayoutItem[];
  allowed: WidgetDef[];
  saving: boolean;
  onSave: (next: WidgetLayoutItem[]) => void;
  onReset: () => void;
}) {
  const allowedIds = new Set(allowed.map((widget) => widget.id));
  const [draft, setDraft] = useState<WidgetLayoutItem[]>(layout);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) setDraft(layout);
  }, [open, layout]);

  const items = draft.filter((item) => allowedIds.has(item.id));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const reordered = [...items];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const hidden = draft.filter((item) => !allowedIds.has(item.id));
    setDraft([...reordered, ...hidden]);
  };

  const update = (id: string, patch: Partial<WidgetLayoutItem>) => {
    setDraft((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const visibleCount = items.filter((item) => item.visible).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b border-border p-5">
          <SheetTitle>Customize dashboard</SheetTitle>
          <SheetDescription>
            Show, hide, resize and reorder your widgets. Changes only apply to your account.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {items.map((item, index) => {
            const def = WIDGET_MAP[item.id];
            if (!def) return null;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnter={() => setOverIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) move(dragIndex, index);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                className={cn(
                  'rounded-[12px] border border-border bg-card p-3 transition-all',
                  dragIndex === index && 'opacity-60 ring-2 ring-[#2C8603]/50',
                  overIndex === index && dragIndex !== null && dragIndex !== index && 'border-[#2C8603]',
                  !item.visible && 'opacity-70',
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-1 cursor-grab text-muted-foreground active:cursor-grabbing" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{def.label}</p>
                    <p className="text-xs text-muted-foreground">{def.description}</p>
                  </div>
                  <Switch
                    checked={item.visible}
                    onCheckedChange={(checked) => update(item.id, { visible: checked })}
                    aria-label={`Show ${def.label}`}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 pl-6">
                  {def.sizes.length > 1 ? (
                    <Select
                      value={String(item.size)}
                      onValueChange={(value) => update(item.id, { size: Number(value) as WidgetSize })}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {def.sizes.map((size) => (
                          <SelectItem key={size} value={String(size)}>{sizeLabel(size)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">{sizeLabel(item.size)}</span>
                  )}

                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move ${def.label} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move ${def.label} down`} disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">{visibleCount} of {items.length} widgets shown</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="gap-2" onClick={onReset} disabled={saving}>
              <RotateCcw className="h-4 w-4" /> Restore default
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button type="button" className="bg-[#2C8603] text-white hover:bg-[#2C8603]/90" onClick={() => onSave(draft)} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
