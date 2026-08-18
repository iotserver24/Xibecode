/**
 * Canonical project-scoped session transcript paths.
 *
 * SessionManager and EnhancedAgent must resolve the same file. A naive
 * `.slice(0, 60)` without the hash suffix used to put daemon and chat
 * transcripts in different directories for long cwd values.
 */

import * as path from 'path';
import * as os from 'os';

export const MAX_SANITIZED_CWD_LENGTH = 60;

/** Stable directory key for a working directory under ~/.xibecode/projects/. */
export function sanitizeCwdKey(dirPath: string): string {
  const sanitized = dirPath.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= MAX_SANITIZED_CWD_LENGTH) {
    return sanitized;
  }
  let hash = 0;
  for (let i = 0; i < dirPath.length; i++) {
    const chr = dirPath.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return `${sanitized.slice(0, MAX_SANITIZED_CWD_LENGTH)}-${Math.abs(hash).toString(36)}`;
}

export function xibecodeHome(baseDir?: string): string {
  return baseDir || path.join(os.homedir(), '.xibecode');
}

export function projectsDir(baseDir?: string): string {
  return path.join(xibecodeHome(baseDir), 'projects');
}

export function projectDir(cwd: string, baseDir?: string): string {
  return path.join(projectsDir(baseDir), sanitizeCwdKey(cwd));
}

/** Absolute JSONL path for a session in a project. */
export function sessionTranscriptPath(
  sessionId: string,
  cwd: string,
  baseDir?: string,
): string {
  return path.join(projectDir(cwd, baseDir), `${sessionId}.jsonl`);
}
