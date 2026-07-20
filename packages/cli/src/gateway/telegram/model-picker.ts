/**
 * Hermes-style model picker state + keyboards (mp:/mm:/mg:/mb:/mx:/mpv:).
 * Adapted from Hermes plugins/platforms/telegram/adapter.py
 */

import { formatMessage, truncateLabel } from './mdv2.js';

export interface PickerProvider {
  slug: string;
  name: string;
  models: string[];
  total_models?: number;
  is_current?: boolean;
}

export interface ModelPickerState {
  msgId?: string;
  providers: PickerProvider[];
  current_model: string;
  current_provider: string;
  provider_page: number;
  selected_provider?: string;
  selected_provider_name?: string;
  model_list?: string[];
  model_page?: number;
  /** Called when user confirms a model (chatId, modelId, providerSlug). */
  onModelSelected: (
    chatId: string,
    modelId: string,
    providerSlug: string,
  ) => Promise<string>;
}

export const PROVIDER_PAGE_SIZE = 10;
export const MODEL_PAGE_SIZE = 8;

type Btn = { text: string; callback_data: string };
type Keyboard = { inline_keyboard: Btn[][] };

export function buildProviderKeyboard(
  providers: PickerProvider[],
  page = 0,
): { keyboard: Keyboard; pageInfo: string } {
  const buttons: Btn[] = providers.map((p) => {
    const count = p.total_models ?? p.models.length;
    let label = `${p.name} (${count})`;
    if (p.is_current) label = `✓ ${label}`;
    return { text: truncateLabel(label, 40), callback_data: `mp:${p.slug}` };
  });

  const total = buttons.length;
  const totalPages = Math.max(1, Math.ceil(total / PROVIDER_PAGE_SIZE));
  page = Math.max(0, Math.min(page, totalPages - 1));
  const start = page * PROVIDER_PAGE_SIZE;
  const end = Math.min(start + PROVIDER_PAGE_SIZE, total);
  const pageButtons = buttons.slice(start, end);

  const rows: Btn[][] = [];
  for (let i = 0; i < pageButtons.length; i += 2) {
    rows.push(pageButtons.slice(i, i + 2));
  }
  if (totalPages > 1) {
    const nav: Btn[] = [];
    if (page > 0) nav.push({ text: '◀ Prev', callback_data: `mpv:${page - 1}` });
    nav.push({ text: `${page + 1}/${totalPages}`, callback_data: 'mx:noop' });
    if (page < totalPages - 1)
      nav.push({ text: 'Next ▶', callback_data: `mpv:${page + 1}` });
    rows.push(nav);
  }
  rows.push([{ text: '✗ Cancel', callback_data: 'mx' }]);

  const pageInfo =
    totalPages > 1 ? ` (${start + 1}–${end} of ${total})` : '';
  return { keyboard: { inline_keyboard: rows }, pageInfo };
}

export function buildModelKeyboard(
  models: string[],
  page: number,
): { keyboard: Keyboard; pageInfo: string } {
  const total = models.length;
  const totalPages = Math.max(1, Math.ceil(total / MODEL_PAGE_SIZE));
  page = Math.max(0, Math.min(page, totalPages - 1));
  const start = page * MODEL_PAGE_SIZE;
  const end = Math.min(start + MODEL_PAGE_SIZE, total);
  const pageModels = models.slice(start, end);

  const buttons: Btn[] = pageModels.map((modelId, i) => {
    const absIdx = start + i;
    let short = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
    if (short.length > 38) short = short.slice(0, 35) + '...';
    return { text: short, callback_data: `mm:${absIdx}` };
  });

  const rows: Btn[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  if (totalPages > 1) {
    const nav: Btn[] = [];
    if (page > 0) nav.push({ text: '◀ Prev', callback_data: `mg:${page - 1}` });
    nav.push({ text: `${page + 1}/${totalPages}`, callback_data: 'mx:noop' });
    if (page < totalPages - 1)
      nav.push({ text: 'Next ▶', callback_data: `mg:${page + 1}` });
    rows.push(nav);
  }
  rows.push([
    { text: '◀ Back', callback_data: 'mb' },
    { text: '✗ Cancel', callback_data: 'mx' },
  ]);

  const pageInfo =
    totalPages > 1 ? ` (${start + 1}–${end} of ${total})` : '';
  return { keyboard: { inline_keyboard: rows }, pageInfo };
}

export function providerListText(
  state: ModelPickerState,
  pageInfo: string,
): string {
  return formatMessage(
    [
      '⚙ *Model Configuration*',
      '',
      `Current model: \`${state.current_model || 'unknown'}\``,
      `Provider: ${state.current_provider}`,
      '',
      `Select a provider:${pageInfo}`,
    ].join('\n'),
  );
}

export function modelListText(
  state: ModelPickerState,
  pageInfo: string,
): string {
  const pname = state.selected_provider_name || state.selected_provider || '';
  const models = state.model_list || [];
  const provider = state.providers.find((p) => p.slug === state.selected_provider);
  const total = provider?.total_models ?? models.length;
  const shown = models.length;
  const extra =
    total > shown
      ? `\n_${total - shown} more available — type \`/model <name>\` directly_`
      : '';
  return formatMessage(
    [
      '⚙ *Model Configuration*',
      '',
      `Provider: *${pname}*${pageInfo}`,
      `Select a model:${extra}`,
    ].join('\n'),
  );
}
