/**
 * HooksManager - Main hooks lifecycle manager.
 *
 * Loads hooks from settings, registers session/plugin hooks,
 * and executes them at the appropriate lifecycle events.
 */

import type { SettingsSchema, HookMatcher } from '../settings/settings-types.js';
import { SettingsManager } from '../settings/settings.js';
import type {
  HookConfig,
  HookContext,
  HookEvent,
  HookResult,
  FunctionHookConfig,
  RegisteredHook,
} from './hook-types.js';
import { executeHook } from './hook-executor.js';
import { validateHooksConfig } from './hook-schema.js';

export class HooksManager {
  private hooks: Map<HookEvent, RegisteredHook[]> = new Map();
  private idCounter = 0;
  private settingsManager?: SettingsManager;

  constructor(settingsManager?: SettingsManager) {
    this.settingsManager = settingsManager;
    // Initialize event maps
    for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd',
      'UserPromptSubmit', 'Stop', 'StopFailure', 'PreCompact', 'PostCompact'] as HookEvent[]) {
      this.hooks.set(event, []);
    }
  }

  /**
   * Load hooks from a settings object.
   */
  loadFromSettings(settings: SettingsSchema): void {
    if (!settings.hooks) return;

    // Validate
    const { valid, errors } = validateHooksConfig(settings.hooks as Record<string, unknown>);
    if (!valid) {
      console.warn('Invalid hooks config:', errors.join('; '));
    }

    for (const [event, matchers] of Object.entries(settings.hooks)) {
      if (!this.hooks.has(event as HookEvent)) continue;

      for (const matcher of matchers as HookMatcher[]) {
        for (const hookConfig of matcher.hooks) {
          this.register(event as HookEvent, hookConfig, 'settings', matcher.matcher);
        }
      }
    }
  }

  /**
   * Load hooks from the settings manager (async).
   */
  async loadFromSettingsManager(): Promise<void> {
    if (!this.settingsManager) return;
    const settings = await this.settingsManager.getSettings();
    this.clearHooks('settings');
    this.loadFromSettings(settings);
  }

  /**
   * Register a hook for a specific event.
   * Returns the hook ID for later removal.
   */
  register(
    event: HookEvent,
    config: HookConfig | FunctionHookConfig,
    source: 'settings' | 'session' | 'plugin' = 'session',
    matcher?: string,
  ): string {
    const id = `hook-${++this.idCounter}`;
    const entry: RegisteredHook = {
      id,
      event,
      matcher,
      config,
      source,
    };

    const list = this.hooks.get(event) || [];
    list.push(entry);
    this.hooks.set(event, list);

    return id;
  }

  /**
   * Add a function hook (in-memory, not persisted).
   */
  addFunctionHook(
    event: HookEvent,
    fn: (context: HookContext) => Promise<HookResult | void>,
    ifCondition?: string,
  ): string {
    const config: FunctionHookConfig = { type: 'function', fn, if: ifCondition };
    return this.register(event, config, 'session');
  }

  /**
   * Remove a hook by ID.
   */
  remove(id: string): boolean {
    for (const [, list] of this.hooks) {
      const idx = list.findIndex((h) => h.id === id);
      if (idx !== -1) {
        list.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Remove all hooks, optionally filtered by source.
   */
  clearHooks(source?: 'settings' | 'session' | 'plugin'): void {
    if (!source) {
      for (const [event] of this.hooks) {
        this.hooks.set(event, []);
      }
      return;
    }

    for (const [event, list] of this.hooks) {
      this.hooks.set(event, list.filter((h) => h.source !== source));
    }
  }

  /**
   * Execute all hooks for a given event.
   * Returns the combined result of all hook executions.
   */
  async execute(event: HookEvent, context: HookContext): Promise<HookResult> {
    const list = this.hooks.get(event) || [];
    const matched = context.toolName
      ? list.filter((h) => !h.matcher || h.matcher === context.toolName || matchGlob(h.matcher, context.toolName ?? ''))
      : list;

    const combined: HookResult = { continue: true };
    const toRemove: string[] = [];

    for (const hook of matched) {
      if (hook.consumed) continue;

      try {
        const result = await executeHook(hook.config, { ...context, event });

        // Merge results
        if (result.decision) combined.decision = result.decision;
        if (result.reason) combined.reason = result.reason;
        if (result.systemMessage) {
          combined.systemMessage = combined.systemMessage
            ? `${combined.systemMessage}\n${result.systemMessage}`
            : result.systemMessage;
        }
        if (result.continue === false) {
          combined.continue = false;
          combined.stopReason = result.stopReason;
        }
        if (result.updatedInput) {
          combined.updatedInput = result.updatedInput;
        }
        if (result.suppressOutput) {
          combined.suppressOutput = true;
        }

        // Mark once-hooks for removal
        if ((hook.config as any).once) {
          toRemove.push(hook.id);
        }
      } catch (err: any) {
        // Hook execution errors are non-blocking
        console.warn(`Hook ${hook.id} error: ${err?.message || err}`);
      }
    }

    // Remove consumed once-hooks
    for (const id of toRemove) {
      this.remove(id);
    }

    return combined;
  }

  /**
   * Quick check if any hooks exist for a given event.
   */
  hasHooks(event: HookEvent): boolean {
    const list = this.hooks.get(event) || [];
    return list.length > 0;
  }

  /**
   * Get all registered hooks (for diagnostics).
   */
  getAllHooks(): Map<HookEvent, RegisteredHook[]> {
    return new Map(this.hooks);
  }
}

/**
 * Simple glob matching for hook matchers.
 * Supports "Bash" (exact) and "Bash*" (prefix).
 */
function matchGlob(pattern: string | undefined, value: string): boolean {
  if (!pattern) return true;
  if (pattern === value) return true;
  if (pattern.endsWith('*') && value.startsWith(pattern.slice(0, -1))) return true;
  return false;
}
