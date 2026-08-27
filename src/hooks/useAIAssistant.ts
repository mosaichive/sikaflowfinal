import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useToast } from '@/hooks/use-toast';
import { getActiveCurrencyCode } from '@/lib/currency';
import { ALL_MODULES } from '@/lib/permissions';
import { loadProductsCompat } from '@/lib/workspace';
import { offlineStorageAvailable, readCachedRecords, readLocalSales, STORE_CUSTOMERS } from '@/lib/offline-db';
import { parseOfflineCommand } from '@/lib/offline-assistant';
import {
  ACTION_LABEL,
  ACTION_MODULE,
  buildAssistantContext,
  buildProductClarifications,
  applyProductChoice,
  executeAssistantAction,
  type AssistantAction,
  type AssistantMessage,
} from '@/lib/ai-assistant';

const uid = () => Math.random().toString(36).slice(2);

const GREETING: AssistantMessage = {
  id: 'greeting',
  role: 'assistant',
  content:
    'Hi! I can record sales, expenses, income, restocks and customers for you — or answer questions about your business. Try "I sold 3 shirts at 50 each and 2 bags for 100" or "How much did I make today?"',
};

/** True when the edge-function call failed at the network layer (not a real API error). */
function isNetworkInvokeError(error: any) {
  const message = String(error?.message || '');
  return (
    error?.name === 'FunctionsFetchError' ||
    /failed to (send|fetch)|network\s?error|load failed/i.test(message)
  );
}

