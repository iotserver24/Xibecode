import React from 'react';
import { Box } from '../ink.js';
import Markdown from 'ink-markdown';

type Props = {
  content: string;
};

/**
 * Renders assistant Markdown in the TUI via ink-markdown (marked + marked-terminal → ANSI in Ink Text).
 */
export function AssistantMarkdown({ content }: Props) {
  const width = Math.max(40, (process.stdout.columns ?? 80) - 8);
  return (
    <Box flexDirection="column">
      <Markdown reflowText width={width}>
        {content.trim().length > 0 ? content : ' '}
      </Markdown>
    </Box>
  );
}
