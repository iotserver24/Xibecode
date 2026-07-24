/**
 * Daemon / gateway runtime mode: **default** (local host) vs **e2b** (sandbox).
 *
 * E2B mode enables hosted-only features:
 * - `/update` → npm install latest + restart daemon (sessions under ~/.xibecode kept)
 * - Agent may use passwordless `sudo -n` for installs when needed
 * - Sandbox id injected into agent context (env or /run/e2b/)
 * - (later) public preview / direct links for running servers
 *
 * Resolution (first match wins):
 * 1. XIBECODE_RUNTIME_MODE / XIBECODE_DAEMON_MODE = default|e2b|local|hosted
 * 2. Auto-detect hosted sandbox (E2B env / /home/user/workspace)
 * 3. default
 */

import * as fs from 'node:fs';
import { isE2bHostedRuntime } from './npm-update-notice.js';

export type RuntimeMode = 'default' | 'e2b';

export interface RuntimeModeInfo {
  mode: RuntimeMode;
  /** True when mode is e2b (explicit or auto). */
  isE2b: boolean;
  /** How the mode was chosen. */
  source: 'env' | 'auto-e2b' | 'default';
  /** Human label for /status. */
  label: string;
}

export interface SandboxIdentity {
  /** E2B sandbox id when known. */
  sandboxId: string | null;
  templateId: string | null;
  /** Where the id came from. */
  source: 'env' | 'run-e2b' | 'none';
  /** Preview URL for a local port: https://{port}-{sandboxId}.e2b.dev */
  previewUrl: (port: number) => string | null;
}

/**
 * Resolve this VM's sandbox id for agent context.
 * E2B injects env vars for SDK commands, and/or files under /run/e2b/ for shells.
 * @see https://e2b.dev/docs/sandbox/environment-variables
 */
export function resolveSandboxIdentity(
  env: NodeJS.ProcessEnv = process.env,
): SandboxIdentity {
  const fromEnv = (
    env.E2B_SANDBOX_ID ||
    env.XIBECODE_SANDBOX_ID ||
    env.SANDBOX_ID ||
    ''
  ).trim();
  let sandboxId: string | null = fromEnv || null;
  let source: SandboxIdentity['source'] = fromEnv ? 'env' : 'none';

  if (!sandboxId) {
    for (const p of [
      '/run/e2b/.E2B_SANDBOX_ID',
      '/run/e2b/E2B_SANDBOX_ID',
    ]) {
      try {
        const v = fs.readFileSync(p, 'utf-8').trim();
        if (v) {
          sandboxId = v;
          source = 'run-e2b';
          break;
        }
      } catch {
        /* missing */
      }
    }
  }

  let templateId: string | null = (
    env.E2B_TEMPLATE_ID ||
    env.XIBECODE_E2B_TEMPLATE ||
    ''
  ).trim() || null;
  if (!templateId) {
    try {
      const v = fs.readFileSync('/run/e2b/.E2B_TEMPLATE_ID', 'utf-8').trim();
      if (v) templateId = v;
    } catch {
      /* ignore */
    }
  }

  const domain = (env.XIBECODE_E2B_PREVIEW_DOMAIN || env.E2B_DOMAIN || 'e2b.dev')
    .trim()
    .replace(/^\.+/, '');

  return {
    sandboxId,
    templateId,
    source,
    previewUrl: (port: number) => {
      if (!sandboxId || !Number.isFinite(port) || port <= 0) return null;
      return `https://${Math.floor(port)}-${sandboxId}.${domain}`;
    },
  };
}

/**
 * Ensure e2b process env is populated for agent + sudo policy.
 * Call once at daemon start.
 */
export function hydrateE2bRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
): { mode: RuntimeModeInfo; identity: SandboxIdentity } {
  const mode = resolveRuntimeMode(env);
  const identity = resolveSandboxIdentity(env);
  if (mode.isE2b) {
    env.XIBECODE_E2B_ALLOW_SUDO = env.XIBECODE_E2B_ALLOW_SUDO || '1';
    if (identity.sandboxId && !env.E2B_SANDBOX_ID) {
      env.E2B_SANDBOX_ID = identity.sandboxId;
    }
    if (identity.sandboxId && !env.XIBECODE_SANDBOX_ID) {
      env.XIBECODE_SANDBOX_ID = identity.sandboxId;
    }
    if (identity.templateId && !env.E2B_TEMPLATE_ID) {
      env.E2B_TEMPLATE_ID = identity.templateId;
    }
    env.E2B_SANDBOX = env.E2B_SANDBOX || 'true';
    env.XIBECODE_HOSTED = env.XIBECODE_HOSTED || '1';
  }
  return { mode, identity };
}

