import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface OAuthTokenRecord {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  scope?: string;
  expires_at?: number; // epoch ms
}

export type OAuthTokenFile = Record<string, OAuthTokenRecord>;

function tokenFilePath(): string {
  return path.join(os.homedir(), '.xibecode', 'mcp-oauth-tokens.json');
}

function lockFilePath(): string {
  return path.join(os.homedir(), '.xibecode', 'mcp-oauth-tokens.lock');
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = lockFilePath();
  const dir = path.dirname(lock);
  await fs.mkdir(dir, { recursive: true });

  // Simple cross-process lock: create file exclusively.
  const startedAt = Date.now();
  while (true) {
    try {
      const handle = await fs.open(lock, 'wx');
      try {
        return await fn();
      } finally {
        await handle.close().catch(() => {});
        await fs.unlink(lock).catch(() => {});
      }
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err;
      if (Date.now() - startedAt > 20_000) throw new Error('Timed out waiting for OAuth token lock');
      await new Promise((r) => setTimeout(r, 125));
    }
  }
}

export async function readOAuthTokens(): Promise<OAuthTokenFile> {
  try {
    const content = await fs.readFile(tokenFilePath(), 'utf-8');
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') return {};
    return data as OAuthTokenFile;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return {};
    throw err;
  }
}

export async function writeOAuthTokens(tokens: OAuthTokenFile): Promise<void> {
  const file = tokenFilePath();
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const payload = JSON.stringify(tokens, null, 2) + '\n';
  await fs.writeFile(file, payload, { encoding: 'utf-8', mode: 0o600 });
}

export async function upsertOAuthToken(serverName: string, token: OAuthTokenRecord): Promise<void> {
  await withLock(async () => {
    const all = await readOAuthTokens();
    all[serverName] = token;
    await writeOAuthTokens(all);
  });
}

export async function getOAuthToken(serverName: string): Promise<OAuthTokenRecord | null> {
  const all = await readOAuthTokens();
  return all[serverName] ?? null;
}

