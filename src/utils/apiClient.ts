export async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      console.warn(`[API] Request to ${url} returned status ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`[API] Request to ${url} returned non-JSON content-type: ${contentType}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[API] Error fetching ${url}:`, err);
    return null;
  }
}
