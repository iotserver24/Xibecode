import { describe, expect, it } from 'vitest';
import { SessionBridge } from '../src/core/session-bridge.js';

describe('SessionBridge UI state', () => {
  it('tracks plan and permission state', () => {
    SessionBridge.onPlanState('awaiting_approval', 'plan-123');
    SessionBridge.onPermissionState('default');
    const state = SessionBridge.getState();
    expect(state.planStatus).toBe('awaiting_approval');
    expect(state.permissionMode).toBe('default');
  });
});
