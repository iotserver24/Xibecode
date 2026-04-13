import { MCPServersConfig, type MCPServerConfig } from '../../utils/config.js';

export type McpServerMatchPattern = string;

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesPattern(value: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === value) return true;
  if (pattern.includes('*')) return wildcardToRegExp(pattern).test(value);
  return value.toLowerCase() === pattern.toLowerCase();
}

export function isAllowedByPolicy(params: {
  serverName: string;
  serverConfig: MCPServerConfig;
  allowed?: McpServerMatchPattern[];
  denied?: McpServerMatchPattern[];
  allowManagedOnly?: boolean;
  isManagedSource?: boolean;
}): boolean {
  const { serverName, serverConfig, allowed, denied, allowManagedOnly, isManagedSource } = params;

  if (allowManagedOnly && !isManagedSource) return false;

  const denyList = denied || [];
  for (const pat of denyList) {
    if (pat.startsWith('name:') && matchesPattern(serverName, pat.slice('name:'.length))) return false;
    if (pat.startsWith('command:') && matchesPattern(serverConfig.command, pat.slice('command:'.length))) return false;
    if (!pat.includes(':') && matchesPattern(serverName, pat)) return false;
  }

  const allowList = allowed || [];
  if (allowList.length === 0) return true;

  for (const pat of allowList) {
    if (pat.startsWith('name:') && matchesPattern(serverName, pat.slice('name:'.length))) return true;
    if (pat.startsWith('command:') && matchesPattern(serverConfig.command, pat.slice('command:'.length))) return true;
    if (!pat.includes(':') && matchesPattern(serverName, pat)) return true;
  }

  return false;
}

export function filterMcpServersByPolicy(
  servers: MCPServersConfig,
  policy: {
    allowed?: McpServerMatchPattern[];
    denied?: McpServerMatchPattern[];
    allowManagedOnly?: boolean;
    isManagedSource?: boolean;
  }
): MCPServersConfig {
  const out: MCPServersConfig = {};
  for (const [name, cfg] of Object.entries(servers)) {
    if (
      isAllowedByPolicy({
        serverName: name,
        serverConfig: cfg,
        allowed: policy.allowed,
        denied: policy.denied,
        allowManagedOnly: policy.allowManagedOnly,
        isManagedSource: policy.isManagedSource,
      })
    ) {
      out[name] = cfg;
    }
  }
  return out;
}

