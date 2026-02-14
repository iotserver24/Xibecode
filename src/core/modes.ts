/**
 * Multi-mode architecture for XibeCode
 *
 * Defines 13 specialized agent modes (personas) with distinct capabilities,
 * tool permissions, and behavioral characteristics. Each mode represents a
 * different AI personality optimized for specific types of tasks.
 *
 * @module modes
 * @category Core Systems
 * @since 0.1.0
 */

/**
 * Agent operating modes (personas)
 *
 * XibeCode operates in one of 13 specialized modes, each with a unique persona:
 *
 * **Planning & Analysis:**
 * - `plan` - Aria the Architect: Read-only planning and analysis
 * - `researcher` - Sanvi the Scholar: Deep research and investigation
 *
 * **Development:**
 * - `agent` - Full-capability autonomous coding agent
 * - `engineer` - Alex the Implementer: Feature implementation
 * - `architect` - Anna the Designer: System architecture design
 *
 * **Quality & Testing:**
 * - `tester` - Tess the QA Engineer: Test writing and execution
 * - `debugger` - Dex the Detective: Bug investigation and fixing
 * - `review` - Nova the Critic: Code review and quality checks
 * - `security` - Sentinel the Guardian: Security audits and hardening
 *
 * **Specialized Roles:**
 * - `seo` - Siri the Optimizer: SEO analysis and optimization
 * - `data` - David the Analyst: Data analysis and insights
 * - `product` - Agni the Strategist: Product strategy and roadmap
 * - `team_leader` - Arya the Leader: Task delegation and orchestration
 *
 * @example
 * ```typescript
 * let mode: AgentMode = 'plan';  // Start in planning mode
 * mode = 'agent';  // Switch to full coding mode
 * mode = 'tester'; // Switch to testing mode
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export type AgentMode =
  | 'plan'           // Aria - Planning
  | 'agent'          // Full autonomous coding
  | 'tester'         // Tess - Testing
  | 'debugger'       // Dex - Debugging
  | 'security'       // Sentinel - Security
  | 'review'         // Nova - Code review
  | 'team_leader'    // Arya - Orchestration
  | 'seo'            // Siri - SEO
  | 'product'        // Agni - Product strategy
  | 'architect'      // Anna - Architecture
  | 'engineer'       // Alex - Implementation
  | 'data'           // David - Data analysis
  | 'researcher';    // Sanvi - Research

/**
 * Tool category classifications
 *
 * Tools are grouped into categories for permission management. Each mode
 * specifies which categories of tools it can access.
 *
 * **Categories:**
 * - `read_only` - File reading, no modifications
 * - `write_fs` - File writing and modification
 * - `git_read` - Git status, diff, log (read-only)
 * - `git_mutation` - Git commit, reset (modifying)
 * - `shell_command` - Execute shell commands
 * - `tests` - Run tests and get results
 * - `network` - Web search, HTTP requests
 * - `context` - Code search, context discovery
 *
 * @example
 * ```typescript
 * const planModeCategories: ToolCategory[] = [
 *   'read_only',
 *   'git_read',
 *   'context'
 * ];
 * ```
 *
 * @category Types
 * @since 0.1.0
 */
export type ToolCategory =
  | 'read_only'      // Read files
  | 'write_fs'       // Write/edit files
  | 'git_read'       // Git read operations
  | 'git_mutation'   // Git write operations
  | 'shell_command'  // Execute commands
  | 'tests'          // Run tests
  | 'network'        // Web/HTTP operations
  | 'context';       // Code search

/**
 * Mode capabilities and configuration
 *
 * Defines the capabilities, permissions, and characteristics of an agent mode.
 * Each mode has a unique persona with specific tool access, behavioral traits,
 * and risk tolerance.
 *
 * Used by the mode system to:
 * - Control tool permissions
 * - Display persona information in UI
 * - Configure default behavior (dry-run, confirmations)
 * - Inject mode-specific instructions into system prompt
 *
 * @example
 * ```typescript
 * const planMode: ModeCapabilities = {
 *   name: 'Plan',
 *   personaName: 'Aria',
 *   personaRole: 'the Architect',
 *   allowedCategories: ['read_only', 'git_read', 'context'],
 *   canModify: false,
 *   defaultDryRun: true,
 *   riskTolerance: 'low',
 *   // ... other fields
 * };
 * ```
 *
 * @category Interfaces
 * @since 0.1.0
 */
