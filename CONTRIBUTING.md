# Contributing to XibeCode

Thank you for your interest in contributing to XibeCode! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Project Structure](#project-structure)
5. [Development Workflow](#development-workflow)
6. [Coding Standards](#coding-standards)
7. [Documentation](#documentation)
8. [Testing](#testing)
9. [Pull Request Process](#pull-request-process)
10. [Issue Guidelines](#issue-guidelines)
11. [Release Process](#release-process)

---

## Code of Conduct

### Our Pledge

We pledge to make participation in XibeCode a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity, level of experience, nationality, personal appearance, race, religion, or sexual identity.

### Our Standards

**Positive behavior includes**:
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other contributors

**Unacceptable behavior includes**:
- Trolling, insulting comments, or personal attacks
- Public or private harassment
- Publishing others' private information
- Any conduct that would be considered inappropriate in a professional setting

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js**: >= 18.0.0 (LTS recommended)
- **npm**: >= 9.0.0 or **pnpm** >= 8.0.0
- **Git**: >= 2.30.0
- **TypeScript**: Familiarity with TypeScript 5.3+
- **Anthropic API Key**: For testing (get from https://console.anthropic.com/)

### First-Time Contributors

If you're new to contributing:

1. **Read the documentation**:
   - [README.md](./README.md) - Project overview
   - [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
   - [API_REFERENCE.md](./API_REFERENCE.md) - API documentation

2. **Look for good first issues**:
   - Browse issues labeled `good-first-issue`
   - Check issues labeled `help-wanted`

3. **Join the community**:
   - GitHub Discussions: Ask questions and share ideas
   - Issues: Report bugs and request features

---

## Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/xibecode.git
cd xibecode

# Add upstream remote
git remote add upstream https://github.com/iotserver24/xibecode.git
```

### 2. Install Dependencies

```bash
# Install dependencies
npm install

# Or with pnpm
pnpm install
```

### 3. Set Up Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your Anthropic API key
echo "ANTHROPIC_API_KEY=your_api_key_here" >> .env
```

### 4. Build the Project

```bash
# Compile TypeScript
npm run build

# Watch mode for development
npx tsx watch src/index.ts
```

### 5. Verify Installation

```bash
# Test the CLI
npm run dev -- --help

# Run tests
npm test
```

---

## Project Structure

```
xibecode/
├── src/                      # Source code
│   ├── core/                 # Core agent components
│   │   ├── agent.ts          # Main agent loop
│   │   ├── tools.ts          # Tool executor (95+ tools)
│   │   ├── modes.ts          # Multi-mode system (13 personas)
│   │   ├── editor.ts         # File editing strategies
│   │   ├── context.ts        # Context management
│   │   ├── memory.ts         # Neural memory system
│   │   ├── skills.ts         # Skill loading
│   │   ├── plugins.ts        # Plugin system
│   │   └── mcp-client.ts     # MCP integration
│   ├── commands/             # CLI commands
│   │   ├── run.ts            # Run command
│   │   ├── chat.ts           # Chat command
│   │   ├── config.ts         # Config command
│   │   └── mcp.ts            # MCP command
│   ├── utils/                # Utility functions
│   │   ├── git.ts            # Git utilities
│   │   ├── safety.ts         # Safety checker
│   │   └── testRunner.ts     # Test detection
│   ├── ui/                   # User interface
│   │   └── enhanced-tui.tsx  # Terminal UI
│   └── index.ts              # Entry point
├── test/                     # Test files
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── docs/                     # Documentation
│   ├── architecture/         # Architecture docs
│   ├── api/                  # API reference
│   ├── guides/               # Developer guides
│   ├── personas/             # Agent persona docs
│   └── examples/             # Code examples
├── site/                     # Documentation website
│   └── app/                  # Next.js app
├── dist/                     # Compiled output
├── ARCHITECTURE.md           # Architecture overview
├── CONTRIBUTING.md           # This file
├── API_REFERENCE.md          # API documentation
├── CODING_STANDARDS.md       # Coding standards
└── package.json              # Package configuration
```

### Key Directories

- **`src/core/`**: Core agent logic - start here for most contributions
- **`src/commands/`**: CLI command implementations
- **`src/utils/`**: Shared utilities and helpers
- **`test/`**: All test files
- **`docs/`**: Markdown documentation

---

## Development Workflow

### 1. Create a Branch

```bash
# Update your fork
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name

# Or a bugfix branch
git checkout -b fix/your-bug-fix
```

### Branch Naming Convention

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring
- `test/description` - Test additions/changes
- `chore/description` - Maintenance tasks

### 2. Make Changes

```bash
# Make your changes
# Write tests for your changes
# Update documentation if needed

# Build and test locally
npm run build
npm test
```

### 3. Commit Changes

```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "feat: add support for custom plugins"
```

**Commit Message Format**:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Maintenance tasks
- `perf`: Performance improvements

**Examples**:

```bash
feat(tools): add http_request tool with retry logic

Add a new http_request tool that supports:
- GET, POST, PUT, DELETE methods
- Custom headers
- Automatic retry on failure
- Timeout configuration

Closes #123
```

```bash
fix(agent): prevent infinite loop in tool execution

Loop detector was not correctly tracking tool calls with
complex input objects. Fixed by using JSON serialization
for comparison.

Fixes #456
```

### 4. Push Changes

```bash
# Push to your fork
git push origin feature/your-feature-name
```

### 5. Create Pull Request

1. Go to your fork on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill in the PR template
5. Submit for review

---

## Coding Standards

### TypeScript Style Guide

#### 1. Type Annotations

```typescript
// ✅ Good: Explicit types for function parameters and returns
function processFile(filePath: string, options: FileOptions): Promise<FileResult> {
  // ...
}

// ❌ Bad: No type annotations
function processFile(filePath, options) {
  // ...
}
```

#### 2. Interface vs Type

```typescript
// ✅ Good: Use interfaces for object shapes
interface ToolConfig {
  name: string;
  description: string;
}

// ✅ Good: Use types for unions and complex types
type AgentMode = 'plan' | 'agent' | 'tester';
```

#### 3. Async/Await

```typescript
// ✅ Good: Use async/await for promises
async function loadFile(path: string): Promise<string> {
  const content = await fs.readFile(path, 'utf-8');
  return content;
}

// ❌ Bad: Using .then() chains
function loadFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf-8').then(content => content);
}
```

#### 4. Error Handling

```typescript
// ✅ Good: Proper error handling with specific types
try {
  await riskyOperation();
} catch (error) {
  if (error instanceof FileNotFoundError) {
    // Handle specific error
  } else {
    throw error;
  }
}

// ❌ Bad: Catching and ignoring errors
try {
  await riskyOperation();
} catch (error) {
  // Silent failure
}
```

#### 5. Naming Conventions

```typescript
// Classes: PascalCase
class EnhancedAgent { }

// Interfaces: PascalCase
interface AgentConfig { }

// Functions: camelCase
function executeTools() { }

// Constants: UPPER_SNAKE_CASE
const MAX_ITERATIONS = 50;

// Private members: _camelCase
class Agent {
  private _internalState: State;
}
```

#### 6. Function Length

- **Target**: 20-30 lines
- **Maximum**: 50 lines
- **If longer**: Extract helper functions

```typescript
// ✅ Good: Extracted helpers
async function processRequest(request: Request): Promise<Response> {
  const validated = validateRequest(request);
  const result = await executeRequest(validated);
  return formatResponse(result);
}

// ❌ Bad: 100-line function
async function processRequest(request: Request): Promise<Response> {
  // 100 lines of code...
}
```

### Code Organization

#### 1. File Structure

```typescript
// 1. Imports (grouped and sorted)
import { external } from 'external-package';
import type { Type } from 'type-package';
import { internal } from './internal.js';

// 2. Types and Interfaces
export interface Config { }

// 3. Constants
const DEFAULT_CONFIG = { };

// 4. Main exports
export class MyClass { }

// 5. Helper functions (not exported)
function helperFunction() { }
```

#### 2. Imports

```typescript
// ✅ Good: Grouped imports
// External dependencies
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';

// Type imports
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';

// Internal imports
import { AgentMode, MODE_CONFIG } from './modes.js';
import { NeuralMemory } from './memory.js';

// ❌ Bad: Unsorted imports
import { NeuralMemory } from './memory.js';
import chalk from 'chalk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import Anthropic from '@anthropic-ai/sdk';
```

### JSDoc Documentation

Every public function, class, and interface must have JSDoc comments. See [CODING_STANDARDS.md](./CODING_STANDARDS.md) for detailed guidelines.

**Example**:

```typescript
/**
 * Executes a tool with the given input
 *
 * Validates tool permissions, performs safety checks, and executes
 * the tool in the current mode context.
 *
 * @example
 * ```typescript
 * const result = await executeTool('read_file', { path: '/app.ts' });
 * console.log(result.output);
 * ```
 *
 * @param toolName - Name of the tool to execute
 * @param input - Tool input parameters
 * @returns Tool execution result
 * @throws {PermissionError} If tool not allowed in current mode
 * @throws {SafetyError} If operation deemed unsafe
 *
 * @see {@link CodingToolExecutor} for tool definitions
 * @since 0.3.0
 * @category Tool Execution
 */
async function executeTool(
  toolName: string,
  input: Record<string, any>
): Promise<ToolResult> {
  // Implementation
}
```

---

## Documentation

### Documentation Requirements

When making changes, update documentation:

1. **JSDoc Comments**: Add/update inline documentation
2. **API Documentation**: Update relevant API docs
3. **Architecture Docs**: Update if architecture changes
4. **README**: Update if user-facing changes
5. **Guides**: Add guides for new features

### Documentation Locations

- **Inline**: JSDoc comments in code
- **API**: `/docs/api/` - API reference docs
- **Architecture**: `/docs/architecture/` - System design
- **Guides**: `/docs/guides/` - Developer tutorials
- **Website**: `/site/app/docs/` - User-facing docs

### Writing Style

- **Be concise**: Short, clear sentences
- **Be specific**: Concrete examples over abstract descriptions
- **Be complete**: Cover all parameters and edge cases
- **Be consistent**: Follow existing documentation patterns

---

## Testing

### Test Requirements

All code changes must include tests:

1. **New Features**: Unit tests + integration tests
2. **Bug Fixes**: Regression test that would fail without the fix
3. **Refactoring**: Ensure existing tests still pass

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- agent.test.ts

# Run with coverage
npm test -- --coverage
```

### Writing Tests

#### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { functionToTest } from '../src/module.js';

describe('functionToTest', () => {
  it('should return expected result', () => {
    const result = functionToTest('input');
    expect(result).toBe('expected');
  });

  it('should handle edge cases', () => {
    expect(() => functionToTest(null)).toThrow();
  });
});
```

#### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';
import { EnhancedAgent } from '../src/core/agent.js';

describe('EnhancedAgent Integration', () => {
  it('should execute complete workflow', async () => {
    const agent = new EnhancedAgent(config);
    const result = await agent.runAgent('task');
    expect(result.success).toBe(true);
  });
});
```

### Test Coverage

- **Target**: 80% overall coverage
- **Minimum**: 70% for new code
- **Critical paths**: 100% coverage (agent loop, tool execution, safety checks)

---

## Pull Request Process

### Before Submitting

1. **Update your branch**:
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-branch
   git rebase main
   ```

2. **Run checks**:
   ```bash
   npm run build
   npm test
   npm run lint  # If linter is configured
   ```

3. **Update documentation**:
   - Update JSDoc comments
   - Update relevant markdown docs
   - Add examples if applicable

4. **Self-review**:
   - Review your own changes
   - Check for console.logs or debug code
   - Verify tests cover edge cases

### PR Template

When creating a PR, fill in the template:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Documentation
- [ ] JSDoc comments added/updated
- [ ] API docs updated
- [ ] README updated (if needed)
- [ ] Architecture docs updated (if needed)

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Tests pass locally
- [ ] No console.logs or debug code
- [ ] Branch is up to date with main

## Related Issues
Closes #<issue_number>
```

### PR Review Process

1. **Automated Checks**: CI runs tests and linting
2. **Code Review**: Maintainers review code
3. **Feedback**: Address review comments
4. **Approval**: Get approval from maintainer
5. **Merge**: Maintainer merges your PR

### Review Timeline

- **Initial response**: Within 3 days
- **Full review**: Within 7 days
- **Complex PRs**: May take longer

---

## Issue Guidelines

### Reporting Bugs

Use the bug report template:

```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- XibeCode version:
- Node.js version:
- OS:
- Anthropic model:

## Additional Context
Screenshots, logs, etc.
```

### Feature Requests

Use the feature request template:

```markdown
## Feature Description
Clear description of the feature

## Use Case
Why is this feature needed?

## Proposed Solution
How should it work?

## Alternatives Considered
Other approaches you've thought of

## Additional Context
Any other information
```

### Good Issue Practices

- **Search first**: Check if issue already exists
- **Be specific**: Provide concrete details
- **Include examples**: Show code or screenshots
- **One issue per topic**: Don't combine multiple requests

---

## Release Process

### Version Numbering

XibeCode follows [Semantic Versioning](https://semver.org/):

- **Major (1.0.0)**: Breaking changes
- **Minor (0.1.0)**: New features, backward compatible
- **Patch (0.0.1)**: Bug fixes, backward compatible

### Release Checklist

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with changes
3. **Run all tests**: `npm test`
4. **Build**: `npm run build`
5. **Tag release**: `git tag v0.3.6`
6. **Push tag**: `git push --tags`
7. **Publish to npm**: `npm publish`
8. **Create GitHub release** with notes

### Changelog Format

```markdown
## [0.3.6] - 2026-02-14

### Added
- New feature X
- Tool Y support

### Changed
- Improved performance of Z

### Fixed
- Bug in component A
- Issue with B

### Deprecated
- Old API method C

### Removed
- Deprecated feature D
```

---

## Getting Help

### Resources

- **Documentation**: `/docs` folder and website
- **GitHub Discussions**: Ask questions
- **GitHub Issues**: Report bugs
- **Architecture**: Read `ARCHITECTURE.md`
- **API Reference**: Read `API_REFERENCE.md`

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Pull Requests**: Code contributions
- **Code Reviews**: Learn from feedback

### Maintainers

- **Anish Kumar (R3AP3R editz)**: [@iotserver24](https://github.com/iotserver24)

---

## Recognition

Contributors are recognized in:

- **README.md**: Contributors section
- **CHANGELOG.md**: Release notes
- **GitHub**: Contributor graphs
- **Releases**: Release notes

Thank you for contributing to XibeCode! 🚀

---

**Document Version**: 1.0
**Last Updated**: February 14, 2026
