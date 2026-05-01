/**
 * Image attachment types for multimodal message support.
 *
 * @module types/attachments
 */

export type ImageAttachment = {
  path: string;
  mime: string;
  dataBase64: string;
  bytes: number;
};
