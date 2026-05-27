import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_SUPPORT_SETTINGS,
  formatSupportPhone,
  getWhatsappHref,
  normalizeSupportSettings,
  type SupportSettings,
} from '@/lib/support';
import { X, Mail, Phone, MessageCircle, MapPin, Copy, Check, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactModal({ open, onOpenChange }: ContactModalProps) {
  const [settings, setSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('platform_support_settings' as any)
        .select('*')
        .eq('singleton_key', 'default')
        .maybeSingle();
      setSettings(data ? normalizeSupportSettings(data) : DEFAULT_SUPPORT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      void loadSettings();
    }
  }, [open, loadSettings]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('contact-modal-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_support_settings' }, () => {
        void loadSettings();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, loadSettings]);

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const contacts = useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      value: string;
      raw: string;
      href: string;
      icon: typeof Mail;
      actionLabel: string;
      actionType: 'call' | 'whatsapp' | 'email' | 'copy' | 'none';
    }> = [];

    if (settings.show_email && settings.support_email) {
      items.push({
        key: 'email',
        label: 'Support Email',
        value: settings.support_email,
        raw: settings.support_email,
        href: `mailto:${settings.support_email}`,
        icon: Mail,
        actionLabel: 'Send email',
        actionType: 'email',
      });
    }

    if (settings.show_phone && settings.phone_number) {
      const formatted = formatSupportPhone(settings.phone_number);
      items.push({
        key: 'phone',
        label: 'Phone Number',
        value: formatted || settings.phone_number,
        raw: settings.phone_number,
        href: `tel:${settings.phone_number}`,
        icon: Phone,
        actionLabel: 'Call now',
        actionType: 'call',
      });
    }

    if (settings.show_whatsapp && (settings.whatsapp_number || settings.whatsapp_link)) {
      const href = getWhatsappHref(settings);
      const formatted = formatSupportPhone(settings.whatsapp_number);
      items.push({
        key: 'whatsapp',
        label: 'WhatsApp',
        value: formatted || 'Chat on WhatsApp',
        raw: settings.whatsapp_number,
        href,
        icon: MessageCircle,
        actionLabel: 'Open chat',
        actionType: 'whatsapp',
      });
    }

    if (settings.show_office_address && settings.office_address) {
      items.push({
        key: 'office',
        label: 'Office Address',
        value: settings.office_address,
        raw: settings.office_address,
        href: '',
        icon: MapPin,
        actionLabel: '',
        actionType: 'none',
      });
    }

    return items;
  }, [settings]);

  const hasAnyContact = contacts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[90vh] w-full max-w-md overflow-y-auto border border-border bg-card p-0 shadow-xl',
          'sm:rounded-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
        )}
      >
        <div className="relative">
          {/* Header */}
          <div className="relative overflow-hidden rounded-t-xl bg-gradient-to-br from-primary/20 to-primary/5 px-6 pb-8 pt-8">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
            <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />

            <DialogHeader className="relative z-10 text-left">
              <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                Contact Support
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Need help with your account or business setup?
              </DialogDescription>
            </DialogHeader>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="space-y-4 px-6 py-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="ml-3 text-sm text-muted-foreground">Loading contact details…</span>
              </div>
            ) : !hasAnyContact ? (
              <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">Support contact information is currently unavailable.</p>
                <p className="mt-1 text-xs text-muted-foreground">Please check back later or reach out through other channels.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground break-words">{item.value}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {item.actionType === 'call' && item.href && (
                        <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
                          <a href={item.href} rel="noreferrer">
                            <Phone className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Call</span>
                          </a>
                        </Button>
                      )}
                      {item.actionType === 'whatsapp' && item.href && (
                        <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
                          <a href={item.href} target="_blank" rel="noreferrer">
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Chat</span>
                          </a>
                        </Button>
                      )}
                      {item.actionType === 'email' && item.href && (
                        <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
                          <a href={item.href} rel="noreferrer">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Email</span>
                          </a>
                        </Button>
                      )}
                      {item.raw && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => handleCopy(item.raw, item.key)}
                          aria-label={`Copy ${item.label}`}
                        >
                          {copiedKey === item.key ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer note */}
            <div className="border-t border-border pt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Contact details are set by the KudiTrack admin team.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
