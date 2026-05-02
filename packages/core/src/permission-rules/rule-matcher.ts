/**
 * Permission rule matcher.
 *
 * Matches tool calls against parsed permission rules.
 */

import { parseRule, patternToRegex, type ParsedRule } from './rule-parser.js';

export interface ToolCallInfo {
  /** Tool name (e.g., "Bash", "Read", "mcp__server__tool") */
  toolName: string;
  /** Tool input for pattern matching (e.g., command for Bash) */
  input?: Record<string, unknown>;
  /** Tool category if known */
  category?: string;
}

export type RuleBehavior = 'allow' | 'deny' | 'ask';

export interface PermissionRule {
  behavior: RuleBehavior;
  parsed: ParsedRule;
  /** Where this rule came from */
  source: string;
}

export interface MatchResult {
  matched: boolean;
  behavior: RuleBehavior;
  rule: PermissionRule;
}

/**
 * Check if a tool call matches a specific rule.
 */
export function matchRule(rule: PermissionRule, call: ToolCallInfo): boolean {
  const { parsed } = rule;

  // MCP rule matching
  if (parsed.isMcp) {
    if (parsed.isWildcard) {
      // "mcp__server__*" matches any tool from that server
      const serverPrefix = parsed.toolName.replace(/__\*$/, '__');
      return call.toolName.startsWith(serverPrefix);
    }
    // Exact MCP tool match
    return call.toolName === parsed.toolName;
  }

  // Tool name must match
  if (call.toolName !== parsed.toolName) {
    return false;
  }

  // No pattern = match entire tool
  if (!parsed.pattern) {
    return true;
  }

  // Wildcard or exact pattern matching against tool input
  const inputValue = extractPatternInput(call);
  if (inputValue === undefined) {
    // Can't match pattern without input; allow the tool name match
    return true;
  }

  if (parsed.isWildcard) {
    const regex = patternToRegex(parsed.pattern);
    return regex.test(inputValue);
  }

  // Exact match (case-insensitive)
  return inputValue.toLowerCase() === parsed.pattern.toLowerCase();
}

/**
 * Find the first matching rule for a tool call from a list of rules.
 * Rules are checked in order; first match wins.
 */
export function findMatchingRule(
  rules: PermissionRule[],
  call: ToolCallInfo,
): MatchResult | null {
  for (const rule of rules) {
    if (matchRule(rule, call)) {
      return { matched: true, behavior: rule.behavior, rule };
    }
  }
  return null;
}

/**
 * Check all rule lists in priority order: deny first, then ask, then allow.
 * Returns the decision and which rule (if any) matched.
 */
export function evaluateRules(
  denyRules: PermissionRule[],
  askRules: PermissionRule[],
  allowRules: PermissionRule[],
  call: ToolCallInfo,
): { decision: RuleBehavior | 'no-match'; matchedRule?: PermissionRule } {
  // 1. Check deny rules first (highest priority)
  const denyMatch = findMatchingRule(denyRules, call);
  if (denyMatch) {
    return { decision: 'deny', matchedRule: denyMatch.rule };
  }

  // 2. Check ask rules
  const askMatch = findMatchingRule(askRules, call);
  if (askMatch) {
    return { decision: 'ask', matchedRule: askMatch.rule };
  }

  // 3. Check allow rules
  const allowMatch = findMatchingRule(allowRules, call);
  if (allowMatch) {
    return { decision: 'allow', matchedRule: allowMatch.rule };
  }

  return { decision: 'no-match' };
}

/**
 * Extract the input value used for pattern matching.
 * For Bash, this is the "command" field. For other tools, "path".
 */
function extractPatternInput(call: ToolCallInfo): string | undefined {
  if (!call.input) return undefined;

  // Bash tool: match against "command" field
  if (call.toolName === 'Bash' && typeof call.input.command === 'string') {
    return call.input.command;
  }

  // File tools: match against "path" field
  if (typeof call.input.path === 'string') {
    return call.input.path;
  }

  // Fallback: try "command" then "pattern"
  if (typeof call.input.command === 'string') {
    return call.input.command;
  }

  return undefined;
}

/**
 * Convert raw rule strings from settings into PermissionRule objects.
 */
export function parseRulesFromStrings(
  rules: string[],
  behavior: RuleBehavior,
  source: string,
): PermissionRule[] {
  return rules.map((raw) => ({
    behavior,
    parsed: parseRule(raw),
    source,
  }));
}
