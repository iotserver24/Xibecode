/**
 * Image attachment types for multimodal message support.
 *
 * @module types/attachments
 */

export type ImageAttachment = {
  path: string;
  mime: string;
  /** Preferred: public https URL. Vision models fetch this more reliably than data URLs. */
  url?: string;
  /** Fallback when no public URL is available (local TUI). */
  dataBase64?: string;
  bytes?: number;
};
