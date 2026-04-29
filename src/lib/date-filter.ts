import { useMemo, useState } from "react";

export type Granularity = "all" | "day" | "month" | "year" | "custom";

export type DateFilter = {
  granularity: Granularity;
  day?: string;   // YYYY-MM-DD
  month?: string; // 1-12
  year?: string;  // YYYY
  from?: string;  // YYYY-MM-DD
  to?: string;    // YYYY-MM-DD
};

export function getRange(f: DateFilter): { start: Date | null; end: Date | null } {
  if (f.granularity === "all") return { start: null, end: null };
  if (f.granularity === "day" && f.day) {
    const s = new Date(f.day); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(s.getDate() + 1);
    return { start: s, end: e };
  }
  if (f.granularity === "month" && f.year && f.month) {
    const y = Number(f.year), m = Number(f.month) - 1;
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  }
  if (f.granularity === "year" && f.year) {
    const y = Number(f.year);
    return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  }
  if (f.granularity === "custom" && f.from && f.to) {
    const s = new Date(f.from); s.setHours(0, 0, 0, 0);
    const e = new Date(f.to); e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  return { start: null, end: null };
}

export function inRange(dateStr: string, range: { start: Date | null; end: Date | null }): boolean {
  if (!range.start || !range.end) return true;
  const d = new Date(dateStr);
  return d >= range.start && d < range.end;
}

export function useDateFilter(initial: Partial<DateFilter> = {}) {
  const now = new Date();
  const [filter, setFilter] = useState<DateFilter>({
    granularity: "year",
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    day: now.toISOString().slice(0, 10),
    ...initial,
  });
  const range = useMemo(() => getRange(filter), [filter]);
  return { filter, setFilter, range };
}
