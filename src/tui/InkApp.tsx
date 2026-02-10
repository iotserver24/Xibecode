import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { EnhancedAgent } from '../core/agent.js';
import type { SessionManager, ChatSession } from '../core/session-manager.js';
import type { ConfigManager } from '../utils/config.js';
import type { MCPClientManager } from '../core/mcp-client.js';
import type { CodingToolExecutor } from '../core/tools.js';
import type { AgentMode } from '../core/modes.js';
import { getAllModes } from '../core/modes.js';
import MarkdownMessage from './MarkdownMessage.js';

type Role = 'user' | 'assistant' | 'tool' | 'system';

interface ViewMessage {
  id: string;
  role: Role;
  content: string;
}

export interface InkAppProps {
  agent: EnhancedAgent;
  sessionManager: SessionManager;
  initialSession: ChatSession;
  config: ConfigManager;
  mcpClientManager: MCPClientManager;
  toolExecutor: CodingToolExecutor;
  model: string;
  themeName: string;
  cwd: string;
  enableToolsByDefault?: boolean;
}

export const InkApp: React.FC<InkAppProps> = ({
  agent,
  sessionManager,
  initialSession,
  config,
  mcpClientManager,
  toolExecutor,
  model,
  themeName,
  cwd,
  enableToolsByDefault = true,
}) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ViewMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [thinking, setThinking] = useState<string | null>(null);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(enableToolsByDefault);
  const [currentSession, setCurrentSession] = useState<ChatSession>(initialSession);
  const allModes = getAllModes();
  const [currentMode, setCurrentMode] = useState<AgentMode>(agent.getMode());
  const [hasResponse, setHasResponse] = useState(false);

  // Subscribe to agent events
  useEffect(() => {
    const listener = (event: any) => {
      switch (event.type) {
        case 'thinking':
          setThinking(event.data.message || 'Thinking...');
          break;
        case 'stream_start':
          setStreaming(true);
          setStreamBuffer('');
          setHasResponse(true);
          break;
        case 'stream_text':
          setStreamBuffer(prev => prev + (event.data.text || ''));
          break;
        case 'stream_end':
          if (streamBuffer.trim()) {
            appendMessage('assistant', streamBuffer);
          }
          setStreaming(false);
          setStreamBuffer('');
          break;
        case 'response':
          if (!hasResponse) {
            appendMessage('assistant', event.data.text || '');
            setHasResponse(true);
          }
          break;
        case 'tool_call':
          appendMessage(
            'tool',
            `**Tool call** \`${event.data.name}\`\n\n\`\`\`json\n${JSON.stringify(event.data.input, null, 2)}\n\`\`\``
          );
          break;
        case 'tool_result':
          appendMessage(
            'tool',
            `**Tool result** \`${event.data.name}\` (${event.data.success ? 'success' : 'error'})\n\n\`\`\`json\n${JSON.stringify(
              event.data.result,
              null,
              2
            )}\n\`\`\``
          );
          break;
        case 'mode_changed':
          setCurrentMode(event.data.to as AgentMode);
          appendMessage('system', `Mode changed: \`${event.data.from}\` → \`${event.data.to}\``);
          break;
        case 'warning':
          appendMessage('system', `⚠️ ${event.data.message}`);
          break;
        case 'error':
          appendMessage('system', `❌ ${event.data.message || event.data.error}`);
          break;
      }
    };

    // EnhancedAgent emits a single 'event' channel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).on('event', listener);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).off?.('event', listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, streamBuffer, hasResponse]);

  const appendMessage = (role: Role, content: string) => {
    if (!content) return;
    setMessages(prev => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        role,
        content,
      },
    ]);
  };

  const persistSession = async () => {
    const stats = agent.getStats();
    const updatedSession: ChatSession = {
      ...currentSession,
      messages: agent.getMessages(),
      stats,
    };
    setCurrentSession(updatedSession);
    await sessionManager.saveMessagesAndStats({
      id: updatedSession.id,
      messages: updatedSession.messages,
      stats,
    });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    appendMessage('user', trimmed);
    setInputValue('');
    setHasResponse(false);
    try {
      const tools = toolsEnabled ? toolExecutor.getTools() : [];
      await agent.run(trimmed, tools, toolExecutor);
      await persistSession();
    } catch (error: any) {
      appendMessage('system', `❌ Failed to process message: ${error.message || String(error)}`);
    }
  };

  useInput(async (input, key) => {
    if (key.return) {
      await sendMessage(inputValue);
      return;
    }

    if (key.tab) {
      const idx = allModes.indexOf(currentMode);
      const next = allModes[(idx + 1) % allModes.length];
      setCurrentMode(next);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).setModeFromUser?.(next, 'User pressed Tab to cycle mode (Ink TUI)');
      appendMessage('system', `Mode: \`${next}\` (press Tab to cycle)`);
      return;
    }

    if (key.ctrl && (key as any).c) {
      await mcpClientManager.disconnectAll();
      exit();
    }
  });

  const header = (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        ⚡ <Text color="cyanBright">XibeCode Ink TUI</Text> · model: {model} · mode: {currentMode} · session:{' '}
        {currentSession.title}
      </Text>
      <Text dimColor>
        cwd: {cwd} · theme: {themeName} · Tab: cycle mode · Ctrl+C: exit
      </Text>
      {thinking && <Text dimColor>… {thinking}</Text>}
    </Box>
  );

  const statusBar = (
    <Box marginTop={1}>
      <Text dimColor>
        model: {model} | mode: {currentMode} | session: {currentSession.title} | tools:{' '}
        {toolsEnabled ? 'on' : 'off'} | theme: {themeName}
      </Text>
    </Box>
  );

  return (
    <Box flexDirection="column">
      {header}
      <Box flexDirection="column" flexGrow={1}>
        {messages.map(m => (
          <Box key={m.id} flexDirection="column" marginBottom={1}>
            <Text bold>
              {m.role === 'user'
                ? 'You'
                : m.role === 'assistant'
                ? 'Assistant'
                : m.role === 'tool'
                ? 'Tool'
                : 'System'}
            </Text>
            <MarkdownMessage content={m.content} />
          </Box>
        ))}
        {streaming && streamBuffer.trim() && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Assistant</Text>
            <MarkdownMessage content={streamBuffer} />
          </Box>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color="greenBright">❯ </Text>
          <TextInput value={inputValue} onChange={setInputValue} placeholder="Type a message..." />
        </Box>
        {statusBar}
      </Box>
    </Box>
  );
};

export default InkApp;

