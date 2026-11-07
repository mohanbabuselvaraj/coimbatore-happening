// Shared by the map and weather routes; only public provider data enters here.
export async function publicResponse(request: Request, load: () => Promise<Response>): Promise<Response> {
  let cache: Cache | undefined;
  try {
    // Dispatch namespaces disable caches.default; named caches stay isolated.
    cache = await caches.open('coimbatore-public-v1');
    const cached = await cache.match(request);
    if (cached) return new Response(cached.body, { status: cached.status, headers: new Headers(cached.headers) });
  } catch {
    // Caching is optional. Continue to the provider when it is unavailable.
  }
  const response = await load();
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  if (cache && response.ok && !/\b(no-store|private)\b/i.test(cacheControl)) {
    try { await cache.put(request, response.clone()); }
    catch { /* A cache write must never discard a successful provider response. */ }
  }
  return response;
}
