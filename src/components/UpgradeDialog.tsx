import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  requiredTier?: 'Business' | 'Business Plus';
  description?: string;
}

export function UpgradeDialog({ open, onOpenChange, feature, requiredTier = 'Business Plus', description }: Props) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mb-1">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Upgrade to unlock {feature}</DialogTitle>
          <DialogDescription>
            {description ?? `${feature} is available on the ${requiredTier} plan and above. Upgrade to enable this for your team.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button onClick={() => { onOpenChange(false); navigate('/billing'); }}>
            <Sparkles className="mr-2 h-4 w-4" />
            See {requiredTier} plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
