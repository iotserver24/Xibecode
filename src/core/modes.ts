/**
 * Multi-mode architecture for XibeCode
 * Defines different operating modes with specific capabilities and restrictions
 */

export type AgentMode = 'plan' | 'agent' | 'tester' | 'debugger' | 'security' | 'review';

export type ToolCategory =
  | 'read_only'
  | 'write_fs'
  | 'git_read'
  | 'git_mutation'
  | 'shell_command'
  | 'tests'
  | 'network'
  | 'context';

export interface ModeCapabilities {
  /** Human-readable mode name */
  name: string;

  /** Short description of the mode */
  description: string;

  /** Agent persona name (friendly name for this mode) */
  personaName: string;

  /** Agent persona role description */
  personaRole: string;

  /** Tool categories allowed in this mode */
  allowedCategories: ToolCategory[];

  /** Whether this mode can modify files */
  canModify: boolean;

  /** Whether dry-run is enabled by default */
  defaultDryRun: boolean;

  /** Color for TUI display (for chalk) */
  displayColor: string;

  /** Icon/emoji for TUI display */
  icon: string;

  /** Additional system prompt instructions for this mode */
  promptSuffix: string;

  /** Risk tolerance level for operations */
  riskTolerance: 'low' | 'medium' | 'high';

  /** Whether mode transitions require confirmation */
  requiresConfirmation: boolean;
}

