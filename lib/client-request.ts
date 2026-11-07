export async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers = new Headers(body ? { 'Content-Type': 'application/json' } : undefined);
  if (import.meta.env.DEV) {
    const fixture = new URLSearchParams(window.location.search).get('data');
    if (fixture) headers.set('X-UI-Fixture', fixture);
  }
  const response = await fetch(url, { headers, signal, ...body ? { method: 'POST', body: JSON.stringify(body) } : {} });
  let data: T & { error?: string };
  try { data = await response.json(); } catch { throw new Error('Connection lost. Please try again.'); }
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Try again.');
  return data;
}
