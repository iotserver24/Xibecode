import { openSync } from 'fs';
import { ReadStream } from 'tty';
import type { RenderOptions } from 'ink';

let cachedStdinOverride: ReadStream | undefined | null = null;

function isEnvTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Gets a ReadStream for /dev/tty when stdin is piped.
 * This allows interactive Ink rendering even when stdin is a pipe.
 * Result is cached for the lifetime of the process.
 */
function getStdinOverride(): ReadStream | undefined {
  if (cachedStdinOverride !== null) {
    return cachedStdinOverride;
  }

  if (process.stdin.isTTY) {
    cachedStdinOverride = undefined;
    return undefined;
  }

  if (isEnvTruthy(process.env.CI)) {
    cachedStdinOverride = undefined;
    return undefined;
  }

  if (process.argv.includes('mcp')) {
    cachedStdinOverride = undefined;
    return undefined;
  }

  if (process.platform === 'win32') {
    cachedStdinOverride = undefined;
    return undefined;
  }

  try {
    const ttyFd = openSync('/dev/tty', 'r');
    const ttyStream = new ReadStream(ttyFd);
    ttyStream.isTTY = true;
    cachedStdinOverride = ttyStream;
    return cachedStdinOverride;
  } catch (err) {
    console.error('[xibecode] Failed to open /dev/tty for interactive input:', err);
    cachedStdinOverride = undefined;
    return undefined;
  }
}

/**
 * Returns base render options for Ink, including stdin override when needed.
 * Use for interactive TUIs so piping a prompt still leaves keyboard input on the real TTY.
 */
export function getBaseRenderOptions(exitOnCtrlC: boolean = false): RenderOptions {
  const stdin = getStdinOverride();
  const options: RenderOptions = { exitOnCtrlC };
  if (stdin) {
    options.stdin = stdin;
  }
  return options;
}
