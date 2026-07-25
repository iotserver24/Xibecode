import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { safeFetch, isFetchAbortError } from './safe-fetch.js';

function listen(
  handler: http.RequestListener,
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

describe('safeFetch abort safety', () => {
  it('isFetchAbortError recognizes AbortError shapes', () => {
    const e = new Error('The operation was aborted.');
    (e as any).name = 'AbortError';
    (e as any).type = 'aborted';
    expect(isFetchAbortError(e)).toBe(true);
    expect(isFetchAbortError(new Error('network fail'))).toBe(false);
  });

  it('aborting a POST with a large string body does not crash the process', async () => {
    const { server, port } = await listen((req, res) => {
      // Delay body consumption so abort can hit mid-request
      setTimeout(() => {
        req.resume();
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
      }, 500);
    });

    try {
      const controller = new AbortController();
      const body = JSON.stringify({
        data: 'x'.repeat(200_000),
        messages: Array.from({ length: 20 }, (_, i) => ({
          role: 'user',
          content: `msg ${i} ${'y'.repeat(500)}`,
        })),
      });

      const pending = safeFetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(), 15);

      try {
        await pending;
        expect.fail('expected fetch to reject on abort');
      } catch (err) {
        expect(isFetchAbortError(err)).toBe(true);
      }

      // Allow any delayed stream destroy() events to surface as uncaught if buggy
      await new Promise((r) => setTimeout(r, 100));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('response body has a defensive error listener after resolve', async () => {
    const { server, port } = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello');
    });

    try {
      const res = await safeFetch(`http://127.0.0.1:${port}/`);
      const body = res.body as Readable | null;
      expect(body).toBeTruthy();
      expect(typeof (body as any).on).toBe('function');
      // At least one error listener (ours) so emit('error') won't crash
      expect((body as any).listenerCount('error')).toBeGreaterThanOrEqual(1);

      // Simulate node-fetch abort emit — must not become uncaught
      (body as any).emit(
        'error',
        Object.assign(new Error('The operation was aborted.'), {
          name: 'AbortError',
          type: 'aborted',
        }),
      );
      await new Promise((r) => setTimeout(r, 30));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
