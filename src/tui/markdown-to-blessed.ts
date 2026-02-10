import { marked } from 'marked';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - marked-terminal doesn't ship official types, see src/types/marked-terminal.d.ts
import TerminalRenderer from 'marked-terminal';

// Configure marked to render to ANSI suitable for terminal output
const renderer = new (TerminalRenderer as any)({
  colors: true,
  headingBold: true,
});

marked.setOptions({ renderer: renderer as any });

/**
 * Convert markdown text into a string containing ANSI escape sequences that
 * render nicely in a terminal (and thus inside blessed boxes).
 */
export function renderMarkdownToAnsi(markdown: string): string {
  if (!markdown.trim()) return '';

  // marked.parse returns string | Promise<string>; we use the sync form here.
  const result = marked.parse(markdown) as unknown;
  if (typeof result === 'string') {
    return result;
  }
  // Fallback to original markdown if parser behaves unexpectedly.
  return markdown;
}

