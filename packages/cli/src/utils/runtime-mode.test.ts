import { describe, expect, it } from 'vitest';
import {
  e2bAgentContextBlock,
  featuresForMode,
  resolveRuntimeMode,
  resolveSandboxIdentity,
} from './runtime-mode.js';

describe('runtime-mode', () => {
  it('defaults to default mode without e2b signals', () => {
    const r = resolveRuntimeMode({});
    expect(r.mode).toBe('default');
    expect(r.isE2b).toBe(false);
    expect(featuresForMode(r.mode).selfUpdateWithRestart).toBe(false);
    expect(featuresForMode(r.mode).agentMayUseSudo).toBe(false);
  });

  it('honors XIBECODE_RUNTIME_MODE=e2b', () => {
    const r = resolveRuntimeMode({ XIBECODE_RUNTIME_MODE: 'e2b' });
    expect(r.mode).toBe('e2b');
    expect(r.source).toBe('env');
    expect(featuresForMode(r.mode).preferSudoNpm).toBe(true);
    expect(featuresForMode(r.mode).selfUpdateWithRestart).toBe(true);
    expect(featuresForMode(r.mode).agentMayUseSudo).toBe(true);
    expect(featuresForMode(r.mode).injectSandboxIdentity).toBe(true);
  });

  it('honors XIBECODE_RUNTIME_MODE=default even if E2B env set', () => {
    const r = resolveRuntimeMode({
      XIBECODE_RUNTIME_MODE: 'default',
      E2B_SANDBOX_ID: 'sbx_test',
    });
    expect(r.mode).toBe('default');
  });

  it('auto-detects e2b from E2B env', () => {
    const r = resolveRuntimeMode({ E2B: '1' });
    expect(r.mode).toBe('e2b');
    expect(r.source).toBe('auto-e2b');
  });

  it('resolves sandbox id from env and builds preview URL', () => {
    const id = resolveSandboxIdentity({
      E2B_SANDBOX_ID: 'iabc123',
      XIBECODE_E2B_PREVIEW_DOMAIN: 'e2b.dev',
    });
    expect(id.sandboxId).toBe('iabc123');
    expect(id.source).toBe('env');
    expect(id.previewUrl(3000)).toBe('https://3000-iabc123.e2b.dev');
  });

  it('e2b agent context mentions sandbox id, sudo -n, and Vite allowedHosts', () => {
    const block = e2bAgentContextBlock(
      {
        sandboxId: 'iabc123',
        templateId: 'xibecode-full-sandbox',
        source: 'env',
        previewUrl: (p) => `https://${p}-iabc123.e2b.dev`,
      },
      featuresForMode('e2b'),
    );
    expect(block).toContain('iabc123');
    expect(block).toContain('sudo -n');
    expect(block).toContain('3000-iabc123.e2b.dev');
    expect(block).toContain('allowedHosts');
    expect(block).toMatch(/0\.0\.0\.0/);
  });
});
