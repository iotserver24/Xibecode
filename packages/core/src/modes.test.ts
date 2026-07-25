import { describe, expect, it } from 'vitest';
import { getToolCategory, isToolAllowed } from './modes.js';

describe('memory and skill tool categories', () => {
  it('categorizes curated_memory and related tools', () => {
    expect(getToolCategory('curated_memory')).toBe('write_fs');
    expect(getToolCategory('update_memory')).toBe('write_fs');
    expect(getToolCategory('remember_lesson')).toBe('write_fs');
    expect(getToolCategory('session_search')).toBe('context');
    expect(getToolCategory('save_skill')).toBe('write_fs');
    expect(getToolCategory('list_skills')).toBe('read_only');
    expect(getToolCategory('view_skill')).toBe('read_only');
  });

  it('allows curated_memory in agent mode', () => {
    expect(isToolAllowed('agent', 'curated_memory')).toEqual({ allowed: true });
    expect(isToolAllowed('agent', 'session_search')).toEqual({ allowed: true });
    expect(isToolAllowed('agent', 'save_skill')).toEqual({ allowed: true });
  });

  it('does not treat curated_memory as unknown', () => {
    const result = isToolAllowed('agent', 'curated_memory');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});
