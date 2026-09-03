// Provider-agnostic AI turn for the KudiTrack Business Assistant.
//
// The assistant runs in one of two modes:
//   AI_PROVIDER=disabled           (DEFAULT)
//       No external AI call is made. The function returns a clean, non-fatal payload and the
//       client falls back to the offline command parser (`src/lib/offline-assistant.ts`),
//       which still handles simple sale/expense/stock commands and product matching.
//   AI_PROVIDER=openai_compatible  (opt-in)
//       Any OpenAI-compatible Chat Completions endpoint (OpenAI, Azure OpenAI, Groq,
//       OpenRouter, a self-hosted gateway, ...). No vendor lock-in.
//       Secrets: AI_BASE_URL (e.g. https://api.openai.com/v1), AI_API_KEY, AI_MODEL.
//
// The `{ reply, action }` contract, the ACTION_SCHEMA, the offline fallback parser and the
// product-matching logic are identical across modes.

export type Turn = { role: "user" | "assistant"; content: string };

export type AssistantResult =
  | { ok: true; reply: string; action: unknown }
  | { ok: false; status: number; error: string };

export type Provider = "disabled" | "openai_compatible";

export function aiProvider(): Provider {
  const raw = (Deno.env.get("AI_PROVIDER") ?? "disabled").toLowerCase();
  return raw === "openai_compatible" || raw === "openai" ? "openai_compatible" : "disabled";
}

const DISABLED_REPLY =
  "The AI assistant is not enabled on this workspace right now. I will try to read your " +
  "message with the built-in command parser instead.";

function parseAssistantJson(raw: string): { reply: string; action: unknown } {
  try {
    const parsed = JSON.parse(raw);
    return {
      reply: typeof parsed?.reply === "string" ? parsed.reply : "Sorry, I did not catch that.",
      action: parsed?.action ?? null,
    };
  } catch {
    return { reply: String(raw || "Sorry, I did not catch that."), action: null };
  }
}

/**
 * Generic OpenAI-compatible Chat Completions implementation.
 *
 * Structured output uses `response_format: { type: "json_schema", json_schema: { ..., strict } }`,
 * which is the same contract the current gateway path uses, so the action shape is unchanged.
 * Endpoints that do not support strict json_schema still return JSON because the system prompt
 * requires it, and `parseAssistantJson` degrades gracefully.
 */
async function runOpenAICompatible(
  systemPrompt: string,
  messages: Turn[],
  schema: Record<string, unknown>,
): Promise<AssistantResult> {
  const baseUrl = (Deno.env.get("AI_BASE_URL") ?? "").replace(/\/+$/, "");
  const key = Deno.env.get("AI_API_KEY");
  const model = Deno.env.get("AI_MODEL");
  if (!baseUrl || !key || !model) {
    return { ok: false, status: 500, error: "AI provider is not configured on this project." };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "assistant_turn", strict: true, schema },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[ai-provider] provider error [${res.status}]: ${detail}`);
    if (res.status === 429) {
      return { ok: false, status: 429, error: "The assistant is busy right now. Please try again in a moment." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 500, error: "AI provider credentials are invalid." };
    }
    return { ok: false, status: 502, error: "The assistant could not respond right now." };
  }

  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content ?? "";
  const { reply, action } = parseAssistantJson(String(text));
  return { ok: true, reply, action };
}

/**
 * Single entry point used by `ai-assistant/index.ts` after cutover.
 * Never throws; always returns a usable result so the client can fall back offline.
 */
export async function runAssistantTurn(args: {
  systemPrompt: string;
  messages: Turn[];
  schema: Record<string, unknown>;
}): Promise<AssistantResult> {
  if (aiProvider() === "disabled") {
    return { ok: true, reply: DISABLED_REPLY, action: null };
  }
  try {
    return await runOpenAICompatible(args.systemPrompt, args.messages, args.schema);
  } catch (err) {
    console.error("[ai-provider] unexpected", err);
    return { ok: false, status: 502, error: "The assistant could not respond right now." };
  }
}
