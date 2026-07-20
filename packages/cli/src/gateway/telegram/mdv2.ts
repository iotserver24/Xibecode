/**
 * Hermes Telegram MarkdownV2 message engine (ported from
 * plugins/platforms/telegram/adapter.py format_message / _escape_mdv2).
 *
 * MIT — adapted from Hermes Agent (Nous Research).
 */

/** Characters MarkdownV2 requires escaped outside code spans. */
const MDV2_ESCAPE_RE = /([_*[\]()~`>#+\-=|{}.!\\])/g;

export function escapeMdv2(text: string): string {
  return text.replace(MDV2_ESCAPE_RE, '\\$1');
}

/** Strip MarkdownV2 escapes + light markers → plain text (Hermes _strip_mdv2). */
export function stripMdv2(text: string): string {
  let cleaned = text.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1');
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');
  cleaned = cleaned.replace(/~([^~]+)~/g, '$1');
  cleaned = cleaned.replace(/\|\|([^|]+)\|\|/g, '$1');
  return cleaned;
}

const TABLE_SEPARATOR_RE = /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/;

function isTableRow(line: string): boolean {
  return line.includes('|') && !line.trimStart().startsWith('```');
}

function renderTableBlock(block: string[]): string {
  if (block.length < 2) return block.join('\n');
  const split = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const headers = split(block[0]);
  const rows = block.slice(2).map(split);
  const parts: string[] = [];
  for (const row of rows) {
    const bullets = headers
      .map((h, i) => `  • **${h}**: ${row[i] ?? ''}`)
      .join('\n');
    parts.push(bullets);
  }
  return parts.join('\n\n');
}

/** GFM pipe tables → bullets (Hermes convert_table_to_bullets). */
export function convertTablesToBullets(text: string): string {
  if (!text.includes('|') || !text.includes('-')) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trimStart();
    if (stripped.startsWith('```')) {
      inFence = !inFence;
      out.push(line);
      i += 1;
      continue;
    }
    if (inFence) {
      out.push(line);
      i += 1;
      continue;
    }
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      TABLE_SEPARATOR_RE.test(lines[i + 1])
    ) {
      const block = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) {
        block.push(lines[j]);
        j += 1;
      }
      out.push(renderTableBlock(block));
      i = j;
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out.join('\n');
}

/** Move (N/M) off fence lines (Hermes _separate_chunk_indicator_from_fence). */
export function separateChunkIndicatorFromFence(text: string): string {
  return text.replace(
    /^``` ((\\)?\(\d+\/\d+(\\)?\))$/gm,
    '```\n$1',
  );
}

/**
 * Convert standard markdown → Telegram MarkdownV2 (Hermes format_message).
 */
export function formatMessage(content: string): string {
  if (!content) return content;

  const placeholders = new Map<string, string>();
  let counter = 0;
  const ph = (value: string): string => {
    const key = `\0PH${counter++}\0`;
    placeholders.set(key, value);
    return key;
  };

  let text = convertTablesToBullets(content);

  // 1) Protect fenced code
  text = text.replace(/```(?:[^\n]*\n)?[\s\S]*?```/g, (raw) => {
    const nl = raw.indexOf('\n', 3);
    const openEnd = nl >= 0 ? nl + 1 : 3;
    const opening = raw.slice(0, openEnd);
    const bodyAndClose = raw.slice(openEnd);
    const body = bodyAndClose.slice(0, -3).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return ph(opening + body + '```');
  });

  // 2) Protect inline code
  text = text.replace(/`[^`]+`/g, (m) => ph(m.replace(/\\/g, '\\\\')));

  // 3) Links
  text = text.replace(
    /\[([^\]]+)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g,
    (_m, display: string, url: string) => {
      const d = escapeMdv2(display);
      const u = url.replace(/\\/g, '\\\\').replace(/\)/g, '\\)');
      return ph(`[${d}](${u})`);
    },
  );

  // 4) Headers → bold
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_m, inner: string) => {
    let t = String(inner).trim().replace(/\*\*(.+?)\*\*/g, '$1');
    return ph(`*${escapeMdv2(t)}*`);
  });

  // 5) Bold ** → *
  text = text.replace(/\*\*(.+?)\*\*/g, (_m, inner: string) =>
    ph(`*${escapeMdv2(inner)}*`),
  );

  // 6) Italic * → _
  text = text.replace(/\*([^*\n]+)\*/g, (_m, inner: string) =>
    ph(`_${escapeMdv2(inner)}_`),
  );

  // 7) Strikethrough
  text = text.replace(/~~(.+?)~~/g, (_m, inner: string) =>
    ph(`~${escapeMdv2(inner)}~`),
  );

  // 8) Spoilers
  text = text.replace(/\|\|(.+?)\|\|/g, (_m, inner: string) =>
    ph(`||${escapeMdv2(inner)}||`),
  );

  // 9) Blockquotes
  text = text.replace(
    /^((?:\*\*)?>{1,3}) (.+)$/gm,
    (_m, prefix: string, c: string) => {
      if (prefix.startsWith('**') && c.endsWith('||')) {
        return ph(`${prefix} ${escapeMdv2(c.slice(0, -2))}||`);
      }
      return ph(`${prefix} ${escapeMdv2(c)}`);
    },
  );

  // 10) Escape rest
  text = escapeMdv2(text);

  // 11) Restore placeholders reverse
  const keys = [...placeholders.keys()].reverse();
  for (const key of keys) {
    text = text.split(key).join(placeholders.get(key)!);
  }

  // 12) Safety net for bare () {} outside code
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/);
  text = parts
    .map((seg, idx) => {
      if (idx % 2 === 1) return seg;
      return seg.replace(/[(){}]/g, (ch, offset) => {
        if (offset > 0 && seg[offset - 1] === '\\') return ch;
        if (ch === '(' && offset > 0 && seg[offset - 1] === ']') return ch;
        if (ch === ')') {
          const before = seg.slice(0, offset);
          if (before.includes('](http') || before.includes('](')) {
            let depth = 0;
            for (let j = offset - 1; j >= Math.max(offset - 2000, 0); j--) {
              if (seg[j] === '(') {
                depth -= 1;
                if (depth < 0) {
                  if (j > 0 && seg[j - 1] === ']') return ch;
                  break;
                }
              } else if (seg[j] === ')') {
                depth += 1;
              }
            }
          }
        }
        return '\\' + ch;
      });
    })
    .join('');

  return separateChunkIndicatorFromFence(text);
}

export function truncateLabel(s: string, max = 48): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}
