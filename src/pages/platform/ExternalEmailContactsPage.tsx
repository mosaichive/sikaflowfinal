import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { normalizeEmailAddress, parseContactFile } from '@/lib/bulk-sms';
import { logPlatformAction } from '@/lib/platform-audit';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, FileUp, ListPlus, Loader2, Mail, Pencil, Plus, Trash2 } from 'lucide-react';

type ContactList = { id: string; name: string; description: string | null; created_at: string };
type EmailContact = {
  id: string;
  list_id: string;
  business_name: string | null;
  contact_name: string | null;
  email_address: string;
  normalized_email_address: string;
  city: string | null;
  region: string | null;
  category: string | null;
  notes: string | null;
  email_opt_out: boolean;
  created_at: string;
};

const PAGE_SIZE = 50;
const emptyContact = (): Partial<EmailContact> => ({
  business_name: '', contact_name: '', email_address: '', city: '', region: '', category: '', notes: '', email_opt_out: false,
});

export default function ExternalEmailContactsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [listDialog, setListDialog] = useState(false);
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [contactDialog, setContactDialog] = useState(false);
  const [contactEditor, setContactEditor] = useState<Partial<EmailContact>>(emptyContact());
  const [busy, setBusy] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    const { data, error } = await supabase.from('external_email_contact_lists').select('*').order('name');
    if (error) return toast({ title: 'Could not load email lists', description: error.message, variant: 'destructive' });
    const next = (data ?? []) as ContactList[];
    setLists(next);
    setSelectedListId((current) => current && next.some((list) => list.id === current) ? current : next[0]?.id ?? '');
  }, [toast]);

  const loadContacts = useCallback(async () => {
    if (!selectedListId) {
      setContacts([]);
      setContactCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase.from('external_email_contacts').select('*', { count: 'exact' }).eq('list_id', selectedListId);
    const cleanSearch = search.trim().replace(/[%_,()]/g, '');
    if (cleanSearch) {
      query = query.or(`contact_name.ilike.%${cleanSearch}%,business_name.ilike.%${cleanSearch}%,normalized_email_address.ilike.%${cleanSearch}%`);
    }
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) toast({ title: 'Could not load email contacts', description: error.message, variant: 'destructive' });
    else {
      setContacts((data ?? []) as EmailContact[]);
      setContactCount(count ?? 0);
    }
    setLoading(false);
  }, [page, search, selectedListId, toast]);

  useEffect(() => { void loadLists(); }, [loadLists]);
  useEffect(() => { void loadContacts(); }, [loadContacts]);
  useEffect(() => { setPage(0); }, [selectedListId, search]);
  useEffect(() => {
    const routeState = location.state as { selectedListId?: string } | null;
    if (!routeState?.selectedListId) return;
    setSelectedListId(routeState.selectedListId);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const selectedList = lists.find((list) => list.id === selectedListId);

  async function currentUserId() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error('Your session has expired. Sign in again.');
    return data.user.id;
  }

  async function createList() {
    if (!listName.trim()) return;
    setBusy('list');
    try {
      const userId = await currentUserId();
      const { data, error } = await supabase.from('external_email_contact_lists').insert({
        name: listName.trim(), description: listDescription.trim() || null, created_by: userId,
      }).select('id').single();
      if (error) throw error;
      await logPlatformAction('external_email_contact_list_created', { list_id: data.id, name: listName.trim() });
      setListDialog(false);
      setListName(''); setListDescription('');
      await loadLists();
      setSelectedListId(data.id);
    } catch (error) {
      toast({ title: 'Could not create email list', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally { setBusy(null); }
  }

  async function saveContact() {
    const normalizedEmail = normalizeEmailAddress(contactEditor.email_address);
    if (!selectedListId || !normalizedEmail) return toast({ title: 'Enter a valid email address', variant: 'destructive' });
    setBusy('contact');
    try {
      const userId = await currentUserId();
      const payload = {
        list_id: selectedListId,
        business_name: contactEditor.business_name?.trim() || null,
        contact_name: contactEditor.contact_name?.trim() || null,
        email_address: contactEditor.email_address!.trim(),
        normalized_email_address: normalizedEmail,
        city: contactEditor.city?.trim() || null,
        region: contactEditor.region?.trim() || null,
        category: contactEditor.category?.trim() || null,
        notes: contactEditor.notes?.trim() || null,
        email_opt_out: Boolean(contactEditor.email_opt_out),
        created_by: userId,
      };
      const result = contactEditor.id
        ? await supabase.from('external_email_contacts').update(payload).eq('id', contactEditor.id)
        : await supabase.from('external_email_contacts').insert(payload);
      if (result.error) throw result.error;
      await logPlatformAction(contactEditor.id ? 'external_email_contact_updated' : 'external_email_contact_added', {
        list_id: selectedListId, contact_id: contactEditor.id ?? null,
      });
      setContactDialog(false);
      setContactEditor(emptyContact());
      await loadContacts();
    } catch (error: any) {
      toast({
        title: 'Could not save email contact',
        description: error?.code === '23505' ? 'That email address is already in this list.' : error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally { setBusy(null); }
  }

  async function removeContact(contact: EmailContact) {
    if (!window.confirm(`Remove ${contact.contact_name || contact.normalized_email_address} from this email list?`)) return;
    const { error } = await supabase.from('external_email_contacts').delete().eq('id', contact.id);
    if (error) return toast({ title: 'Could not remove email contact', description: error.message, variant: 'destructive' });
    await logPlatformAction('external_email_contact_removed', { list_id: contact.list_id, contact_id: contact.id });
    await loadContacts();
  }

  async function toggleOptOut(contact: EmailContact, checked: boolean) {
    const { error } = await supabase.from('external_email_contacts').update({ email_opt_out: checked }).eq('id', contact.id);
    if (error) return toast({ title: 'Could not update email contact', description: error.message, variant: 'destructive' });
    await logPlatformAction(checked ? 'external_email_contact_suppressed' : 'external_email_contact_unsuppressed', { contact_id: contact.id });
    setContacts((current) => current.map((row) => row.id === contact.id ? { ...row, email_opt_out: checked } : row));
  }

  async function readImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('read');
    try {
      const rows = await parseContactFile(file);
      if (rows.length > 10000) throw new Error('A single import is limited to 10,000 parsed rows.');
      navigate('/super-admin/external-contacts', {
        state: {
          importRows: rows,
          importFile: file.name,
          importEmailTargetId: selectedListId || undefined,
          returnToEmailContacts: true,
        },
      });
    } catch (error) {
      toast({ title: 'Could not read contact file', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally { setBusy(null); }
  }

  async function deleteList() {
    if (!selectedList || !window.confirm(`Delete ${selectedList.name} and its external email contacts?`)) return;
    const { error } = await supabase.from('external_email_contact_lists').delete().eq('id', selectedList.id);
    if (error) return toast({ title: 'Could not delete email list', description: error.message, variant: 'destructive' });
    await logPlatformAction('external_email_contact_list_deleted', { list_id: selectedList.id, name: selectedList.name });
    setSelectedListId('');
    await loadLists();
  }

  return <div className="space-y-6 max-w-7xl">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Mail className="h-6 w-6" /> External Email Contacts</h1><p className="text-sm text-muted-foreground">Prospect email lists remain separate from registered KudiTrack users.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setListDialog(true)}><ListPlus className="mr-2 h-4 w-4" /> New list</Button>
        <label><Button variant="outline" asChild disabled={busy === 'read'}><span><FileUp className="mr-2 h-4 w-4" /> Import CSV / Excel</span></Button><input type="file" accept=".csv,.xlsx" className="sr-only" disabled={busy === 'read'} onChange={readImport} /></label>
        <Button disabled={!selectedListId} onClick={() => { setContactEditor(emptyContact()); setContactDialog(true); }}><Plus className="mr-2 h-4 w-4" /> Add email contact</Button>
      </div>
    </div>

    <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <Select value={selectedListId} onValueChange={setSelectedListId}><SelectTrigger className="sm:w-80"><SelectValue placeholder="Select an email list" /></SelectTrigger><SelectContent>{lists.map((list) => <SelectItem value={list.id} key={list.id}>{list.name}</SelectItem>)}</SelectContent></Select>
      <Input className="sm:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, business, or email" disabled={!selectedListId} />
      <div className="sm:ml-auto flex items-center gap-2"><Badge variant="outline">{contactCount.toLocaleString()} emails</Badge>{selectedList && <Button size="icon" variant="ghost" className="text-destructive" title="Delete list" onClick={() => void deleteList()}><Trash2 className="h-4 w-4" /></Button>}</div>
    </CardContent></Card>

    <div className="overflow-hidden rounded-md border border-border">
      <Table><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Business</TableHead><TableHead>Email</TableHead><TableHead>Location</TableHead><TableHead>Do Not Email</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{loading ? <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : contacts.length === 0 ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{selectedListId ? 'No email contacts in this list.' : 'Create or import an email list to begin.'}</TableCell></TableRow> : contacts.map((contact) => <TableRow key={contact.id}>
          <TableCell className="font-medium">{contact.contact_name || '—'}</TableCell><TableCell>{contact.business_name || '—'}</TableCell><TableCell className="text-sm">{contact.normalized_email_address}</TableCell><TableCell>{[contact.city, contact.region].filter(Boolean).join(', ') || '—'}</TableCell>
          <TableCell><Switch checked={contact.email_opt_out} onCheckedChange={(checked) => void toggleOptOut(contact, checked)} aria-label={`Do not email ${contact.contact_name || contact.normalized_email_address}`} /></TableCell>
          <TableCell className="text-right"><Button size="icon" variant="ghost" title="Edit email contact" onClick={() => { setContactEditor(contact); setContactDialog(true); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" title="Remove email contact" onClick={() => void removeContact(contact)}><Trash2 className="h-4 w-4" /></Button></TableCell>
        </TableRow>)}</TableBody></Table>
    </div>
    <div className="flex items-center justify-end gap-2"><Button size="icon" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground">Page {page + 1}</span><Button size="icon" variant="outline" disabled={(page + 1) * PAGE_SIZE >= contactCount} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div>

    <Dialog open={listDialog} onOpenChange={setListDialog}><DialogContent><DialogHeader><DialogTitle>Create external email list</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Name</Label><Input value={listName} onChange={(event) => setListName(event.target.value)} maxLength={120} placeholder="Accra Retailers" /></div><div className="space-y-2"><Label>Description</Label><Textarea value={listDescription} onChange={(event) => setListDescription(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setListDialog(false)}>Cancel</Button><Button onClick={createList} disabled={busy === 'list' || !listName.trim()}>Create list</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={contactDialog} onOpenChange={setContactDialog}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{contactEditor.id ? 'Edit email contact' : 'Add email contact'}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Contact name" value={contactEditor.contact_name ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, contact_name: value }))} />
      <Field label="Business name" value={contactEditor.business_name ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, business_name: value }))} />
      <Field label="Email" type="email" value={contactEditor.email_address ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, email_address: value }))} required />
      <Field label="Category" value={contactEditor.category ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, category: value }))} />
      <Field label="City" value={contactEditor.city ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, city: value }))} />
      <Field label="Region" value={contactEditor.region ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, region: value }))} />
      <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea value={contactEditor.notes ?? ''} onChange={(event) => setContactEditor((current) => ({ ...current, notes: event.target.value }))} /></div>
      <label className="flex items-center gap-3 text-sm sm:col-span-2"><Switch checked={Boolean(contactEditor.email_opt_out)} onCheckedChange={(checked) => setContactEditor((current) => ({ ...current, email_opt_out: checked }))} /> Do Not Email</label>
    </div><DialogFooter><Button variant="outline" onClick={() => setContactDialog(false)}>Cancel</Button><Button onClick={saveContact} disabled={busy === 'contact'}>Save email contact</Button></DialogFooter></DialogContent></Dialog>

  </div>;
}

function Field({ label, value, onChange, required, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <div className="space-y-2"><Label>{label}{required ? ' *' : ''}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
