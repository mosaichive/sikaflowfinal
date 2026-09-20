import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
import { analyzeRecipients, normalizeSmsPhone, parseContactFile, smsCountryCode, SmsContactInput } from '@/lib/bulk-sms';
import { logPlatformAction } from '@/lib/platform-audit';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, FileUp, ListPlus, Loader2, Pencil, PhoneCall, Plus, Trash2, Upload } from 'lucide-react';

type ContactList = { id: string; name: string; description: string | null; created_at: string };
type Contact = {
  id: string;
  list_id: string;
  business_name: string | null;
  contact_name: string | null;
  phone_number: string;
  normalized_phone_number: string;
  city: string | null;
  region: string | null;
  category: string | null;
  notes: string | null;
  sms_opt_out: boolean;
  created_at: string;
};

const PAGE_SIZE = 50;

const emptyContact = (): Partial<Contact> => ({
  business_name: '', contact_name: '', phone_number: '', city: '', region: '', category: '', notes: '', sms_opt_out: false,
});

export default function ExternalContactsPage() {
  const { toast } = useToast();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [listDialog, setListDialog] = useState(false);
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [contactDialog, setContactDialog] = useState(false);
  const [contactEditor, setContactEditor] = useState<Partial<Contact>>(emptyContact());
  const [importRows, setImportRows] = useState<SmsContactInput[]>([]);
  const [importFile, setImportFile] = useState('');
  const [importDialog, setImportDialog] = useState(false);
  const [deleteListOpen, setDeleteListOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadLists = useCallback(async () => {
    const { data, error } = await supabase.from('external_contact_lists').select('*').order('name');
    if (error) return toast({ title: 'Could not load contact lists', description: error.message, variant: 'destructive' });
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
    let query = supabase.from('external_contacts').select('*', { count: 'exact' }).eq('list_id', selectedListId);
    if (search.trim()) query = query.ilike('contact_name', `%${search.trim().replace(/[%_]/g, '')}%`);
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) toast({ title: 'Could not load contacts', description: error.message, variant: 'destructive' });
    else {
      setContacts((data ?? []) as Contact[]);
      setContactCount(count ?? 0);
    }
    setLoading(false);
  }, [page, search, selectedListId, toast]);

  useEffect(() => { void loadLists(); }, [loadLists]);
  useEffect(() => { void loadContacts(); }, [loadContacts]);
  useEffect(() => { setPage(0); }, [selectedListId, search]);

  const selectedList = lists.find((list) => list.id === selectedListId);
  const importAnalysis = useMemo(() => analyzeRecipients(importRows), [importRows]);
  const importStats = useMemo(() => ({
    total: importAnalysis.length,
    valid: importAnalysis.filter((row) => row.validity === 'valid').length,
    invalid: importAnalysis.filter((row) => row.validity === 'invalid').length,
    duplicates: importAnalysis.filter((row) => row.validity === 'duplicate').length,
  }), [importAnalysis]);

  async function createList() {
    if (!listName.trim()) return;
    setBusy('list');
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('external_contact_lists').insert({
      name: listName.trim(), description: listDescription.trim() || null, created_by: userData.user!.id,
    }).select('id').single();
    setBusy(null);
    if (error) return toast({ title: 'Could not create list', description: error.message, variant: 'destructive' });
    await logPlatformAction('external_contact_list_created', { list_id: data.id, name: listName.trim() });
    setListDialog(false);
    setListName(''); setListDescription('');
    await loadLists();
    setSelectedListId(data.id);
  }

  async function saveContact() {
    const normalized = normalizeSmsPhone(contactEditor.phone_number);
    if (!selectedListId || !normalized) return toast({ title: 'Enter a valid phone number', variant: 'destructive' });
    setBusy('contact');
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      list_id: selectedListId,
      business_name: contactEditor.business_name?.trim() || null,
      contact_name: contactEditor.contact_name?.trim() || null,
      phone_number: contactEditor.phone_number!.trim(),
      normalized_phone_number: normalized,
      country_code: smsCountryCode(normalized),
      city: contactEditor.city?.trim() || null,
      region: contactEditor.region?.trim() || null,
      category: contactEditor.category?.trim() || null,
      notes: contactEditor.notes?.trim() || null,
      sms_opt_out: Boolean(contactEditor.sms_opt_out),
      created_by: userData.user!.id,
    };
    const result = contactEditor.id
      ? await supabase.from('external_contacts').update(payload).eq('id', contactEditor.id)
      : await supabase.from('external_contacts').insert(payload);
    setBusy(null);
    if (result.error) return toast({ title: 'Could not save contact', description: result.error.code === '23505' ? 'That number is already in this list.' : result.error.message, variant: 'destructive' });
    await logPlatformAction(contactEditor.id ? 'external_contact_updated' : 'external_contact_added', { list_id: selectedListId, contact_id: contactEditor.id ?? null });
    setContactDialog(false);
    setContactEditor(emptyContact());
    await loadContacts();
  }

  async function removeContact(contact: Contact) {
    if (!window.confirm(`Remove ${contact.contact_name || contact.normalized_phone_number} from this list?`)) return;
    const { error } = await supabase.from('external_contacts').delete().eq('id', contact.id);
    if (error) return toast({ title: 'Could not remove contact', description: error.message, variant: 'destructive' });
    await logPlatformAction('external_contact_removed', { list_id: contact.list_id, contact_id: contact.id });
    await loadContacts();
  }

  async function toggleOptOut(contact: Contact, checked: boolean) {
    const { error } = await supabase.from('external_contacts').update({ sms_opt_out: checked }).eq('id', contact.id);
    if (error) return toast({ title: 'Could not update contact', description: error.message, variant: 'destructive' });
    await logPlatformAction(checked ? 'external_contact_suppressed' : 'external_contact_unsuppressed', { contact_id: contact.id });
    setContacts((current) => current.map((row) => row.id === contact.id ? { ...row, sms_opt_out: checked } : row));
  }

  async function readImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('read');
    try {
      const rows = await parseContactFile(file);
      if (rows.length > 10000) throw new Error('A single import is limited to 10,000 rows.');
      setImportRows(rows);
      setImportFile(file.name);
      setImportDialog(true);
    } catch (error) {
      toast({ title: 'Could not read contact file', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally { setBusy(null); }
  }

  async function importContacts() {
    if (!selectedListId) return;
    const valid = importAnalysis.filter((row) => row.validity === 'valid' && row.normalized);
    if (!valid.length) return toast({ title: 'No valid contacts to import', variant: 'destructive' });
    setBusy('import');
    const { data: userData } = await supabase.auth.getUser();
    try {
      const rows = valid.map((row) => ({
        list_id: selectedListId,
        business_name: row.businessName?.trim() || null,
        contact_name: row.contactName?.trim() || null,
        phone_number: row.phone.trim(),
        normalized_phone_number: row.normalized!,
        country_code: smsCountryCode(row.normalized!),
        city: row.city?.trim() || null,
        region: row.region?.trim() || null,
        category: row.category?.trim() || null,
        notes: row.notes?.trim() || null,
        source: 'import',
        created_by: userData.user!.id,
      }));
      for (let index = 0; index < rows.length; index += 500) {
        const { error } = await supabase.from('external_contacts').upsert(rows.slice(index, index + 500), { onConflict: 'list_id,normalized_phone_number' });
        if (error) throw error;
      }
      await logPlatformAction('external_contacts_imported', { list_id: selectedListId, imported: rows.length, invalid: importStats.invalid, duplicates: importStats.duplicates });
      toast({ title: 'Contacts imported', description: `${rows.length.toLocaleString()} valid contacts were added or updated.` });
      setImportDialog(false); setImportRows([]); setImportFile('');
      await loadContacts();
    } catch (error) {
      toast({ title: 'Import failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally { setBusy(null); }
  }

  async function deleteList() {
    if (!selectedList) return;
    const { error } = await supabase.from('external_contact_lists').delete().eq('id', selectedList.id);
    if (error) return toast({ title: 'Could not delete list', description: error.message, variant: 'destructive' });
    await logPlatformAction('external_contact_list_deleted', { list_id: selectedList.id, name: selectedList.name });
    setDeleteListOpen(false);
    setSelectedListId('');
    await loadLists();
  }

  return <div className="space-y-6 max-w-7xl">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><PhoneCall className="h-6 w-6" /> External Contacts</h1><p className="text-sm text-muted-foreground">Prospect lists remain separate from registered KudiTrack users.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setListDialog(true)}><ListPlus className="mr-2 h-4 w-4" /> New list</Button>
        <label><Button variant="outline" asChild disabled={!selectedListId || busy === 'read'}><span><FileUp className="mr-2 h-4 w-4" /> Import contacts</span></Button><input type="file" accept=".csv,.xlsx" className="sr-only" disabled={!selectedListId} onChange={readImport} /></label>
        <Button disabled={!selectedListId} onClick={() => { setContactEditor(emptyContact()); setContactDialog(true); }}><Plus className="mr-2 h-4 w-4" /> Add contact</Button>
      </div>
    </div>

    <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <Select value={selectedListId} onValueChange={setSelectedListId}><SelectTrigger className="sm:w-80"><SelectValue placeholder="Select a contact list" /></SelectTrigger><SelectContent>{lists.map((list) => <SelectItem value={list.id} key={list.id}>{list.name}</SelectItem>)}</SelectContent></Select>
      <Input className="sm:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contact name" disabled={!selectedListId} />
      <div className="sm:ml-auto flex items-center gap-2"><Badge variant="outline">{contactCount.toLocaleString()} contacts</Badge>{selectedList && <Button size="icon" variant="ghost" className="text-destructive" title="Delete list" onClick={() => setDeleteListOpen(true)}><Trash2 className="h-4 w-4" /></Button>}</div>
    </CardContent></Card>

    <div className="overflow-hidden rounded-md border border-border">
      <Table><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Business</TableHead><TableHead>Phone</TableHead><TableHead>Location</TableHead><TableHead>Do Not SMS</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{loading ? <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : contacts.length === 0 ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{selectedListId ? 'No contacts in this list.' : 'Create a contact list to begin.'}</TableCell></TableRow> : contacts.map((contact) => <TableRow key={contact.id}>
          <TableCell className="font-medium">{contact.contact_name || '—'}</TableCell><TableCell>{contact.business_name || '—'}</TableCell><TableCell className="font-mono text-xs">{contact.normalized_phone_number}</TableCell><TableCell>{[contact.city, contact.region].filter(Boolean).join(', ') || '—'}</TableCell>
          <TableCell><Switch checked={contact.sms_opt_out} onCheckedChange={(checked) => void toggleOptOut(contact, checked)} aria-label={`Do not SMS ${contact.contact_name || contact.normalized_phone_number}`} /></TableCell>
          <TableCell className="text-right"><Button size="icon" variant="ghost" title="Edit contact" onClick={() => { setContactEditor(contact); setContactDialog(true); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" title="Remove contact" onClick={() => void removeContact(contact)}><Trash2 className="h-4 w-4" /></Button></TableCell>
        </TableRow>)}</TableBody></Table>
    </div>
    <div className="flex items-center justify-end gap-2"><Button size="icon" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground">Page {page + 1}</span><Button size="icon" variant="outline" disabled={(page + 1) * PAGE_SIZE >= contactCount} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div>

    <Dialog open={listDialog} onOpenChange={setListDialog}><DialogContent><DialogHeader><DialogTitle>Create contact list</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Name</Label><Input value={listName} onChange={(event) => setListName(event.target.value)} maxLength={120} placeholder="Accra Retailers" /></div><div className="space-y-2"><Label>Description</Label><Textarea value={listDescription} onChange={(event) => setListDescription(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setListDialog(false)}>Cancel</Button><Button onClick={createList} disabled={busy === 'list' || !listName.trim()}>Create list</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={contactDialog} onOpenChange={setContactDialog}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{contactEditor.id ? 'Edit contact' : 'Add contact'}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Contact name" value={contactEditor.contact_name ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, contact_name: value }))} />
      <Field label="Business name" value={contactEditor.business_name ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, business_name: value }))} />
      <Field label="Phone" value={contactEditor.phone_number ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, phone_number: value }))} required />
      <Field label="Category" value={contactEditor.category ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, category: value }))} />
      <Field label="City" value={contactEditor.city ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, city: value }))} />
      <Field label="Region" value={contactEditor.region ?? ''} onChange={(value) => setContactEditor((current) => ({ ...current, region: value }))} />
      <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea value={contactEditor.notes ?? ''} onChange={(event) => setContactEditor((current) => ({ ...current, notes: event.target.value }))} /></div>
      <label className="flex items-center gap-3 text-sm sm:col-span-2"><Switch checked={Boolean(contactEditor.sms_opt_out)} onCheckedChange={(checked) => setContactEditor((current) => ({ ...current, sms_opt_out: checked }))} /> Do Not SMS</label>
    </div><DialogFooter><Button variant="outline" onClick={() => setContactDialog(false)}>Cancel</Button><Button onClick={saveContact} disabled={busy === 'contact'}>Save contact</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={importDialog} onOpenChange={setImportDialog}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Import preview</DialogTitle></DialogHeader><p className="text-sm font-medium flex items-center gap-2"><Upload className="h-4 w-4" /> {importFile}</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniStat label="Total rows" value={importStats.total} /><MiniStat label="Valid" value={importStats.valid} /><MiniStat label="Invalid" value={importStats.invalid} /><MiniStat label="Duplicates" value={importStats.duplicates} /></div><DialogFooter><Button variant="outline" onClick={() => setImportDialog(false)}>Cancel</Button><Button onClick={importContacts} disabled={busy === 'import' || !importStats.valid}>{busy === 'import' ? 'Importing…' : `Import ${importStats.valid.toLocaleString()} contacts`}</Button></DialogFooter></DialogContent></Dialog>

    <AlertDialog open={deleteListOpen} onOpenChange={setDeleteListOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {selectedList?.name}?</AlertDialogTitle><AlertDialogDescription>This removes the list and its external contacts. Campaign history remains intact.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={deleteList}>Delete list</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="space-y-2"><Label>{label}{required ? ' *' : ''}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value.toLocaleString()}</p></div>;
}
