/**
 * Telegram gateway engine entry.
 * @see NOTICE for messaging gateway Agent MIT attribution.
 */
export {
  TelegramEngine,
  TelegramAdapter,
  type TelegramConfig,
  type ModelPickerOptions,
} from './engine.js';
export { formatMessage, escapeMdv2, stripMdv2 } from './mdv2.js';
export type { PickerProvider, ModelPickerState } from './model-picker.js';