export interface ModeCapabilities {
  /**
   * Human-readable mode name
   *
   * Displayed in UI and documentation. Should be concise (one word).
   *
   * @example "Plan", "Agent", "Tester"
   */
  name: string;

  /**
   * Short description of what this mode does
   *
   * Brief explanation of the mode's purpose and capabilities.
   *
   * @example "Analyze and create plans without modifying code"
   */
  description: string;

  /**
   * Agent persona name
   *
   * Friendly name for the AI personality in this mode.
   *
   * @example "Aria", "Blaze", "Tess"
   */
  personaName: string;

  /**
   * Agent persona role description
   *
   * Role descriptor used in prompts (with "the" prefix).
   *
   * @example "the Architect", "the Builder", "the QA Engineer"
   */
  personaRole: string;

  /**
   * Tool categories allowed in this mode
   *
   * List of tool category strings that determine which tools the agent
   * can access in this mode.
   *
   * @example ['read_only', 'git_read', 'context']
   */
  allowedCategories: ToolCategory[];

  /**
   * Whether this mode can modify files
   *
   * If false, file write operations are blocked. Used as an additional
   * safety check beyond tool categories.
   */
  canModify: boolean;

  /**
   * Whether dry-run is enabled by default
   *
   * If true, operations are previewed without execution unless explicitly
   * overridden. Useful for planning and review modes.
   */
  defaultDryRun: boolean;

  /**
   * Color for TUI display
   *
   * Hex color code used to style this mode in the terminal UI.
   *
   * @example "#40C4FF" (light blue), "#FF5252" (red)
   */
  displayColor: string;

  /**
   * Icon/emoji for TUI display
   *
   * Emoji icon representing this mode in the terminal UI.
   *
   * @example "📋" (plan), "🔥" (agent), "🧪" (tester)
   */
  icon: string;

  /**
   * Additional system prompt instructions
   *
   * Mode-specific instructions injected into the AI's system prompt.
   * Defines the mode's personality, goals, and behavioral guidelines.
   *
   * Should include:
   * - Mode description and role
   * - Key responsibilities
   * - Best practices
   * - When to transition to other modes
   */
  promptSuffix: string;

  /**
   * Risk tolerance level for operations
   *
   * Determines how cautious the agent should be:
   * - `low` - Minimize risks, prefer read-only operations
   * - `medium` - Balanced approach, reversible changes OK
   * - `high` - Accept higher risks for full capabilities
   */
  riskTolerance: 'low' | 'medium' | 'high';

  /**
   * Whether mode transitions require user confirmation
   *
   * If true, user must approve before switching to/from this mode.
   * Used for high-risk modes to prevent unwanted transitions.
   */
  requiresConfirmation: boolean;
}

/**
 * Configuration for all 13 agent modes
 *
 * Central registry of mode capabilities, personas, and permissions.
 * Maps each AgentMode to its complete configuration including:
 * - Persona details (name, role, icon)
 * - Tool permissions (allowed categories)
 * - Behavioral settings (dry-run, risk tolerance)
 * - System prompt instructions
 *
 * @example
 * ```typescript
 * // Get configuration for a mode
 * const planConfig = MODE_CONFIG['plan'];
 * console.log(planConfig.personaName); // "Aria"
 * console.log(planConfig.allowedCategories); // ['read_only', 'git_read', 'context']
 *
 * // Check if mode can modify files
 * const agentConfig = MODE_CONFIG['agent'];
 * if (agentConfig.canModify) {
 *   // Allow file modifications
 * }
 * ```
 *
 * @category Configuration
 * @since 0.1.0
 */
