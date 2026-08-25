import { useEffect, useRef, useState } from 'react';
import { Sparkles, Mic, MicOff, Send, X, Loader2, Check, RotateCcw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/constants';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import {
  ACTION_LABEL,
  type AssistantAction,
  type AssistantMessage,
  type AssistantSaleItem,
} from '@/lib/ai-assistant';

const QUICK_PROMPTS = [
  'How much did I make today?',
  'Sold 2 shirts at 50 and 1 bag at 100',
  'Which products are low on stock?',
  'Record 5,000 rent expense',
];

function ActionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

function saleItemsOf(action: AssistantAction): AssistantSaleItem[] {
  if (Array.isArray(action.items) && action.items.length > 0) return action.items;
  return [{ product_name: action.product_name, quantity: action.quantity, unit_price: action.unit_price }];
}

/** Editable multi-item table shown on a pending sale card. */
function SaleItemsEditor({
  action,
  disabled,
  onChange,
}: {
  action: AssistantAction;
  disabled: boolean;
  onChange: (next: AssistantAction) => void;
}) {
  const items = saleItemsOf(action);

  const update = (index: number, patch: Partial<AssistantSaleItem>) => {
    onChange({ ...action, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };
  const remove = (index: number) => {
    onChange({ ...action, items: items.filter((_, i) => i !== index) });
  };

  const pricedTotal = items.reduce(
    (sum, item) => (item.unit_price != null ? sum + Number(item.unit_price) * (Number(item.quantity) || 1) : sum),
    0,
  );
  const hasUnpriced = items.some((item) => item.unit_price == null);

  return (
    <div className="space-y-1.5 rounded-xl bg-background/70 p-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <span
            className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
            title={String(item.product_name ?? '')}
          >
            {item.product_name || 'Product'}
          </span>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={item.quantity ?? ''}
            disabled={disabled}
            onChange={(event) =>
              update(index, { quantity: event.target.value === '' ? null : Math.max(1, Number(event.target.value) || 1) })
            }
            className="h-7 w-14 px-1.5 text-center text-xs"
            aria-label={`Quantity for ${item.product_name}`}
          />
          <span className="text-[10px] text-muted-foreground">×</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={item.unit_price ?? ''}
            placeholder="Catalogue"
            disabled={disabled}
            onChange={(event) =>
              update(index, { unit_price: event.target.value === '' ? null : Number(event.target.value) })
            }
            className="h-7 w-20 px-1.5 text-right text-xs"
            aria-label={`Unit price for ${item.product_name}`}
          />
          {items.length > 1 ? (
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={disabled}
              aria-label={`Remove ${item.product_name}`}
              className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-1.5 text-xs">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold text-foreground">
          {formatCurrency(pricedTotal)}
          {hasUnpriced ? ' + catalogue-priced items' : ''}
        </span>
      </div>
    </div>
  );
}

/** Read-only item list shown once a sale card is settled. */
function SaleItemsSummary({ action }: { action: AssistantAction }) {
  const items = saleItemsOf(action);
  return (
    <div className="space-y-1 rounded-xl bg-background/70 p-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="truncate text-muted-foreground">
            {item.product_name} × {item.quantity ?? 1}
          </span>
          <span className="shrink-0 font-medium text-foreground">
            {item.unit_price != null
              ? formatCurrency(Number(item.unit_price) * (Number(item.quantity) || 1))
              : 'catalogue price'}
          </span>
        </div>
      ))}
    </div>
  );
}

function ActionCard({
  message,
  action,
  busy,
  online,
  onUpdate,
  onConfirm,
  onCancel,
}: {
  message: AssistantMessage;
  action: AssistantAction;
  busy: boolean;
  online: boolean;
  onUpdate: (next: AssistantAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const settled = message.actionState === 'done' || message.actionState === 'cancelled';
  const isSale = action.type === 'record_sale';

  return (
    <div className="mt-2 rounded-2xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
          {ACTION_LABEL[action.type]}
        </Badge>
        {message.actionState === 'done' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : null}
        {message.actionState === 'cancelled' ? (
          <span className="text-[11px] text-muted-foreground">Cancelled</span>
        ) : null}
      </div>

      <p className="text-sm font-medium text-foreground">{action.summary}</p>

      {isSale ? (
        settled ? (
          <SaleItemsSummary action={action} />
        ) : (
          <SaleItemsEditor action={action} disabled={busy} onChange={onUpdate} />
        )
      ) : null}

      <div className="space-y-1 rounded-xl bg-background/70 p-2">
        {!isSale && action.product_name ? <ActionDetail label="Product" value={action.product_name} /> : null}
        {!isSale && action.quantity != null ? <ActionDetail label="Quantity" value={String(action.quantity)} /> : null}
        {!isSale && action.unit_price != null ? (
          <ActionDetail label="Unit price" value={formatCurrency(Number(action.unit_price))} />
        ) : null}
        {!isSale && action.amount != null ? <ActionDetail label="Amount" value={formatCurrency(Number(action.amount))} /> : null}
        {action.category ? <ActionDetail label="Category" value={action.category} /> : null}
        {action.customer_name ? <ActionDetail label="Customer" value={action.customer_name} /> : null}
        {action.on_credit ? (
          <ActionDetail label="Payment" value="On credit — unpaid" />
        ) : action.payment_method ? (
          <ActionDetail label="Payment" value={action.payment_method.replace('_', ' ')} />
        ) : null}
        {action.date ? <ActionDetail label="Date" value={action.date} /> : null}
        {action.note ? <ActionDetail label="Note" value={action.note} /> : null}
      </div>

      {!settled ? (
        <div className="flex gap-2 pt-0.5">
          <Button size="sm" className="flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            {online ? 'Confirm & save' : 'Save on this device'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const voiceBaseRef = useRef('');
  const assistant = useAIAssistant();

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [assistant.messages, assistant.thinking, open]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setInput('');
    void assistant.send(value);
  };

  const toggleListening = () => {
    if (assistant.listening) {
      assistant.stopListening();
      return;
    }
    // Dictation appends to whatever is already typed; sending stays manual.
    voiceBaseRef.current = input.trim();
    assistant.startListening((text) => {
      setInput([voiceBaseRef.current, text].filter(Boolean).join(' '));
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        className={cn(
          'fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300',
          'hover:scale-105 active:scale-95 bottom-24 md:bottom-6',
        )}
      >
        <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-40" aria-hidden />
        {open ? <X className="relative h-6 w-6" /> : <Sparkles className="relative h-6 w-6" />}
      </button>

      {open ? (
        <div
          className={cn(
            'fixed z-40 flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl',
            'inset-x-3 bottom-40 top-20 md:inset-auto md:right-6 md:bottom-24 md:top-auto md:h-[560px] md:w-[400px]',
          )}
          role="dialog"
          aria-label="AI Business Assistant"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-card/90 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">Business Assistant</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Powered by AI</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge
                variant={assistant.online ? 'secondary' : 'destructive'}
                className="gap-1 text-[10px]"
                title={
                  assistant.online
                    ? 'Connected — the full AI assistant is available'
                    : 'Offline — on-device mode. Records save locally and sync when you reconnect.'
                }
              >
                {assistant.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {assistant.online ? 'Online' : 'Offline'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={assistant.reset}
                aria-label="Start new conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {assistant.messages.map((message) => (
              <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-secondary text-foreground rounded-bl-md',
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  {message.action ? (
                    <ActionCard
                      message={message}
                      action={message.action}
                      busy={assistant.executingId === message.id}
                      online={assistant.online}
                      onUpdate={(next) => assistant.updateAction(message.id, next)}
                      onConfirm={() => assistant.confirmAction(message.id, message.action!)}
                      onCancel={() => assistant.cancelAction(message.id)}
                    />
                  ) : null}
                </div>
              </div>
            ))}

            {assistant.thinking ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Thinking…
                </div>
              </div>
            ) : null}

            {assistant.messages.length <= 1 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submit(prompt)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border bg-card/90 px-3 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
          >
            <Button
              type="button"
              variant={assistant.listening ? 'destructive' : 'secondary'}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label={assistant.listening ? 'Stop listening' : 'Speak your request'}
              onClick={toggleListening}
            >
              {assistant.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={assistant.listening ? 'Listening… tap Send when done' : 'Ask or tell me what happened…'}
              className="h-10 rounded-full"
              disabled={assistant.thinking}
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              disabled={assistant.thinking || !input.trim()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}
