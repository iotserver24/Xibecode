import * as os from 'os';
import * as path from 'path';
import type { MCPServersConfig } from '../../utils/config.js';
import { MCPServersFileManager } from '../../utils/mcp-servers-file.js';
import { findProjectMcpConfigFiles, readMcpServersFromFile } from './mcp-config.js';
import { filterMcpServersByPolicy } from './mcp-policy.js';

export interface ResolvedMcpServers {
  servers: MCPServersConfig;
  sourceSummary: {
    managedUsed: boolean;
    projectFiles: string[];
    globalFile?: string;
  };
}

function stdioSignature(cfg: { command: string; args?: string[]; env?: Record<string, string> }): string {
  const args = (cfg.args || []).join('\u0000');
  // Do not include env values in signatures (can contain secrets).
  const envKeys = cfg.env ? Object.keys(cfg.env).sort().join(',') : '';
  return `stdio:${cfg.command}\u0000${args}\u0000envKeys:${envKeys}`;
}

function dedupeBySignature(servers: MCPServersConfig): MCPServersConfig {
  const seen = new Map<string, string>(); // signature -> chosenName
  const out: MCPServersConfig = {};

  for (const [name, cfg] of Object.entries(servers)) {
    const sig = stdioSignature(cfg);
    const existing = seen.get(sig);
    if (existing) {
      // Prefer later entries (higher precedence in our merge order) by overwriting.
      delete out[existing];
    }
    seen.set(sig, name);
    out[name] = cfg;
  }

  return out;
}

export async function resolveMcpServers(params: {
  cwd: string;
  allowed?: string[];
  denied?: string[];
  allowManagedOnly?: boolean;
}): Promise<ResolvedMcpServers> {
  const configDir = path.join(os.homedir(), '.xibecode');
  const managedPath = path.join(configDir, 'managed', 'managed-mcp.json');

  // 1) Enterprise-managed override: if present, it is authoritative.
  try {
    const managed = await readMcpServersFromFile(managedPath, 'managed-mcp.json');
    const filtered = filterMcpServersByPolicy(managed, {
      allowed: params.allowed,
      denied: params.denied,
      allowManagedOnly: params.allowManagedOnly,
      isManagedSource: true,
    });
    return {
      servers: dedupeBySignature(filtered),
      sourceSummary: { managedUsed: true, projectFiles: [] },
    };
  } catch (err: any) {
    // If it doesn't exist, continue. If it exists but is invalid, treat as error (surface via caller).
    if (err?.code !== 'ENOENT') {
      throw err;
    }
  }

  // 2) Project scope: merge .mcp.json discovered up the directory tree (root->leaf).
  const projectFiles = await findProjectMcpConfigFiles(params.cwd);
  let merged: MCPServersConfig = {};
  for (const fp of projectFiles) {
    const fromFile = await readMcpServersFromFile(fp);
    merged = { ...merged, ...fromFile };
  }

  // 3) User scope: global ~/.xibecode/mcp-servers.json
  const fm = new MCPServersFileManager();
  const globalFile = fm.getFilePath();
  try {
    const fromGlobal = await fm.loadMCPServers();
    merged = { ...merged, ...fromGlobal };
  } catch {
    // If global file is invalid, we still want project MCP servers to work.
    // The caller can separately validate or show warnings.
  }

  merged = filterMcpServersByPolicy(merged, {
    allowed: params.allowed,
    denied: params.denied,
    allowManagedOnly: params.allowManagedOnly,
    isManagedSource: false,
  });

  return {
    servers: dedupeBySignature(merged),
    sourceSummary: {
      managedUsed: false,
      projectFiles,
      globalFile,
    },
  };
}

