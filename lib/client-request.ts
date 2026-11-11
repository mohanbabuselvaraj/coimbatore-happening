export async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers = new Headers(body ? { 'Content-Type': 'application/json' } : undefined);
  if (import.meta.env.DEV) {
    const fixture = new URLSearchParams(window.location.search).get('data');
    if (fixture) headers.set('X-UI-Fixture', fixture);
  }
  const response = await fetch(url, { headers, signal, ...body ? { method: 'POST', body: JSON.stringify(body) } : {} });
  let data: T & { error?: string; code?: string };
  try { data = await response.json(); } catch { throw new Error('Connection lost. Please try again.'); }
  if (!response.ok) { if(url.startsWith('/api/admin/')&&data.code==='ADMIN_LOCKED')window.dispatchEvent(new Event('admin-locked')); throw new Error(data.error ?? 'Something went wrong. Try again.'); }
  if(url.startsWith('/api/admin/'))window.dispatchEvent(new Event('admin-request'));
  return data;
}
