// Provider-agnostic AI turn for the KudiTrack Business Assistant.
//
// STATUS: PREPARED FOR MIGRATION — NOT WIRED INTO PRODUCTION YET.
// `supabase/functions/ai-assistant/index.ts` still calls the Lovable AI Gateway directly.
// After production cutover, replace its inline fetch with `runAssistantTurn(...)` below and
// set AI_PROVIDER=anthropic. Until then the default provider stays "lovable", so behaviour
// is unchanged if this module is imported early.
//
// Secrets:
//   AI_PROVIDER        = "lovable" (default) | "anthropic"
//   LOVABLE_API_KEY    — only for the "lovable" path (goes away after cutover)
//   ANTHROPIC_API_KEY  — required for the "anthropic" path
//   ANTHROPIC_MODEL    — optional, default "claude-sonnet-4-5"

export type Turn = { role: "user" | "assistant"; content: string };

export type AssistantResult =
  | { ok: true; reply: string; action: unknown }
  | { ok: false; status: number; error: string };

export function aiProvider(): "lovable" | "anthropic" {
  return (Deno.env.get("AI_PROVIDER") ?? "lovable").toLowerCase() === "anthropic"
    ? "anthropic"
    : "lovable";
}

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
 * Anthropic Claude implementation.
 *
 * Structured output is obtained with a single forced tool call (`emit_turn`) whose
 * input_schema is the same JSON Schema the Lovable/OpenAI path passes as
 * `text.format.json_schema`. This is Anthropic's supported equivalent of strict
 * structured output, so the assistant's action contract does not change.
 *
 * API: POST https://api.anthropic.com/v1/messages
 * Headers: x-api-key, anthropic-version: 2023-06-01, content-type
 */
async function runAnthropic(
  systemPrompt: string,
  messages: Turn[],
  schema: Record<string, unknown>,
): Promise<AssistantResult> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, status: 500, error: "AI is not configured on this project." };
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [{
        name: "emit_turn",
        description: "Return the assistant reply and the structured action for this turn.",
        input_schema: schema,
      }],
      tool_choice: { type: "tool", name: "emit_turn" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[ai-provider:anthropic] error", res.status, detail);
    if (res.status === 429) {
      return { ok: false, status: 429, error: "The assistant is busy right now. Please try again in a moment." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 500, error: "AI is not configured correctly on this project." };
    }
    return { ok: false, status: 502, error: "The assistant could not respond right now." };
  }

  const data = await res.json().catch(() => null) as
    | { content?: Array<{ type: string; name?: string; input?: unknown; text?: string }> }
    | null;
  const toolUse = data?.content?.find((c) => c.type === "tool_use" && c.name === "emit_turn");
  if (toolUse?.input) {
    const input = toolUse.input as { reply?: unknown; action?: unknown };
    return {
      ok: true,
      reply: typeof input.reply === "string" ? input.reply : "Sorry, I did not catch that.",
      action: input.action ?? null,
    };
  }
  const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = parseAssistantJson(text);
  return { ok: true, reply: parsed.reply, action: parsed.action };
}

/** Existing Lovable AI Gateway path, kept so rollback is an env-var flip, not a code change. */
async function runLovable(
  systemPrompt: string,
  messages: Turn[],
  schema: Record<string, unknown>,
  model: string,
  readOutputText: (body: ReadableStream<Uint8Array>) => Promise<string>,
): Promise<AssistantResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return { ok: false, status: 500, error: "AI is not configured on this workspace." };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        ...messages.map((m) => ({
          role: m.role,
          content: [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content }],
        })),
      ],
      text: { format: { type: "json_schema", name: "assistant_turn", strict: true, schema } },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error("[ai-provider:lovable] error", res.status, detail);
    if (res.status === 429) {
      return { ok: false, status: 429, error: "The assistant is busy right now. Please try again in a moment." };
    }
    if (res.status === 402) {
      return { ok: false, status: 402, error: "AI credits are exhausted. Please top up to keep using the assistant." };
    }
    return { ok: false, status: 502, error: "The assistant could not respond right now." };
  }

  const parsed = parseAssistantJson(await readOutputText(res.body));
  return { ok: true, reply: parsed.reply, action: parsed.action };
}

export async function runAssistantTurn(opts: {
  systemPrompt: string;
  messages: Turn[];
  schema: Record<string, unknown>;
  lovableModel: string;
  readOutputText: (body: ReadableStream<Uint8Array>) => Promise<string>;
}): Promise<AssistantResult> {
  if (aiProvider() === "anthropic") {
    return await runAnthropic(opts.systemPrompt, opts.messages, opts.schema);
  }
  return await runLovable(
    opts.systemPrompt,
    opts.messages,
    opts.schema,
    opts.lovableModel,
    opts.readOutputText,
  );
}
