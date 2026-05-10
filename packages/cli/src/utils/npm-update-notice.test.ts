import { describe, expect, it } from 'vitest';
import { compareSemverCore } from './npm-update-notice.js';

describe('compareSemverCore', () => {
  it('orders patch versions', () => {
    expect(compareSemverCore('1.3.6', '1.3.5')).toBeGreaterThan(0);
    expect(compareSemverCore('1.3.5', '1.3.6')).toBeLessThan(0);
  });

  it('orders minor versions', () => {
    expect(compareSemverCore('1.4.0', '1.3.99')).toBeGreaterThan(0);
  });

  it('ignores prerelease suffix for core comparison', () => {
    expect(compareSemverCore('1.3.5', '1.3.5-beta')).toBe(0);
  });
});
