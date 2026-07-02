import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Survey, SurveyQuestion } from '@/lib/survey';

interface ResponseRow {
  id: string;
  survey_id: string;
  user_id: string;
  business_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  rating: number | null;
  submitted_at: string;
}

interface AnswerRow {
  id: string;
  response_id: string;
  question_id: string;
  answer: { value: any };
}

export default function SurveyResponsesPage() {
  const [params, setParams] = useSearchParams();
  const surveyId = params.get('survey') ?? '';
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [statusCounts, setStatusCounts] = useState({ completed: 0, skipped: 0, shown: 0 });
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [viewing, setViewing] = useState<ResponseRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('surveys').select('*').order('created_at', { ascending: false });
      const list = (data ?? []) as Survey[];
      setSurveys(list);
      if (!surveyId && list[0]) setParams({ survey: list[0].id }, { replace: true });
    })();
  }, []);

  useEffect(() => {
    if (!surveyId) return;
    (async () => {
      const [{ data: qs }, { data: resps }, { data: statuses }] = await Promise.all([
        supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('position'),
        supabase.from('survey_responses').select('*').eq('survey_id', surveyId).order('submitted_at', { ascending: false }),
        supabase.from('survey_user_status').select('status').eq('survey_id', surveyId),
      ]);
      setQuestions((qs ?? []) as any);
      setResponses((resps ?? []) as any);
      const respIds = ((resps ?? []) as ResponseRow[]).map((r) => r.id);
      if (respIds.length) {
        const { data: ans } = await supabase.from('survey_response_answers').select('*').in('response_id', respIds);
        setAnswers((ans ?? []) as any);
      } else {
        setAnswers([]);
      }
      const counts = { completed: 0, skipped: 0, shown: 0 };
      ((statuses ?? []) as { status: string }[]).forEach((s) => {
        if (s.status in counts) (counts as any)[s.status]++;
      });
      setStatusCounts(counts);
    })();
  }, [surveyId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();
    return responses.filter((r) => {
      if (term && !`${r.name} ${r.email} ${r.phone}`.toLowerCase().includes(term)) return false;
      if (ratingFilter !== 'all' && String(r.rating ?? '') !== ratingFilter) return false;
      if (dateFilter !== 'all') {
        const t = new Date(r.submitted_at).getTime();
        const days = dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : 0;
        if (days && now - t > days * 86400000) return false;
      }
      return true;
    });
  }, [responses, search, ratingFilter, dateFilter]);

  const avgRating = useMemo(() => {
    const rated = responses.filter((r) => typeof r.rating === 'number');
    if (!rated.length) return 0;
    return rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length;
  }, [responses]);

  const totalShown = statusCounts.completed + statusCounts.skipped + statusCounts.shown;
  const completionRate = totalShown ? (statusCounts.completed / totalShown) * 100 : 0;

  function exportCsv() {
    const cols = ['Name', 'Email', 'Phone', 'Rating', 'Submitted At', ...questions.map((q) => q.label)];
    const rows = filtered.map((r) => {
      const map = new Map(answers.filter((a) => a.response_id === r.id).map((a) => [a.question_id, a.answer?.value]));
      return [
        r.name ?? '',
        r.email ?? '',
        r.phone ?? '',
        r.rating ?? '',
        r.submitted_at,
        ...questions.map((q) => {
          const v = map.get(q.id);
          return Array.isArray(v) ? v.join('; ') : v ?? '';
        }),
      ];
    });
    const csv = [cols, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-responses-${surveyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Survey Responses</h1>
          <p className="text-sm text-muted-foreground">Review, filter and export customer experience feedback.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={surveyId} onValueChange={(v) => setParams({ survey: v })}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select survey" /></SelectTrigger>
            <SelectContent>
              {surveys.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Total Responses" value={responses.length} />
        <Metric label="Average Rating" value={avgRating ? avgRating.toFixed(2) : '—'} />
        <Metric label="Completion Rate" value={`${completionRate.toFixed(0)}%`} />
        <Metric label="Skipped" value={statusCounts.skipped} />
        <Metric label="Pending" value={statusCounts.shown} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, email, phone" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Rating" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ratings</SelectItem>
              {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} Star{n > 1 ? 's' : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Date" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name ?? '—'}</TableCell>
                  <TableCell>{r.email ?? '—'}</TableCell>
                  <TableCell>{r.phone ?? '—'}</TableCell>
                  <TableCell>{r.rating ?? '—'}</TableCell>
                  <TableCell>{new Date(r.submitted_at).toLocaleString()}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => setViewing(r)}>View</Button></TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No responses.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {viewing && (
        <Dialog open onOpenChange={(v) => !v && setViewing(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Response Details</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Name:</span> {viewing.name ?? '—'}</p>
              <p><span className="text-muted-foreground">Email:</span> {viewing.email ?? '—'}</p>
              <p><span className="text-muted-foreground">Phone:</span> {viewing.phone ?? '—'}</p>
              <p><span className="text-muted-foreground">Rating:</span> {viewing.rating ?? '—'}</p>
              <p><span className="text-muted-foreground">Submitted:</span> {new Date(viewing.submitted_at).toLocaleString()}</p>
              <div className="pt-3 border-t space-y-3">
                {questions.map((q) => {
                  const a = answers.find((x) => x.response_id === viewing.id && x.question_id === q.id);
                  const v = a?.answer?.value;
                  return (
                    <div key={q.id}>
                      <p className="text-xs text-muted-foreground">{q.label}</p>
                      <p className="text-sm">{Array.isArray(v) ? v.join(', ') : v ?? '—'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
