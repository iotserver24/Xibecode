/**
 * Abort-safe wrapper around node-fetch.
 *
 * node-fetch v3 converts string/Buffer request bodies into Readable streams
 * without an 'error' listener. On AbortSignal abort it calls
 * `request.body.destroy(AbortError)` and/or `response.body.emit('error', AbortError)`.
 * If no listener is attached, Node treats that as an unhandled 'error' event and
 * crashes the process — which is fatal for the 24/7 daemon on /stop or auto-stop.
 *
 * This helper:
 * 1. Wraps string/Buffer bodies in a Readable that already has an error listener
 * 2. Attaches a defensive error listener on the response body as soon as fetch resolves
 *    (covers the race before the consumer attaches its own handler)
 */
import nodeFetch, {
  type RequestInfo,
  type RequestInit,
  type Response,
} from 'node-fetch';
import { Readable } from 'node:stream';

export function isFetchAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: string; type?: string; message?: string };
  return (
    anyErr.name === 'AbortError' ||
    anyErr.type === 'aborted' ||
    String(anyErr.message || '')
      .toLowerCase()
      .includes('aborted')
  );
}

/** Swallow stream errors so destroy()/emit never become unhandled. */
function attachDefensiveStreamErrorHandler(stream: unknown): void {
  const s = stream as {
    on?: (event: string, cb: (err: unknown) => void) => void;
  } | null;
  if (!s || typeof s.on !== 'function') return;
  s.on('error', () => {
    /* intentional: presence of a listener prevents process crash */
  });
}

function wrapRequestBody(body: RequestInit['body']): RequestInit['body'] {
  if (body == null) return body;

  if (typeof body === 'string') {
    const stream = Readable.from(Buffer.from(body));
    attachDefensiveStreamErrorHandler(stream);
    return stream as unknown as RequestInit['body'];
  }

  if (Buffer.isBuffer(body)) {
    const stream = Readable.from(body);
    attachDefensiveStreamErrorHandler(stream);
    return stream as unknown as RequestInit['body'];
  }

  // Caller-supplied stream: ensure it won't crash on destroy(AbortError)
  attachDefensiveStreamErrorHandler(body);
  return body;
}

/**
 * Drop-in replacement for node-fetch that is safe to abort mid-request.
 */
export async function safeFetch(
  url: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const next: RequestInit = init ? { ...init } : {};
  if (next.body != null) {
    next.body = wrapRequestBody(next.body);
  }

  const response = await nodeFetch(url, next);

  // Close the race window: abort can emit on body before the caller attaches
  // its own 'error' listener (see callOpenAI streaming path).
  attachDefensiveStreamErrorHandler(response.body);

  return response;
}

export default safeFetch;
