import { describe, expect, it } from 'vitest';
import {
  CURSOR_OVERLAY_JS,
  DEFAULT_STREAM_PORT,
  encodeSse,
  isInputMessage,
  streamPort,
  streamWsUrl,
} from './computer-stream.js';

describe('computer stream helpers', () => {
  it('builds a localhost ack-paced ws url', () => {
    expect(streamWsUrl(9223)).toBe('ws://127.0.0.1:9223/?pacing=ack&maxFps=8');
    expect(streamPort()).toBe(DEFAULT_STREAM_PORT);
  });

  it('encodes SSE data lines', () => {
    expect(encodeSse({ type: 'status', screencasting: false })).toBe(
      'data: {"type":"status","screencasting":false}\n\n',
    );
  });

  it('treats input_* as control messages we must never send', () => {
    expect(isInputMessage({ type: 'input_mouse', x: 1 })).toBe(true);
    expect(isInputMessage({ type: 'input_keyboard' })).toBe(true);
    expect(isInputMessage({ type: 'frame', data: 'abc' })).toBe(false);
    expect(isInputMessage({ type: 'ack', seq: 1 })).toBe(false);
  });

  it('ships a page-level cursor overlay (CDP frames have no OS pointer)', () => {
    expect(CURSOR_OVERLAY_JS).toContain('__xc_cursor');
    expect(CURSOR_OVERLAY_JS).toContain('mousemove');
    expect(CURSOR_OVERLAY_JS).toContain('mousedown');
  });
});
