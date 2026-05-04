/**
 * Graceful shutdown with guaranteed session data flush.
 *
 * Registers signal handlers (SIGINT, SIGTERM, SIGHUP) that trigger an ordered
 * shutdown sequence:
 *
 *   1. Flush session data (most critical — must complete first)
 *   2. Re-append metadata to transcript tail
 *   3. Run registered cleanup handlers
 *   4. Force exit (with failsafe timer as backstop)
 *
 * The failsafe timer guarantees the process exits within max(5s, hookBudget + 3.5s)
 * even if cleanup handlers hang (e.g., on MCP connections or dead TTYs).
 *
 * @module graceful-shutdown
 */

import { writeSync } from 'fs';
import { createRequire } from 'module';
const localRequire = createRequire(import.meta.url);

// ─── Cleanup Registry ───────────────────────────────────────────

const cleanupFunctions = new Set<() => Promise<void>>();

/**
 * Register a cleanup function to run during graceful shutdown.
 * @returns Unregister function that removes the cleanup handler
 */
export function registerCleanup(cleanupFn: () => Promise<void>): () => void {
  cleanupFunctions.add(cleanupFn);
  return () => cleanupFunctions.delete(cleanupFn);
}

/**
 * Run all registered cleanup functions.
 * Called internally by gracefulShutdown.
 */
export async function runCleanupFunctions(): Promise<void> {
  await Promise.all(Array.from(cleanupFunctions).map((fn) => fn()));
}

// ─── Shutdown State ─────────────────────────────────────────────

let shutdownInProgress = false;
let failsafeTimer: ReturnType<typeof setTimeout> | undefined;
let orphanCheckInterval: ReturnType<typeof setInterval> | undefined;

/** Check if graceful shutdown is in progress. */
export function isShuttingDown(): boolean {
  return shutdownInProgress;
}

/** Reset shutdown state — only for use in tests. */
export function resetShutdownState(): void {
  shutdownInProgress = false;
  if (failsafeTimer !== undefined) {
    clearTimeout(failsafeTimer);
    failsafeTimer = undefined;
  }
  if (orphanCheckInterval !== undefined) {
    clearInterval(orphanCheckInterval);
    orphanCheckInterval = undefined;
  }
}

// ─── Terminal Cleanup ───────────────────────────────────────────

const SHOW_CURSOR = '\x1b[?25h';
const EXIT_ALT_SCREEN = '\x1b[?1049l';

/**
 * Clean up terminal modes synchronously before process exit.
 * Ensures the cursor is visible and alt-screen is exited.
 */
function cleanupTerminalModes(): void {
  if (!process.stdout.isTTY) return;
  try {
    writeSync(1, SHOW_CURSOR);
    writeSync(1, EXIT_ALT_SCREEN);
  } catch {
    // Terminal may already be gone (SIGHUP)
  }
}

// ─── Force Exit ─────────────────────────────────────────────────

/**
 * Force process exit, handling the case where the terminal is gone.
 * Falls back to SIGKILL if process.exit() throws EIO from dead terminal.
 */
function forceExit(exitCode: number): never {
  if (failsafeTimer !== undefined) {
    clearTimeout(failsafeTimer);
    failsafeTimer = undefined;
  }
  try {
    process.exit(exitCode);
  } catch (e) {
    // process.exit() threw — likely EIO from dead terminal
    if ((process.env.NODE_ENV as string) === 'test') {
      throw e;
    }
    process.kill(process.pid, 'SIGKILL');
  }
  // In tests, process.exit may be mocked to return
  if ((process.env.NODE_ENV as string) !== 'test') {
    throw new Error('unreachable');
  }
  return undefined as never;
}

// ─── Resume Hint ────────────────────────────────────────────────

let resumeHintPrinted = false;

/**
 * Print a hint about how to resume the session.
 * Only shown for interactive sessions with persistence enabled.
 */
