/**
 * Hook validation schemas.
 */

import type { HookConfig, HookEvent, HookMatcher } from './hook-types.js';

/**
 * Validate a hook config object.
 * Returns an array of error messages (empty if valid).
 */
export function validateHookConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('Hook config must be an object');
    return errors;
  }

  const hook = config as Record<string, unknown>;

  if (!hook.type || typeof hook.type !== 'string') {
    errors.push('Hook must have a "type" field');
    return errors;
  }

  const validTypes = ['command', 'prompt', 'agent', 'http'];
  if (!validTypes.includes(hook.type as string)) {
    errors.push(`Invalid hook type: "${hook.type}". Must be one of: ${validTypes.join(', ')}`);
    return errors;
  }

  switch (hook.type) {
    case 'command':
      if (!hook.command || typeof hook.command !== 'string') {
        errors.push('Command hook must have a "command" field');
      }
      break;
    case 'prompt':
      if (!hook.prompt || typeof hook.prompt !== 'string') {
        errors.push('Prompt hook must have a "prompt" field');
      }
      break;
    case 'agent':
      if (!hook.prompt || typeof hook.prompt !== 'string') {
        errors.push('Agent hook must have a "prompt" field');
      }
      break;
    case 'http':
      if (!hook.url || typeof hook.url !== 'string') {
        errors.push('HTTP hook must have a "url" field');
      }
      break;
  }

  if (hook.timeout !== undefined && (typeof hook.timeout !== 'number' || hook.timeout < 0)) {
    errors.push('Timeout must be a non-negative number');
  }

  if (hook.if !== undefined && typeof hook.if !== 'string') {
    errors.push('"if" field must be a string');
  }

  return errors;
}

/**
 * Validate a hook matcher object from settings.json.
 */
export function validateHookMatcher(matcher: unknown): string[] {
  const errors: string[] = [];

  if (!matcher || typeof matcher !== 'object') {
    errors.push('Hook matcher must be an object');
    return errors;
  }

  const m = matcher as Record<string, unknown>;

  if (m.matcher !== undefined && typeof m.matcher !== 'string') {
    errors.push('Matcher must be a string');
  }

  if (!Array.isArray(m.hooks)) {
    errors.push('Matcher must have a "hooks" array');
    return errors;
  }

  for (let i = 0; i < (m.hooks as unknown[]).length; i++) {
    const hookErrors = validateHookConfig((m.hooks as unknown[])[i]);
    for (const err of hookErrors) {
      errors.push(`Hook ${i}: ${err}`);
    }
  }

  return errors;
}

/**
 * Validate hooks config from settings.
 */
export function validateHooksConfig(
  hooks: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const validEvents = new Set<string>([
    'PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd',
    'UserPromptSubmit', 'Stop', 'StopFailure', 'PreCompact', 'PostCompact',
  ]);

  for (const [event, matchers] of Object.entries(hooks)) {
    if (!validEvents.has(event)) {
      errors.push(`Unknown hook event: "${event}"`);
      continue;
    }

    if (!Array.isArray(matchers)) {
      errors.push(`Event "${event}" must have an array of matchers`);
      continue;
    }

    for (let i = 0; i < matchers.length; i++) {
      const matcherErrors = validateHookMatcher(matchers[i]);
      for (const err of matcherErrors) {
        errors.push(`${event}[${i}]: ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