export const MODE_CONFIG: Record<AgentMode, ModeCapabilities> = {
  plan: {
    name: 'Plan',
    description: 'Analyze and create plans without modifying code',
    personaName: 'Aria',
    personaRole: 'the Architect',
    allowedCategories: ['read_only', 'git_read', 'context'],
    canModify: false,
    defaultDryRun: true,
    displayColor: '#40C4FF', // light blue
    icon: '📋',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## PLAN MODE - Read-Only Planning
### You are Aria the Architect 📋

You are operating in PLAN MODE. Your role is to:

- Analyze existing codebases and understand project structure
- Identify problems, requirements, and potential solutions
- Create detailed implementation plans with step-by-step instructions
- Suggest architectural improvements and refactoring approaches
- Evaluate different implementation strategies

### Your Goal
After analysis, present a clear, actionable plan and request the appropriate mode switch.

### Best Practices
- Be thorough in your analysis - read relevant files first
- Consider edge cases and potential pitfalls
- Provide concrete, actionable steps
- Suggest appropriate tools and approaches for implementation

### Mode Switching
When your analysis is complete and you need to execute the plan:
- Request a switch to **Blaze the Builder (Agent Mode)** by including:
  [[REQUEST_MODE: agent | reason=Ready to implement the plan]]
- For security-focused plans, you may recommend **Sentinel (Security Mode)** instead
- The system will handle the transition automatically if approved`,
  },

  agent: {
    name: 'Agent',
    description: 'Autonomous coding with full capabilities',
    personaName: 'Blaze',
    personaRole: 'the Builder',
    allowedCategories: ['read_only', 'write_fs', 'git_read', 'git_mutation', 'shell_command', 'tests', 'context'],
    canModify: true,
    defaultDryRun: false,
    displayColor: '#00E676', // vivid green
    icon: '🤖',
    riskTolerance: 'medium',
    requiresConfirmation: false,
    promptSuffix: `
## AGENT MODE - Full Autonomous Coding
### You are Blaze the Builder 🤖

You are operating in AGENT MODE with full capabilities to:

- Read, analyze, and modify code files
- Create new files and directories
- Run shell commands and tests
- Use git for version control and checkpoints
- Install dependencies and manage packages
- Execute multi-step development workflows

### Package Manager Priority
1. pnpm (preferred)
2. bun (fallback)
3. npm (last resort)

### Mode Switching
You can switch to other personas when needed:
- **Dex the Debugger** for focused bug fixing: [[REQUEST_MODE: debugger | reason=...]]
- **Aria the Architect** for planning complex features: [[REQUEST_MODE: plan | reason=...]]
- **Sentinel the Security Analyst** for security audits: [[REQUEST_MODE: security | reason=...]]
- **Nova the Reviewer** for code review: [[REQUEST_MODE: review | reason=...]]

### Best Practices
- Always read files before modifying them
- Use appropriate tools for each task
- Create git checkpoints before risky operations
- Run tests after changes to verify correctness
- Be incremental and verify each step`,
  },

  tester: {
    name: 'Tester',
    description: 'Comprehensive testing and quality assurance',
    personaName: 'Tess',
    personaRole: 'the Tester',
    allowedCategories: ['read_only', 'write_fs', 'git_read', 'git_mutation', 'tests', 'context'],
    canModify: true,
    defaultDryRun: false,
    displayColor: '#FF4081', // pink
    icon: '🧪',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## TESTER MODE - Quality Assurance
### You are Tess the Tester 🧪

You are operating in TESTER MODE. Your mission is to ensure code quality and correctness:

- Design and implement comprehensive test suites
- Run existing tests and analyze failures
- Create regression tests for reported bugs
- Verify new features against requirements
- Ensure high test coverage

### Your Approach
1. **Analyze**: Understand the requirements and existing code
2. **Plan**: Design test cases (unit, integration, e2e)
3. **Implement**: Write robust, maintainable test code
4. **Execute**: Run tests and analyze results
5. **Report**: Document findings and coverage

### Best Practices
- Prefer TDD (Test Driven Development) flows where possible
- Write clear, descriptive test names
- Test edge cases and error conditions
- Ensure tests are deterministic and isolated

### Mode Switching
- **Dex the Debugger** for fixing test failures: [[REQUEST_MODE: debugger | reason=Fix failing tests]]
- **Blaze the Builder** for implementing missing features: [[REQUEST_MODE: agent | reason=Implement feature for testing]]`,
  },

  debugger: {
    name: 'Debugger',
    description: 'Systematic debugging and root cause analysis',
    personaName: 'Dex',
    personaRole: 'the Debugger',
    allowedCategories: ['read_only', 'write_fs', 'git_read', 'git_mutation', 'shell_command', 'tests', 'context'],
    canModify: true,
    defaultDryRun: false,
    displayColor: '#FFD740', // amber/yellow
    icon: '🐛',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## DEBUGGER MODE - Systematic Bug Resolution
### You are Dex the Debugger 🐛

You are operating in DEBUGGER MODE. Your mission is to:

- Identify and reproduce bugs systematically
- Analyze error messages and stack traces
- Use debugging tools and techniques effectively
- Create minimal test cases to isolate issues
- Apply targeted fixes with surgical precision

### Your Approach
1. **Reproduce**: Create reliable reproduction steps
2. **Isolate**: Narrow down the root cause
3. **Analyze**: Understand why the bug occurs
4. **Fix**: Apply minimal, targeted changes
5. **Verify**: Ensure the fix works and doesn't break anything

### Best Practices
- Start with run_tests to see current failures
- Focus on changed files if debugging a regression
- Make minimal, surgical changes
- Add tests to prevent future recurrence
- Use git checkpoints before attempting fixes

### Mode Switching
- Switch to **Blaze the Builder (Agent)** for broader refactors: [[REQUEST_MODE: agent | reason=...]]
- Return to **Aria the Architect (Plan)** for complex architectural fixes: [[REQUEST_MODE: plan | reason=...]]`,
  },

  security: {
    name: 'Security',
    description: 'Security analysis and vulnerability detection',
    personaName: 'Sentinel',
    personaRole: 'the Security Analyst',
    allowedCategories: ['read_only', 'git_read', 'shell_command', 'tests', 'context'],
    canModify: false,
    defaultDryRun: true,
    displayColor: '#FF5252', // vivid red
    icon: '🔒',
    riskTolerance: 'low',
    requiresConfirmation: true,
    promptSuffix: `
## SECURITY MODE - Vulnerability Analysis
### You are Sentinel the Security Analyst 🔒

You are operating in SECURITY MODE. Your mission is comprehensive security analysis:

- Scan code for common security vulnerabilities
- Analyze dependencies for known security issues
- Review authentication and authorization patterns
- Check for data exposure risks
- Identify potential attack vectors

### Security Focus Areas
- **Injection attacks** (SQL, XSS, command injection)
- **Authentication & authorization** flaws
- **Data exposure** and privacy issues
- **Dependency vulnerabilities**
- **Configuration security**
- **API security**

### After Analysis & Mode Switching
After completing your security analysis, request the appropriate mode:
- **Dex the Debugger** for targeted vulnerability fixes: [[REQUEST_MODE: debugger | reason=Fix security vulnerabilities]]
- **Blaze the Builder** for broader security improvements: [[REQUEST_MODE: agent | reason=Implement security enhancements]]

### Restrictions
- Read-only analysis mode - cannot modify code
- Focus on identification and risk assessment
- Provide detailed findings with severity ratings
- Suggest specific remediation steps`,
  },

  review: {
    name: 'Review',
    description: 'Code review and quality analysis',
    personaName: 'Nova',
    personaRole: 'the Reviewer',
    allowedCategories: ['read_only', 'git_read', 'tests', 'context'],
    canModify: false,
    defaultDryRun: true,
    displayColor: '#BB86FC', // purple
    icon: '👀',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## REVIEW MODE - Code Quality Analysis
### You are Nova the Reviewer 👀

You are operating in REVIEW MODE. Your role is to review code quality:

- Assess code readability and maintainability
- Check for best practices and coding standards
- Identify potential bugs or issues
- Evaluate architectural decisions
- Suggest improvements and refactoring opportunities

### Review Criteria
- **Code Quality**: Readability, naming, structure
- **Best Practices**: Language idioms, patterns, conventions
- **Performance**: Potential bottlenecks or inefficiencies
- **Maintainability**: Technical debt, complexity
- **Security**: Basic security considerations
- **Testing**: Test coverage and quality

### Mode Switching
After review, you can request implementation of improvements:
- **Blaze the Builder (Agent)** for implementing suggestions: [[REQUEST_MODE: agent | reason=Implement review suggestions]]
- **Aria the Architect (Plan)** for complex refactoring plans: [[REQUEST_MODE: plan | reason=Plan major refactoring]]

### Restrictions
- Read-only mode (no file modifications)
- Focus on constructive feedback
- Suggest specific improvements
- Reference concrete code locations`,
  },
};

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // Read-only tools
  'read_file': 'read_only',
  'read_multiple_files': 'read_only',
  'list_directory': 'read_only',
  'search_files': 'read_only',
  'get_context': 'context',

  // Write tools
  'write_file': 'write_fs',
  'edit_file': 'write_fs',
  'edit_lines': 'write_fs',
  'insert_at_line': 'write_fs',
  'delete_file': 'write_fs',
  'move_file': 'write_fs',
  'create_directory': 'write_fs',

  // Git tools
  'get_git_status': 'git_read',
  'get_git_changed_files': 'git_read',
  'get_git_diff_summary': 'git_read',
  'create_git_checkpoint': 'git_mutation',
  'revert_to_git_checkpoint': 'git_mutation',

  // Shell and test tools
  'run_command': 'shell_command',
  'run_tests': 'tests',
  'get_test_status': 'tests',

  // Network tools
  'web_search': 'network',
  'web_fetch': 'network',
};

