/**
 * Permission rule parser.
 *
 * Parses rule syntax like:
 *   "Read"                  -- allow/deny entire tool
 *   "Read(*)"              -- allow/deny all Read calls
 *   "Bash(npm install)"    -- allow/deny specific command
 *   "Bash(npm run *)"      -- wildcard matching
 *   "Bash(npm run:*)"      -- legacy prefix matching
 *   "mcp__server"          -- all tools from an MCP server
 *   "mcp__server__*"       -- wildcard MCP tools
 *   "mcp__server__tool"    -- specific MCP tool
 */

export interface ParsedRule {
  /** The tool name (e.g., "Bash", "Read", "mcp__server__tool") */
  toolName: string;
  /** Optional pattern inside parentheses (e.g., "npm run *") */
  pattern?: string;
  /** Whether the pattern uses wildcard matching */
  isWildcard: boolean;
  /** Whether this is an MCP rule (contains __) */
  isMcp: boolean;
  /** The original raw rule string */
  raw: string;
}

/**
 * Parse a permission rule string into a structured format.
 */
export function parseRule(rule: string): ParsedRule {
  const trimmed = rule.trim();
  const mcpMatch = trimmed.match(/^mcp__(.+)$/);

  if (mcpMatch) {
    const rest = mcpMatch[1];
    const isWildcard = rest.endsWith('__*') || rest.endsWith('*');
    return {
      toolName: trimmed,
      pattern: isWildcard ? undefined : undefined,
      isWildcard,
      isMcp: true,
      raw: trimmed,
    };
  }

  // Match "ToolName(pattern)" or "ToolName"
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.+)\)$/);
  if (match) {
    const toolName = match[1];
    let pattern = match[2];
    let isWildcard = false;

    // Legacy prefix matching: "npm run:*" -> treat as "npm run *"
    if (pattern.endsWith(':*')) {
      pattern = pattern.slice(0, -2) + ' *';
      isWildcard = true;
    }

    // Check for wildcard anywhere in pattern
    if (pattern.includes('*')) {
      isWildcard = true;
    }

    return {
      toolName,
      pattern,
      isWildcard,
      isMcp: false,
      raw: trimmed,
    };
  }

  // Bare tool name with no pattern
  return {
    toolName: trimmed,
    isWildcard: false,
    isMcp: false,
    raw: trimmed,
  };
}

/**
 * Convert a wildcard pattern to a regex.
 * Supports `*` as "match anything" and escapes all other regex chars.
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex special chars except *
    .replace(/\*/g, '.*');                    // * becomes .*
  return new RegExp(`^${escaped}$`, 'i');
}
