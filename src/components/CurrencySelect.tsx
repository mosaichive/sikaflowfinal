import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { CurrencyDef, searchCurrencies } from '@/lib/currency';

interface CurrencySelectProps {
  value: string;
  onChange: (code: string) => void;
  currencies: CurrencyDef[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function CurrencySelect({
  value,
  onChange,
  currencies,
  disabled,
  placeholder = 'Select currency',
  className,
}: CurrencySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => searchCurrencies(currencies, query), [currencies, query]);
  const selected = currencies.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="truncate">
            {selected ? (
              <>
                {selected.flag ? `${selected.flag} ` : ''}
                {selected.name} ({selected.code}) {selected.symbol}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country, name or code…"
            className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No currency found.</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                  setQuery('');
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                  c.code === value && 'bg-accent',
                )}
              >
                <span className="w-6">{c.flag ?? ''}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.code}</span>
                <span className="w-8 text-right">{c.symbol}</span>
                {c.code === value && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