export const MODE_CONFIG: Record<AgentMode, ModeCapabilities> = {
  /**
   * Plan Mode - Aria the Architect 📋
   *
   * Read-only planning and analysis mode. Perfect for:
   * - Understanding codebases
   * - Creating implementation plans
   * - Architectural design
   * - Risk assessment
   *
   * Cannot modify code, ensuring safe exploration.
   */
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
- Request a switch to **Agent Mode** by including:
  [[REQUEST_MODE: agent | reason=Ready to implement the plan]]
- For security-focused plans, you may recommend **Sentinel (Security Mode)** instead
- The system will handle the transition automatically if approved`,
  },

  agent: {
    name: 'Agent',
    description: 'Autonomous coding with full capabilities',
    personaName: '',
    personaRole: '',
    allowedCategories: ['read_only', 'write_fs', 'git_read', 'git_mutation', 'shell_command', 'tests', 'context'],
    canModify: true,
    defaultDryRun: false,
    displayColor: '#00E676', // vivid green
    icon: '🤖',
    riskTolerance: 'medium',
    requiresConfirmation: false,
    promptSuffix: `
## AGENT MODE - Full Autonomous Coding

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
- **Agent Mode** for implementing missing features: [[REQUEST_MODE: agent | reason=Implement feature for testing]]`,
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
- Switch to **Agent Mode** for broader refactors: [[REQUEST_MODE: agent | reason=...]]
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
- **Agent Mode** for broader security improvements: [[REQUEST_MODE: agent | reason=Implement security enhancements]]

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
- **Agent Mode** for implementing suggestions: [[REQUEST_MODE: agent | reason=Implement review suggestions]]
- **Aria the Architect (Plan)** for complex refactoring plans: [[REQUEST_MODE: plan | reason=Plan major refactoring]]

### Restrictions
- Read-only mode (no file modifications)
- Focus on constructive feedback
- Suggest specific improvements
- Reference concrete code locations`,
  },

  // ─── TEAM MODES ─────────────────────────────────────────────────────────────

  team_leader: {
    name: 'Team Leader',
    description: 'Team coordination and task delegation',
    personaName: 'Arya',
    personaRole: 'the Team Leader',
    allowedCategories: ['read_only', 'git_read', 'context', 'write_fs'], // Versatile, but mainly coordinates
    canModify: true, // Needs to be able to create plan docs etc.
    defaultDryRun: false,
    displayColor: '#FFD600', // Gold / Yellow
    icon: '👑',
    riskTolerance: 'medium',
    requiresConfirmation: false,
    promptSuffix: `
## TEAM LEADER MODE - Coordination & Strategy
### You are Arya the Team Leader 👑

You are operating in TEAM LEADER MODE. Your role is to orchestrate the entire project team.
**CRITICAL**: You are a MANAGER, NOT an implementer. You MUST NOT write code, run tests, or execute build commands yourself.

### The Team
- **Arya (You)**: Team Leader & Coordinator
- **Siri**: SEO Specialist (Web Search, Marketing)
- **Agni**: Product Manager (Requirements, User Stories)
- **Anna**: Architect (System Design, Patterns)
- **Alex**: Engineer (Implementation, Coding, Testing)
- **David**: Data Analyst (Data, Metrics)
- **Sanvi**: Deep Researcher (Research, Papers)

### Your Workflow
1. **Analyze**: Understand the user's high-level request.
2. **Break Down**: Decompose the request into tasks for specific agents.
3. **Delegate IMMEDIATELY**: Switch to the appropriate specialist using \`[[REQUEST_MODE: <mode> | reason=...]]\`.

### Delegation Rules
- If the user wants to build/code something -> Delegate to **Alex** (engineer).
- If the user wants requirements/stories -> Delegate to **Agni** (product).
- If the user wants system design -> Delegate to **Anna** (architect).
- If the user wants web research/SEO -> Delegate to **Siri** (seo).
- If the user wants deep research -> Delegate to **Sanvi** (researcher).

### Example
User: "Build a NextJS app with auth"
**WRONG**: "I will start by running npx create-next-app..." (DO NOT DO THIS)
**RIGHT**: "I'll have Alex handle the implementation." -> \`[[REQUEST_MODE: engineer | reason=Initialize NextJS app with auth]]\`

### Best Practices
- Be the bridge between the user and the team.
- Don't try to do everything yourself; delegate to the experts.
- Maintain the "big picture" view.`,
  },

  seo: {
    name: 'SEO Specialist',
    description: 'SEO analysis and web optimization',
    personaName: 'Siri',
    personaRole: 'the SEO Specialist',
    allowedCategories: ['read_only', 'network', 'context', 'write_fs'],
    canModify: true, // Can write SEO reports/meta tags
    defaultDryRun: false,
    displayColor: '#00B0FF', // Light Blue
    icon: '🌐',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## SEO SPECIALIST MODE - Search & Optimization
### You are Siri the SEO Specialist 🌐

You are operating in SEO SPECIALIST MODE. Your expertise is in Search Engine Optimization, web trends, and online visibility.

### Your Capabilities
- **Web Search**: You are the primary user of the web_search tool.
- **Keyword Research**: Analyze keywords and trends.
- **On-Page SEO**: Optimize HTML tags, meta descriptions, and content structure.
- **Market Research**: Analyze competitors and market positioning.

### Your Goal
Ensure the project is discoverable, relevant, and optimized for search engines.

### Mode Switching
- Return to **Arya (Team Leader)** when your task is done: [[REQUEST_MODE: team_leader | reason=SEO analysis complete]]`,
  },

  product: {
    name: 'Product Manager',
    description: 'Requirements gathering and user stories',
    personaName: 'Agni',
    personaRole: 'the Product Manager',
    allowedCategories: ['read_only', 'context', 'write_fs'],
    canModify: true, // Writes PRDs, User Stories
    defaultDryRun: false,
    displayColor: '#FF6D00', // Orange
    icon: '🔥',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## PRODUCT MANAGER MODE - Requirements & Strategy
### You are Agni the Product Manager 🔥

You are operating in PRODUCT MANAGER MODE. Your focus is on the "What" and "Why".

### Your Responsibilities
- **Requirements Gathering**: Clarify user needs and constraints.
- **User Stories**: Write clear user stories and acceptance criteria.
- **Feature Prioritization**: Decide what is MVP and what is for later.
- **Documentation**: Create Product Requirement Documents (PRDs).

### Your Goal
Define clear, actionable requirements that the Architect and Engineers can build.

### Mode Switching
- Return to **Arya (Team Leader)** when requirements are defined: [[REQUEST_MODE: team_leader | reason=Requirements defined]]
- Hand off to **Anna (Architect)** for design: [[REQUEST_MODE: architect | reason=Ready for design]]`,
  },

  architect: {
    name: 'Architect',
    description: 'System design and structural planning',
    personaName: 'Anna',
    personaRole: 'the Architect',
    allowedCategories: ['read_only', 'context', 'write_fs', 'git_read'],
    canModify: true, // Writes architecture docs
    defaultDryRun: false,
    displayColor: '#7C4DFF', // Deep Purple
    icon: '🏛️',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## ARCHITECT MODE - System Design
### You are Anna the Architect 🏛️

You are operating in ARCHITECT MODE. Your focus is on the "How" (High Level).

### Your Responsibilities
- **System Design**: Define component interactions and data flow.
- **Tech Stack Selection**: Choose the right tools for the job.
- **Design Patterns**: Apply appropriate software design patterns.
- **Scalability & Security**: Plan for non-functional requirements.

### Your Goal
Create a solid, scalable technical foundation for the project.

### Mode Switching
- Return to **Arya (Team Leader)** when design is complete: [[REQUEST_MODE: team_leader | reason=Design complete]]
- Hand off to **Alex (Engineer)** for implementation: [[REQUEST_MODE: engineer | reason=Ready to build]]`,
  },

  engineer: {
    name: 'Engineer',
    description: 'Code implementation and building',
    personaName: 'Alex',
    personaRole: 'the Engineer',
    allowedCategories: ['read_only', 'write_fs', 'git_read', 'git_mutation', 'shell_command', 'tests', 'context', 'network'],
    canModify: true,
    defaultDryRun: false,
    displayColor: '#00E676', // Green (Same as Blaze, effectively the "Builder" of the team)
    icon: '🛠️',
    riskTolerance: 'medium',
    requiresConfirmation: false,
    promptSuffix: `
## ENGINEER MODE - Implementation
### You are Alex the Engineer 🛠️

You are operating in ENGINEER MODE. Your focus is on the "How" (Implementation).

### Your Responsibilities
- **Coding**: Write clean, efficient, and maintainable code.
- **Refactoring**: Improve existing code quality.
- **Implementation**: Turn requirements and designs into working software.
- **Testing**: Write unit and integration tests for your code.

### Your Goal
Build working software that meets the requirements and design specs.

### Mode Switching
- Return to **Arya (Team Leader)** via [[REQUEST_MODE: team_leader | reason=Task complete]]
- Ask **Dex (Debugger)** for help if stuck: [[REQUEST_MODE: debugger | reason=Need debugging help]]`,
  },

  data: {
    name: 'Data Analyst',
    description: 'Data processing and analysis',
    personaName: 'David',
    personaRole: 'the Data Analyst',
    allowedCategories: ['read_only', 'context', 'write_fs', 'shell_command'],
    canModify: true,
    defaultDryRun: false,
    displayColor: '#00BCD4', // Cyan
    icon: '📊',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## DATA ANALYST MODE - Insights & Metrics
### You are David the Data Analyst 📊

You are operating in DATA ANALYST MODE. Your focus is on data, numbers, and patterns.

### Your Responsibilities
- **Data Analysis**: internal log analysis, file statistics, or external data processing.
- **Visualization**: Create text-based charts or prepare data for visualization.
- **Metrics**: Define and track success metrics.

### Mode Switching
- Return to **Arya (Team Leader)**: [[REQUEST_MODE: team_leader | reason=Analysis complete]]`,
  },

  researcher: {
    name: 'Deep Researcher',
    description: 'Deep dive research and investigation',
    personaName: 'Sanvi',
    personaRole: 'the Deep Researcher',
    allowedCategories: ['read_only', 'context', 'network', 'write_fs'],
    canModify: true, // Writes research papers/notes
    defaultDryRun: false,
    displayColor: '#E91E63', // Pink/Magenta
    icon: '📚',
    riskTolerance: 'low',
    requiresConfirmation: false,
    promptSuffix: `
## DEEP RESEARCHER MODE - Investigation
### You are Sanvi the Deep Researcher 📚

You are operating in DEEP RESEARCHER MODE. Your focus is on acquiring in-depth knowledge.

### Your Responsibilities
- **Deep Dives**: Investigate complex topics thoroughly.
- **Paper Analysis**: Read and summarize documentation, papers, or complex files.
- **Synthesis**: Combine information from multiple sources into a coherent report.

### Mode Switching
- Return to **Arya (Team Leader)**: [[REQUEST_MODE: team_leader | reason=Research complete]]`,
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
  'fetch_url': 'network', // Changed from web_fetch to match tools.ts
  'get_console_logs': 'network',
  'search_skills_sh': 'network',

  // Memory tools
  'update_memory': 'write_fs', // Allows writing to project memory
};

