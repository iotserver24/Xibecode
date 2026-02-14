# XibeCode Coding Standards

> **Version:** 1.0
> **Last Updated:** February 2026

This document defines coding standards and documentation requirements for XibeCode. All contributors must follow these standards.

## Table of Contents

1. [Documentation Standards](#documentation-standards)
2. [JSDoc Templates](#jsdoc-templates)
3. [TypeScript Style Guide](#typescript-style-guide)
4. [Code Organization](#code-organization)
5. [Naming Conventions](#naming-conventions)
6. [Error Handling](#error-handling)
7. [Testing Standards](#testing-standards)
8. [Git Commit Standards](#git-commit-standards)

---

## Documentation Standards

### Documentation Coverage Requirements

| Scope | Coverage Required | JSDoc Tags Required |
|-------|-------------------|---------------------|
| Public APIs | 100% | `@param`, `@returns`, `@example` |
| Internal functions | 80% | `@param`, `@returns` |
| Helper functions | 50% | `@param`, `@returns` |
| Type definitions | 100% | Description only |
| Complex logic | 100% | `@param`, `@returns`, `@example` |

### What Requires Documentation

#### ✅ Always Document

1. **Public Functions and Methods**
   ```typescript
   /**
    * Brief description
    *
    * Detailed explanation
    *
    * @example
    * ```typescript
    * const result = myFunction('input');
    * ```
    *
    * @param param1 - Description
    * @returns Description
    */
   export function myFunction(param1: string): Result { }
   ```

2. **Classes and Interfaces**
   ```typescript
   /**
    * Brief description of the class
    *
    * Detailed explanation of purpose and usage
    *
    * @example
    * ```typescript
    * const instance = new MyClass(config);
    * await instance.doSomething();
    * ```
    */
   export class MyClass { }
   ```

3. **Complex Types**
   ```typescript
   /**
    * Configuration options for the agent
    *
    * @property apiKey - Anthropic API key
    * @property model - Model identifier
    * @property maxIterations - Maximum loop iterations (default: 50)
    */
   export interface AgentConfig {
     apiKey: string;
     model: string;
     maxIterations?: number;
   }
   ```

4. **Exported Constants**
   ```typescript
   /**
    * Maximum number of agent loop iterations before stopping
    */
   export const MAX_ITERATIONS = 50;
   ```

5. **Tool Definitions**
   ```typescript
   /**
    * Reads a file from the filesystem
    *
    * Supports reading text and binary files with automatic encoding detection.
    * Large files are truncated to prevent memory issues.
    *
    * @example
    * ```typescript
    * const result = await executeTool('read_file', { path: '/app.ts' });
    * console.log(result.output);
    * ```
    *
    * @param input - Tool input parameters
    * @param input.path - Absolute or relative file path
    * @param input.encoding - File encoding (default: 'utf-8')
    * @returns File contents or error message
    * @throws {FileNotFoundError} If file does not exist
    * @throws {PermissionError} If file not readable
    *
    * @category File Operations
    * @mode All modes
    * @since 0.1.0
    */
   ```

#### ❌ Don't Require Documentation

1. **Self-Explanatory Private Helpers**
   ```typescript
   // OK: No JSDoc needed for obvious helpers
   private isValid(str: string): boolean {
     return str.length > 0;
   }
   ```

2. **Getters/Setters (if obvious)**
   ```typescript
   // OK: No JSDoc for simple accessors
   get name(): string {
     return this._name;
   }
   ```

3. **Implementation Details**
   ```typescript
   // OK: Implementation internals don't need JSDoc
   private _internalCache = new Map();
   ```

---

## JSDoc Templates

### Function Template

```typescript
/**
 * [One-line summary of what the function does]
 *
 * [Detailed explanation including]:
 * - Key behaviors and side effects
 * - Important preconditions or assumptions
 * - Usage patterns and best practices
 * - Performance characteristics (if relevant)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await functionName(param1, param2);
 * console.log(result);
 * ```
 *
 * @example
 * ```typescript
 * // Advanced usage
 * const result = await functionName(param1, param2, {
 *   option: 'value'
 * });
 * ```
 *
 * @param paramName - Description of parameter with constraints
 * @param optionalParam - Description (optional, default: value)
 * @param options - Configuration options
 * @param options.field - Description of nested field
 * @returns Description of return value including type and meaning
 * @throws {ErrorType} When this specific error occurs
 * @throws {AnotherError} When this other error occurs
 *
 * @see {@link RelatedFunction} for related functionality
 * @see {@link OtherClass} for context
 * @since 0.3.5
 * @category [Category Name]
 * @internal (if internal API)
 * @deprecated Use {@link NewFunction} instead
 */
export async function functionName(
  paramName: string,
  optionalParam?: number,
  options?: Options
): Promise<Result> {
  // Implementation
}
```

### Class Template

```typescript
/**
 * [One-line summary of the class purpose]
 *
 * [Detailed explanation including]:
 * - Primary responsibilities
 * - Key design decisions
 * - Usage patterns
 * - Lifecycle (initialization, cleanup)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const instance = new ClassName(config);
 * const result = await instance.method();
 * await instance.cleanup();
 * ```
 *
 * @example
 * ```typescript
 * // Advanced usage with options
 * const instance = new ClassName({
 *   ...config,
 *   advanced: true
 * });
 * instance.on('event', handler);
 * ```
 *
 * @category [Category Name]
 * @since 0.3.5
 */
export class ClassName {
  /**
   * Creates a new instance
   *
   * @param config - Configuration options
   * @throws {ConfigError} If configuration is invalid
   */
  constructor(config: Config) {
    // Implementation
  }

  /**
   * [Method documentation]
   *
   * @param param - Parameter description
   * @returns Return description
   */
  public async method(param: string): Promise<Result> {
    // Implementation
  }
}
```

### Interface Template

```typescript
/**
 * [One-line summary of the interface purpose]
 *
 * [Detailed explanation of when and how to use this interface]
 *
 * @example
 * ```typescript
 * const config: InterfaceName = {
 *   field1: 'value',
 *   field2: 42
 * };
 * ```
 *
 * @category [Category Name]
 * @since 0.3.5
 */
export interface InterfaceName {
  /**
   * [Field description]
   *
   * @default Default value if applicable
   */
  field1: string;

  /**
   * [Optional field description]
   *
   * @optional
   * @default Default value
   */
  field2?: number;

  /**
   * [Complex field description]
   */
  nested: {
    /** Sub-field description */
    subField: boolean;
  };
}
```

### Type Alias Template

```typescript
/**
 * [One-line summary of the type]
 *
 * [Detailed explanation of valid values and usage]
 *
 * @example
 * ```typescript
 * const mode: AgentMode = 'plan';
 * ```
 *
 * @category [Category Name]
 * @since 0.3.5
 */
export type TypeName = 'value1' | 'value2' | 'value3';
```

### Tool Definition Template

```typescript
/**
 * [One-line summary of tool purpose]
 *
 * [Detailed explanation including]:
 * - What the tool does
 * - When to use it
 * - Important behaviors or limitations
 * - Side effects
 *
 * @example
 * ```typescript
 * const result = await executeTool('tool_name', {
 *   param: 'value'
 * });
 * ```
 *
 * @param input - Tool input parameters
 * @param input.param1 - Description with constraints
 * @param input.param2 - Optional parameter (optional)
 * @returns Tool execution result
 * @throws {ErrorType} When error occurs
 *
 * @category [Tool Category]
 * @mode Modes that can use this tool
 * @since Version when added
 */
{
  name: 'tool_name',
  description: 'Brief description for Claude AI',
  input_schema: { /* JSON Schema */ },
  execute: async (input) => { /* Implementation */ }
}
```

---

## JSDoc Tag Reference

### Required Tags

| Tag | Usage | When Required |
|-----|-------|---------------|
| `@param` | Parameter description | All functions with parameters |
| `@returns` | Return value description | All non-void functions |
| `@example` | Usage example | All public APIs |

### Optional Tags

| Tag | Usage | When to Use |
|-----|-------|-------------|
| `@throws` | Error conditions | Functions that throw errors |
| `@see` | Related references | When related APIs exist |
| `@since` | Version added | New APIs |
| `@deprecated` | Deprecation notice | Deprecated APIs |
| `@category` | Logical grouping | For organization |
| `@internal` | Internal API | Non-public APIs |
| `@default` | Default value | Optional parameters |

### Custom Tags

| Tag | Usage | When to Use |
|-----|-------|-------------|
| `@mode` | Allowed agent modes | Tool definitions |
| `@tool-category` | Tool category | Tool definitions |
| `@risk-level` | Risk assessment | Dangerous operations |

---

## TypeScript Style Guide

### Type Annotations

#### Always Annotate

```typescript
// ✅ Good: Explicit types
function processFile(filePath: string, options: FileOptions): Promise<FileResult> {
  return fileProcessor.process(filePath, options);
}

// ✅ Good: Annotated parameters
const callback = (data: CallbackData): void => {
  console.log(data);
};
```

#### Type Inference OK

```typescript
// ✅ Good: Obvious inference
const name = 'xibecode'; // string inferred
const count = 42;        // number inferred
const items = [1, 2, 3]; // number[] inferred

// ✅ Good: Generic type inference
const mapped = items.map(x => x * 2); // number[] inferred
```

#### Avoid Any

```typescript
// ❌ Bad: Using any
function process(data: any): any {
  return data.value;
}

// ✅ Good: Proper types
function process(data: ProcessInput): ProcessOutput {
  return { result: data.value };
}

// ✅ Good: Unknown for truly unknown types
function process(data: unknown): ProcessOutput {
  if (isProcessInput(data)) {
    return { result: data.value };
  }
  throw new Error('Invalid input');
}
```

### Interfaces vs Types

#### Use Interfaces For

```typescript
// ✅ Good: Object shapes
interface Config {
  apiKey: string;
  model: string;
}

// ✅ Good: Extensibility
interface BaseConfig {
  apiKey: string;
}

interface ExtendedConfig extends BaseConfig {
  model: string;
}
```

#### Use Types For

```typescript
// ✅ Good: Unions
type Status = 'pending' | 'running' | 'complete';

// ✅ Good: Intersections
type Extended = BaseType & AdditionalProps;

// ✅ Good: Mapped types
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

// ✅ Good: Complex types
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Async/Await

```typescript
// ✅ Good: Async/await
async function loadData(): Promise<Data> {
  const raw = await fetchData();
  const processed = await processData(raw);
  return processed;
}

// ❌ Bad: Promise chains
function loadData(): Promise<Data> {
  return fetchData()
    .then(raw => processData(raw))
    .then(processed => processed);
}
```

### Error Handling

```typescript
// ✅ Good: Specific error handling
try {
  await riskyOperation();
} catch (error) {
  if (error instanceof FileNotFoundError) {
    console.error('File not found:', error.path);
  } else if (error instanceof PermissionError) {
    console.error('Permission denied:', error.message);
  } else {
    throw error; // Re-throw unexpected errors
  }
}

// ❌ Bad: Catching and ignoring
try {
  await riskyOperation();
} catch (error) {
  // Silent failure
}

// ❌ Bad: Generic error handling
try {
  await riskyOperation();
} catch (error) {
  console.error('Error:', error);
  // No specific handling
}
```

### Null Safety

```typescript
// ✅ Good: Optional chaining
const value = obj?.nested?.property;

// ✅ Good: Nullish coalescing
const config = userConfig ?? defaultConfig;

// ✅ Good: Type guards
if (value !== null && value !== undefined) {
  // value is defined here
}

// ❌ Bad: Assuming non-null
const value = obj.nested.property; // Can throw if obj is undefined
```

---

## Code Organization

### File Structure

```typescript
// 1. Imports (grouped and sorted)
// External dependencies
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';

// Type imports
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';

// Internal imports
import { AgentMode, MODE_CONFIG } from './modes.js';
import { NeuralMemory } from './memory.js';

// 2. Type Definitions
export interface Config {
  // ...
}

export type Status = 'pending' | 'running';

// 3. Constants
const DEFAULT_CONFIG = {
  // ...
};

export const MAX_ITERATIONS = 50;

// 4. Main Exports (classes, functions)
export class MyClass {
  // ...
}

export function myFunction() {
  // ...
}

// 5. Helper Functions (not exported)
function helperFunction() {
  // ...
}
```

### Import Organization

```typescript
// ✅ Good: Grouped and ordered
// 1. External packages
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import ora from 'ora';

// 2. Type imports
import type { Tool, MessageParam } from '@anthropic-ai/sdk/resources/messages';

// 3. Internal modules (by path depth)
import { Config } from './types.js';
import { ToolExecutor } from './core/tools.js';
import { Helper } from './utils/helpers.js';

// ❌ Bad: Unorganized
import { Helper } from './utils/helpers.js';
import chalk from 'chalk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import Anthropic from '@anthropic-ai/sdk';
import { Config } from './types.js';
```

### Function Organization

```typescript
class MyClass {
  // 1. Public properties
  public config: Config;

  // 2. Private properties
  private _internalState: State;

  // 3. Constructor
  constructor(config: Config) {
    this.config = config;
  }

  // 4. Public methods (most important first)
  public async execute(): Promise<Result> {
    // ...
  }

  public async process(): Promise<void> {
    // ...
  }

  // 5. Public helper methods
  public validate(): boolean {
    // ...
  }

  // 6. Private methods
  private async _internalMethod(): Promise<void> {
    // ...
  }

  // 7. Private helpers
  private _simpleHelper(): string {
    // ...
  }
}
```

---

## Naming Conventions

### General Rules

| Type | Convention | Example |
|------|-----------|---------|
| Classes | PascalCase | `EnhancedAgent` |
| Interfaces | PascalCase | `AgentConfig` |
| Types | PascalCase | `AgentMode` |
| Functions | camelCase | `executeTools` |
| Methods | camelCase | `runAgent` |
| Variables | camelCase | `maxIterations` |
| Constants | UPPER_SNAKE_CASE | `MAX_ITERATIONS` |
| Private members | _camelCase | `_internalState` |
| Type parameters | Single letter or PascalCase | `T`, `TConfig` |

### Specific Guidelines

#### Classes

```typescript
// ✅ Good: Descriptive nouns
class EnhancedAgent { }
class FileEditor { }
class ContextManager { }

// ❌ Bad: Vague or abbreviated
class Agt { }
class Mgr { }
class Util { }
```

#### Functions

```typescript
// ✅ Good: Verb + Noun
function executeTools() { }
function loadMemory() { }
function parseConfig() { }

// ❌ Bad: Unclear purpose
function doStuff() { }
function handle() { }
function process() { }
```

#### Boolean Variables

```typescript
// ✅ Good: Question form
const isValid = true;
const hasPermission = false;
const canModify = true;
const shouldRetry = false;

// ❌ Bad: Not clearly boolean
const valid = true;
const permission = false;
```

#### Constants

```typescript
// ✅ Good: Descriptive and scoped
const MAX_LOOP_ITERATIONS = 50;
const DEFAULT_MODEL_NAME = 'claude-sonnet-4-5';
const API_BASE_URL = 'https://api.anthropic.com';

// ❌ Bad: Too generic
const MAX = 50;
const DEFAULT = 'value';
```

---

## Error Handling

### Custom Error Classes

```typescript
// ✅ Good: Specific error types
export class FileNotFoundError extends Error {
  constructor(
    public readonly path: string,
    message?: string
  ) {
    super(message ?? `File not found: ${path}`);
    this.name = 'FileNotFoundError';
  }
}

export class PermissionError extends Error {
  constructor(
    public readonly operation: string,
    public readonly reason: string
  ) {
    super(`Permission denied for ${operation}: ${reason}`);
    this.name = 'PermissionError';
  }
}
```

### Error Handling Patterns

```typescript
// ✅ Good: Specific catch blocks
try {
  await operation();
} catch (error) {
  if (error instanceof FileNotFoundError) {
    // Handle file not found
    return defaultValue;
  } else if (error instanceof PermissionError) {
    // Handle permission error
    throw new UserError(`Access denied: ${error.reason}`);
  } else {
    // Re-throw unexpected errors
    throw error;
  }
}

// ✅ Good: Error wrapping
try {
  await lowLevelOperation();
} catch (error) {
  throw new HighLevelError(
    'Operation failed',
    { cause: error }
  );
}
```

### Result Types

```typescript
// ✅ Good: Result type for expected failures
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function safeParse(input: string): Promise<Result<Data>> {
  try {
    const data = JSON.parse(input);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: 'Invalid JSON' };
  }
}

// Usage
const result = await safeParse(input);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

---

## Testing Standards

### Test Organization

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('FunctionName', () => {
  // Setup
  beforeEach(() => {
    // Reset state
  });

  // Happy path
  it('should return expected result for valid input', () => {
    const result = functionName('valid');
    expect(result).toBe('expected');
  });

  // Edge cases
  it('should handle empty input', () => {
    expect(() => functionName('')).toThrow();
  });

  it('should handle null input', () => {
    expect(() => functionName(null)).toThrow();
  });

  // Error cases
  it('should throw error for invalid input', () => {
    expect(() => functionName('invalid')).toThrow(ValidationError);
  });
});
```

### Test Naming

```typescript
// ✅ Good: Descriptive test names
it('should execute tool and return success result')
it('should throw PermissionError when tool not allowed in current mode')
it('should handle network timeout gracefully')

// ❌ Bad: Vague test names
it('works')
it('test error')
it('handles input')
```

---

## Git Commit Standards

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

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

---

## Summary Checklist

### Before Committing

- [ ] All public APIs have JSDoc comments
- [ ] Examples provided for complex functions
- [ ] Type annotations are explicit
- [ ] No `any` types (use `unknown` instead)
- [ ] Error handling is specific
- [ ] Tests cover happy path and edge cases
- [ ] Code follows naming conventions
- [ ] Imports are organized
- [ ] No console.log or debug code
- [ ] Commit message follows format

### Documentation Checklist

- [ ] JSDoc for all public functions
- [ ] `@param` tags for all parameters
- [ ] `@returns` tag for return values
- [ ] `@example` tags with working code
- [ ] `@throws` tags for errors
- [ ] Related docs updated
- [ ] README updated (if needed)

---

**Document Version**: 1.0
**Last Updated**: February 14, 2026
**Maintained By**: XibeCode Team
