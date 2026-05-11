import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift } from 'lucide-react';

export default function ReferralsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground">Annual referral activity tracking.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gift className="h-4 w-4" /> Coming soon</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Referral tracking is not yet enabled on this platform. Contact engineering to provision the referrals tables.</p>
        </CardContent>
      </Card>
    </div>
  );
}