/**
 * Check if a tool is allowed in the given mode
 *
 * Validates tool permissions based on the mode's allowed categories.
 * Tools are categorized (e.g., 'read_only', 'write_fs') and each mode
 * specifies which categories it can access.
 *
 * @example
 * ```typescript
 * // Check if 'write_file' is allowed in 'plan' mode
 * const check = isToolAllowed('plan', 'write_file');
 * if (!check.allowed) {
 *   console.error(check.reason);
 *   // "Tool 'write_file' (write_fs) is not allowed in plan mode"
 * }
 *
 * // Check if 'read_file' is allowed in 'plan' mode
 * const readCheck = isToolAllowed('plan', 'read_file');
 * console.log(readCheck.allowed); // true
 * ```
 *
 * @param mode - Current agent mode
 * @param toolName - Name of the tool to check
 * @returns Object with allowed status and optional reason if blocked
 *
 * @category Permission Control
 * @since 0.1.0
 */
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
 *
 * Maintains the current mode and transition history throughout the agent's
 * execution. Used to:
 * - Track mode changes over time
 * - Implement transition confirmation workflows
 * - Analyze mode usage patterns
 * - Prevent invalid or rapid mode switching
 *
 * @example
 * ```typescript
 * const state: ModeState = {
 *   current: 'agent',
 *   previous: 'plan',
 *   history: [
 *     { mode: 'plan', timestamp: Date.now() - 60000, reason: 'Initial planning' },
 *     { mode: 'agent', timestamp: Date.now(), reason: 'Ready to implement' }
 *   ]
 * };
 * ```
 *
 * @category Interfaces
 * @since 0.3.0
 */
