import React, { useMemo } from 'react';
import { Text as InkText } from 'ink';
import { Marked } from 'marked';
import * as markedTerminalModule from 'marked-terminal';
import { Box } from '../ink.js';

type Props = {
  content: string;
};

/** Runtime export; `@types/marked-terminal` only models the legacy default class. */
const markedTerminal = (markedTerminalModule as unknown as { markedTerminal: (options?: object) => object })
  .markedTerminal;

/**
 * Renders assistant Markdown in the TUI (marked + marked-terminal → ANSI in Ink Text).
 * Uses Ink's Text directly so theme foreground does not override chalk/ANSI from the renderer.
 */
export function AssistantMarkdown({ content }: Props) {
  const width = Math.max(40, (process.stdout.columns ?? 80) - 8);
  const ansi = useMemo(() => {
    const md = new Marked();
    // marked-terminal defaults showSectionPrefix: true, which prints literal ## before headings.
    md.use(markedTerminal({ reflowText: true, width, showSectionPrefix: false }));
    const src = content.trim().length > 0 ? content : ' ';
    return (md.parse(src) as string).trim();
  }, [content, width]);

  return (
    <Box flexDirection="column">
      <InkText>{ansi}</InkText>
    </Box>
  );
}
