import { describe, expect, it } from 'vitest';
import {
  featuresForMode,
  resolveRuntimeMode,
} from './runtime-mode.js';

describe('runtime-mode', () => {
  it('defaults to default mode without e2b signals', () => {
    const r = resolveRuntimeMode({});
    expect(r.mode).toBe('default');
    expect(r.isE2b).toBe(false);
    expect(featuresForMode(r.mode).selfUpdateWithRestart).toBe(false);
  });

  it('honors XIBECODE_RUNTIME_MODE=e2b', () => {
    const r = resolveRuntimeMode({ XIBECODE_RUNTIME_MODE: 'e2b' });
    expect(r.mode).toBe('e2b');
    expect(r.source).toBe('env');
    expect(featuresForMode(r.mode).preferSudoNpm).toBe(true);
    expect(featuresForMode(r.mode).selfUpdateWithRestart).toBe(true);
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
});