export interface ModeState {
  /** Current active mode */
  current: AgentMode;

  /** Previously active mode (if any) */
  previous?: AgentMode;

  /** Complete history of mode transitions */
  history: Array<{ mode: AgentMode; timestamp: number; reason?: string }>;

  /** Transition currently in progress (awaiting confirmation) */
  transitionInProgress?: {
    from: AgentMode;
    to: AgentMode;
    awaitingConfirmation: boolean;
  };

  /** Pending transition request not yet processed */
  pendingRequest?: ModeTransitionRequest;
}

/**
 * Mode transition request
 *
 * Represents a request to change modes, including metadata about the
 * request source and reason.
 *
 * @example
 * ```typescript
 * const request: ModeTransitionRequest = {
 *   targetMode: 'debugger',
 *   reason: 'Need to investigate failing tests',
 *   source: 'model',  // AI requested the transition
 *   timestamp: Date.now()
 * };
 * ```
 *
 * @category Interfaces
 * @since 0.3.0
 */
export interface ModeTransitionRequest {
  /** Mode to transition to */
  targetMode: AgentMode;

  /** Reason for the transition */
  reason: string;

  /** Source of the request */
  source: 'model' | 'user' | 'system';

  /** When the request was made (Unix timestamp) */
  timestamp: number;
}

