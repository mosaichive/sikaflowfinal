import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Star, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { toast } from '@/hooks/use-toast';
import type { Survey, SurveyQuestion } from '@/lib/survey';
import { SKIP_DAYS, sessionShownKey } from '@/lib/survey';

type AnswerValue = string | string[] | number | null;

export function SurveyModal() {
  const { user, displayName } = useAuth();
  const { business, businessId } = useBusiness();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: surveys } = await supabase
        .from('surveys')
        .select('*')
        .eq('enabled', true)
        .limit(1);
      const active = (surveys?.[0] ?? null) as Survey | null;
      if (!active || cancelled) return;

      // Once per session
      if (sessionStorage.getItem(sessionShownKey(active.id))) return;

      // Check user status
      const { data: statusRow } = await supabase
        .from('survey_user_status')
        .select('status, skipped_at, submitted_at')
        .eq('survey_id', active.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (statusRow?.status === 'completed' || statusRow?.submitted_at) return;
      if (statusRow?.status === 'skipped' && statusRow.skipped_at) {
        const skippedAt = new Date(statusRow.skipped_at).getTime();
        const ageMs = Date.now() - skippedAt;
        if (ageMs < SKIP_DAYS * 24 * 60 * 60 * 1000) return;
      }

      const { data: qs } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', active.id)
        .order('position', { ascending: true });

      if (cancelled) return;
      setSurvey(active);
      setQuestions((qs ?? []) as any);
      setOpen(true);
      sessionStorage.setItem(sessionShownKey(active.id), '1');

      // Record shown
      await supabase.from('survey_user_status').upsert(
        {
          survey_id: active.id,
          user_id: user.id,
          status: statusRow?.status ?? 'shown',
          shown_at: new Date().toISOString(),
        },
        { onConflict: 'survey_id,user_id' },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const ratingQuestion = useMemo(() => questions.find((q) => q.type === 'rating'), [questions]);

  async function handleSkip() {
    if (!survey || !user) return;
    await supabase.from('survey_user_status').upsert(
      {
        survey_id: survey.id,
        user_id: user.id,
        status: 'skipped',
        skipped_at: new Date().toISOString(),
      },
      { onConflict: 'survey_id,user_id' },
    );
    setOpen(false);
  }

  async function handleSubmit() {
    if (!survey || !user) return;
    // Validate required
    for (const q of questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        toast({ title: 'Please answer all required questions', description: q.label, variant: 'destructive' });
        return;
      }
    }
    setSubmitting(true);
    try {
      const rating = ratingQuestion ? (answers[ratingQuestion.id] as number | null) ?? null : null;
      const { data: resp, error: respErr } = await supabase
        .from('survey_responses')
        .insert({
          survey_id: survey.id,
          user_id: user.id,
          business_id: businessId ?? null,
          name: displayName ?? null,
          email: user.email ?? null,
          phone: (user as any)?.phone ?? null,
          rating,
        })
        .select('id')
        .single();
      if (respErr) throw respErr;

      const rows = questions.map((q) => ({
        response_id: resp!.id,
        question_id: q.id,
        answer: { value: answers[q.id] ?? null },
      }));
      if (rows.length) {
        const { error: ansErr } = await supabase.from('survey_response_answers').insert(rows);
        if (ansErr) throw ansErr;
      }

      await supabase.from('survey_user_status').upsert(
        {
          survey_id: survey.id,
          user_id: user.id,
          status: 'completed',
          submitted_at: new Date().toISOString(),
        },
        { onConflict: 'survey_id,user_id' },
      );

      setDone(true);
    } catch (err: any) {
      toast({ title: 'Could not submit', description: err?.message ?? 'Try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !survey) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !done) return; setOpen(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {done ? (
          <div className="py-8 text-center space-y-3">
            <div className="text-3xl">🎉</div>
            <h3 className="text-lg font-semibold">Thank you!</h3>
            <p className="text-sm text-muted-foreground">Your feedback helps us improve KudiTrack.</p>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{survey.title}</DialogTitle>
              {survey.description && <DialogDescription>{survey.description}</DialogDescription>}
            </DialogHeader>
            <div className="space-y-5 py-2">
              {questions.map((q) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                />
              ))}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" onClick={handleSkip} disabled={submitting}>Skip for Now</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Survey
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">
        {question.label}
        {question.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {question.type === 'rating' && (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = typeof value === 'number' && value >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className="p-1 transition-transform hover:scale-110"
                aria-label={`Rate ${n}`}
              >
                <Star className={`h-7 w-7 ${active ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
              </button>
            );
          })}
        </div>
      )}
      {question.type === 'multiple_choice' && (
        <RadioGroup value={(value as string) ?? ''} onValueChange={(v) => onChange(v)}>
          {question.options.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`${question.id}_${opt}`} />
              <Label htmlFor={`${question.id}_${opt}`} className="font-normal cursor-pointer">{opt}</Label>
            </div>
          ))}
        </RadioGroup>
      )}
      {question.type === 'checkbox' && (
        <div className="space-y-2">
          {question.options.map((opt) => {
            const arr = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt);
            return (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  id={`${question.id}_${opt}`}
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c ? [...arr, opt] : arr.filter((x) => x !== opt);
                    onChange(next);
                  }}
                />
                <Label htmlFor={`${question.id}_${opt}`} className="font-normal cursor-pointer">{opt}</Label>
              </div>
            );
          })}
        </div>
      )}
      {question.type === 'short_text' && (
        <Input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={200} />
      )}
      {question.type === 'long_text' && (
        <Textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={2000} rows={4} />
      )}
    </div>
  );
}
