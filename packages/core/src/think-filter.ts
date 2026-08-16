/**
 * Split model output into visible reply text vs hidden reasoning.
 *
 * Handles `<think>`, `<thinking>`, and `<thought>` (case-insensitive),
 * including tags split across streaming chunks.
 */

export interface ThinkFilterChunk {
  text: string;
  thinking: string;
}

const OPEN_TAGS = ['<think>', '<thinking>', '<thought>'] as const;
const CLOSE_TAGS = ['</think>', '</thinking>', '</thought>'] as const;

function findIgnoreCase(haystack: string, needle: string, from: number): number {
  return haystack.toLowerCase().indexOf(needle.toLowerCase(), from);
}

function earliestMatch(haystack: string, tags: readonly string[], from: number): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const tag of tags) {
    const index = findIgnoreCase(haystack, tag, from);
    if (index === -1) continue;
    if (!best || index < best.index) {
      best = { index, length: tag.length };
    }
  }
  return best;
}

function partialTagSuffixLen(text: string): number {
  const lower = text.toLowerCase();
  let longest = 0;
  for (const tag of [...OPEN_TAGS, ...CLOSE_TAGS]) {
    for (let len = tag.length - 1; len >= 1; len--) {
      if (len > longest && lower.endsWith(tag.slice(0, len))) {
        longest = len;
      }
    }
  }
  return longest;
}

export class ThinkTagFilter {
  private insideThink = false;
  private buffer = '';

  reset() {
    this.insideThink = false;
    this.buffer = '';
  }

  /**
   * Process a streaming text chunk. Visible reply text and reasoning
   * are returned separately so the UI can render a Thought block.
   */
  push(chunk: string): ThinkFilterChunk {
    const combined = this.buffer + chunk;
    this.buffer = '';
    let text = '';
    let thinking = '';
    let i = 0;

    while (i < combined.length) {
      if (this.insideThink) {
        const close = earliestMatch(combined, CLOSE_TAGS, i);
        if (close) {
          thinking += combined.slice(i, close.index);
          this.insideThink = false;
          i = close.index + close.length;
        } else {
          const remaining = combined.slice(i);
          const partial = partialTagSuffixLen(remaining);
          if (partial > 0) {
            thinking += remaining.slice(0, remaining.length - partial);
            this.buffer = remaining.slice(remaining.length - partial);
          } else {
            thinking += remaining;
          }
          break;
        }
      } else {
        const open = earliestMatch(combined, OPEN_TAGS, i);
        if (open) {
          text += combined.slice(i, open.index);
          this.insideThink = true;
          i = open.index + open.length;
        } else {
          const remaining = combined.slice(i);
          const partial = partialTagSuffixLen(remaining);
          if (partial > 0) {
            text += remaining.slice(0, remaining.length - partial);
            this.buffer = remaining.slice(remaining.length - partial);
          } else {
            text += remaining;
          }
          break;
        }
      }
    }

    return { text, thinking };
  }

  flush(): ThinkFilterChunk {
    const leftover = this.buffer;
    this.buffer = '';
    if (this.insideThink) return { text: '', thinking: leftover };
    return { text: leftover, thinking: '' };
  }

  static split(text: string): ThinkFilterChunk {
    const filter = new ThinkTagFilter();
    const first = filter.push(text);
    const last = filter.flush();
    return {
      text: first.text + last.text,
      thinking: first.thinking + last.thinking,
    };
  }

  static strip(text: string): string {
    return ThinkTagFilter.split(text).text.trim();
  }
}

export function extractDeltaReasoning(delta: unknown): string {
  if (!delta || typeof delta !== 'object') return '';
  const d = delta as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof d.reasoning_content === 'string') parts.push(d.reasoning_content);
  else if (typeof d.reasoning === 'string') parts.push(d.reasoning);

  if (Array.isArray(d.content)) {
    for (const item of d.content) {
      if (!item || typeof item !== 'object') continue;
      const block = item as Record<string, unknown>;
      const type = String(block.type || '');
      if (type === 'thinking' || type === 'reasoning' || type === 'thought') {
        const piece =
          (typeof block.thinking === 'string' && block.thinking) ||
          (typeof block.reasoning === 'string' && block.reasoning) ||
          (typeof block.text === 'string' && block.text) ||
          '';
        if (piece) parts.push(piece);
      }
    }
  }

  return parts.join('');
}

export function extractDeltaText(delta: unknown): string {
  if (!delta || typeof delta !== 'object') return '';
  const d = delta as Record<string, unknown>;

  if (typeof d.content === 'string') return d.content;
  if (!Array.isArray(d.content)) return '';

  return d.content
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter((block) => {
      const type = String(block.type || 'text');
      return type === 'text' || type === 'output_text';
    })
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('');
}

export function extractAnthropicThinkingDelta(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const ev = event as Record<string, unknown>;
  const delta = ev.delta;
  if (delta && typeof delta === 'object') {
    const d = delta as Record<string, unknown>;
    if (d.type === 'thinking_delta' && typeof d.thinking === 'string') {
      return d.thinking;
    }
  }
  if (typeof ev.thinking === 'string') return ev.thinking;
  return '';
}
