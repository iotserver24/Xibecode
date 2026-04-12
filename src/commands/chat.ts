import { launchClaudeStyleChat } from '../ui/claude-style-chat.js';
import { createRoot } from '../ink.js';
import { exitWithMessage } from '../interactiveHelpers.js';

interface ChatOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  provider?: string;
  costMode?: string;
  theme?: string;
  session?: string;
  noWebui?: boolean;
}

export async function chatCommand(options: ChatOptions) {
  try {
    await launchClaudeStyleChat(options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error starting chat session';
    const root = createRoot({ exitOnCtrlC: true });
    await exitWithMessage(root, message, { color: 'error', exitCode: 1 });
  }
}
