import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DateFilter } from "@/lib/date-filter";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function DateFilterBar({
  filter, onChange, allowAll = true,
}: {
  filter: DateFilter;
  onChange: (f: DateFilter) => void;
  allowAll?: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Filter</Label>
        <Select
          value={filter.granularity}
          onValueChange={(v) => onChange({ ...filter, granularity: v as DateFilter["granularity"] })}
        >
          <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {allowAll && <SelectItem value="all">All time</SelectItem>}
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="year">Year</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filter.granularity === "day" && (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Date</Label>
          <Input type="date" className="h-9 w-[160px]" value={filter.day ?? ""} onChange={(e) => onChange({ ...filter, day: e.target.value })} />
        </div>
      )}

      {filter.granularity === "month" && (
        <>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Month</Label>
            <Select value={filter.month} onValueChange={(v) => onChange({ ...filter, month: v })}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <YearSelect value={filter.year} years={years} onChange={(v) => onChange({ ...filter, year: v })} />
        </>
      )}

      {filter.granularity === "year" && (
        <YearSelect value={filter.year} years={years} onChange={(v) => onChange({ ...filter, year: v })} />
      )}

      {filter.granularity === "custom" && (
        <>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</Label>
            <Input type="date" className="h-9 w-[150px]" value={filter.from ?? ""} onChange={(e) => onChange({ ...filter, from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
            <Input type="date" className="h-9 w-[150px]" value={filter.to ?? ""} onChange={(e) => onChange({ ...filter, to: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}

function YearSelect({ value, years, onChange }: { value?: string; years: string[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Year</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
