import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const code = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://shop-pro-launch.vercel.app';

function makeWorker() {
  const listeners: Record<string, (event: any) => void> = {};
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const browserCaches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue(['shop-pro-v4', 'aqvora-pwa-v1', 'other-site-cache']),
    delete: vi.fn().mockResolvedValue(true),
  };
  const response = {
    ok: true, type: 'basic',
    headers: { get: vi.fn().mockReturnValue(null) },
    clone: vi.fn(),
  };
  response.clone.mockReturnValue(response);
  const fetcher = vi.fn().mockResolvedValue(response);
  const sw = {
    location: { origin },
    addEventListener: (type: string, listener: (event: any) => void) => {
      listeners[type] = listener;
    },
  };
  runInNewContext(code, { self: sw, caches: browserCaches, fetch: fetcher, URL, Response });
  return { listeners, cache, browserCaches, fetcher, response };
}

function request(url: string, mode = 'cors') {
  return { method: 'GET', url, mode };
}
async function runFetch(worker: ReturnType<typeof makeWorker>, req: ReturnType<typeof request>) {
  let responsePromise: Promise<unknown> | undefined;
  worker.listeners.fetch({
    request: req,
    respondWith: (value: Promise<unknown>) => { responsePromise = value; },
  });
  if (responsePromise) await responsePromise;
  return responsePromise;
}

describe('AQVORA PWA production service worker: public-only caching', () => {
  it('does not force immediate takeover of an installed Cashbook with offline work', () => {
    expect(code).not.toContain('self.skipWaiting()');
    expect(code).not.toContain('self.clients.claim()');
    expect(code).not.toContain('caches.delete(key))');
    expect(code).toContain("const CACHE_NAME = 'aqvora-shell-v2'");
  });

  it('never intercepts financial, auth, report or API GET requests', async () => {
    const worker = makeWorker();
    const paths = [
      '/api/ledger', '/api/ai/chat', '/auth/v1/user',
      '/rest/v1/transactions', '/functions/v1/secure', '/reports/private.json',
      '/assets/known.js?private=1',
      'https://elsewhere.example/assets/file.js',
    ];
    for (const path of paths) {
      const url = path.startsWith('http') ? path : origin + path;
      expect(await runFetch(worker, request(url))).toBeUndefined();
    }
    expect(worker.browserCaches.open).not.toHaveBeenCalled();
    expect(worker.cache.put).not.toHaveBeenCalled();
  });

  it('caches only same-origin static public assets without private cache headers', async () => {
    const worker = makeWorker();
    await runFetch(worker, request(origin + '/assets/app-abc.js'));
    expect(worker.browserCaches.open).toHaveBeenCalledWith('aqvora-shell-v2');
    expect(worker.fetcher).toHaveBeenCalledTimes(1);
    expect(worker.cache.put).toHaveBeenCalledTimes(1);

    const restricted = makeWorker();
    restricted.response.headers.get.mockReturnValue('private, max-age=0');
    await runFetch(restricted, request(origin + '/assets/app.css'));
    expect(restricted.cache.put).not.toHaveBeenCalled();
  });

  it('keeps navigation network-first, with only static index.html offline fallback', async () => {
    const online = makeWorker();
    await runFetch(online, request(origin + '/business/overview', 'navigate'));
    expect(online.fetcher).toHaveBeenCalledWith(
      expect.objectContaining({url: origin + '/business/overview'}),
      { cache: 'no-store' },
    );
    expect(online.cache.put).not.toHaveBeenCalled();

    const offline = makeWorker();
    offline.fetcher.mockRejectedValueOnce(new Error('offline'));
    offline.browserCaches.match.mockResolvedValueOnce('cached public app shell');
    const body = await runFetch(offline, request(origin + '/reports', 'navigate'));
    expect(body).toBeDefined();
    expect(offline.browserCaches.match).toHaveBeenCalledWith('/index.html');
    expect(offline.cache.put).not.toHaveBeenCalled();
  });

  it('deletes only known old PWA caches; never clears unrelated origin caches', async () => {
    const worker = makeWorker();
    let ready: Promise<unknown> | undefined;
    worker.listeners.activate({ waitUntil: (promise: Promise<unknown>) => { ready = promise; } });
    await ready;
    const cleared = worker.browserCaches.delete.mock.calls.map(x => x[0]);
    expect(cleared).toContain('shop-pro-v4');
    expect(cleared).toContain('aqvora-pwa-v1');
    expect(cleared).not.toContain('other-site-cache');
  });

  it('pre-caches only a public shell and icons, never a financial record endpoint', async () => {
    const worker = makeWorker();
    let ready: Promise<unknown> | undefined;
    worker.listeners.install({ waitUntil: (promise: Promise<unknown>) => { ready = promise; } });
    await ready;
    const names = worker.cache.addAll.mock.calls[0][0] as string[];
    expect(names).toContain('/index.html');
    expect(names).toContain('/manifest.json');
    expect(names).not.toContain('/');
    expect(names.every(name => !name.startsWith('/api/') && !name.includes('transactions'))).toBe(true);
  });
});
