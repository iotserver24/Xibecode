/**
 * Explicit session compaction.
 *
 *   xibecode compact
 *   xibecode compact --session <id>
 */

import {
  SessionManager,
  compactSession,
  RunObservation,
  restoreObservationFromHandoff,
  loadResumeContext,
  getTranscriptWriter,
  sessionTranscriptPath,
  heuristicContextWindow,
} from 'xibecode-core';

export async function compactCommand(options: {
  session?: string;
  allContext?: boolean;
  profile?: string;
}): Promise<void> {
  const cwd = process.cwd();
  const manager = new SessionManager();
  const sessionId = (options.session || '').trim();

  let id = sessionId;
  let transcriptPath: string | undefined;

  if (id) {
    const loaded = await manager.loadSession(id);
    if (!loaded) {
      console.error(`Session not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    transcriptPath = manager.getSessionPath(loaded.id, loaded.cwd || cwd);
    id = loaded.id;
  } else {
    const listed = await manager.listSessions(cwd);
    if (!listed.length) {
      console.error('No sessions in this project to compact.');
      process.exitCode = 1;
      return;
    }
    id = listed[0]!.id;
    const loaded = await manager.loadSession(id);
    transcriptPath = manager.getSessionPath(id, loaded?.cwd || cwd);
  }

  const path = transcriptPath || sessionTranscriptPath(id, cwd);
  const resume = await loadResumeContext(path);
  if (!resume.messages.length) {
    console.log('Nothing to compact — session has no conversation messages.');
    return;
  }

  const observation = new RunObservation();
  if (resume.handoff) restoreObservationFromHandoff(observation, resume.handoff);

  const result = await compactSession({
    sessionId: id,
    cwd,
    transcriptPath: path,
    messages: options.allContext ? resume.messages : resume.messages,
    trigger: 'manual',
    contextWindow: heuristicContextWindow(''),
    lastUuid: resume.lastUuid,
    observation,
    task: resume.handoff?.task,
    onStatus: (message) => console.log(message),
  });

  await getTranscriptWriter().flush();
  console.log(result.userStatus);
  if (result.handoff) {
    const files = result.handoff.changedFiles.length;
    const tests = result.handoff.validation.length;
    console.log(
      `Session ${id.slice(0, 8)}… · ${files} file(s) · ${tests} validation(s) · status ${result.handoff.status}`,
    );
  }
}
