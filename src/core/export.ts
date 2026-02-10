import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { ChatSession } from './session-manager.js';

export interface ExportMetadata {
  title: string;
  model: string;
  created?: string;
  updated?: string;
}

export function exportMessagesToMarkdown(
  messages: MessageParam[],
  meta: ExportMetadata
): string {
  const lines: string[] = [];

  lines.push(`# XibeCode Session: ${meta.title || 'Untitled Session'}`);
  lines.push('');
  lines.push(`**Model**: ${meta.model}`);
  if (meta.created) {
    lines.push(`**Created**: ${meta.created}`);
  }
  if (meta.updated) {
    lines.push(`**Updated**: ${meta.updated}`);
  }
  lines.push('');
  lines.push('## Conversation');
  lines.push('');

  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = renderContent(msg);
      lines.push('**You**:');
      lines.push('');
      lines.push(content);
      lines.push('');
    } else if (msg.role === 'assistant') {
      const content = renderContent(msg);
      lines.push('**Assistant**:');
      lines.push('');
      lines.push(content);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function exportSessionToMarkdown(session: ChatSession): string {
  return exportMessagesToMarkdown(session.messages, {
    title: session.title,
    model: session.model,
    created: session.created,
    updated: session.updated,
  });
}

function renderContent(msg: MessageParam): string {
  if (typeof msg.content === 'string') return msg.content;
  if (!Array.isArray(msg.content)) return '';

  const parts: string[] = [];
  for (const block of msg.content as any[]) {
    if (block.type === 'text' && block.text) {
      parts.push(block.text);
    }
  }
  return parts.join('\n');
}

