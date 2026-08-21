import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useToast } from '@/hooks/use-toast';
import { getActiveCurrencyCode } from '@/lib/currency';
import { ALL_MODULES } from '@/lib/permissions';
import { loadProductsCompat } from '@/lib/workspace';
import {
  ACTION_LABEL,
  ACTION_MODULE,
  buildAssistantContext,
  executeAssistantAction,
  type AssistantAction,
  type AssistantMessage,
} from '@/lib/ai-assistant';

const uid = () => Math.random().toString(36).slice(2);

const GREETING: AssistantMessage = {
  id: 'greeting',
  role: 'assistant',
  content:
    'Hi! I can record sales, expenses, income, restocks and customers for you — or answer questions about your business. Try "I sold 3 shirts at 50 each" or "How much did I make today?"',
};

export function useAIAssistant() {
  const { user, displayName, effectiveBusinessOwnerId, hasModule, staffMembership } = useAuth();
  const { businessId, business } = useBusiness();
  const { toast } = useToast();

  const [messages, setMessages] = useState<AssistantMessage[]>([GREETING]);
  const [thinking, setThinking] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const allowedModules = useMemo(
    () => ALL_MODULES.map((m) => m.key).filter((key) => hasModule(key)),
    [hasModule, staffMembership],
  );

  const voiceSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }, []);

  const ownerId = effectiveBusinessOwnerId ?? user?.id ?? null;

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking || !user || !ownerId || !businessId) return;

      const userMessage: AssistantMessage = { id: uid(), role: 'user', content: trimmed };
      const history = [...messages, userMessage].filter((m) => m.id !== 'greeting');
      setMessages((prev) => [...prev, userMessage]);
      setThinking(true);

      try {
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
          },
        ]);
      } catch (err: any) {
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
    [allowedModules, business?.name, businessId, hasModule, messages, ownerId, thinking, user],
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
        const products = await loadProductsCompat(false, businessId);
        const { data: profile } = await supabase
          .from('profiles')
          .select('allow_sales_without_stock')
          .eq('id', ownerId)
          .maybeSingle();

        const result = await executeAssistantAction(action, {
          userId: user.id,
          ownerId,
          businessId,
          displayName: displayName || user.email || 'Team member',
          products: products as any[],
          allowSalesWithoutStock: Boolean((profile as any)?.allow_sales_without_stock),
        });

        if (!result.ok) {
          toast({ title: 'Could not save', description: result.message, variant: 'destructive' });
          setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: result.message }]);
          return;
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, actionState: 'done' } : m)).concat({
            id: uid(),
            role: 'assistant',
            content: `${result.message} Anything else?`,
          }),
        );
        toast({ title: 'Saved', description: result.message });
      } catch (err: any) {
        toast({ title: 'Could not save', description: err?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setExecutingId(null);
      }
    },
    [businessId, displayName, hasModule, ownerId, toast, user],
  );

  const cancelAction = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, actionState: 'cancelled' } : m)).concat({
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

  const startListening = useCallback(
    (onResult: (text: string) => void) => {
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
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript;
        if (transcript) onResult(String(transcript));
      };
      recognition.onerror = () => {
        setListening(false);
        toast({ title: 'Could not hear you', description: 'Try again or type your request.', variant: 'destructive' });
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
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
    send,
    confirmAction,
    cancelAction,
    startListening,
    stopListening,
    reset,
  };
}
