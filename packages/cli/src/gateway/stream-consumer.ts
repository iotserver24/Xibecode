/**
 * progressive message consumer for messaging gateways.
 *
 * Progress grouping (messaging gateway `tool_progress_grouping`):
 * - **separate** (default): each tool line is a **new** message; tool-result
 * may edit only the last tool line. Matches messaging gateway "separate" / pre-v0.9.
 * - **accumulate**: one bubble edited in place with all tool lines.
 *
 * Stream draft (optional): edits a preview bubble as stream_text arrives.
 * Final answer is always sent by the caller as a new message.
 *
 * Env:
 * - XIBECODE_STREAM_EDIT=1 enables progressive answer drafts (off by default —
 * final answer is a new message; matches chat without mid-turn
 *   draft thrash on Telegram)
 * - XIBECODE_PROGRESS_GROUPING=accumulate|separate overrides default (separate)
 */

import type { MessagingAdapter } from './types.js';

const MIN_EDIT_MS = 900;
const MAX_DRAFT_CHARS = 3200;

export type ProgressGrouping = 'separate' | 'accumulate';

export type StreamConsumerOptions = {
  adapter: MessagingAdapter;
  chatId: string;
  threadId?: string;
  /** Header line for the progress bubble / first status message */
  progressHeader: string;
  enabled?: boolean;
  /**
 * messaging gateway tool_progress_grouping.
 * Default: separate (new message per tool) — matches user-facing messaging gateway UX.
   */
  grouping?: ProgressGrouping;
};

function resolveGrouping(explicit?: ProgressGrouping): ProgressGrouping {
  if (explicit === 'separate' || explicit === 'accumulate') return explicit;
  const env = (process.env.XIBECODE_PROGRESS_GROUPING || '').toLowerCase().trim();
  if (env === 'accumulate' || env === 'edit') return 'accumulate';
  if (env === 'separate' || env === 'new') return 'separate';
  return 'separate';
}

export class GatewayStreamConsumer {
  private adapter: MessagingAdapter;
  private chatId: string;
  private threadId?: string;
  private progressHeader: string;
  private enabled: boolean;
  private grouping: ProgressGrouping;

  private toolLines: string[] = [];
  /** Message id of the status/header bubble (heartbeat edits this). */
  private statusMsgId?: string;
  /** Accumulate mode: one bubble for all tools. */
  private progressMsgId?: string;
  /** Separate mode: last tool line message (for replaceLast edit). */
  private lastToolMsgId?: string;
  private draftMsgId?: string;
  private draftText = '';
  private lastProgressFlush = 0;
  private lastDraftFlush = 0;
  private closed = false;
  /** After a tool starts, next stream text opens a fresh draft bubble. */
  private needNewDraftBubble = false;

  constructor(opts: StreamConsumerOptions) {
    this.adapter = opts.adapter;
    this.chatId = opts.chatId;
    this.threadId = opts.threadId;
    this.progressHeader = opts.progressHeader;
    this.grouping = resolveGrouping(opts.grouping);
    this.enabled =
      opts.enabled !== false &&
      typeof this.adapter.sendOrEditProgress === 'function';
  }

  private canProgress(): boolean {
    return this.enabled && typeof this.adapter.sendOrEditProgress === 'function';
  }

  private canDraft(): boolean {
 // Off by default: final answer is a new message (user preference / messaging gateway chat UX).
    // Set XIBECODE_STREAM_EDIT=1 to re-enable mid-turn draft edits.
    const v = (process.env.XIBECODE_STREAM_EDIT || '').toLowerCase();
    return this.canProgress() && (v === '1' || v === 'true' || v === 'on');
  }

  private renderAccumulate(footer?: string): string {
    const lines = [this.progressHeader, ...this.toolLines.slice(-10)];
    if (footer) lines.push(footer);
    return lines.join('\n');
  }

  /**
   * Initial status / heartbeat. In separate mode this is its own message
   * (not the tool list). In accumulate mode it is the shared bubble.
   */
  async flushProgress(footer?: string): Promise<void> {
    if (!this.canProgress() || this.closed) return;
    this.lastProgressFlush = Date.now();

    if (this.grouping === 'separate') {
      const text = footer
        ? `${this.progressHeader}\n${footer}`
        : this.progressHeader;
      this.statusMsgId = await this.adapter.sendOrEditProgress!(
        this.chatId,
        text,
        this.statusMsgId,
        { threadId: this.threadId },
      );
      return;
    }

    this.progressMsgId = await this.adapter.sendOrEditProgress!(
      this.chatId,
      this.renderAccumulate(footer),
      this.progressMsgId,
      { threadId: this.threadId },
    );
  }

  async pushToolLine(
    line: string,
    opts?: { replaceLast?: boolean; force?: boolean },
  ): Promise<void> {
    if (this.closed) return;
    // Tool boundary: next streamed answer is a new bubble
    this.needNewDraftBubble = true;
    if (opts?.replaceLast && this.toolLines.length > 0) {
      this.toolLines[this.toolLines.length - 1] = line;
    } else {
      this.toolLines.push(line);
    }

    if (!this.canProgress()) return;

    if (this.grouping === 'separate') {
 // messaging gateway separate: one message per tool line; result may edit last only
      if (opts?.replaceLast && this.lastToolMsgId) {
        this.lastToolMsgId = await this.adapter.sendOrEditProgress!(
          this.chatId,
          line,
          this.lastToolMsgId,
          { threadId: this.threadId },
        );
      } else {
        // Always new message — never edit an older tool bubble
        this.lastToolMsgId = await this.adapter.sendOrEditProgress!(
          this.chatId,
          line,
          undefined,
          { threadId: this.threadId },
        );
      }
      this.lastProgressFlush = Date.now();
      return;
    }

    // accumulate: rate-limited edit of one bubble
    const now = Date.now();
    if (!opts?.force && now - this.lastProgressFlush < MIN_EDIT_MS) return;
    await this.flushProgress();
  }

  /**
   * Progressive answer text (from agent stream_text). Rate-limited edits.
   * Only when XIBECODE_STREAM_EDIT=1.
   */
  async onDelta(text: string): Promise<void> {
    if (!this.canDraft() || this.closed || !text) return;
    if (this.needNewDraftBubble) {
      this.draftMsgId = undefined;
      this.draftText = '';
      this.needNewDraftBubble = false;
    }
    this.draftText = (this.draftText + text).slice(-MAX_DRAFT_CHARS);
    const now = Date.now();
    if (now - this.lastDraftFlush < MIN_EDIT_MS) return;
    this.lastDraftFlush = now;
    const preview =
      this.draftText.length >= MAX_DRAFT_CHARS
        ? '…' + this.draftText.slice(-MAX_DRAFT_CHARS + 1)
        : this.draftText;
    this.draftMsgId = await this.adapter.sendOrEditProgress!(
      this.chatId,
      preview || '…',
      this.draftMsgId,
      { threadId: this.threadId },
    );
  }

  /** Mark progress bubble done; soft footer only (no shouty _done_). */
  async markDone(footer: string): Promise<void> {
    await this.flushProgress(footer);
  }

  getDraft(): string {
    return this.draftText;
  }

  getGrouping(): ProgressGrouping {
    return this.grouping;
  }

  close(): void {
    this.closed = true;
  }
}

/**
 * Keep chunk markers off fenced code lines (messaging gateway fence hygiene).
 */
export function separateChunkIndicatorFromFence(text: string): string {
  // Avoid: ``` (1/2)  which breaks Markdown fences on Telegram
  return text.replace(/```\s*(\(\d+\/\d+\))\s*$/m, '```\n$1');
}
