import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Star, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_REVIEW_MEDIA_ADJUSTMENT,
  getReviewMediaStyle,
  normalizeReviewMediaAdjustment,
  type ReviewMediaFit,
} from '@/lib/review-media';

type ReviewRow = {
  id: string;
  customer_name: string;
  business_name: string | null;
  testimonial: string;
  rating: number;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  media_fit?: ReviewMediaFit | null;
  media_position_x?: number | null;
  media_position_y?: number | null;
  media_zoom?: number | null;
  avatar_url: string | null;
  visible: boolean;
  sort_order: number;
};

type Draft = Omit<ReviewRow, 'id'> & { id?: string };

const BUCKET = 'platform-ads';
const MAX_SIZE = 50 * 1024 * 1024;

function empty(order: number): Draft {
  return {
    customer_name: '', business_name: '', testimonial: '', rating: 5,
    media_url: null,
    media_type: null,
    ...DEFAULT_REVIEW_MEDIA_ADJUSTMENT,
    avatar_url: null,
    visible: true,
    sort_order: order,
  };
}

function MediaAdjustmentSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const displayValue = step < 1 ? value.toFixed(2) : Math.round(value);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs font-medium text-foreground">{displayValue}{suffix}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
    </div>
  );
}

export default function PlatformReviewsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty(0));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('marketing_reviews')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    setRows((data as ReviewRow[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const startNew = () => { setDraft(empty(rows.length)); setOpen(true); };
  const startEdit = (r: ReviewRow) => {
    setDraft({ ...r, ...normalizeReviewMediaAdjustment(r) });
    setOpen(true);
  };

  const onUpload = async (file: File) => {
    if (file.size > MAX_SIZE) return toast({ title: 'File too large (max 50MB)', variant: 'destructive' });
    const kind: 'image' | 'video' = file.type.startsWith('video') ? 'video' : 'image';
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg');
      const path = `reviews/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setDraft((d) => ({ ...d, media_url: pub.publicUrl, media_type: kind, ...DEFAULT_REVIEW_MEDIA_ADJUSTMENT }));
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const onUploadAvatar = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) return toast({ title: 'Avatar too large (max 4MB)', variant: 'destructive' });
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `reviews/avatars/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setDraft((d) => ({ ...d, avatar_url: pub.publicUrl }));
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!draft.customer_name.trim()) return toast({ title: 'Customer name required', variant: 'destructive' });
    setSaving(true);
    const payload: any = {
      customer_name: draft.customer_name.trim(),
      business_name: draft.business_name?.trim() || null,
      testimonial: draft.testimonial.trim(),
      rating: draft.rating,
      media_url: draft.media_url,
      media_type: draft.media_type,
      ...normalizeReviewMediaAdjustment(draft),
      avatar_url: draft.avatar_url,
      visible: draft.visible,
      sort_order: draft.sort_order,
    };
    const q = draft.id
      ? (supabase as any).from('marketing_reviews').update(payload).eq('id', draft.id)
      : (supabase as any).from('marketing_reviews').insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    setOpen(false);
    toast({ title: draft.id ? 'Review updated' : 'Review added' });
    void load();
  };

  const remove = async (r: ReviewRow) => {
    if (!confirm(`Delete review from ${r.customer_name}?`)) return;
    const { error } = await (supabase as any).from('marketing_reviews').delete().eq('id', r.id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Deleted' });
    void load();
  };

  const toggleVisible = async (r: ReviewRow) => {
    await (supabase as any).from('marketing_reviews').update({ visible: !r.visible }).eq('id', r.id);
    void load();
  };

  const move = async (r: ReviewRow, dir: -1 | 1) => {
    const idx = rows.findIndex((x) => x.id === r.id);
    const swap = rows[idx + dir];
    if (!swap) return;
    await (supabase as any).from('marketing_reviews').update({ sort_order: swap.sort_order }).eq('id', r.id);
    await (supabase as any).from('marketing_reviews').update({ sort_order: r.sort_order }).eq('id', swap.id);
    void load();
  };

  const mediaAdjustment = normalizeReviewMediaAdjustment(draft);
  const setMediaAdjustment = (patch: Partial<ReturnType<typeof normalizeReviewMediaAdjustment>>) => {
    setDraft((current) => ({ ...current, ...normalizeReviewMediaAdjustment({ ...current, ...patch }) }));
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Homepage Reviews</h1>
          <p className="text-sm text-muted-foreground">Manage testimonials shown on the public homepage.</p>
        </div>
        <Button onClick={startNew}><Plus className="h-4 w-4 mr-2" /> New Review</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All Reviews ({rows.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <div className="h-14 w-14 rounded-lg overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
                {r.media_type === 'video' && r.media_url ? (
                  <video src={r.media_url} className="h-full w-full" style={getReviewMediaStyle(r)} muted />
                ) : r.media_url ? (
                  <img src={r.media_url} alt="" className="h-full w-full" style={getReviewMediaStyle(r)} />
                ) : (
                  <span className="text-xs text-muted-foreground">No media</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm truncate">{r.customer_name}</p>
                  <Badge variant={r.visible ? 'default' : 'secondary'}>{r.visible ? 'Visible' : 'Hidden'}</Badge>
                  <div className="flex gap-0.5">
                    {Array.from({ length: r.rating }).map((_, k) => <Star key={k} className="h-3 w-3 fill-amber-400 text-amber-400" />)}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate">{r.business_name}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{r.testimonial}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => move(r, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => move(r, 1)} disabled={i === rows.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                <Switch checked={r.visible} onCheckedChange={() => toggleVisible(r)} />
                <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.id ? 'Edit review' : 'New review'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Customer name</Label>
                <Input value={draft.customer_name} onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })} />
              </div>
              <div>
                <Label>Business name</Label>
                <Input value={draft.business_name || ''} onChange={(e) => setDraft({ ...draft, business_name: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Testimonial</Label>
              <Textarea rows={4} value={draft.testimonial} onChange={(e) => setDraft({ ...draft, testimonial: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rating</Label>
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setDraft({ ...draft, rating: n })}>
                      <Star className={`h-5 w-5 ${n <= draft.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                  <Label>Visible</Label>
                  <Switch checked={draft.visible} onCheckedChange={(v) => setDraft({ ...draft, visible: v })} />
                </div>
                <div className="flex-1">
                  <Label>Order</Label>
                  <Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })} />
                </div>
              </div>
            </div>

            <div>
              <Label>Media (image or video)</Label>
              {draft.media_url && (
                <div className="mt-2 h-48 rounded-lg overflow-hidden bg-secondary">
                  {draft.media_type === 'video'
                    ? <video src={draft.media_url} className="h-full w-full transition-transform duration-200" style={getReviewMediaStyle(mediaAdjustment)} muted autoPlay loop playsInline />
                    : <img src={draft.media_url} alt="" className="h-full w-full transition-transform duration-200" style={getReviewMediaStyle(mediaAdjustment)} />}
                </div>
              )}
              <label className="mt-2 flex items-center gap-2 cursor-pointer">
                <Button variant="outline" size="sm" disabled={uploading} asChild>
                  <span><Upload className="h-4 w-4 mr-2" />{uploading ? 'Uploading…' : draft.media_url ? 'Replace media' : 'Upload media'}</span>
                </Button>
                <input
                  type="file" accept="image/*,video/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ''; }}
                />
                {draft.media_url && (
                  <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, media_url: null, media_type: null, ...DEFAULT_REVIEW_MEDIA_ADJUSTMENT })}>Remove</Button>
                )}
              </label>
              {draft.media_url && (
                <div className="mt-3 rounded-xl border border-border bg-secondary/20 p-3 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Media adjustment</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft((current) => ({ ...current, ...DEFAULT_REVIEW_MEDIA_ADJUSTMENT }))}
                    >
                      Reset
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cover', 'contain'] as ReviewMediaFit[]).map((fit) => (
                      <Button
                        key={fit}
                        type="button"
                        variant={mediaAdjustment.media_fit === fit ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMediaAdjustment({ media_fit: fit })}
                        className="capitalize"
                      >
                        {fit}
                      </Button>
                    ))}
                  </div>
                  <MediaAdjustmentSlider
                    label="Horizontal focus"
                    value={mediaAdjustment.media_position_x}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(value) => setMediaAdjustment({ media_position_x: value })}
                  />
                  <MediaAdjustmentSlider
                    label="Vertical focus"
                    value={mediaAdjustment.media_position_y}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(value) => setMediaAdjustment({ media_position_y: value })}
                  />
                  <MediaAdjustmentSlider
                    label="Zoom"
                    value={mediaAdjustment.media_zoom}
                    min={1}
                    max={3}
                    step={0.05}
                    suffix="x"
                    onChange={(value) => setMediaAdjustment({ media_zoom: value })}
                  />
                </div>
              )}
            </div>

            <div>
              <Label>Customer avatar (optional)</Label>
              <div className="flex items-center gap-3 mt-2">
                {draft.avatar_url && <img src={draft.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />}
                <label>
                  <Button variant="outline" size="sm" disabled={uploading} asChild>
                    <span><Upload className="h-4 w-4 mr-2" />{draft.avatar_url ? 'Replace' : 'Upload'}</span>
                  </Button>
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadAvatar(f); e.target.value = ''; }}
                  />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save review'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
