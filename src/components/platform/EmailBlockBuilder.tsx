import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowDown, ArrowUp, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { EmailBlock, uid } from '@/lib/email-blocks';


const ADD_OPTIONS: Array<{ label: string; make: () => EmailBlock }> = [
  { label: 'Section', make: () => ({ id: uid(), type: 'section_start' }) },
  { label: 'End section', make: () => ({ id: uid(), type: 'section_end' }) },
  { label: 'Hero image', make: () => ({ id: uid(), type: 'hero', imageUrl: '', alt: '', link: '' }) },
  { label: 'Badge', make: () => ({ id: uid(), type: 'badge', text: 'Flash sale' }) },
  { label: 'Heading', make: () => ({ id: uid(), type: 'heading', text: 'Headline' }) },
  { label: 'Paragraph', make: () => ({ id: uid(), type: 'text', text: 'Your text here.' }) },
  { label: 'Button', make: () => ({ id: uid(), type: 'button', label: 'Upgrade now', url: 'https://kuditrack.online' }) },
  { label: 'Feature row', make: () => ({ id: uid(), type: 'feature', imageUrl: '', title: 'Feature title', text: 'Short description.' }) },
  { label: 'Divider', make: () => ({ id: uid(), type: 'divider' }) },
  { label: 'Spacer', make: () => ({ id: uid(), type: 'spacer' }) },
];

export default function EmailBlockBuilder(props: {
  blocks: EmailBlock[];
  onChange: (b: EmailBlock[]) => void;
  media: Array<{ id: string; url: string; name: string; kind: string }>;
}) {
  const { blocks, onChange, media } = props;

  const update = (id: string, patch: Partial<EmailBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)));
  const remove = (id: string) => onChange(blocks.filter((b) => b.id !== id));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...blocks];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const ImagePicker = ({ value, onPick }: { value: string; onPick: (url: string) => void }) => {
    const inputId = `upl-${Math.random().toString(36).slice(2)}`;
    const handleFile = async (file?: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast.error('Please choose an image file');
        return;
      }
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('email-media').upload(path, file, { upsert: false });
      if (error) { toast.error(error.message); return; }
      const { data: signed } = await supabase.storage.from('email-media').createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!signed?.signedUrl) { toast.error('Could not sign URL'); return; }
      const { data: user } = await supabase.auth.getUser();
      await supabase.from('email_media_library').insert({
        name: file.name, url: signed.signedUrl, storage_path: path,
        mime_type: file.type, size_bytes: file.size, kind: 'image',
        created_by: user.user?.id,
      });
      onPick(signed.signedUrl);
      toast.success('Image uploaded');
    };

    return (
      <div className="space-y-2">
        <input id={inputId} type="file" accept="image/*" className="hidden" onChange={(e) => { void handleFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => document.getElementById(inputId)?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1" /> {value ? 'Replace image' : 'Upload image'}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onPick('')}>Remove</Button>
          )}
        </div>
        {value ? (
          <img src={value} alt="Selected" className="h-24 w-auto rounded border object-cover" />
        ) : null}
        {media.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Or pick from library</Label>
            <div className="flex gap-1 flex-wrap">
              {media.filter((m) => m.kind === 'image' || m.url.match(/\.(png|jpe?g|gif|webp)/i)).slice(0, 12).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick(m.url)}
                  className="h-10 w-14 rounded border overflow-hidden"
                  title={m.name}
                >
                  <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {ADD_OPTIONS.map((o) => (
          <Button key={o.label} size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange([...blocks, o.make()])}>
            + {o.label}
          </Button>
        ))}
      </div>

      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">Add blocks to build the email layout.</p>
      )}

      {blocks.map((b, i) => (
        <Card key={b.id} className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {b.type.replace('_', ' ')}
            </span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(b.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>

          {b.type === 'hero' && (
            <div className="space-y-2">
              <ImagePicker value={b.imageUrl} onPick={(url) => update(b.id, { imageUrl: url } as any)} />
              <Input placeholder="Alt text" value={b.alt} onChange={(e) => update(b.id, { alt: e.target.value } as any)} />
              <Input placeholder="Link (optional)" value={b.link} onChange={(e) => update(b.id, { link: e.target.value } as any)} />
            </div>
          )}

          {(b.type === 'badge' || b.type === 'heading') && (
            <Input value={(b as any).text} onChange={(e) => update(b.id, { text: e.target.value } as any)} />
          )}

          {b.type === 'text' && (
            <Textarea rows={3} value={b.text} onChange={(e) => update(b.id, { text: e.target.value } as any)} />
          )}

          {b.type === 'button' && (
            <div className="grid md:grid-cols-2 gap-2">
              <Input placeholder="Label" value={b.label} onChange={(e) => update(b.id, { label: e.target.value } as any)} />
              <Input placeholder="URL" value={b.url} onChange={(e) => update(b.id, { url: e.target.value } as any)} />
            </div>
          )}

          {b.type === 'feature' && (
            <div className="space-y-2">
              <ImagePicker value={b.imageUrl} onPick={(url) => update(b.id, { imageUrl: url } as any)} />
              <Input placeholder="Title" value={b.title} onChange={(e) => update(b.id, { title: e.target.value } as any)} />
              <Textarea rows={3} placeholder="Description" value={b.text} onChange={(e) => update(b.id, { text: e.target.value } as any)} />
            </div>
          )}

          {(b.type === 'divider' || b.type === 'spacer' || b.type === 'section_start' || b.type === 'section_end') && (
            <Label className="text-xs text-muted-foreground">
              {b.type === 'section_start' ? 'Starts a new white card' : b.type === 'section_end' ? 'Closes the current card' : 'No settings'}
            </Label>
          )}
        </Card>
      ))}
    </div>
  );
}
