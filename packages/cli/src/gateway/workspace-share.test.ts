import { describe, expect, it } from 'vitest';
import {
  formatShareMessage,
  publicShareUrl,
  shouldAttemptWorkspaceShare,
} from './workspace-share.js';

describe('workspace-share', () => {
  it('builds a public URL with token and original name', () => {
    const url = publicShareUrl({
      sandboxId: 'iabc123',
      token: 'Tok_en-1',
      name: 'out.pdf',
    });
    expect(url).toBe('https://8788-iabc123.e2b.app/f/Tok_en-1/out.pdf');
  });

  it('percent-encodes spaces in the filename', () => {
    const url = publicShareUrl({
      sandboxId: 'iabc123',
      token: 'abc',
      name: 'My Notes.txt',
      port: 8788,
    });
    expect(url).toBe('https://8788-iabc123.e2b.app/f/abc/My%20Notes.txt');
  });

  it('formats chat lines with name and url', () => {
    const text = formatShareMessage([
      {
        token: 't1',
        name: 'out.pdf',
        url: 'https://8788-iabc123.e2b.app/f/t1/out.pdf',
        path: '/home/user/workspace/out.pdf',
      },
    ]);
    expect(text).toBe('📎 out.pdf — https://8788-iabc123.e2b.app/f/t1/out.pdf');
  });

  it('attempts share in e2b runtime or when sandbox id is set', () => {
    expect(shouldAttemptWorkspaceShare({ XIBECODE_RUNTIME_MODE: 'e2b' })).toBe(
      true,
    );
    expect(shouldAttemptWorkspaceShare({ E2B_SANDBOX_ID: 'iabc' })).toBe(true);
    expect(shouldAttemptWorkspaceShare({})).toBe(false);
  });
});
