import React, { useMemo } from 'react';
import { Text as InkText } from 'ink';
import { Marked } from 'marked';
import * as markedTerminalModule from 'marked-terminal';
import { Box, Text } from '../ink.js';
import {
  parseTaskComplete,
  stripModeRequests,
  stripTaskComplete,
} from '../core/modes.js';

type Props = {
  content: string;
};

/** Runtime export; `@types/marked-terminal` only models the legacy default class. */
const markedTerminal = (markedTerminalModule as unknown as { markedTerminal: (options?: object) => object })
  .markedTerminal;

function markdownBodyForDisplay(raw: string): string {
  return stripModeRequests(stripTaskComplete(raw)).trim();
}

function shouldShowEvidence(evidence: string | undefined): boolean {
  if (evidence === undefined) return false;
  const t = evidence.trim();
  return t.length > 0 && t.toLowerCase() !== 'none';
}

/**
 * Renders assistant Markdown in the TUI (marked + marked-terminal → ANSI in Ink Text).
 * Uses Ink's Text directly so theme foreground does not override chalk/ANSI from the renderer.
 * `[[TASK_COMPLETE | summary=... | evidence=...]]` is stripped from the prose and shown as a short bordered block.
 */
export function AssistantMarkdown({ content }: Props) {
  const width = Math.max(40, (process.stdout.columns ?? 80) - 8);
  const taskMeta = useMemo(() => parseTaskComplete(content), [content]);
  const mdSource = useMemo(() => markdownBodyForDisplay(content), [content]);

  const ansi = useMemo(() => {
    const md = new Marked();
    md.use(markedTerminal({ reflowText: true, width, showSectionPrefix: false }));
    const src = mdSource.length > 0 ? mdSource : ' ';
    return (md.parse(src) as string).trim();
  }, [mdSource, width]);

  const showProse = mdSource.length > 0;
  const showTaskFooter = taskMeta !== null;

  return (
    <Box flexDirection="column">
      {showProse && (
        <Box flexDirection="column">
          <InkText>{ansi}</InkText>
        </Box>
      )}
      {showTaskFooter && taskMeta && (
        <Box
          marginTop={showProse ? 1 : 0}
          borderStyle="round"
          borderColor="success"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold color="success">
            Task complete
          </Text>
          <Text wrap="wrap" color="text">
            {taskMeta.summary}
          </Text>
          {shouldShowEvidence(taskMeta.evidence) && (
            <Text wrap="wrap" dimColor>
              Evidence: {taskMeta.evidence}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