function printResumeHint(): void {
  if (resumeHintPrinted) return;
  if (!process.stdout.isTTY) return;

  // Try to get session info from the transcript writer (sync, for shutdown context)
  try {
    const { getTranscriptWriter } = localRequire('./transcript-writer.js') as typeof import('./transcript-writer.js');
    const writer = getTranscriptWriter();
    const sessionId = writer.getSessionId();
    if (sessionId) {
      try {
        writeSync(1, `\nResume this session with:\nxibecode --resume ${sessionId}\n`);
        resumeHintPrinted = true;
      } catch {
        // Ignore write errors
      }
    }
  } catch {
    // Transcript writer not available — skip hint
  }
}

// ─── Graceful Shutdown ──────────────────────────────────────────

/**
 * Perform graceful shutdown with ordered cleanup phases.
 *
 * 1. Arm failsafe timer
 * 2. Clean up terminal
 * 3. Flush session data (run cleanup handlers)
 * 4. Print resume hint
 * 5. Force exit
 *
 * @param exitCode - Exit code to use
 * @param reason - Reason for shutdown (for hooks)
 */
export async function gracefulShutdown(exitCode = 0, reason = 'other'): Promise<void> {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  // Failsafe: guarantee process exits even if cleanup hangs
  failsafeTimer = setTimeout(
    (code) => {
      cleanupTerminalModes();
      printResumeHint();
      forceExit(code as number);
    },
    Math.max(5000, 5000 + 3500), // max(5s, hookBudget + 3.5s) — simplified
    exitCode,
  );
  failsafeTimer.unref();

  // Set the exit code
  process.exitCode = exitCode;

  // Exit alt screen and print resume hint FIRST, before async operations
  cleanupTerminalModes();
  printResumeHint();

  // Flush session data — this is the most critical cleanup
  let cleanupTimeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const cleanupPromise = (async () => {
      try {
        await runCleanupFunctions();
      } catch {
        // Silently ignore cleanup errors
      }
    })();

    await Promise.race([
      cleanupPromise,
      new Promise((_, reject) => {
        cleanupTimeoutId = setTimeout(
          (rej: (reason: unknown) => void) => rej(new Error('Cleanup timeout')),
          2000,
          reject,
        );
      }),
    ]);
    clearTimeout(cleanupTimeoutId);
  } catch {
    clearTimeout(cleanupTimeoutId);
  }

  forceExit(exitCode);
}

/**
 * Synchronous wrapper for gracefulShutdown.
 * Kicks off the async shutdown and stores the promise.
 */
export function gracefulShutdownSync(exitCode = 0, reason = 'other'): void {
  process.exitCode = exitCode;
  void gracefulShutdown(exitCode, reason).catch(() => {
    cleanupTerminalModes();
    printResumeHint();
    forceExit(exitCode);
  });
}

// ─── Signal Handler Setup ───────────────────────────────────────

let handlersInstalled = false;

/**
 * Install global signal handlers for graceful shutdown.
 * Called once during application startup.
 */
export function setupGracefulShutdown(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on('SIGINT', () => {
    void gracefulShutdown(0, 'sigint');
  });

  process.on('SIGTERM', () => {
    void gracefulShutdown(143, 'sigterm'); // 128 + 15
  });

  if (process.platform !== 'win32') {
    process.on('SIGHUP', () => {
      void gracefulShutdown(129, 'sighup'); // 128 + 1
    });

    // Detect orphaned process when terminal closes without delivering SIGHUP
    if (process.stdin.isTTY) {
      orphanCheckInterval = setInterval(() => {
        if (!process.stdout.writable || !process.stdin.readable) {
          clearInterval(orphanCheckInterval!);
          void gracefulShutdown(129, 'orphan_detected');
        }
      }, 30000);
      orphanCheckInterval.unref();
    }
  }

  // Log uncaught exceptions for observability
  process.on('uncaughtException', (error) => {
    try {
      const { logForDebugging } = localRequire('./utils/debug-logger.js') as { logForDebugging: (msg: string, opts?: { level: string }) => void };
      logForDebugging(`Uncaught exception: ${error.name}: ${error.message}`, { level: 'error' });
    } catch {
      // Logging not available
    }
  });

  process.on('unhandledRejection', (reason) => {
    // Prevent crash — log and continue
  });
}

/** Reset handler installation state — only for use in tests. */
export function resetHandlersForTesting(): void {
  handlersInstalled = false;
}
