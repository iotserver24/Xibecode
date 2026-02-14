# XibeCode API Reference

> **Version:** 0.3.5
> **Last Updated:** February 2026

This document provides an overview of the XibeCode API. For detailed documentation of each component, see the linked documents below.

## Table of Contents

1. [Overview](#overview)
2. [Core APIs](#core-apis)
3. [Quick Reference](#quick-reference)
4. [Tool Categories](#tool-categories)
5. [Mode System](#mode-system)
6. [Extension APIs](#extension-apis)
7. [Configuration](#configuration)

---

## Overview

XibeCode exposes several APIs for different use cases:

- **Public API**: For using XibeCode programmatically
- **Tool API**: For creating custom tools
- **Plugin API**: For extending agent capabilities
- **MCP API**: For integrating external context servers
- **Mode API**: For creating custom agent modes

---

## Core APIs

### 1. EnhancedAgent

Main agent class for running autonomous coding tasks.

**Documentation**: [docs/api/agent.md](./docs/api/agent.md)

**Quick Example**:
```typescript
import { EnhancedAgent } from 'xibecode';

const agent = new EnhancedAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5-20250929',
  mode: 'agent',
  maxIterations: 50
});

agent.on('stream_text', (text) => console.log(text));
await agent.runAgent('Build a login page');
```

**Key Methods**:
- `runAgent(task: string): Promise<void>` - Execute a task
- `on(event: string, handler: Function): void` - Listen to events
- `setMode(mode: AgentMode): void` - Change agent mode

**Events**:
- `stream_text` - Agent's text output
- `tool_call` - Tool execution started
- `tool_result` - Tool execution completed
- `mode_changed` - Mode transition occurred
- `complete` - Task finished

---

### 2. CodingToolExecutor

Tool execution engine with 95+ built-in tools.

**Documentation**: [docs/api/tools.md](./docs/api/tools.md)

**Quick Example**:
```typescript
import { CodingToolExecutor } from 'xibecode';

const executor = new CodingToolExecutor({
  mode: 'agent',
  workingDir: process.cwd()
});

const result = await executor.executeTool('read_file', {
  path: '/src/app.ts'
});

console.log(result.output);
```

**Key Methods**:
- `getTools(): Tool[]` - Get available tools
- `executeTool(name, input): Promise<ToolResult>` - Execute a tool
- `isToolAllowed(name, mode): boolean` - Check tool permission

**Tool Categories**:
- File operations (read, write, edit)
- Git operations (commit, diff, status)
- Shell commands (run_command, interactive_shell)
- Web operations (search, fetch)
- Context operations (grep, find_files)
- Test operations (run_tests)

---

### 3. Mode System

Multi-persona architecture with 13 specialized modes.

**Documentation**: [docs/api/modes.md](./docs/api/modes.md)

**Quick Example**:
```typescript
import { MODE_CONFIG, transitionMode, createModeState } from 'xibecode';

const modeState = createModeState('plan');

// Transition to agent mode
const newState = transitionMode(modeState, 'agent', 'Ready to code');

// Get mode configuration
const config = MODE_CONFIG['plan'];
console.log(config.personaName); // "Aria"
console.log(config.allowedCategories); // ['read_only', 'git_read']
```

**Available Modes**:
- `plan` - Aria (Read-only planning)
- `agent` - Blaze (Full coding)
- `tester` - Tess (Test writing)
- `debugger` - Dex (Bug fixing)
- `security` - Sentinel (Security audits)
- `review` - Nova (Code review)
- `team_leader` - Arya (Task delegation)
- `seo` - Siri (SEO optimization)
- `product` - Agni (Product strategy)
- `architect` - Anna (System design)
- `engineer` - Alex (Implementation)
- `data` - David (Data analysis)
- `researcher` - Sanvi (Research)

---

### 4. FileEditor

Intelligent file editing with multiple strategies.

**Documentation**: [docs/api/editor.md](./docs/api/editor.md)

**Quick Example**:
```typescript
import { FileEditor } from 'xibecode';

const editor = new FileEditor();

// Search and replace
await editor.edit('/src/app.ts', {
  strategy: 'search-replace',
  search: 'const oldCode = 1;',
  replace: 'const newCode = 2;'
});

// Line range editing
await editor.edit('/src/app.ts', {
  strategy: 'line-range',
  startLine: 10,
  endLine: 15,
  newContent: 'new code here'
});
```

**Editing Strategies**:
- `search-replace` - Exact string replacement (most reliable)
- `line-range` - Replace line ranges
- `verified` - Edit with post-verification
- `insert` - Insert without replacing

---

### 5. ContextManager

Smart context discovery for relevant code.

**Documentation**: [docs/api/context.md](./docs/api/context.md)

**Quick Example**:
```typescript
import { ContextManager } from 'xibecode';

const contextMgr = new ContextManager({
  workingDir: process.cwd(),
  maxTokens: 50000
});

const context = await contextMgr.getContext('/src/components/Login.tsx');

console.log(context.primaryFile);
console.log(context.relatedFiles);
console.log(context.dependencies);
```

**Key Features**:
- Import detection and resolution
- Related file discovery
- Partial file loading
- Token budget management

---

### 6. NeuralMemory

Persistent learning across sessions.

**Documentation**: [docs/api/memory.md](./docs/api/memory.md)

**Quick Example**:
```typescript
import { NeuralMemory } from 'xibecode';

const memory = new NeuralMemory('/project/.xibecode/memory.json');
await memory.load();

// Store a learning
await memory.update({
  patterns: {
    'error-handling': 'Always use try-catch for async operations'
  }
});

// Query memory
const pattern = memory.get('patterns', 'error-handling');
```

**Memory Types**:
- Patterns - Code conventions
- Solutions - Problem resolutions
- Preferences - User settings
- Commands - Frequent operations

---

### 7. SkillManager

Dynamic skill loading and execution.

**Documentation**: [docs/api/skills.md](./docs/api/skills.md)

**Quick Example**:
```typescript
import { SkillManager } from 'xibecode';

const skillMgr = new SkillManager({
  skillDirs: ['./.xibecode/skills', '~/.xibecode/skills']
});

await skillMgr.loadSkills();

const skill = skillMgr.getSkill('refactor-component');
const result = await skillMgr.executeSkill('refactor-component', {
  component: 'Button'
});
```

**Skill Structure**:
```typescript
{
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  mode?: AgentMode;
}
```

---

### 8. Plugin System

Extend agent capabilities with custom tools.

**Documentation**: [docs/api/plugins.md](./docs/api/plugins.md)

**Quick Example**:
```typescript
// my-plugin.js
export default {
  name: 'my-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      input_schema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        },
        required: ['input']
      },
      execute: async (input) => {
        return { success: true, output: `Processed: ${input.input}` };
      }
    }
  ]
};

// Load plugin
import { loadPlugins } from 'xibecode';
const plugins = await loadPlugins('./.xibecode/plugins');
```

**Plugin Interface**:
```typescript
interface Plugin {
  name: string;
  version: string;
  tools: Tool[];
  init?: () => Promise<void>;
  cleanup?: () => Promise<void>;
}
```

---

### 9. MCP Client

Model Context Protocol integration.

**Documentation**: [docs/api/mcp.md](./docs/api/mcp.md)

**Quick Example**:
```typescript
import { MCPClient } from 'xibecode';

const mcp = new MCPClient();

// Connect to MCP server
await mcp.connect('filesystem', {
  type: 'stdio',
  command: 'mcp-server-filesystem',
  args: ['/workspace']
});

// List available tools
const tools = await mcp.listTools('filesystem');

// Execute remote tool
const result = await mcp.executeTool('filesystem', 'read_file', {
  path: '/data.json'
});
```

**Server Types**:
- `stdio` - Standard I/O communication
- `sse` - Server-Sent Events
- `websocket` - WebSocket connection

---

### 10. SafetyChecker

Risk assessment for operations.

**Documentation**: [docs/api/safety.md](./docs/api/safety.md)

**Quick Example**:
```typescript
import { SafetyChecker } from 'xibecode';

const safety = new SafetyChecker();

// Check command safety
const check = safety.checkCommand('rm -rf /', 'agent');

if (!check.allowed) {
  console.error(`Blocked: ${check.reason}`);
  return;
}

// Check file operation
const fileCheck = safety.checkFileOperation('write', '/etc/passwd');
if (!fileCheck.allowed) {
  console.error(`Blocked: ${fileCheck.reason}`);
}
```

**Risk Levels**:
- `low` - Read-only operations
- `medium` - Reversible modifications
- `high` - Destructive or system operations

---

## Quick Reference

### Tool Execution

```typescript
// Basic tool execution
const result = await executor.executeTool('tool_name', { param: 'value' });

// Handle result
if (result.success) {
  console.log(result.output);
} else {
  console.error(result.error);
}
```

### Mode Transitions

```typescript
// Set mode explicitly
agent.setMode('tester');

// Request mode transition
const modeRequest = '@mode:debugger Find and fix the bug';
// Agent will automatically transition
```

### Event Handling

```typescript
agent.on('stream_text', (text) => process.stdout.write(text));
agent.on('tool_call', (data) => console.log(`Calling: ${data.tool}`));
agent.on('tool_result', (data) => console.log(`Result: ${data.result}`));
agent.on('error', (error) => console.error(error));
agent.on('complete', () => console.log('Task complete'));
```

### File Editing

```typescript
// Search and replace
await editor.edit('/file.ts', {
  strategy: 'search-replace',
  search: 'old code',
  replace: 'new code'
});

// Line range
await editor.edit('/file.ts', {
  strategy: 'line-range',
  startLine: 10,
  endLine: 20,
  newContent: 'replacement'
});
```

### Context Loading

```typescript
// Get context for a file
const context = await contextMgr.getContext('/src/app.ts');

// Access context data
console.log(context.primaryFile.content);
context.relatedFiles.forEach(file => {
  console.log(file.path, file.relevance);
});
```

---

## Tool Categories

### File Operations

| Tool | Description | Mode Access |
|------|-------------|-------------|
| `read_file` | Read file contents | All modes |
| `write_file` | Write file contents | Write modes |
| `edit_file` | Edit file with strategies | Write modes |
| `delete_file` | Delete a file | Write modes |
| `create_directory` | Create directory | Write modes |
| `list_directory` | List directory contents | All modes |

**See**: [docs/api/tools.md#file-operations](./docs/api/tools.md#file-operations)

### Git Operations

| Tool | Description | Mode Access |
|------|-------------|-------------|
| `get_git_status` | Get git status | Read-only + |
| `get_git_diff` | Get git diff | Read-only + |
| `git_commit` | Create commit | Mutation modes |
| `git_reset` | Reset changes | Mutation modes |
| `create_git_checkpoint` | Save checkpoint | Mutation modes |

**See**: [docs/api/tools.md#git-operations](./docs/api/tools.md#git-operations)

### Shell Commands

| Tool | Description | Mode Access |
|------|-------------|-------------|
| `run_command` | Execute shell command | Command modes |
| `interactive_shell` | Interactive shell session | Command modes |

**See**: [docs/api/tools.md#shell-commands](./docs/api/tools.md#shell-commands)

### Web Operations

| Tool | Description | Mode Access |
|------|-------------|-------------|
| `web_search` | Search the web | All modes |
| `fetch_url` | Fetch URL content | All modes |
| `http_request` | Make HTTP request | Network modes |

**See**: [docs/api/tools.md#web-operations](./docs/api/tools.md#web-operations)

### Context Operations

| Tool | Description | Mode Access |
|------|-------------|-------------|
| `grep_code` | Search code | All modes |
| `find_files` | Find files by pattern | All modes |
| `get_context` | Get file context | All modes |

**See**: [docs/api/tools.md#context-operations](./docs/api/tools.md#context-operations)

### Test Operations

| Tool | Description | Mode Access |
|------|-------------|-------------|
| `run_tests` | Run test suite | Test modes |
| `get_test_results` | Get test results | Test modes |

**See**: [docs/api/tools.md#test-operations](./docs/api/tools.md#test-operations)

---

## Mode System

### Mode Hierarchy

```
Base Agent Tools
├── Read-Only Modes
│   ├── plan (Aria)
│   └── researcher (Sanvi)
├── Write Modes
│   ├── agent (Blaze)
│   ├── engineer (Alex)
│   └── architect (Anna)
├── Analysis Modes
│   ├── security (Sentinel)
│   ├── review (Nova)
│   ├── seo (Siri)
│   └── data (David)
├── Testing Modes
│   ├── tester (Tess)
│   └── debugger (Dex)
└── Orchestration Modes
    ├── team_leader (Arya)
    └── product (Agni)
```

### Mode Capabilities

| Mode | Read | Write | Git | Shell | Network |
|------|------|-------|-----|-------|---------|
| plan | ✅ | ❌ | Read | ❌ | ✅ |
| agent | ✅ | ✅ | ✅ | ✅ | ✅ |
| tester | ✅ | ✅ | Read | ✅ | ✅ |
| debugger | ✅ | ✅ | ✅ | ✅ | ✅ |
| security | ✅ | ⚠️  | Read | ⚠️  | ✅ |
| review | ✅ | ⚠️  | Read | ❌ | ✅ |
| researcher | ✅ | ❌ | Read | ❌ | ✅ |

**Legend**: ✅ Full access | ⚠️ Limited access | ❌ No access

**See**: [docs/api/modes.md](./docs/api/modes.md)

---

## Extension APIs

### Creating Custom Tools

```typescript
const customTool = {
  name: 'my_custom_tool',
  description: 'Performs a custom operation',
  input_schema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: 'Input parameter' }
    },
    required: ['param']
  },
  execute: async (input: { param: string }) => {
    // Tool implementation
    const result = performOperation(input.param);
    return {
      success: true,
      output: result
    };
  }
};

// Register with executor
executor.registerTool(customTool);
```

**See**: [docs/guides/adding-tools.md](./docs/guides/adding-tools.md)

### Creating Plugins

```typescript
export default {
  name: 'my-plugin',
  version: '1.0.0',

  async init() {
    // Initialize plugin
  },

  tools: [
    // Custom tools
  ],

  async cleanup() {
    // Cleanup resources
  }
};
```

**See**: [docs/guides/creating-plugins.md](./docs/guides/creating-plugins.md)

### Creating Custom Modes

```typescript
import { AgentMode, ModeCapabilities } from 'xibecode';

const customMode: ModeCapabilities = {
  name: 'Custom',
  description: 'My custom mode',
  personaName: 'CustomBot',
  personaRole: 'the Specialist',
  allowedCategories: ['read_only', 'context'],
  canModify: false,
  defaultDryRun: false,
  displayColor: '#FF6B6B',
  icon: '🤖',
  riskTolerance: 'low',
  requiresConfirmation: false,
  promptSuffix: 'Custom instructions here'
};

// Register mode
MODE_CONFIG['custom'] = customMode;
```

**See**: [docs/guides/adding-modes.md](./docs/guides/adding-modes.md)

---

## Configuration

### Agent Configuration

```typescript
interface AgentConfig {
  apiKey: string;              // Anthropic API key
  baseUrl?: string;            // API base URL (optional)
  model: string;               // Model ID
  maxIterations?: number;      // Max loop iterations (default: 50)
  verbose?: boolean;           // Verbose logging
  mode?: AgentMode;            // Initial mode (default: 'agent')
}
```

### Tool Executor Configuration

```typescript
interface ToolExecutorConfig {
  mode: AgentMode;             // Current mode
  workingDir: string;          // Working directory
  safetyCheck?: boolean;       // Enable safety checks (default: true)
  dryRun?: boolean;            // Dry-run mode (default: false)
}
```

### Context Manager Configuration

```typescript
interface ContextConfig {
  workingDir: string;          // Working directory
  maxTokens?: number;          // Token budget (default: 50000)
  maxFiles?: number;           // Max files to include (default: 20)
  partialFileLines?: number;   // Lines for partial files (default: 100)
}
```

---

## Detailed API Documentation

For detailed API documentation, see:

- **[Agent API](./docs/api/agent.md)** - EnhancedAgent class
- **[Tools API](./docs/api/tools.md)** - CodingToolExecutor and all tools
- **[Modes API](./docs/api/modes.md)** - Mode system and orchestration
- **[Editor API](./docs/api/editor.md)** - FileEditor editing strategies
- **[Context API](./docs/api/context.md)** - ContextManager API
- **[Memory API](./docs/api/memory.md)** - NeuralMemory API
- **[Skills API](./docs/api/skills.md)** - SkillManager API
- **[Plugins API](./docs/api/plugins.md)** - Plugin system API
- **[MCP API](./docs/api/mcp.md)** - MCP integration API
- **[Safety API](./docs/api/safety.md)** - SafetyChecker API
- **[Browser API](./docs/api/browser.md)** - BrowserManager API

---

## TypeScript Definitions

XibeCode is written in TypeScript and includes full type definitions. Import types:

```typescript
import type {
  AgentConfig,
  AgentMode,
  Tool,
  ToolResult,
  ModeCapabilities,
  ContextOptions
} from 'xibecode';
```

---

## Examples

### Basic Agent Usage

```typescript
import { EnhancedAgent } from 'xibecode';

const agent = new EnhancedAgent({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-5-20250929',
  mode: 'agent'
});

await agent.runAgent('Create a new React component for user profile');
```

### Multi-Mode Workflow

```typescript
const agent = new EnhancedAgent({ apiKey, model, mode: 'plan' });

// Plan phase
await agent.runAgent('Analyze the authentication system');

// Implementation phase
agent.setMode('agent');
await agent.runAgent('Implement OAuth integration');

// Testing phase
agent.setMode('tester');
await agent.runAgent('Write tests for OAuth flow');
```

### Custom Plugin

```typescript
// my-custom-plugin.js
export default {
  name: 'custom-plugin',
  version: '1.0.0',
  tools: [
    {
      name: 'analyze_performance',
      description: 'Analyze code performance',
      input_schema: {
        type: 'object',
        properties: {
          file: { type: 'string' }
        }
      },
      execute: async ({ file }) => {
        // Analysis logic
        return { success: true, output: 'Performance analysis results' };
      }
    }
  ]
};
```

---

## Additional Resources

- **[Architecture](./ARCHITECTURE.md)** - System design overview
- **[Contributing](./CONTRIBUTING.md)** - Contribution guidelines
- **[Coding Standards](./CODING_STANDARDS.md)** - Code style guide
- **[Developer Guides](./docs/guides/)** - Tutorials and guides
- **[Examples](./docs/examples/)** - Code examples

---

**Document Version**: 1.0
**Last Updated**: February 14, 2026
**API Stability**: Stable (v0.3.5)
