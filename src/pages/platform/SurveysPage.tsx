import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, Plus, Eye, MessageSquare, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
const db = supabase as any;
import { toast } from '@/hooks/use-toast';
import type { Survey, SurveyQuestion, SurveyQuestionType } from '@/lib/survey';

type DraftQuestion = Omit<SurveyQuestion, 'id' | 'survey_id'> & { id?: string; _new?: boolean; _deleted?: boolean };

const TYPE_LABELS: Record<SurveyQuestionType, string> = {
  rating: 'Rating (1–5 stars)',
  multiple_choice: 'Multiple Choice',
  checkbox: 'Checkboxes',
  short_text: 'Short Text',
  long_text: 'Long Text',
};

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Survey | null>(null);
  const [previewing, setPreviewing] = useState<Survey | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await db.from('surveys').select('*').order('created_at', { ascending: false });
    setSurveys((data ?? []) as Survey[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  async function createSurvey() {
    const { data, error } = await supabase
      .from('surveys')
      .insert({ title: 'Untitled Survey', description: '', enabled: false })
      .select('*')
      .single();
    if (error) return toast({ title: 'Failed to create', description: error.message, variant: 'destructive' });
    await load();
    setEditing(data as Survey);
  }

  async function toggleEnabled(s: Survey, value: boolean) {
    if (value) {
      // Disable others first (only one enabled at a time)
      await db.from('surveys').update({ enabled: false }).neq('id', s.id).eq('enabled', true);
    }
    const { error } = await db.from('surveys').update({ enabled: value }).eq('id', s.id);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    await load();
  }

  async function deleteSurvey(s: Survey) {
    if (!confirm(`Delete "${s.title}"? Responses will also be removed.`)) return;
    const { error } = await db.from('surveys').delete().eq('id', s.id);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Customer Experience Surveys</h1>
          <p className="text-sm text-muted-foreground">Only one survey can be active at a time.</p>
        </div>
        <Button onClick={createSurvey}><Plus className="h-4 w-4 mr-2" /> New Survey</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : surveys.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No surveys yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {surveys.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    {s.title}
                    {s.enabled && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">Active</span>}
                  </CardTitle>
                  {s.description && <CardDescription className="line-clamp-2">{s.description}</CardDescription>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-2 mr-2">
                    <Switch checked={s.enabled} onCheckedChange={(v) => toggleEnabled(s, v)} />
                    <span className="text-xs text-muted-foreground">Enabled</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setPreviewing(s)}><Eye className="h-4 w-4 mr-1" /> Preview</Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(s)}>Edit</Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/super-admin/survey-responses?survey=${s.id}`}><MessageSquare className="h-4 w-4 mr-1" /> Responses</Link>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteSurvey(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <SurveyEditorDialog
          survey={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}

      {previewing && (
        <SurveyPreviewDialog survey={previewing} onClose={() => setPreviewing(null)} />
      )}
    </div>
  );
}

function SurveyEditorDialog({ survey, onClose, onSaved }: { survey: Survey; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(survey.title);
  const [description, setDescription] = useState(survey.description ?? '');
  const [thankYouMessage, setThankYouMessage] = useState(survey.thank_you_message ?? '');
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', survey.id)
        .order('position', { ascending: true });
      setQuestions((data ?? []) as any);
    })();
  }, [survey.id]);

  function addQuestion() {
    setQuestions((q) => [
      ...q,
      { type: 'short_text', label: '', options: [], required: false, position: q.length, _new: true } as DraftQuestion,
    ]);
  }
  function updateQ(idx: number, patch: Partial<DraftQuestion>) {
    setQuestions((q) => q.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeQ(idx: number) {
    setQuestions((q) => {
      const item = q[idx];
      if (item._new) return q.filter((_, i) => i !== idx);
      return q.map((it, i) => (i === idx ? { ...it, _deleted: true } : it));
    });
  }
  function move(idx: number, dir: -1 | 1) {
    setQuestions((q) => {
      const next = [...q];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return q;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((it, i) => ({ ...it, position: i }));
    });
  }

  async function save() {
    setSaving(true);
    try {
      const { error: sErr } = await db
        .from('surveys')
        .update({ title, description, thank_you_message: thankYouMessage.trim() ? thankYouMessage : null })
        .eq('id', survey.id);
      if (sErr) throw sErr;

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q._deleted && q.id) {
          await db.from('survey_questions').delete().eq('id', q.id);
          continue;
        }
        if (q._deleted) continue;
        const payload = {
          survey_id: survey.id,
          type: q.type,
          label: q.label,
          options: q.options ?? [],
          required: q.required,
          position: i,
        };
        if (q.id) {
          await db.from('survey_questions').update(payload).eq('id', q.id);
        } else {
          await db.from('survey_questions').insert(payload);
        }
      }
      toast({ title: 'Saved' });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const visibleQuestions = questions.filter((q) => !q._deleted);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Survey</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Thank You Message</Label>
            <Textarea
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value.slice(0, 1000))}
              rows={4}
              maxLength={1000}
              placeholder={'🎉 Thank You!\n\nWe sincerely appreciate your feedback. Your responses help us improve KudiTrack and build a better experience for your business.'}
            />
            <p className="text-xs text-muted-foreground">
              Shown after a user submits the survey. Leave empty to use the default message. {thankYouMessage.length}/1000
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Questions</h3>
            <Button size="sm" variant="outline" onClick={addQuestion}><Plus className="h-4 w-4 mr-1" /> Add Question</Button>
          </div>

          <div className="space-y-3">
            {visibleQuestions.map((q, idx) => {
              const realIdx = questions.indexOf(q);
              return (
                <Card key={q.id ?? `new-${realIdx}`}>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex gap-2 items-start">
                      <div className="flex flex-col gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(realIdx, -1)}><ArrowUp className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(realIdx, 1)}><ArrowDown className="h-3 w-3" /></Button>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <Select value={q.type} onValueChange={(v) => updateQ(realIdx, { type: v as SurveyQuestionType })}>
                            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(TYPE_LABELS).map(([k, l]) => (
                                <SelectItem key={k} value={k}>{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2 ml-auto">
                            <Checkbox
                              id={`req-${realIdx}`}
                              checked={q.required}
                              onCheckedChange={(c) => updateQ(realIdx, { required: !!c })}
                            />
                            <Label htmlFor={`req-${realIdx}`} className="text-xs font-normal">Required</Label>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => removeQ(realIdx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                        <Input placeholder="Question label" value={q.label} onChange={(e) => updateQ(realIdx, { label: e.target.value })} />
                        {(q.type === 'multiple_choice' || q.type === 'checkbox') && (
                          <Textarea
                            placeholder="Options, one per line"
                            rows={3}
                            value={(q.options ?? []).join('\n')}
                            onChange={(e) => updateQ(realIdx, { options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                          />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {visibleQuestions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No questions yet — click "Add Question".</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SurveyPreviewDialog({ survey, onClose }: { survey: Survey; onClose: () => void }) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', survey.id)
        .order('position', { ascending: true });
      setQuestions((data ?? []) as any);
    })();
  }, [survey.id]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{survey.title}</DialogTitle>
          {survey.description && <p className="text-sm text-muted-foreground">{survey.description}</p>}
        </DialogHeader>
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="space-y-1">
              <p className="text-sm font-medium">{q.label} {q.required && <span className="text-destructive">*</span>}</p>
              <p className="text-xs text-muted-foreground">Type: {TYPE_LABELS[q.type]}</p>
              {(q.type === 'multiple_choice' || q.type === 'checkbox') && (
                <ul className="text-xs text-muted-foreground list-disc pl-5">
                  {q.options.map((o) => <li key={o}>{o}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
