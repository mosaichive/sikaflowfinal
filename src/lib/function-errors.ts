export async function getFunctionErrorMessage(error: unknown, fallback = 'Request failed') {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;

    if (context instanceof Response) {
      try {
        const payload = await context.clone().json();

        if (payload && typeof payload === 'object') {
          const message =
            'error' in payload && typeof payload.error === 'string'
              ? payload.error
              : 'message' in payload && typeof payload.message === 'string'
                ? payload.message
                : null;

          if (message?.trim()) return message;
        }
      } catch {
        // Fall through to plain-text parsing.
      }

      try {
        const text = await context.clone().text();
        if (text.trim()) return text;
      } catch {
        // Fall through to generic error handling.
      }
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}