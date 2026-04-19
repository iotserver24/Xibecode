import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, createRoot } from '../ink.js';
import TextInput from 'ink-text-input';
import { SessionManager, type SessionMetadata, type ChatSession } from '../core/session-manager.js';
import { launchClaudeStyleChat } from '../ui/claude-style-chat.js';
import { ConfigManager, type ProviderType } from '../utils/config.js';
import { renderAndRun } from '../interactiveHelpers.js';

interface ResumeOptions {
  profile?: string;
  session?: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function SessionPicker(props: {
  sessions: SessionMetadata[];
  onSelect: (id: string) => void;
  onCancel: () => void;
}): React.ReactNode {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const WINDOW_SIZE = 12;

  const filteredSessions = props.sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(filter.toLowerCase()) ||
      s.id.toLowerCase().includes(filter.toLowerCase()),
  );

  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(WINDOW_SIZE / 2), filteredSessions.length - WINDOW_SIZE),
  );
  const visibleSessions = filteredSessions.slice(windowStart, windowStart + WINDOW_SIZE);

  useInput((input, key) => {
    if (key.escape) {
      props.onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev <= 0 ? filteredSessions.length - 1 : prev - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev >= filteredSessions.length - 1 ? 0 : prev + 1));
    }
    if (key.return && filteredSessions.length > 0) {
      const selected = filteredSessions[selectedIndex];
      if (selected) {
        props.onSelect(selected.id);
      }
    }
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="claude">
          Resume Session
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="inactive">Filter: </Text>
        <TextInput value={filter} onChange={setFilter} placeholder="Search sessions..." />
      </Box>
      {filteredSessions.length === 0 ? (
        <Text color="inactive">No sessions found.</Text>
      ) : (
        <Box flexDirection="column">
          {visibleSessions.map((session, idx) => {
            const absoluteIndex = windowStart + idx;
            const isSelected = absoluteIndex === selectedIndex;
            return (
              <Box key={session.id} flexDirection="column">
                <Text>
                  <Text color={isSelected ? 'claude' : 'inactive'}>{isSelected ? '▸ ' : '  '}</Text>
                  <Text bold color={isSelected ? 'claude' : 'text'}>
                    {session.title}
                  </Text>
                </Text>
                <Text color="subtle">
                  {'    '}
                  {formatRelativeTime(session.updated)} · {session.model} ·{' '}
                  {session.id.slice(0, 20)}...
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="subtle">↑/↓ navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  );
}

async function showSessionPicker(sessions: SessionMetadata[]): Promise<string | null> {
  return new Promise((resolve) => {
    const root = createRoot({ exitOnCtrlC: true });

    const onSelect = (id: string) => {
      resolve(id);
      root.unmount();
    };

    const onCancel = () => {
      resolve(null);
      root.unmount();
    };

    renderAndRun(root, <SessionPicker sessions={sessions} onSelect={onSelect} onCancel={onCancel} />);
  });
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  const sessionManager = new SessionManager();
  const config = new ConfigManager(options.profile);

  if (options.session) {
    const session = await sessionManager.loadSession(options.session);
    if (!session) {
      console.error(`Session not found: ${options.session}`);
      process.exit(1);
    }
    await resumeSession(session, config, options.profile);
    return;
  }

  const sessions = await sessionManager.listSessions();

  if (sessions.length === 0) {
    console.log('No sessions found to resume.');
    console.log('\nStart a new session with: xibecode chat');
    process.exit(0);
    return;
  }

  const selectedId = await showSessionPicker(sessions);

  if (!selectedId) {
    console.log('Resume cancelled.');
    process.exit(0);
    return;
  }

  const session = await sessionManager.loadSession(selectedId);
  if (!session) {
    console.error(`Failed to load session: ${selectedId}`);
    process.exit(1);
    return;
  }

  await resumeSession(session, config, options.profile);
}

async function resumeSession(
  session: ChatSession,
  config: ConfigManager,
  profile?: string,
): Promise<void> {
  console.log(`\nResuming session: ${session.title}`);
  console.log(`Session ID: ${session.id}`);
  console.log(`Model: ${session.model}`);
  console.log(`Messages: ${session.messages.length}`);
  console.log('');

  const apiKey = config.getApiKey();
  if (!apiKey) {
    console.error('No API key configured. Run: xibecode config --set-key YOUR_KEY');
    process.exit(1);
  }

  const baseUrl = config.getBaseUrl();
  const provider = config.get('provider') as ProviderType | undefined;

  const initialMessages = session.messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  await launchClaudeStyleChat({
    model: session.model,
    baseUrl,
    apiKey,
    provider,
    profile,
    sessionId: session.id,
    initialMessages,
  });
}
