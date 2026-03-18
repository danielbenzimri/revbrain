/**
 * API Request Deduplication
 *
 * Collapses identical in-flight GET requests into a single network call.
 * Multiple components mounting simultaneously may trigger the same API query;
 * this layer ensures only one fetch hits the server.
 *
 * TanStack Query deduplicates at the hook level, but direct authFetch calls
 * from services/utilities bypass that. This provides network-level dedup.
 */

const inFlight = new Map<string, Promise<Response>>();

/**
 * Fetch with deduplication for GET requests.
 * If an identical GET request is already in flight, returns a clone of
 * the existing response instead of making a new network call.
 *
 * Non-GET requests always pass through without deduplication.
 */
export function dedupFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = options.method?.toUpperCase() || 'GET';

  // Only dedup GET requests
  if (method !== 'GET') {
    return fetch(url, options);
  }

  const existing = inFlight.get(url);
  if (existing) {
    // Clone so each consumer gets a fresh readable body
    return existing.then((r) => r.clone());
  }

  const promise = fetch(url, options)
    .then((response) => {
      // Store a clone and return the original — we need the stored one
      // to be cloneable for subsequent consumers
      return response;
    })
    .finally(() => {
      inFlight.delete(url);
    });

  inFlight.set(url, promise);
  return promise;
}