export function useAIAssistant() {
  const { user, displayName, effectiveBusinessOwnerId, hasModule, staffMembership } = useAuth();
  const { businessId, business } = useBusiness();
  const { toast } = useToast();

  const [messages, setMessages] = useState<AssistantMessage[]>([GREETING]);
  const [thinking, setThinking] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const recognitionRef = useRef<any>(null);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const allowedModules = useMemo(
    () => ALL_MODULES.map((m) => m.key).filter((key) => hasModule(key)),
    [hasModule, staffMembership],
  );

  const voiceSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }, []);

  const ownerId = effectiveBusinessOwnerId ?? user?.id ?? null;

  /**
   * On-device fallback: parse the command against the cached catalogue and
   * return the same structured action the cloud assistant would. Used when
   * offline, or when the edge function is unreachable.
   */
  const runOffline = useCallback(
    async (text: string) => {
      const [products, customers, localSales] = await Promise.all([
        loadProductsCompat(false, businessId).catch(() => [] as any[]),
        readCachedRecords(STORE_CUSTOMERS).catch(() => [] as any[]),
        readLocalSales().catch(() => []),
      ]);

      const result = parseOfflineCommand(text, {
        products: products as any[],
        customers: customers as any[],
        localSales,
        currency: getActiveCurrencyCode(),
      });

      if (result.kind === 'reply') {
        setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: result.reply }]);
        return;
      }

      const action = result.action;
      const blocked = !hasModule(ACTION_MODULE[action.type]);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: blocked
            ? `You do not have access to ${ACTION_LABEL[action.type].toLowerCase()}. Ask your business owner for permission.`
            : result.reply,
          action: blocked ? null : action,
          actionState: blocked ? undefined : 'pending',
          clarifications: blocked ? undefined : buildProductClarifications(action, products as any[]),
        },
      ]);
    },
    [businessId, hasModule],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking) return;
      if (!user || !ownerId || !businessId) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: 'user', content: trimmed },
          {
            id: uid(),
            role: 'assistant',
            content: 'Finish setting up your business first — then I can record and answer questions for you.',
          },
        ]);
        return;
      }

      const userMessage: AssistantMessage = { id: uid(), role: 'user', content: trimmed };
      const history = [...messages, userMessage].filter((m) => m.id !== 'greeting');
      setMessages((prev) => [...prev, userMessage]);
      setThinking(true);

      try {
        if (!onlineRef.current) {
          await runOffline(trimmed);
          return;
        }

        const context = await buildAssistantContext({
          ownerId,
          businessId,
          businessName: business?.name || '',
          currency: getActiveCurrencyCode(),
          modules: allowedModules,
        });

        const { data, error } = await supabase.functions.invoke('ai-assistant', {
          body: {
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            context,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const action: AssistantAction | null = data?.action ?? null;
        const blocked = action && !hasModule(ACTION_MODULE[action.type]);
        const catalogue =
          action && !blocked ? await loadProductsCompat(false, businessId).catch(() => [] as any[]) : [];

        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: blocked
              ? `You do not have access to ${ACTION_LABEL[action!.type].toLowerCase()}. Ask your business owner for permission.`
              : String(data?.reply || 'Sorry, I did not catch that.'),
            action: blocked ? null : action,
            actionState: blocked || !action ? undefined : 'pending',
            clarifications:
              blocked || !action ? undefined : buildProductClarifications(action, catalogue as any[]),
          },
        ]);
      } catch (err: any) {
        // Network-level failures fall back to the on-device parser so the user can keep working.
        if (isNetworkInvokeError(err) && offlineStorageAvailable()) {
          try {
            await runOffline(trimmed);
            return;
          } catch {
            /* fall through to the error message */
          }
        }
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: err?.message?.includes('Failed to send')
              ? 'I could not reach the assistant. Check your connection and try again.'
              : err?.message || 'Something went wrong. Please try again.',
          },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [allowedModules, business?.name, businessId, hasModule, messages, ownerId, runOffline, thinking, user],
  );

  const confirmAction = useCallback(
    async (messageId: string, action: AssistantAction) => {
      if (!user || !ownerId || !businessId) return;
      if (!hasModule(ACTION_MODULE[action.type])) {
        toast({ title: 'Not allowed', description: 'You do not have access to this module.', variant: 'destructive' });
        return;
      }

      setExecutingId(messageId);
      try {
        const offline = !onlineRef.current;
        const products = await loadProductsCompat(false, businessId);

        // Offline there is no way to read the stock policy — queue the sale and
        // let the server-side sync enforce it.
        let allowSalesWithoutStock = true;
        if (!offline) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('allow_sales_without_stock')
            .eq('id', ownerId)
            .maybeSingle();
          allowSalesWithoutStock = Boolean((profile as any)?.allow_sales_without_stock);
        }

        const result = await executeAssistantAction(action, {
          userId: user.id,
          ownerId,
          businessId,
          displayName: displayName || user.email || 'Team member',
          products: products as any[],
          allowSalesWithoutStock,
          offline,
        });

        if (!result.ok) {
          toast({ title: 'Could not save', description: result.message, variant: 'destructive' });
          setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: result.message }]);
          return;
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, actionState: 'done' as const } : m)).concat({
            id: uid(),
            role: 'assistant',
            content: `${result.message} Anything else?`,
          }),
        );
        toast({ title: offline ? 'Saved on device' : 'Saved', description: result.message });
      } catch (err: any) {
        toast({ title: 'Could not save', description: err?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setExecutingId(null);
      }
    },
    [businessId, displayName, hasModule, ownerId, toast, user],
  );

  /** Applies the user's edits (quantity, price, removed lines) to a pending action card. */
  const updateAction = useCallback((messageId: string, action: AssistantAction) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, action } : m)));
  }, []);

  /** User picked a catalogue product for an unmatched name in an action card. */
  const resolveClarification = useCallback((messageId: string, index: number, productName: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.action
          ? {
              ...m,
              action: applyProductChoice(m.action, index, productName),
              clarifications: (m.clarifications ?? []).filter((c) => c.index !== index),
            }
          : m,
      ),
    );
  }, []);

  const cancelAction = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, actionState: 'cancelled' as const } : m)).concat({
        id: uid(),
        role: 'assistant',
        content: 'No problem, nothing was saved.',
      }),
    );
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  /**
   * Continuous dictation: the transcript streams into the input box and is
   * NEVER auto-sent — the user reviews it and taps Send.
   */
  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      if (!voiceSupported) {
        toast({
          title: 'Voice not supported',
          description: 'Your browser does not support voice input. Please type instead.',
          variant: 'destructive',
        });
        return;
      }
      const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new Ctor();
      recognition.lang = 'en-GH';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalTranscript = '';
      recognition.onresult = (event: any) => {
        let interim = '';
        const results = event?.results;
        for (let i = event?.resultIndex ?? 0; i < (results?.length ?? 0); i++) {
          const result = results[i];
          const transcript = result?.[0]?.transcript ?? '';
          if (result?.isFinal) finalTranscript = `${finalTranscript} ${transcript}`.trim();
          else interim += transcript;
        }
        const combined = [finalTranscript, interim.trim()].filter(Boolean).join(' ').trim();
        if (combined) onTranscript(combined);
      };
      recognition.onerror = () => {
        setListening(false);
        toast({ title: 'Could not hear you', description: 'Try again or type your request.', variant: 'destructive' });
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setListening(true);
      try {
        recognition.start();
      } catch {
        setListening(false);
      }
    },
    [toast, voiceSupported],
  );

  const reset = useCallback(() => setMessages([GREETING]), []);

  useEffect(() => () => stopListening(), [stopListening]);

  return {
    messages,
    thinking,
    executingId,
    listening,
    voiceSupported,
    online,
    send,
    confirmAction,
    cancelAction,
    updateAction,
    resolveClarification,
    startListening,
    stopListening,
    reset,
  };
}