export function resolveRuntimeMode(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeModeInfo {
  const raw = (
    env.XIBECODE_RUNTIME_MODE ||
    env.XIBECODE_DAEMON_MODE ||
    env.XIBECODE_HOST_MODE ||
    ''
  )
    .trim()
    .toLowerCase();

  if (
    raw === 'e2b' ||
    raw === 'hosted' ||
    raw === 'cloud' ||
    raw === 'sandbox'
  ) {
    return {
      mode: 'e2b',
      isE2b: true,
      source: 'env',
      label: 'e2b (hosted sandbox)',
    };
  }
  if (raw === 'default' || raw === 'local' || raw === 'host') {
    return {
      mode: 'default',
      isE2b: false,
      source: 'env',
      label: 'default (local)',
    };
  }

  if (isE2bHostedRuntime(env)) {
    return {
      mode: 'e2b',
      isE2b: true,
      source: 'auto-e2b',
      label: 'e2b (auto-detected)',
    };
  }

  return {
    mode: 'default',
    isE2b: false,
    source: 'default',
    label: 'default (local)',
  };
}

/** Features gated by runtime mode (extensible for preview URLs later). */
export interface RuntimeFeatures {
  /** Telegram /update yes installs npm + restarts daemon. */
  selfUpdateWithRestart: boolean;
  /** Prefer sudo npm -g when plain npm fails (global root install in template). */
  preferSudoNpm: boolean;
  /**
   * Agent may run passwordless `sudo -n …` without approval for package ops.
   * Still blocks catastrophic patterns (rm -rf /, fork bombs).
   */
  agentMayUseSudo: boolean;
  /** Surface “public link” tooling when we wire it. */
  publicPreviewLinks: boolean;
  /** Ping home chat when npm has a newer CLI. */
  updateOfferOnStart: boolean;
  /** Inject sandbox id + preview URL hints into agent system prompt. */
  injectSandboxIdentity: boolean;
}

export function featuresForMode(mode: RuntimeMode): RuntimeFeatures {
  if (mode === 'e2b') {
    return {
      selfUpdateWithRestart: true,
      preferSudoNpm: true,
      agentMayUseSudo: true,
      publicPreviewLinks: true,
      updateOfferOnStart: true,
      injectSandboxIdentity: true,
    };
  }
  return {
    selfUpdateWithRestart: false,
    preferSudoNpm: false,
    agentMayUseSudo: false,
    publicPreviewLinks: false,
    updateOfferOnStart: false,
    injectSandboxIdentity: false,
  };
}

export function describeRuntimeMode(info?: RuntimeModeInfo): string {
  const i = info || resolveRuntimeMode();
  const f = featuresForMode(i.mode);
  const id = resolveSandboxIdentity();
  const lines = [
    `Runtime mode: **${i.mode}** (${i.label})`,
    i.source === 'env'
      ? '_Set by `XIBECODE_RUNTIME_MODE`_'
      : i.source === 'auto-e2b'
        ? '_Auto-detected hosted sandbox environment_'
        : '_Local host default_',
  ];
  if (i.isE2b) {
    lines.push(
      '',
      '**E2B built-ins:**',
      id.sandboxId
        ? `• Sandbox id: \`${id.sandboxId}\` (${id.source})`
        : '• Sandbox id: _unknown_ (set `E2B_SANDBOX_ID` or check `/run/e2b/`)',
      '• `/update` · `/update yes` — `npm i -g xibecode@latest` (+ sudo if needed) then **restart daemon**',
      '• Agent may use `sudo -n` for installs when needed (passwordless)',
      '• Chat history stays in `~/.xibecode/daemon/sessions/` across restarts',
      f.publicPreviewLinks && id.sandboxId
        ? `• Preview pattern: \`https://{port}-${id.sandboxId}.e2b.dev\``
        : f.publicPreviewLinks
          ? '• Public preview links for running servers'
          : '',
    );
  }
  return lines.filter(Boolean).join('\n');
}

/**
 * Extra system-prompt lines for the coding agent in e2b mode
 * (sandbox id + sudo + preview URLs).
 */
export function e2bAgentContextBlock(
  identity?: SandboxIdentity,
  features?: RuntimeFeatures,
): string {
  const id = identity || resolveSandboxIdentity();
  const f = features || featuresForMode(resolveRuntimeMode().mode);
  if (!f.injectSandboxIdentity && !f.agentMayUseSudo) return '';

  const lines = ['## Hosted sandbox (e2b mode)'];
  if (id.sandboxId) {
    lines.push(
      `- **Sandbox id:** \`${id.sandboxId}\` (source: ${id.source})`,
      `- When the user asks for the sandbox id, report this value exactly.`,
    );
    if (f.publicPreviewLinks) {
      const exampleHost = `3000-${id.sandboxId}.e2b.dev`;
      lines.push(
        `- Public preview for a listening port N: \`https://N-${id.sandboxId}.e2b.dev\` (e.g. port 3000 → \`${id.previewUrl(3000)}\`).`,
        `- Prefer reporting that URL after you start a server (and confirm HTTP 200 on localhost first).`,
        '',
        '### Vite / dev-server host allowlist (required for preview URLs)',
        '- E2B opens the app as `https://{port}-{sandboxId}.e2b.dev`. Vite blocks unknown Host headers by default → "This host is not allowed".',
        '- **Whenever you create or run a Vite app**, set in `vite.config.ts` / `vite.config.js` before sharing the link:',
        '```js',
        'export default defineConfig({',
        '  server: {',
        "    host: '0.0.0.0',",
        "    // allow E2B preview hosts (or true / 'all' in Vite 5.1+)",
        "    allowedHosts: true,",
        '  },',
        '})',
        '```',
        `- Equivalent: \`allowedHosts: ['.e2b.dev', '${exampleHost}']\` if you prefer an explicit list.`,
        '- Bind with `--host 0.0.0.0` (or server.host above) so the proxy can reach the process.',
        '- If the user already sees "host is not allowed", **edit vite.config immediately**, restart the dev server, then re-send the preview URL.',
        '- Next.js: usually fine with `next dev -H 0.0.0.0`; webpack-dev-server may need `allowedHosts: "all"`.',
      );
    }
  } else {
    lines.push(
      '- Sandbox id not in env — try `cat /run/e2b/.E2B_SANDBOX_ID` via run_command if needed.',
    );
  }
  if (id.templateId) {
    lines.push(`- Template: \`${id.templateId}\``);
  }
  if (f.agentMayUseSudo) {
    lines.push(
      '- **sudo:** You may use passwordless `sudo -n <cmd>` when installs need root (apt, global npm, etc.). Prefer `sudo -n` (non-interactive) so commands never hang on a password prompt.',
      '- Do not use interactive `sudo` without `-n`. Destructive system wipes are still forbidden.',
    );
  }
  return lines.join('\n');
}
