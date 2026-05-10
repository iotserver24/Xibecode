import { ConfigManager } from './config.js';

export type CliRemoteExecutionConfig = {
  gatewayUrl: string;
  authToken?: string;
  sessionId?: string;
  strategy?: 'host_only';
  cwd?: string;
};

export function resolveRemoteExecutionConfig(
  config: ConfigManager,
  cwd: string,
): CliRemoteExecutionConfig | undefined {
  if (config.getSandboxMode() !== 'e2b') return undefined;
  const gatewayUrl = config.getSandboxGatewayUrl();
  if (!gatewayUrl) return undefined;
  return {
    gatewayUrl,
    authToken: config.getSandboxAuthToken(),
    strategy: config.getSandboxSessionStrategy(),
    cwd,
  };
}

export function getRuntimeStatusLabel(config: ConfigManager): 'local' | 'cloud' {
  return config.getSandboxMode() === 'e2b' ? 'cloud' : 'local';
}

class CliRemoteExecutionClient {
  private readonly gatewayUrl: string;
  private readonly authToken?: string;
  private readonly cwd?: string;
  private sessionId: string;
  private initialized = false;

  constructor(config: CliRemoteExecutionConfig) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/+$/, '');
    this.authToken = config.authToken;
    this.cwd = config.cwd;
    this.sessionId = config.sessionId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
        strategy: 'host_only',
      }),
    });
    const payload = await this.parseJson(response);
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || `Gateway session setup failed (${response.status})`);
    }
    if (typeof payload?.sessionId === 'string' && payload.sessionId.trim()) {
      this.sessionId = payload.sessionId.trim();
    }
    this.initialized = true;
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
}

export function attachRemoteExecution(toolExecutor: any, remoteExecution?: CliRemoteExecutionConfig): void {
  if (!remoteExecution) return;
  if (!toolExecutor || typeof toolExecutor.execute !== 'function') return;
  const remoteClient = new CliRemoteExecutionClient(remoteExecution);
  const originalExecute = toolExecutor.execute.bind(toolExecutor);
  toolExecutor.execute = async (toolName: string, input: any) => {
    if (toolName === 'run_command' && input && typeof input.command === 'string') {
      return remoteClient.runCommand(input);
    }
    return originalExecute(toolName, input);
  };
}
