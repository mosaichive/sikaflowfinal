/**
 * SMS notification preferences for the business owner. Reads + writes
 * the three boolean columns on `profiles` (sms_notify_sale_thanks,
 * sms_notify_low_stock, sms_notify_team_invite). Defaults to ON for all.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';

type Prefs = {
  sms_notify_sale_thanks: boolean;
  sms_notify_low_stock: boolean;
  sms_notify_team_invite: boolean;
};

const DEFAULTS: Prefs = {
  sms_notify_sale_thanks: true,
  sms_notify_low_stock: true,
  sms_notify_team_invite: true,
};

export function SmsNotificationsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      const { data } = await (supabase as any)
        .from('profiles')
        .select('sms_notify_sale_thanks, sms_notify_low_stock, sms_notify_team_invite')
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;
      if (data) {
        setPrefs({
          sms_notify_sale_thanks: data.sms_notify_sale_thanks ?? true,
          sms_notify_low_stock: data.sms_notify_low_stock ?? true,
          sms_notify_team_invite: data.sms_notify_team_invite ?? true,
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const update = async (key: keyof Prefs, value: boolean) => {
    if (!user?.id) return;
    const prev = prefs;
    setPrefs({ ...prefs, [key]: value });
    const { error } = await (supabase as any)
      .from('profiles')
      .update({ [key]: value })
      .eq('id', user.id);
    if (error) {
      setPrefs(prev);
      toast({ title: 'Could not update preference', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> SMS Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Choose which SMS messages your business sends out automatically. All are on by default.
        </p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm">Customer thank-you SMS</Label>
            <p className="text-xs text-muted-foreground">Sent to the customer after a successful sale.</p>
          </div>
          <Switch
            disabled={loading}
            checked={prefs.sms_notify_sale_thanks}
            onCheckedChange={(v) => update('sms_notify_sale_thanks', v)}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm">Low-stock alerts</Label>
            <p className="text-xs text-muted-foreground">Sent to you (and inventory managers) when stock hits the threshold.</p>
          </div>
          <Switch
            disabled={loading}
            checked={prefs.sms_notify_low_stock}
            onCheckedChange={(v) => update('sms_notify_low_stock', v)}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm">Team invitation SMS</Label>
            <p className="text-xs text-muted-foreground">Sent when you invite a new team member with a phone number.</p>
          </div>
          <Switch
            disabled={loading}
            checked={prefs.sms_notify_team_invite}
            onCheckedChange={(v) => update('sms_notify_team_invite', v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
