import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  makeDayRange,
  makeMonthRange,
  makeYearRange,
  startOfDay,
  endOfDay,
  type DateRange,
} from '@/lib/financial-filters';

export type DateMode = 'day' | 'month' | 'year' | 'range';

export type DashboardDateState = {
  mode: DateMode;
  day: Date;
  month: number;
  year: number;
  range: { from: Date; to: Date };
};

export function buildDateRange(state: DashboardDateState): DateRange {
  if (state.mode === 'day') return makeDayRange(state.day);
  if (state.mode === 'month') return makeMonthRange(state.year, state.month);
  if (state.mode === 'year') return makeYearRange(state.year);
  return { from: startOfDay(state.range.from), to: endOfDay(state.range.to) };
}

export function defaultDateState(): DashboardDateState {
  const now = new Date();
  return {
    mode: 'day',
    day: now,
    month: now.getMonth(),
    year: now.getFullYear(),
    range: { from: now, to: now },
  };
}

export function describeRange(state: DashboardDateState): string {
  if (state.mode === 'day') return format(state.day, 'PPP');
  if (state.mode === 'month') return format(new Date(state.year, state.month, 1), 'MMMM yyyy');
  if (state.mode === 'year') return String(state.year);
  return `${format(state.range.from, 'PP')} – ${format(state.range.to, 'PP')}`;
}

export function DateRangeFilter({
  value,
  onChange,
  availableYears,
}: {
  value: DashboardDateState;
  onChange: (next: DashboardDateState) => void;
  availableYears: number[];
}) {
  const [dayOpen, setDayOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);

  const months = useMemo(
    () => Array.from({ length: 12 }).map((_, i) => ({ value: i, label: format(new Date(2000, i, 1), 'MMMM') })),
    [],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={value.mode} onValueChange={(m) => onChange({ ...value, mode: m as DateMode })}>
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="range">Range</TabsTrigger>
        </TabsList>
      </Tabs>

      {value.mode === 'day' ? (
        <Popover open={dayOpen} onOpenChange={setDayOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('justify-start text-left font-normal', !value.day && 'text-muted-foreground')}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value.day ? format(value.day, 'PPP') : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={value.day}
              onSelect={(d) => {
                if (!d) return;
                onChange({ ...value, day: d });
                setDayOpen(false);
              }}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      ) : null}

      {value.mode === 'month' ? (
        <>
          <Select value={String(value.month)} onValueChange={(m) => onChange({ ...value, month: Number(m) })}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(value.year)} onValueChange={(y) => onChange({ ...value, year: Number(y) })}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      ) : null}

      {value.mode === 'year' ? (
        <Select value={String(value.year)} onValueChange={(y) => onChange({ ...value, year: Number(y) })}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : null}

      {value.mode === 'range' ? (
        <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(value.range.from, 'PP')} – {format(value.range.to, 'PP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from: value.range.from, to: value.range.to }}
              onSelect={(r) => {
                if (r?.from && r?.to) {
                  onChange({ ...value, range: { from: r.from, to: r.to } });
                }
              }}
              numberOfMonths={2}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
