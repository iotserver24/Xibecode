/**
 * Hook executor - runs each hook type (command, prompt, agent, HTTP, function).
 */

import { execFile } from 'child_process';
import * as http from 'http';
import * as https from 'https';
import type {
  CommandHookConfig,
  FunctionHookConfig,
  HookConfig,
  HookContext,
  HookResult,
  HttpHookConfig,
  PromptHookConfig,
  AgentHookConfig,
} from './hook-types.js';

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Execute a single hook and return the result.
 */
export async function executeHook(
  config: HookConfig | FunctionHookConfig,
  context: HookContext,
): Promise<HookResult> {
  const timeoutMs = (('timeout' in config ? config.timeout : undefined) ?? 60) * 1000 || DEFAULT_TIMEOUT_MS;

  switch (config.type) {
    case 'command':
      return executeCommandHook(config as CommandHookConfig, context, timeoutMs);
    case 'prompt':
      return executePromptHook(config as PromptHookConfig, context, timeoutMs);
    case 'agent':
      return executeAgentHook(config as AgentHookConfig, context, timeoutMs);
    case 'http':
      return executeHttpHook(config as HttpHookConfig, context, timeoutMs);
    case 'function':
      return executeFunctionHook(config as FunctionHookConfig, context, timeoutMs);
    default:
      return { continue: true, reason: `Unknown hook type: ${(config as any).type}` };
  }
}

/**
 * Execute a command hook by spawning a child process.
 *
 * Exit code semantics:
 *   0 = success
 *   2 = blocking error (stderr shown to model, tool call blocked)
 *   other = non-blocking error (stderr shown to user only)
 */
async function executeCommandHook(
  config: CommandHookConfig,
  context: HookContext,
  timeout: number,
): Promise<HookResult> {
  const command = interpolateEnv(config.command, context);

  return new Promise((resolve) => {
    const shell = config.shell === 'powershell' ? 'powershell' : '/bin/bash';
    const shellArgs = config.shell === 'powershell'
      ? ['-Command', command]
      : ['-c', command];

    const child = execFile(shell, shellArgs, {
      timeout,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, XIBE_HOOK_EVENT: context.event },
    }, (error, stdout, stderr) => {
      if (error) {
        // Exit code 2 = blocking
        if ('code' in error && error.code === 2) {
          resolve({
            continue: false,
            decision: 'block',
            reason: stderr || 'Hook blocked with exit code 2',
          });
          return;
        }
        // Timeout or other error = non-blocking
        resolve({
          continue: true,
          reason: stderr || error.message,
        });
        return;
      }

      // Parse stdout as JSON if possible
      const result = parseHookOutput(stdout);
      resolve(result);
    });

    // Kill on timeout
    setTimeout(() => {
      child.kill('SIGTERM');
    }, timeout);
  });
}

/**
 * Execute a prompt hook (placeholder - needs LLM client integration).
 */
async function executePromptHook(
  config: PromptHookConfig,
  context: HookContext,
  _timeout: number,
): Promise<HookResult> {
  // Prompt hooks need an LLM client which we don't have in core.
  // Return a no-op result; the CLI layer can override with actual LLM calls.
  return {
    continue: true,
    reason: `Prompt hook not yet supported in core: ${config.prompt.slice(0, 50)}...`,
  };
}

/**
 * Execute an agent hook (placeholder - needs agent integration).
 */
async function executeAgentHook(
  config: AgentHookConfig,
  context: HookContext,
  _timeout: number,
): Promise<HookResult> {
  // Agent hooks need to spawn a sub-agent which requires the full agent stack.
  return {
    continue: true,
    reason: `Agent hook not yet supported in core: ${config.prompt.slice(0, 50)}...`,
  };
}

/**
 * Execute an HTTP hook by POSTing JSON to the configured URL.
 */
async function executeHttpHook(
  config: HttpHookConfig,
  context: HookContext,
  timeout: number,
): Promise<HookResult> {
  const url = new URL(interpolateEnv(config.url, context));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };

  // Interpolate env vars in header values
  for (const [key, value] of Object.entries(headers)) {
    headers[key] = interpolateEnv(value, context);
  }

  const body = JSON.stringify({
    event: context.event,
    toolName: context.toolName,
    toolInput: context.toolInput,
    sessionId: context.sessionId,
    metadata: context.metadata,
  });

  return new Promise((resolve) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      headers,
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const result = parseHookOutput(data);
          resolve(result);
        } else {
          resolve({
            continue: true,
            reason: `HTTP hook returned ${res.statusCode}: ${data.slice(0, 200)}`,
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        continue: true,
        reason: `HTTP hook error: ${err.message}`,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        continue: true,
        reason: 'HTTP hook timed out',
      });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Execute a function hook (in-memory TypeScript callback).
 */
async function executeFunctionHook(
  config: FunctionHookConfig,
  context: HookContext,
  _timeout: number,
): Promise<HookResult> {
  try {
    const result = await config.fn(context);
    return result ?? { continue: true };
  } catch (err: any) {
    return {
      continue: true,
      reason: `Function hook error: ${err?.message || String(err)}`,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Interpolate $ARGUMENTS and env vars in a string.
 */
function interpolateEnv(template: string, context: HookContext): string {
  let result = template;

  // Replace $ARGUMENTS with tool input or user prompt
  if (result.includes('$ARGUMENTS')) {
    const args = context.toolName
      ? JSON.stringify(context.toolInput ?? {})
      : context.userPrompt ?? '';
    result = result.replace(/\$ARGUMENTS/g, args);
  }

  return result;
}

/**
 * Parse hook stdout as JSON, falling back to a simple continue result.
 */
function parseHookOutput(stdout: string): HookResult {
  const trimmed = stdout.trim();
  if (!trimmed) return { continue: true };

  try {
    const parsed = JSON.parse(trimmed);
    return {
      continue: parsed.continue !== false,
      suppressOutput: parsed.suppressOutput === true,
      stopReason: parsed.stopReason,
      decision: parsed.decision,
      reason: parsed.reason,
      systemMessage: parsed.systemMessage,
      updatedInput: parsed.updatedInput,
    };
  } catch {
    // Non-JSON output: treat as system message
    return {
      continue: true,
      systemMessage: trimmed,
    };
  }
}
