export interface SafeFetchJsonOptions<T> extends RequestInit {
  timeoutMs?: number;
  parse?: (raw: unknown) => T | null;
}

export async function safeFetchJson<T>(
  url: string,
  options?: SafeFetchJsonOptions<T>
): Promise<T | null> {
  const { timeoutMs = 12000, parse, signal: externalSignal, ...fetchInit } = options || {};
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let onExternalAbort: (() => void) | undefined;

  if (externalSignal) {
    if (externalSignal.aborted) {
      return null;
    }
    onExternalAbort = () => controller.abort();
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const res = await fetch(url, { ...fetchInit, signal: controller.signal });
    if (!res.ok) {
      console.warn(`[API] Request to ${url} returned status ${res.status}`);
      return null;
    }
    if (res.status === 204) {
      return null;
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isJsonContentType =
      contentType.includes('application/json') || contentType.includes('+json');
    if (!isJsonContentType) {
      console.warn(`[API] Request to ${url} returned non-JSON content-type: ${contentType}`);
      return null;
    }

    const rawText = await res.text();
    if (!rawText || !rawText.trim()) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.warn(`[API] Malformed JSON from ${url}:`, parseErr);
      return null;
    }

    if (parse) {
      return parse(parsed);
    }
    return parsed as T;
  } catch (err) {
    console.warn(`[API] Error fetching ${url}:`, err);
    return null;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
