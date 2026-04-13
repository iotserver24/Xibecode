import * as crypto from 'crypto';
import * as http from 'http';
import { URL } from 'url';

import type { MCPServerConfig } from '../../utils/config.js';
import { getOAuthToken, upsertOAuthToken, type OAuthTokenRecord } from './oauth-store.js';

export interface OAuthStartResult {
  authUrl: string;
  redirectUri: string;
  state: string;
  note: string;
}

export interface OAuthFinishResult {
  success: boolean;
  message: string;
}

export interface PendingOAuth {
  serverName: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
}

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function pkcePair(): { codeVerifier: string; codeChallenge: string } {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { codeVerifier: verifier, codeChallenge: challenge };
}

async function discoverEndpoints(cfg: MCPServerConfig): Promise<{
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
}> {
  const oauth = cfg.oauth;
  if (!oauth) throw new Error('This MCP server has no oauth config');
  const clientId = oauth.clientId;
  if (!clientId) throw new Error('Missing oauth.clientId in MCP server config');

  // Prefer explicit endpoints.
  if (oauth.authorizationUrl && oauth.tokenUrl) {
    return {
      authorizationUrl: oauth.authorizationUrl,
      tokenUrl: oauth.tokenUrl,
      clientId,
      scopes: oauth.scopes || [],
    };
  }

  // Minimal discovery: if auth server metadata URL is provided, read it and pull endpoints.
  if (oauth.authServerMetadataUrl) {
    const res = await fetch(oauth.authServerMetadataUrl);
    if (!res.ok) throw new Error(`Failed to fetch auth server metadata (${res.status})`);
    const meta = (await res.json()) as any;
    if (!meta.authorization_endpoint || !meta.token_endpoint) {
      throw new Error('Auth server metadata missing authorization_endpoint/token_endpoint');
    }
    return {
      authorizationUrl: meta.authorization_endpoint,
      tokenUrl: meta.token_endpoint,
      clientId,
      scopes: oauth.scopes || [],
    };
  }

  throw new Error('Missing OAuth endpoints. Provide oauth.authorizationUrl+oauth.tokenUrl or oauth.authServerMetadataUrl');
}

export class McpOAuthFlowManager {
  private pending = new Map<string, PendingOAuth>();

  getPending(serverName: string): PendingOAuth | null {
    return this.pending.get(serverName) || null;
  }

  async start(serverName: string, cfg: MCPServerConfig): Promise<OAuthStartResult> {
    const { authorizationUrl, tokenUrl, clientId, scopes } = await discoverEndpoints(cfg);

    // Create ephemeral localhost callback server.
    const server = http.createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') return reject(new Error('Failed to bind localhost callback port'));
        resolve(addr.port);
      });
    });

    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const state = base64url(crypto.randomBytes(16));
    const { codeVerifier, codeChallenge } = pkcePair();

    this.pending.set(serverName, {
      serverName,
      codeVerifier,
      state,
      redirectUri,
      tokenUrl,
      clientId,
      scopes,
    });

    // Handle callback: exchange code and store token.
    server.on('request', async (req, res) => {
      try {
        const url = new URL(req.url || '/', redirectUri);
        if (url.pathname !== '/callback') {
          res.writeHead(404).end('Not found');
          return;
        }

        const code = url.searchParams.get('code');
        const gotState = url.searchParams.get('state');
        const err = url.searchParams.get('error');
        if (err) {
          res.writeHead(400).end(`OAuth error: ${err}`);
          return;
        }
        if (!code) {
          res.writeHead(400).end('Missing code');
          return;
        }
        const pending = this.pending.get(serverName);
        if (!pending) {
          res.writeHead(400).end('No pending OAuth session');
          return;
        }
        if (gotState !== pending.state) {
          res.writeHead(400).end('State mismatch');
          return;
        }

        await this.exchangeCode(serverName, code);
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('XibeCode MCP auth complete. You can return to the terminal.');
      } catch (e: any) {
        res.writeHead(500).end(`OAuth callback failed: ${e?.message || String(e)}`);
      } finally {
        server.close(() => {});
      }
    });

    const auth = new URL(authorizationUrl);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('state', state);
    auth.searchParams.set('code_challenge_method', 'S256');
    auth.searchParams.set('code_challenge', codeChallenge);
    if (scopes.length) auth.searchParams.set('scope', scopes.join(' '));

    // Best-effort open browser, but always return URL for manual open.
    try {
      const open = (await import('open')).default;
      await open(auth.toString());
    } catch {
      // ignore
    }

    return {
      authUrl: auth.toString(),
      redirectUri,
      state,
      note: 'If your browser does not open automatically, open authUrl manually. If localhost callback is not reachable, use finish step with the full callback URL.',
    };
  }

  async finish(serverName: string, callbackUrl: string): Promise<OAuthFinishResult> {
    const pending = this.pending.get(serverName);
    if (!pending) {
      return { success: false, message: `No pending OAuth session for ${serverName}. Run start first.` };
    }
    const url = new URL(callbackUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) return { success: false, message: 'Callback URL missing code param' };
    if (state !== pending.state) return { success: false, message: 'State mismatch' };
    await this.exchangeCode(serverName, code);
    return { success: true, message: `OAuth completed for ${serverName}` };
  }

  async getValidAccessToken(serverName: string, cfg: MCPServerConfig): Promise<string | null> {
    const token = await getOAuthToken(serverName);
    if (!token) return null;
    const now = Date.now();
    const expiresSoon = token.expires_at ? token.expires_at - now < 5 * 60 * 1000 : false;
    if (!expiresSoon) return token.access_token;
    if (!token.refresh_token) return token.access_token;

    const oauth = cfg.oauth;
    if (!oauth) return token.access_token;

    const { tokenUrl, clientId } = await discoverEndpoints(cfg);
    const refreshed = await this.refreshToken({ tokenUrl, clientId, refresh_token: token.refresh_token });
    await upsertOAuthToken(serverName, refreshed);
    return refreshed.access_token;
  }

  private async exchangeCode(serverName: string, code: string): Promise<void> {
    const pending = this.pending.get(serverName);
    if (!pending) throw new Error('No pending OAuth session');

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('client_id', pending.clientId);
    body.set('code', code);
    body.set('redirect_uri', pending.redirectUri);
    body.set('code_verifier', pending.codeVerifier);
    if (pending.scopes.length) body.set('scope', pending.scopes.join(' '));

    const res = await fetch(pending.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      throw new Error(`Token exchange failed (${res.status}): ${json?.error || JSON.stringify(json)}`);
    }

    const record: OAuthTokenRecord = {
      access_token: json.access_token,
      token_type: json.token_type,
      refresh_token: json.refresh_token,
      scope: json.scope,
      expires_at: json.expires_in ? Date.now() + Number(json.expires_in) * 1000 : undefined,
    };

    await upsertOAuthToken(serverName, record);
  }

  private async refreshToken(params: { tokenUrl: string; clientId: string; refresh_token: string }): Promise<OAuthTokenRecord> {
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('client_id', params.clientId);
    body.set('refresh_token', params.refresh_token);

    const res = await fetch(params.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      throw new Error(`Token refresh failed (${res.status}): ${json?.error || JSON.stringify(json)}`);
    }

    return {
      access_token: json.access_token,
      token_type: json.token_type,
      refresh_token: json.refresh_token || params.refresh_token,
      scope: json.scope,
      expires_at: json.expires_in ? Date.now() + Number(json.expires_in) * 1000 : undefined,
    };
  }
}