export function isToolAllowed(mode: AgentMode, toolName: string): { allowed: boolean; reason?: string } {
  const category = TOOL_CATEGORIES[toolName];
  if (!category) {
    return { allowed: false, reason: `Unknown tool: ${toolName}` };
  }

  const modeConfig = MODE_CONFIG[mode];
  const allowed = modeConfig.allowedCategories.includes(category);

  if (!allowed) {
    return {
      allowed: false,
      reason: `Tool '${toolName}' (${category}) is not allowed in ${mode} mode`,
    };
  }

  return { allowed: true };
}

export function getAllowedTools(mode: AgentMode): string[] {
  const modeConfig = MODE_CONFIG[mode];
  return Object.entries(TOOL_CATEGORIES)
    .filter(([, category]) => modeConfig.allowedCategories.includes(category))
    .map(([tool]) => tool);
}

export function requiresModeTransitionConfirmation(fromMode: AgentMode, toMode: AgentMode): boolean {
  const fromConfig = MODE_CONFIG[fromMode];
  const toConfig = MODE_CONFIG[toMode];

  // Always require confirmation for transitions to security mode
  if (toConfig.requiresConfirmation) {
    return true;
  }

  // Require confirmation when escalating from read-only to write-enabled modes
  if (!fromConfig.canModify && toConfig.canModify) {
    return true;
  }

  return false;
}

