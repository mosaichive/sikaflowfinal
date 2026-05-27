import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, CheckCircle, TrendingUp, Package, Users, Wallet, BarChart3, Bell, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AboutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const features = [
  { icon: TrendingUp, label: 'Track daily sales' },
  { icon: Package, label: 'Monitor stock levels' },
  { icon: Users, label: 'Manage customers and orders' },
  { icon: Wallet, label: 'Record expenses and savings' },
  { icon: BarChart3, label: 'Track profits and business cash flow' },
  { icon: Bell, label: 'Monitor low-stock alerts' },
  { icon: Shield, label: 'Manage team members with permissions' },
  { icon: CheckCircle, label: 'Access business performance insights using date filters' },
];

const steps = [
  'Create your account',
  'Complete your business setup',
  'Add products and stock',
  'Record sales daily',
  'Track expenses and savings',
  'Monitor profits and available business money',
  'Use filters to analyze performance by day, month, or year',
];

export function AboutModal({ open, onOpenChange }: AboutModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[90vh] w-full max-w-lg overflow-y-auto border border-border bg-card p-0 shadow-xl',
          'sm:rounded-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
        )}
      >
        <div className="relative">
          {/* Header gradient background */}
          <div className="relative overflow-hidden rounded-t-xl bg-gradient-to-br from-primary/20 to-primary/5 px-6 pb-8 pt-8">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
            <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />

            <DialogHeader className="relative z-10 text-left">
              <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                About KudiTrack
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Smart sales and inventory management made simple.
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
          <div className="space-y-6 px-6 py-6">
            {/* Intro */}
            <p className="text-sm leading-7 text-muted-foreground">
              KudiTrack is a smart sales and inventory management system built to help business owners track sales, monitor stock, manage expenses, calculate profits, and understand their real business cash flow in real time.
            </p>

            <p className="text-sm leading-7 text-muted-foreground">
              The platform is designed for small businesses, shops, online sellers, wholesalers, and growing brands that want a simple but powerful way to manage daily operations without complicated accounting software.
            </p>

            {/* Features grid */}
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground">
                With KudiTrack, you can
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {features.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 transition-colors hover:bg-muted/60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <f.icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-foreground">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Why important */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Why KudiTrack is important</h3>
              <p className="text-sm leading-7 text-muted-foreground">
                Many business owners sell every day but still struggle to know their actual profit, where their money goes, how much stock is left, or whether the business is growing or losing money. KudiTrack solves this by bringing all business activities into one clear dashboard.
              </p>
            </div>

            {/* How to use */}
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground">
                How to use KudiTrack
              </h3>
              <ol className="space-y-2">
                {steps.map((step, i) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-sm text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Footer */}
            <div className="border-t border-border pt-4 text-center">
              <p className="text-xs font-medium text-muted-foreground">
                KudiTrack — Smart business tracking made simple.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
