import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ALL_MODULES, type ModuleKey } from '@/lib/permissions';

interface Props {
  value: ModuleKey[];
  onChange: (next: ModuleKey[]) => void;
  disabled?: boolean;
}

export function PermissionsEditor({ value, onChange, disabled }: Props) {
  const set = new Set(value);
  const toggle = (key: ModuleKey, checked: boolean) => {
    const next = new Set(set);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(Array.from(next));
  };

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3">
      {ALL_MODULES.map((m) => (
        <label
          key={m.key}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
        >
          <Checkbox
            checked={set.has(m.key)}
            onCheckedChange={(c) => toggle(m.key, Boolean(c))}
            disabled={disabled}
          />
          <Label className="cursor-pointer font-normal">{m.label}</Label>
        </label>
      ))}
    </div>
  );
}
