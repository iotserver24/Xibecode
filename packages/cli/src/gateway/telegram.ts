/**
 * Telegram adapter — re-exports engine.
 * Implementation lives in ./telegram/ (MarkdownV2, model picker, callbacks).
 */
export {
  TelegramAdapter,
  TelegramEngine,
  type TelegramConfig,
  type ModelPickerOptions,
} from './telegram/index.js';