export function getModeTransitionMessage(fromMode: AgentMode, toMode: AgentMode): string {
  const fromConfig = MODE_CONFIG[fromMode];
  const toConfig = MODE_CONFIG[toMode];

  if (toMode === 'security') {
    return `Switching to ${toConfig.name} mode for security analysis. This mode focuses on vulnerability detection and cannot modify files.`;
  }

  if (!fromConfig.canModify && toConfig.canModify) {
    return `Escalating from ${fromConfig.name} (read-only) to ${toConfig.name} (write-enabled). ${toConfig.name} mode can modify files, run commands, and change git state.`;
  }

  return `Switching from ${fromConfig.name} to ${toConfig.name} mode.`;
}

/**
 * Mode state for tracking in agent session
 */
export interface ModeState {
  current: AgentMode;
  previous?: AgentMode;
  history: Array<{ mode: AgentMode; timestamp: number; reason?: string }>;
  transitionInProgress?: {
    from: AgentMode;
    to: AgentMode;
    awaitingConfirmation: boolean;
  };
  pendingRequest?: ModeTransitionRequest;
}

/**
 * Mode transition request
 */
export interface ModeTransitionRequest {
  targetMode: AgentMode;
  reason: string;
  source: 'model' | 'user' | 'system';
  timestamp: number;
}

/**
 * Auto-approval policy for mode escalation
 */
export type AutoApprovalPolicy = 'never' | 'prompt-only' | 'always-for-debugger' | 'always';

/**
 * Mode transition policy configuration
 */
export interface ModeTransitionPolicy {
  autoApprovalPolicy: AutoApprovalPolicy;
  allowAutoEscalation: boolean;
}

export function createModeState(initialMode: AgentMode = 'agent'): ModeState {
  return {
    current: initialMode,
    history: [{
      mode: initialMode,
      timestamp: Date.now(),
      reason: 'Initial mode',
    }],
  };
}

export function transitionMode(state: ModeState, newMode: AgentMode, reason?: string): ModeState {
  return {
    current: newMode,
    previous: state.current,
    history: [
      ...state.history,
      {
        mode: newMode,
        timestamp: Date.now(),
        reason,
      },
    ],
    transitionInProgress: undefined,
    pendingRequest: undefined,
  };
}

/**
 * Mode Orchestrator - manages mode transitions and policies
 */
export class ModeOrchestrator {
  private policy: ModeTransitionPolicy;

  constructor(policy?: ModeTransitionPolicy) {
    this.policy = policy || {
      autoApprovalPolicy: 'always',
      allowAutoEscalation: true,
    };
  }

  /**
   * Request a mode change
   */
  requestModeChange(
    state: ModeState,
    targetMode: AgentMode,
    reason: string,
    source: 'model' | 'user' | 'system' = 'model'
  ): ModeState {
    const request: ModeTransitionRequest = {
      targetMode,
      reason,
      source,
      timestamp: Date.now(),
    };

    return {
      ...state,
      pendingRequest: request,
    };
  }

