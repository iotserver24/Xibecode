/**
 * Shared messaging types for the coding-focused 24/7 gateway.
 */

export type PlatformName = 'telegram' | 'discord' | 'slack';

export interface InboundMessage {
  platform: PlatformName;
  chatId: string;
  userId: string;
  text: string;
  messageId?: string;
  username?: string;
  /** Channel/thread metadata for threaded platforms. */
  threadId?: string;
}

export interface MessagingAdapter {
  readonly name: PlatformName;
  /** Optional home channel for cron delivery. */
  homeChannel?: string;
  stop(): void;
  sendMessage(chatId: string, text: string, opts?: { threadId?: string }): Promise<void>;
  /** Optional typing indicator. */
  sendTyping?(chatId: string, opts?: { threadId?: string }): Promise<void>;
  /** Optional: edit a progress message in place. Returns message id. */
  sendOrEditProgress?(
    chatId: string,
    text: string,
    previousMessageId?: string,
    opts?: { threadId?: string },
  ): Promise<string | undefined>;
  /** Start receiving messages until stop(). */
  runLoop(onMessage: (msg: InboundMessage) => Promise<void>): Promise<void>;
}

export interface ActiveRun {
  abort: AbortController;
  startedAt: number;
  prompt: string;
}
