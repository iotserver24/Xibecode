import { ConfigManager } from './config.js';
import type { RemoteExecutionConfig } from 'xibecode-core';

export type CliRemoteExecutionConfig = {
  gatewayUrl: string;
  authToken?: string;
  sessionId?: string;
  e2bSandboxId?: string;
  strategy?: 'host_only' | 'sandbox_full';
  cwd?: string;
  workspaceRoot?: string;
};

function createSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveRemoteExecutionConfig(
  config: ConfigManager,
  cwd: string,
): CliRemoteExecutionConfig | undefined {
  if (config.getSandboxMode() !== 'e2b') return undefined;
  const gatewayUrl = config.getSandboxGatewayUrl();
  if (!gatewayUrl) return undefined;
  const strategy = config.getSandboxSessionStrategy();
  const workspaceRoot =
    process.env.XIBECODE_SANDBOX_WORKSPACE_ROOT?.trim() ||
    (strategy === 'sandbox_full' ? '/home/user/workspace' : undefined);
  return {
    gatewayUrl,
    authToken: config.getSandboxAuthToken(),
    strategy,
    cwd,
    workspaceRoot,
    sessionId: createSessionId(),
  };
}

export function getRuntimeStatusLabel(config: ConfigManager): 'local' | 'cloud' {
  return config.getSandboxMode() === 'e2b' ? 'cloud' : 'local';
}

/** Session + gateway wiring for core CodingToolExecutor (enables remote search_files / grep_code in sandbox_full). */
export function codingToolExecutorRemoteOptions(
  remote?: CliRemoteExecutionConfig,
): RemoteExecutionConfig | undefined {
  if (!remote || remote.strategy !== 'sandbox_full') return undefined;
  return {
    gatewayUrl: remote.gatewayUrl,
    authToken: remote.authToken,
    sessionId: remote.sessionId,
    strategy: 'sandbox_full',
    cwd: remote.cwd,
    workspaceRoot: remote.workspaceRoot,
  };
}

/** E2B workspace path for system-prompt guidance (host paths must not be passed as tool paths). */
export function remoteToolWorkspaceRootForAgent(remote?: CliRemoteExecutionConfig): string | undefined {
  if (!remote || remote.strategy !== 'sandbox_full') return undefined;
  const w = remote.workspaceRoot?.trim();
  if (w) return w;
  const env = process.env.XIBECODE_SANDBOX_WORKSPACE_ROOT?.trim();
  return env || '/home/user/workspace';
}

export function remoteToolSandboxIdForAgent(remote?: CliRemoteExecutionConfig): string | undefined {
  const sid = remote?.e2bSandboxId?.trim();
  return sid || undefined;
}

class CliRemoteExecutionClient {
  private readonly configRef: CliRemoteExecutionConfig;
  private readonly gatewayUrl: string;
  private readonly authToken?: string;
  private readonly cwd?: string;
  private readonly strategy: 'host_only' | 'sandbox_full';
  private readonly workspaceRoot?: string;
  private sessionId: string;
  private e2bSandboxId?: string;
  private initialized = false;

