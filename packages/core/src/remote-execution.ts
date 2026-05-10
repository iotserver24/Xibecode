import { randomUUID } from 'crypto';

export type RemoteExecutionConfig = {
  gatewayUrl: string;
  authToken?: string;
  sessionId?: string;
  strategy?: 'host_only';
  cwd?: string;
};

export type RemoteExecutionRequest = {
  command: string;
  cwd?: string;
  input?: string;
  timeout?: number;
  maxOutputChars?: number;
};

export class RemoteExecutionClient {
  private readonly gatewayUrl: string;
  private readonly authToken?: string;
  private readonly strategy: 'host_only';
  private readonly cwd?: string;
  private sessionId: string;
  private initialized = false;

  constructor(config: RemoteExecutionConfig) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/+$/, '');
    this.authToken = config.authToken;
    this.sessionId = config.sessionId || randomUUID();
    this.strategy = config.strategy || 'host_only';
    this.cwd = config.cwd;
  }

  getSessionId(): string {
    return this.sessionId;
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
      }),
    });
    const payload = await this.parseJson(response);
    if (!response.ok || payload?.success === false) {
      const message = payload?.message || `Gateway session setup failed (${response.status})`;
      throw new Error(message);
    }
    if (typeof payload?.sessionId === 'string' && payload.sessionId.trim()) {
      this.sessionId = payload.sessionId.trim();
    }
    this.initialized = true;
  }

  async runCommand(input: RemoteExecutionRequest): Promise<any> {
    await this.ensureSession();

    const timeoutSeconds = Math.max(1, Number(input.timeout || 120));
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), timeoutSeconds * 1000 + 1500);

    try {
      const response = await fetch(
        `${this.gatewayUrl}/sessions/${encodeURIComponent(this.sessionId)}/exec`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            command: input.command,
            cwd: input.cwd,
            input: input.input,
            timeout: timeoutSeconds,
            maxOutputChars: input.maxOutputChars,
          }),
          signal: controller.signal,
        },
      );

      const payload = await this.parseJson(response);
      if (!response.ok || payload?.success === false) {
        const message = payload?.message || `Gateway command failed (${response.status})`;
        return {
          success: false,
          error: true,
          stdout: String(payload?.stdout ?? ''),
          stderr: String(payload?.stderr ?? message),
          exitCode: payload?.exitCode,
          timedOut: false,
          platform: 'e2b',
          sessionId: this.sessionId,
        };
      }

      return {
        success: payload?.success !== false,
        stdout: String(payload?.stdout ?? ''),
        stderr: String(payload?.stderr ?? ''),
        exitCode: payload?.exitCode,
        timedOut: Boolean(payload?.timedOut),
        platform: String(payload?.platform ?? 'e2b'),
        sessionId: this.sessionId,
      };
    } catch (error: any) {
      const aborted = error?.name === 'AbortError';
      return {
        success: false,
        error: true,
        stdout: '',
        stderr: aborted
          ? `Remote command timed out after ${timeoutSeconds}s.`
          : `Remote execution error: ${error?.message || String(error)}`,
        exitCode: undefined,
        timedOut: aborted,
        platform: 'e2b',
        sessionId: this.sessionId,
      };
    } finally {
      clearTimeout(abortTimer);
    }
  }
}
