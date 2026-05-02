/**
 * PermissionRuleManager - Manages allow/deny/ask permission rules.
 *
 * Loads rules from settings, evaluates tool calls against them,
 * and provides the pipeline: deny -> ask -> allow -> mode-based fallback.
 */

import type { SettingsSchema, SettingsSource } from '../settings/settings-types.js';
import { SettingsManager } from '../settings/settings.js';
import type { PermissionMode, ToolPermissionDecision } from '../permissions.js';
import {
  type PermissionRule,
  type RuleBehavior,
  type ToolCallInfo,
  evaluateRules,
  parseRulesFromStrings,
} from './rule-matcher.js';

export interface RuleEvaluationResult {
  decision: RuleBehavior | 'no-match';
  matchedRule?: PermissionRule;
}

export class PermissionRuleManager {
  private denyRules: PermissionRule[] = [];
  private askRules: PermissionRule[] = [];
  private allowRules: PermissionRule[] = [];
  private settingsManager?: SettingsManager;

  constructor(settingsManager?: SettingsManager) {
    this.settingsManager = settingsManager;
  }

  /**
   * Load rules from a settings object.
   */
  loadFromSettings(settings: SettingsSchema, source: SettingsSource = 'user'): void {
    const perms = settings.permissions;
    if (!perms) return;

    if (perms.deny && perms.deny.length > 0) {
      this.denyRules.push(...parseRulesFromStrings(perms.deny, 'deny', source));
    }
    if (perms.ask && perms.ask.length > 0) {
      this.askRules.push(...parseRulesFromStrings(perms.ask, 'ask', source));
    }
    if (perms.allow && perms.allow.length > 0) {
      this.allowRules.push(...parseRulesFromStrings(perms.allow, 'allow', source));
    }
  }

  /**
   * Load rules from the settings manager (async).
   */
  async loadFromSettingsManager(): Promise<void> {
    if (!this.settingsManager) return;
    const settings = await this.settingsManager.getSettings();
    this.clearRules();
    this.loadFromSettings(settings, 'user');
  }

  /**
   * Evaluate a tool call against all rules.
   * Pipeline: deny first -> ask -> allow -> no-match.
   */
  evaluate(call: ToolCallInfo): RuleEvaluationResult {
    return evaluateRules(this.denyRules, this.askRules, this.allowRules, call);
  }

  /**
   * Convert rule evaluation to a ToolPermissionDecision.
   * Falls back to the provided permission mode when no rule matches.
   */
  toPermissionDecision(
    call: ToolCallInfo,
    mode: PermissionMode,
  ): ToolPermissionDecision {
    const result = this.evaluate(call);

    switch (result.decision) {
      case 'deny':
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Denied by rule: ${result.matchedRule?.parsed.raw}`,
        };
      case 'ask':
        return {
          allowed: false,
          requiresApproval: true,
          reason: `Requires approval by rule: ${result.matchedRule?.parsed.raw}`,
        };
      case 'allow':
        return {
          allowed: true,
          requiresApproval: false,
          reason: `Allowed by rule: ${result.matchedRule?.parsed.raw}`,
        };
      case 'no-match':
      default:
        // No rule matched; fall back to mode-based decision
        if (mode === 'dontAsk' || mode === 'acceptEdits') {
          return { allowed: true, requiresApproval: false };
        }
        return {
          allowed: false,
          requiresApproval: true,
          reason: 'No matching permission rule; requires approval',
        };
    }
  }

  /**
   * Add a single rule at runtime (not persisted).
   */
  addRule(behavior: RuleBehavior, ruleString: string): void {
    const rules = parseRulesFromStrings([ruleString], behavior, 'session');
    switch (behavior) {
      case 'deny':
        this.denyRules.push(...rules);
        break;
      case 'ask':
        this.askRules.push(...rules);
        break;
      case 'allow':
        this.allowRules.push(...rules);
        break;
    }
  }

  /**
   * Remove a rule by its raw string.
   */
  removeRule(behavior: RuleBehavior, ruleString: string): boolean {
    const target = behavior === 'deny' ? this.denyRules
      : behavior === 'ask' ? this.askRules
      : this.allowRules;

    const idx = target.findIndex((r) => r.parsed.raw === ruleString);
    if (idx !== -1) {
      target.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all rules.
   */
  clearRules(): void {
    this.denyRules = [];
    this.askRules = [];
    this.allowRules = [];
  }

  /**
   * Get all rules (for diagnostics).
   */
  getAllRules(): { deny: PermissionRule[]; ask: PermissionRule[]; allow: PermissionRule[] } {
    return {
      deny: [...this.denyRules],
      ask: [...this.askRules],
      allow: [...this.allowRules],
    };
  }
}