  constructor(config: CliRemoteExecutionConfig) {
    this.configRef = config;
    this.gatewayUrl = config.gatewayUrl.replace(/\/+$/, '');
    this.authToken = config.authToken;
    this.cwd = config.cwd;
    this.strategy = config.strategy || 'host_only';
    this.workspaceRoot = config.workspaceRoot;
    this.sessionId = config.sessionId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.e2bSandboxId = config.e2bSandboxId;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async parseJson(response: Response): Promise<any> {
    const text = await response.text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  async ensureSession(): Promise<void> {
    if (this.initialized) return;
    const response = await fetch(`${this.gatewayUrl}/sessions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        sessionId: this.sessionId,
        cwd: this.cwd,
        strategy: this.strategy,
        workspaceRoot: this.workspaceRoot,
      }),
    });
    const payload = await this.parseJson(response);
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || `Gateway session setup failed (${response.status})`);
    }
    if (typeof payload?.sessionId === 'string' && payload.sessionId.trim()) {
      this.sessionId = payload.sessionId.trim();
      this.configRef.sessionId = this.sessionId;
    }
    if (typeof payload?.sandboxId === 'string' && payload.sandboxId.trim()) {
      this.e2bSandboxId = payload.sandboxId.trim();
      this.configRef.e2bSandboxId = this.e2bSandboxId;
    }
    this.initialized = true;
  }

  getSandboxId(): string | undefined {
    return this.e2bSandboxId?.trim() || undefined;
  }

  private async request(path: string, init: RequestInit): Promise<any> {
    await this.ensureSession();
    const response = await fetch(`${this.gatewayUrl}${path}`, {
      ...init,
      headers: {
        ...this.getHeaders(),
        ...(init.headers || {}),
      },
    });
    const payload = await this.parseJson(response);
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || `Gateway request failed (${response.status})`);
    }
    return payload;
  }

  async runCommand(input: {
    command: string;
    cwd?: string;
    input?: string;
    timeout?: number;
    max_output_chars?: number;
  }): Promise<any> {
    await this.ensureSession();
    const timeoutSeconds = Math.max(1, Number(input.timeout || 120));
    const response = await fetch(`${this.gatewayUrl}/sessions/${encodeURIComponent(this.sessionId)}/exec`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        command: input.command,
        cwd: input.cwd,
        input: input.input,
        timeout: timeoutSeconds,
        maxOutputChars: input.max_output_chars,
      }),
    });
    const payload = await this.parseJson(response);
    if (!response.ok || payload?.success === false) {
      return {
        success: false,
        error: true,
        stdout: String(payload?.stdout ?? ''),
        stderr: String(payload?.stderr ?? payload?.message ?? `Gateway command failed (${response.status})`),
        exitCode: payload?.exitCode,
        timedOut: false,
        platform: 'e2b',
      };
    }
    return {
      success: payload?.success !== false,
      stdout: String(payload?.stdout ?? ''),
      stderr: String(payload?.stderr ?? ''),
      exitCode: payload?.exitCode,
      timedOut: Boolean(payload?.timedOut),
      platform: String(payload?.platform ?? 'e2b'),
    };
  }

  async readFile(path: string, startLine?: number, endLine?: number): Promise<any> {
    const query = new URLSearchParams({ path });
    if (typeof startLine === 'number') query.set('start_line', String(startLine));
    if (typeof endLine === 'number') query.set('end_line', String(endLine));
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/file?${query.toString()}`, {
      method: 'GET',
    });
  }

  async writeFile(path: string, content: string): Promise<any> {
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    });
  }

  async deleteFile(path: string): Promise<any> {
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/file`, {
      method: 'DELETE',
      body: JSON.stringify({ path }),
    });
  }

  async listDirectory(path: string): Promise<any> {
    const query = new URLSearchParams({ path });
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/list?${query.toString()}`, {
      method: 'GET',
    });
  }

  async createDirectory(path: string): Promise<any> {
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/directory`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  async moveFile(source: string, destination: string): Promise<any> {
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/move`, {
      method: 'POST',
      body: JSON.stringify({ source, destination }),
    });
  }
}