  /**
   * Evaluate if a mode transition should be auto-approved
   */
  evaluateModeChangeRequest(state: ModeState): {
    approved: boolean;
    requiresConfirmation: boolean;
    reason?: string;
  } {
    if (!state.pendingRequest) {
      return { approved: false, requiresConfirmation: false };
    }

    const { targetMode, source } = state.pendingRequest;
    const currentMode = state.current;

    // User-initiated changes are always approved
    if (source === 'user') {
      return { approved: true, requiresConfirmation: false };
    }

    // System-initiated changes are always approved
    if (source === 'system') {
      return { approved: true, requiresConfirmation: false };
    }

    // Model-initiated changes - use policy
    const fromConfig = MODE_CONFIG[currentMode];
    const toConfig = MODE_CONFIG[targetMode];

    // Check if transition requires confirmation
    const needsConfirmation = requiresModeTransitionConfirmation(currentMode, targetMode);

    // Safety check - block high-risk auto-transitions
    if (this.policy.autoApprovalPolicy !== 'always') {
      // For now, allow all model-initiated transitions under 'always' policy
      // In the future, we could add safety checks here
    }

    // Apply auto-approval policy
    switch (this.policy.autoApprovalPolicy) {
      case 'always':
        return { approved: true, requiresConfirmation: false };

      case 'always-for-debugger':
        // Auto-approve transitions to debugger mode
        if (targetMode === 'debugger') {
          return { approved: true, requiresConfirmation: false };
        }
        return {
          approved: false,
          requiresConfirmation: needsConfirmation,
          reason: 'Auto-approval only enabled for debugger mode',
        };

      case 'prompt-only':
        // Auto-approve transitions between read-only modes or within same privilege level
        if (fromConfig.canModify === toConfig.canModify) {
          return { approved: true, requiresConfirmation: false };
        }
        return {
          approved: false,
          requiresConfirmation: true,
          reason: 'Escalation from read-only to write mode requires confirmation',
        };

      case 'never':
      default:
        return {
          approved: false,
          requiresConfirmation: needsConfirmation,
          reason: 'Auto-approval is disabled',
        };
    }
  }

  /**
   * Clear pending mode change request
   */
  clearPendingRequest(state: ModeState): ModeState {
    return {
      ...state,
      pendingRequest: undefined,
    };
  }

  /**
   * Update policy
   */
  updatePolicy(policy: Partial<ModeTransitionPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * Get current policy
   */
  getPolicy(): ModeTransitionPolicy {
    return { ...this.policy };
  }
}

/**
 * Parse mode request from text (looks for [[REQUEST_MODE: ...]] tags)
 */
export function parseModeRequest(text: string): { mode: AgentMode; reason: string } | null {
  // Match [[REQUEST_MODE: <mode> | reason=<reason>]]
  const pattern = /\[\[REQUEST_MODE:\s*(\w+)\s*\|\s*reason=([^\]]+)\]\]/i;
  const match = text.match(pattern);

  if (!match) {
    return null;
  }

  const mode = match[1].toLowerCase();
  const reason = match[2].trim();

  if (!isValidMode(mode)) {
    return null;
  }

  return {
    mode: mode as AgentMode,
    reason,
  };
}

/**
 * Strip mode request tags from text (for display)
 */
export function stripModeRequests(text: string): string {
  return text.replace(/\[\[REQUEST_MODE:[^\]]+\]\]/gi, '').trim();
}

export function isValidMode(mode: string): mode is AgentMode {
  return ['plan', 'agent', 'tester', 'debugger', 'security', 'review'].includes(mode);
}

export function getAllModes(): AgentMode[] {
  return ['plan', 'agent', 'tester', 'debugger', 'security', 'review'];
}