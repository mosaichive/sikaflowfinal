import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const safeStatus = (status ?? '').toString();
  const config: Record<string, string> = {
    paid: 'bg-success/10 text-success border-success/20',
    partial: 'bg-warning/10 text-warning border-warning/20',
    unpaid: 'bg-destructive/10 text-destructive border-destructive/20',
  };

  const label = safeStatus
    ? safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1)
    : '—';

  return (
    <Badge variant="outline" className={`text-xs font-medium ${config[safeStatus] || ''}`}>
      {label}
    </Badge>
  );
}
