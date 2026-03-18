import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dedupFetch } from './request-dedup';

describe('dedupFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should deduplicate concurrent identical GET requests into one fetch call', async () => {
    const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const [res1, res2] = await Promise.all([
      dedupFetch('/api/v1/projects'),
      dedupFetch('/api/v1/projects'),
    ]);

    // Only one actual fetch call
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Both consumers get usable responses
    const data1 = await res1.json();
    const data2 = await res2.json();
    expect(data1).toEqual({ data: 'test' });
    expect(data2).toEqual({ data: 'test' });
  });

  it('should never deduplicate POST requests', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    await Promise.all([
      dedupFetch('/api/v1/projects', { method: 'POST', body: '{}' }),
      dedupFetch('/api/v1/projects', { method: 'POST', body: '{}' }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should make a fresh call after the first request completes', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      return new Response(JSON.stringify({ call: callCount }), { status: 200 });
    });

    // First request
    const res1 = await dedupFetch('/api/v1/data');
    expect(await res1.json()).toEqual({ call: 1 });

    // Second request (after first completed) — should be a fresh call
    const res2 = await dedupFetch('/api/v1/data');
    expect(await res2.json()).toEqual({ call: 2 });

    expect(callCount).toBe(2);
  });

  it('should give each consumer a usable Response via clone', async () => {
    const body = JSON.stringify({ items: [1, 2, 3] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const [res1, res2, res3] = await Promise.all([
      dedupFetch('/api/v1/items'),
      dedupFetch('/api/v1/items'),
      dedupFetch('/api/v1/items'),
    ]);

    // All three consumers can read the body
    expect(await res1.json()).toEqual({ items: [1, 2, 3] });
    expect(await res2.json()).toEqual({ items: [1, 2, 3] });
    expect(await res3.json()).toEqual({ items: [1, 2, 3] });
  });
});
