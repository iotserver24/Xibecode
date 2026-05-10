import { randomUUID } from 'crypto';
import type { RemoteExecutionConfig } from './remote-execution.js';

type JsonValue = Record<string, unknown>;

export class RemoteWorkspaceClient {
  private readonly gatewayUrl: string;
  private readonly authToken?: string;
  private readonly strategy: 'host_only' | 'sandbox_full';
  private readonly cwd?: string;
  private workspaceRoot?: string;
  private sessionId: string;
  private initialized = false;

  constructor(config: RemoteExecutionConfig) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/+$/, '');
    this.authToken = config.authToken;
    this.sessionId = config.sessionId || randomUUID();
    this.strategy = config.strategy || 'host_only';
    this.cwd = config.cwd;
    this.workspaceRoot = config.workspaceRoot?.trim() || undefined;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspaceRoot;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async parseJson(response: Response): Promise<JsonValue> {
    const text = await response.text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as JsonValue;
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
      throw new Error(String(payload?.message || `Gateway session setup failed (${response.status})`));
    }
    if (typeof payload?.sessionId === 'string' && payload.sessionId.trim()) {
      this.sessionId = payload.sessionId.trim();
    }
    if (typeof payload?.workspaceRoot === 'string' && payload.workspaceRoot.trim()) {
      this.workspaceRoot = payload.workspaceRoot.trim();
    }
    this.initialized = true;
  }

  private async request<T = JsonValue>(path: string, init: RequestInit = {}): Promise<T> {
    await this.ensureSession();
    const response = await fetch(`${this.gatewayUrl}${path}`, {
      ...init,
      headers: {
        ...this.getHeaders(),
        ...(init.headers || {}),
      },
    });
    const payload = (await this.parseJson(response)) as T & { success?: boolean; message?: string };
    if (!response.ok || (payload && (payload as any).success === false)) {
      const message = (payload as any)?.message || `Gateway request failed (${response.status})`;
      throw new Error(String(message));
    }
    return payload as T;
  }

  async readFile(filePath: string, startLine?: number, endLine?: number): Promise<any> {
    const query = new URLSearchParams({ path: filePath });
    if (typeof startLine === 'number') query.set('start_line', String(startLine));
    if (typeof endLine === 'number') query.set('end_line', String(endLine));
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/file?${query.toString()}`, {
      method: 'GET',
    });
  }

  async writeFile(filePath: string, content: string): Promise<any> {
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, content }),
    });
  }

  async deleteFile(filePath: string): Promise<any> {
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/file`, {
      method: 'DELETE',
      body: JSON.stringify({ path: filePath }),
    });
  }

  async listDirectory(dirPath: string): Promise<any> {
    const query = new URLSearchParams({ path: dirPath });
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/list?${query.toString()}`, {
      method: 'GET',
    });
  }

  async createDirectory(dirPath: string): Promise<any> {
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/directory`, {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    });
  }

  async moveFile(source: string, destination: string): Promise<any> {
    return this.request(`/sessions/${encodeURIComponent(this.sessionId)}/move`, {
      method: 'POST',
      body: JSON.stringify({ source, destination }),
    });
  }
}