/**
 * Auto-approval policy for mode transitions
 *
 * Controls when mode transitions require user confirmation:
 * - `never` - Always require confirmation
 * - `prompt-only` - Require confirmation for escalation (read → write)
 * - `always-for-debugger` - Auto-approve transitions to debugger mode
 * - `always` - Auto-approve all transitions (⚠️ use with caution)
 *
 * @category Types
 * @since 0.3.0
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

/**
 * Parse task completion from text (looks for [[TASK_COMPLETE | summary=...]] tags)
 */
export function parseTaskComplete(text: string): { summary: string } | null {
  const pattern = /\[\[TASK_COMPLETE\s*\|\s*summary=([^\]]+)\]\]/i;
  const match = text.match(pattern);
  if (!match) return null;
  return { summary: match[1].trim() };
}

/**
 * Strip task complete tags from text (for display)
 */
export function stripTaskComplete(text: string): string {
  return text.replace(/\[\[TASK_COMPLETE[^\]]+\]\]/gi, '').trim();
}

export function isValidMode(mode: string): mode is AgentMode {
  return [
    'plan', 'agent', 'tester', 'debugger', 'security', 'review',
    'team_leader', 'seo', 'product', 'architect', 'engineer', 'data', 'researcher'
  ].includes(mode);
}

export function getAllModes(): AgentMode[] {
  return [
    'plan', 'agent', 'tester', 'debugger', 'security', 'review',
    'team_leader', 'seo', 'product', 'architect', 'engineer', 'data', 'researcher'
  ];
}