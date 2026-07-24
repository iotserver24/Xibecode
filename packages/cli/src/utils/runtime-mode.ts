/**
 * Daemon / gateway runtime mode: **default** (local host) vs **e2b** (sandbox).
 *
 * E2B mode enables hosted-only features:
 * - `/update` → npm install latest + restart daemon (sessions under ~/.xibecode kept)
 * - (later) public preview / direct links for running servers
 *
 * Resolution (first match wins):
 * 1. XIBECODE_RUNTIME_MODE / XIBECODE_DAEMON_MODE = default|e2b|local|hosted
 * 2. Auto-detect hosted sandbox (E2B env / /home/user/workspace)
 * 3. default
 */

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
  /** Surface “public link” tooling when we wire it (placeholder). */
  publicPreviewLinks: boolean;
  /** Ping home chat when npm has a newer CLI. */
  updateOfferOnStart: boolean;
}

export function featuresForMode(mode: RuntimeMode): RuntimeFeatures {
  if (mode === 'e2b') {
    return {
      selfUpdateWithRestart: true,
      preferSudoNpm: true,
      publicPreviewLinks: true, // reserved — wiring later
      updateOfferOnStart: true,
    };
  }
  return {
    selfUpdateWithRestart: false,
    preferSudoNpm: false,
    publicPreviewLinks: false,
    updateOfferOnStart: false,
  };
}

export function describeRuntimeMode(info?: RuntimeModeInfo): string {
  const i = info || resolveRuntimeMode();
  const f = featuresForMode(i.mode);
  const lines = [
    `Runtime mode: **${i.mode}** (${i.label})`,
    i.source === 'env'
      ? '_Set by `XIBECODE_RUNTIME_MODE`_'
      : i.source === 'auto-e2b'
        ? '_Auto-detected E2B/hosted environment_'
        : '_Local host default_',
  ];
  if (i.isE2b) {
    lines.push(
      '',
      '**E2B built-ins:**',
      '• `/update` · `/update yes` — `npm i -g xibecode@latest` (+ sudo if needed) then **restart daemon**',
      '• Chat history stays in `~/.xibecode/daemon/sessions/` across restarts',
      f.publicPreviewLinks
        ? '• Public preview links for running servers — coming next'
        : '',
    );
  }
  return lines.filter(Boolean).join('\n');
}
