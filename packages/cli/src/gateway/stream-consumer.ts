/**
 * Hermes-style progressive message consumer for messaging gateways.
 *
 * - One progress bubble edited in place (tools + status)
 * - Optional answer draft edited as stream_text arrives
 * - Tool boundary freezes the draft so tools appear "above" new text
 * - finalize() delivers the final answer (caller sends Markdown via adapter)
 *
 * Env: XIBECODE_STREAM_EDIT=0 disables progressive answer edits.
 */

import type { MessagingAdapter } from './types.js';

const MIN_EDIT_MS = 900;
const MAX_DRAFT_CHARS = 3200;

export type StreamConsumerOptions = {
  adapter: MessagingAdapter;
  chatId: string;
  threadId?: string;
  /** Header line for the progress bubble */
  progressHeader: string;
  enabled?: boolean;
};

export class GatewayStreamConsumer {
  private adapter: MessagingAdapter;
  private chatId: string;
  private threadId?: string;
  private progressHeader: string;
  private enabled: boolean;

  private toolLines: string[] = [];
  private progressMsgId?: string;
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
    this.enabled =
      opts.enabled !== false &&
      process.env.XIBECODE_STREAM_EDIT !== '0' &&
      process.env.XIBECODE_STREAM_EDIT !== 'false';
  }

  private canEdit(): boolean {
    return this.enabled && typeof this.adapter.sendOrEditProgress === 'function';
  }

  private renderProgress(footer?: string): string {
    const lines = [this.progressHeader, ...this.toolLines.slice(-10)];
    if (footer) lines.push(footer);
    return lines.join('\n');
  }

  async flushProgress(footer?: string): Promise<void> {
    if (!this.canEdit() || this.closed) return;
    this.lastProgressFlush = Date.now();
    this.progressMsgId = await this.adapter.sendOrEditProgress!(
      this.chatId,
      this.renderProgress(footer),
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
    const now = Date.now();
    if (!opts?.force && now - this.lastProgressFlush < MIN_EDIT_MS) return;
    await this.flushProgress();
  }

  /**
   * Progressive answer text (from agent stream_text). Rate-limited edits.
   */
  async onDelta(text: string): Promise<void> {
    if (!this.canEdit() || this.closed || !text) return;
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

  /** Mark progress bubble done; returns draft text if any (may be partial). */
  async markDone(footer: string): Promise<void> {
    await this.flushProgress(footer);
  }

  getDraft(): string {
    return this.draftText;
  }

  close(): void {
    this.closed = true;
  }
}

/**
 * Keep chunk markers off fenced code lines (Hermes fence hygiene).
 */
export function separateChunkIndicatorFromFence(text: string): string {
  // Avoid: ``` (1/2)  which breaks Markdown fences on Telegram
  return text.replace(/```\s*(\(\d+\/\d+\))\s*$/m, '```\n$1');
}
