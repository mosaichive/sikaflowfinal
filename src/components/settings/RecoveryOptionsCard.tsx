import { Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function RecoveryOptionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <LifeBuoy className="h-4 w-4" />
          Forgot Password Recovery Options
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Recover access using your verified email address or your verified phone number.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/forgot-password">Reset by email</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/forgot-password?method=phone">Reset by phone OTP</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
