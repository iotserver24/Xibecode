import React from 'react';
import { Box, Text } from 'ink';

interface MarkdownMessageProps {
  content: string;
}

/**
 * Minimal markdown renderer for the Ink TUI.
 * Keeps dependencies light by supporting just:
 * - paragraphs
 * - headings starting with #
 * - fenced code blocks ``` ```
 * - bullet lists starting with - or *
 *
 * This can be upgraded later to use ink-markdown or remark.
 */
export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const lines = content.split('\n');

  const elements: React.ReactNode[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];

  const flushCode = () => {
    if (!codeBuffer.length) return;
    elements.push(
      <Box key={`code-${elements.length}`} flexDirection="column">
        {codeBuffer.map((line, idx) => (
          <Text key={idx} color="magenta">
            {line}
          </Text>
        ))}
      </Box>
    );
    codeBuffer = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/g, '');

    if (line.trim().startsWith('```')) {
      if (inCode) {
        // closing fence
        flushCode();
        inCode = false;
      } else {
        // opening fence
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeBuffer.push(line);
      return;
    }

    if (!line.trim()) {
      elements.push(<Text key={`blank-${idx}`}> </Text>);
      return;
    }

    if (line.startsWith('#')) {
      const headingText = line.replace(/^#+\s*/, '');
      elements.push(
        <Text key={`h-${idx}`} bold>
          {headingText}
        </Text>
      );
      return;
    }

    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const item = line.trim().replace(/^[-*]\s+/, '');
      elements.push(
        <Text key={`li-${idx}`}>• {item}</Text>
      );
      return;
    }

    elements.push(<Text key={`p-${idx}`}>{line}</Text>);
  });

  // flush any trailing code block
  flushCode();

  return <Box flexDirection="column">{elements}</Box>;
}

export default MarkdownMessage;