export function attachRemoteExecution(toolExecutor: any, remoteExecution?: CliRemoteExecutionConfig): void {
  if (!remoteExecution) return;
  if (!toolExecutor || typeof toolExecutor.execute !== 'function') return;
  const remoteClient = new CliRemoteExecutionClient(remoteExecution);
  const originalExecute = toolExecutor.execute.bind(toolExecutor);
  toolExecutor.execute = async (toolName: string, input: any) => {
    if (!remoteExecution.e2bSandboxId) {
      await remoteClient.ensureSession().catch(() => undefined);
      const sid = remoteClient.getSandboxId();
      if (sid) remoteExecution.e2bSandboxId = sid;
    }
    if (toolName === 'run_command' && input && typeof input.command === 'string') {
      return remoteClient.runCommand(input);
    }
    if (remoteExecution.strategy === 'sandbox_full') {
      if (toolName === 'read_file' && input?.path) {
        return remoteClient.readFile(input.path, input.start_line, input.end_line);
      }
      if (toolName === 'read_multiple_files' && Array.isArray(input?.paths)) {
        const files = await Promise.all(
          input.paths.map(async (targetPath: string) => {
            try {
              return await remoteClient.readFile(targetPath);
            } catch (error: any) {
              return { error: true, success: false, path: targetPath, message: error?.message || String(error) };
            }
          }),
        );
        return { files, errors: files.filter((item) => item?.error) };
      }
      if (toolName === 'write_file' && input?.path && typeof input?.content === 'string') {
        return remoteClient.writeFile(input.path, input.content);
      }
      if (toolName === 'list_directory') {
        return remoteClient.listDirectory(input?.path || '.');
      }
      if (toolName === 'create_directory' && input?.path) {
        return remoteClient.createDirectory(input.path);
      }
      if (toolName === 'delete_file' && input?.path) {
        return remoteClient.deleteFile(input.path);
      }
      if (toolName === 'move_file' && input?.source && input?.destination) {
        return remoteClient.moveFile(input.source, input.destination);
      }
      if (toolName === 'edit_file' && input?.path && typeof input?.search === 'string' && typeof input?.replace === 'string') {
        const current = await remoteClient.readFile(input.path);
        const content = String(current?.content ?? '');
        const occurrences = (content.match(new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (occurrences === 0) return { success: false, error: true, message: `Search string not found in ${input.path}` };
        if (!input?.all && occurrences > 1) {
          return { success: false, error: true, message: `Search string appears ${occurrences} times. Please be more specific or use all:true` };
        }
        const next = input?.all ? content.replaceAll(input.search, input.replace) : content.replace(input.search, input.replace);
        return remoteClient.writeFile(input.path, next);
      }
      if (toolName === 'edit_lines' && input?.path && typeof input?.new_content === 'string') {
        const current = await remoteClient.readFile(input.path);
        const lines = String(current?.content ?? '').split('\n');
        const startLine = Number(input?.start_line || 0);
        const endLine = Number(input?.end_line || 0);
        if (startLine < 1 || endLine > lines.length || startLine > endLine) {
          return { success: false, error: true, message: `Invalid line range: ${startLine}-${endLine}` };
        }
        const next = [
          ...lines.slice(0, startLine - 1),
          ...String(input.new_content).split('\n'),
          ...lines.slice(endLine),
        ].join('\n');
        return remoteClient.writeFile(input.path, next);
      }
      if (toolName === 'insert_at_line' && input?.path && typeof input?.line === 'number') {
        const current = await remoteClient.readFile(input.path);
        const lines = String(current?.content ?? '').split('\n');
        const line = Number(input.line);
        if (line < 1 || line > lines.length + 1) {
          return { success: false, error: true, message: `Invalid line number: ${line}` };
        }
        const next = [
          ...lines.slice(0, line - 1),
          ...String(input?.content ?? '').split('\n'),
          ...lines.slice(line - 1),
        ].join('\n');
        return remoteClient.writeFile(input.path, next);
      }
      if (toolName === 'verified_edit' && input?.path && typeof input?.new_content === 'string') {
        const current = await remoteClient.readFile(input.path);
        const lines = String(current?.content ?? '').split('\n');
        const startLine = Number(input?.start_line || 0);
        const endLine = Number(input?.end_line || 0);
        const oldContent = String(input?.old_content ?? '');
        if (startLine < 1 || endLine > lines.length || startLine > endLine) {
          return { success: false, error: true, message: `Invalid line range: ${startLine}-${endLine}` };
        }
        const actual = lines.slice(startLine - 1, endLine).join('\n');
        const normalize = (value: string) => value.split('\n').map((line) => line.trimEnd()).join('\n').trim();
        if (normalize(actual) !== normalize(oldContent)) {
          return { success: false, error: true, message: 'Content mismatch for verified_edit', actual_content: actual };
        }
        const next = [
          ...lines.slice(0, startLine - 1),
          ...String(input.new_content).split('\n'),
          ...lines.slice(endLine),
        ].join('\n');
        return remoteClient.writeFile(input.path, next);
      }
      if (toolName === 'run_tests') {
        const command = typeof input?.command === 'string' && input.command.trim() ? input.command : 'pnpm test';
        return remoteClient.runCommand({ command, cwd: input?.cwd, timeout: 300 });
      }
      if (toolName === 'get_git_status') {
        return remoteClient.runCommand({ command: 'git status --porcelain=v1 -b' });
      }
      if (toolName === 'get_git_diff_summary') {
        const command = input?.target ? `git diff --stat ${input.target}` : 'git diff --stat';
        return remoteClient.runCommand({ command });
      }
      if (toolName === 'get_git_changed_files') {
        const command = input?.target ? `git diff --name-only ${input.target}` : 'git diff --name-only';
        return remoteClient.runCommand({ command });
      }
    }
    return originalExecute(toolName, input);
  };
}
