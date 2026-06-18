import { useState, useCallback, useEffect } from 'react';
import { PanelLeft, PanelRight, Settings, Command } from 'lucide-react';
import type { HostedAgentEvent, ModeState } from '../preload/index';
import ChatPanel from './components/ChatPanel';
import ChatHistory from './components/ChatHistory';
import SettingsPanel from './components/SettingsPanel';
import CommandPalette from './components/CommandPalette';
import SetupWizard from './components/SetupWizard';
import StatusBar from './components/StatusBar';
import TabbedRightPanel from './components/TabbedRightPanel';
import { cn } from './lib/utils';

const xibe = (window as any).xibecode;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'info' | 'error';
  content: string;
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
  timestamp: number;
  isStreaming?: boolean;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modeState, setModeState] = useState<ModeState>({
    current: 'agent',
    history: [{ mode: 'agent', timestamp: Date.now(), reason: 'Initial mode' }],
  });
  const [isRunning, setIsRunning] = useState(false);
  const [workingDir, setWorkingDir] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeModel, setActiveModel] = useState('');
  const [activeProvider, setActiveProvider] = useState('');
  const [activeBaseUrl, setActiveBaseUrl] = useState('');
  const [wireFormat, setWireFormat] = useState<string>('auto');
  const [appVersion, setAppVersion] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [costMode, setCostMode] = useState('normal');
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      const wd = await xibe.app.getWorkingDir();
      setWorkingDir(wd);
      const ver = await xibe.app.getVersion();
      setAppVersion(ver);
      const model = await xibe.config.getModel();
      setActiveModel(model);
      const provider = await xibe.config.getProvider();
      setActiveProvider(provider || 'auto');
      const baseUrl = await xibe.config.getBaseUrl();
      setActiveBaseUrl(baseUrl || 'provider default');
      const apiKey = await xibe.config.getApiKey();
      if (!apiKey) {
        setNeedsSetup(true);
        setShowSetup(true);
      }
      const rf = await xibe.config.get('requestFormat');
      if (rf) setWireFormat(rf);
      const cm = await xibe.config.getCostMode();
      setCostMode(cm || 'normal');
    })();
  }, []);

  const handleAgentEvents = useCallback((batch: HostedAgentEvent[]) => {
    setMessages((prev) => {
      const updated = [...prev];

      // Cache target indices before loop to avoid O(N*M) inner loop scaling
      let lastAssistantIndex = -1;
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant' && updated[i].isStreaming) {
          lastAssistantIndex = i;
          break;
        }
      }

      // Use a stack for pending tool indices as there could be multiple tool calls in a single batch
      const pendingToolIndices: number[] = [];
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].role === 'tool' && updated[i].toolName && !updated[i].toolOutput) {
          pendingToolIndices.push(i);
        }
      }

      for (const event of batch) {
        const d = event.data as any;
        switch (event.type) {
          case 'stream_text': {
            const text = d?.text ?? '';
            if (!text) break;
            if (lastAssistantIndex >= 0) {
              updated[lastAssistantIndex] = { ...updated[lastAssistantIndex], content: updated[lastAssistantIndex].content + text };
            } else {
              lastAssistantIndex = updated.length;
              updated.push({ id: uid(), role: 'assistant', content: text, timestamp: event.timestamp, isStreaming: true });
            }
            break;
          }
          case 'response': {
            const text = d?.text ?? '';
            if (!text) break;
            if (lastAssistantIndex >= 0) {
              updated[lastAssistantIndex] = { ...updated[lastAssistantIndex], content: updated[lastAssistantIndex].content + text };
            } else {
              lastAssistantIndex = updated.length;
              updated.push({ id: uid(), role: 'assistant', content: text, timestamp: event.timestamp, isStreaming: true });
            }
            break;
          }
          case 'stream_end': {
            if (lastAssistantIndex >= 0) {
              updated[lastAssistantIndex] = { ...updated[lastAssistantIndex], isStreaming: false };
              lastAssistantIndex = -1; // Reset since streaming is complete
            }
            break;
          }
          case 'tool_call': {
            const newIndex = updated.length;
            pendingToolIndices.push(newIndex);
            updated.push({ id: uid(), role: 'tool', content: '', toolName: d?.name ?? 'unknown', toolInput: d?.input, timestamp: event.timestamp });
            break;
          }
          case 'tool_result': {
            const i = pendingToolIndices.shift(); // FIFO order for tool results
            if (i !== undefined && i >= 0) {
              updated[i] = { ...updated[i], toolOutput: d, content: typeof d === 'string' ? d : JSON.stringify(d, null, 2) };
            }
            break;
          }
          case 'complete': {
            if (lastAssistantIndex >= 0) {
              updated[lastAssistantIndex] = { ...updated[lastAssistantIndex], isStreaming: false };
              lastAssistantIndex = -1; // Reset since streaming is complete
            }
            setIsRunning(false);
            break;
          }
          case 'error': {
            const msg = d?.message ?? d?.error ?? 'Unknown error';
            updated.push({ id: uid(), role: 'error', content: msg, timestamp: event.timestamp });
            setIsRunning(false);
            break;
          }
          case 'mode_changed': {
            setModeState((prev) => ({
              current: d?.to ?? prev.current,
              previous: prev.current,
              history: [...prev.history, { mode: d?.to ?? prev.current, timestamp: event.timestamp, reason: d?.reason }],
            }));
            break;
          }
        }
      }
      return updated;
    });
  }, []);

  const handleSendMessage = useCallback(async (content: string) => {
    setMessages((prev) => [...prev, { id: uid(), role: 'user', content, timestamp: Date.now() }]);
    setIsRunning(true);

    if (!isInitialized) {
      try {
        const apiKey = await xibe.config.getApiKey();
        const model = await xibe.config.getModel();
        const provider = await xibe.config.getProvider();
        const baseUrl = await xibe.config.getBaseUrl();
        const requestFormat = await xibe.config.get('requestFormat');
        if (!apiKey) throw new Error('No API key configured. Run /setup first.');
        await xibe.agent.initialize({
          apiKey, model,
          provider: provider || undefined,
          baseUrl: baseUrl || undefined,
          workingDir,
          mode: modeState.current,
          requestFormat: requestFormat || undefined,
        });
        setIsInitialized(true);
      } catch (err: any) {
        setMessages((prev) => [...prev, { id: uid(), role: 'error', content: `Failed to initialize: ${err.message}`, timestamp: Date.now() }]);
        setIsRunning(false);
        return;
      }
    }

    // Create a new session if we don't have one yet
    if (!activeSessionId) {
      try {
        const model = await xibe.config.getModel();
        const session = await xibe.session.create({ model, cwd: workingDir });
        setActiveSessionId(session.id);
      } catch {
        // Session creation is non-fatal; chat continues without persistence
      }
    }

    const unsub = xibe.agent.onEvents(handleAgentEvents);
    try {
      await xibe.agent.sendMessage(content);
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: uid(), role: 'error', content: `Failed: ${err.message}`, timestamp: Date.now() }]);
    } finally {
      unsub();
      setIsRunning(false);
      // Persist messages to session after agent finishes
      if (activeSessionId) {
        try {
          const session = await xibe.session.load(activeSessionId);
          if (session) {
            const apiMessages = messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({ role: m.role, content: m.content }));
            await xibe.session.save({ ...session, messages: apiMessages });
          }
        } catch {
          // Non-fatal
        }
      }
    }
  }, [isInitialized, workingDir, modeState.current, handleAgentEvents, activeSessionId, messages]);

  const handleModeSwitch = useCallback(async (mode: string, reason: string) => {
    await xibe.agent.switchMode(mode, reason);
    setModeState((prev) => ({ current: mode, previous: prev.current, history: [...prev.history, { mode, timestamp: Date.now(), reason }] }));
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setIsInitialized(false);
    setActiveSessionId(undefined);
  }, []);

  const handleSelectSession = useCallback(async (id: string) => {
    const session = await xibe.session.load(id);
    if (!session) return;
    setActiveSessionId(id);
    setMessages(
      (session.messages || []).map((m: any) => ({
        id: uid(),
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        timestamp: new Date(session.created).getTime(),
      }))
    );
    setIsInitialized(false);
  }, []);

  const handleCommand = useCallback(async (cmd: string, arg?: string) => {
    switch (cmd) {
      case '/clear':
        handleNewChat();
        break;
      case '/mode':
        if (arg) {
          await handleModeSwitch(arg, `Switched via /mode`);
          setMessages((prev) => [...prev, { id: uid(), role: 'info', content: `Mode switched to ${arg}`, timestamp: Date.now() }]);
        }
        break;
      case '/model':
        if (arg) {
          await xibe.config.set('model', arg);
          setActiveModel(arg);
          setIsInitialized(false);
          setMessages((prev) => [...prev, { id: uid(), role: 'info', content: `Model switched to ${arg}`, timestamp: Date.now() }]);
        }
        break;
      case '/format':
        if (arg && ['auto', 'openai', 'anthropic'].includes(arg)) {
          await xibe.config.set('requestFormat', arg);
          setWireFormat(arg);
          setIsInitialized(false);
          setMessages((prev) => [...prev, { id: uid(), role: 'info', content: `Wire format set to ${arg}`, timestamp: Date.now() }]);
        }
        break;
      case '/setup':
        setShowSetup(true);
        break;
      case '/config':
        setSettingsOpen(true);
        break;
      case '/exit':
        (window as any).close();
        break;
      case '/donate':
      case '/sponsor': {
        const url = 'https://ai.xibebase.in';
        await xibe.shell.run(`xdg-open "${url}" || open "${url}"`).catch(() => {});
        break;
      }
    }
  }, [handleModeSwitch, handleNewChat]);

  const handleSetupComplete = useCallback(async () => {
    setShowSetup(false);
    setNeedsSetup(false);
    setActiveModel(await xibe.config.getModel());
    setActiveProvider((await xibe.config.getProvider()) || 'auto');
    setActiveBaseUrl((await xibe.config.getBaseUrl()) || 'provider default');
    setIsInitialized(false);
  }, []);

  const handleModelChange = useCallback(async (model: string) => {
    await xibe.config.set('model', model);
    setActiveModel(model);
    setIsInitialized(false);
  }, []);

  const handleProviderChange = useCallback(async (provider: string) => {
    if (provider === 'auto') { await xibe.config.delete('provider'); setActiveProvider('auto'); }
    else {
      await xibe.config.set('provider', provider);
      setActiveProvider(provider);
      const providers = await xibe.config.getProviders();
      const cfg = providers.find((p: any) => p.id === provider);
      if (cfg) { await xibe.config.set('baseUrl', cfg.baseUrl); setActiveBaseUrl(cfg.baseUrl); await xibe.config.set('requestFormat', cfg.format); setWireFormat(cfg.format); }
    }
    setIsInitialized(false);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-xibe-bg text-xibe-text font-sans overflow-hidden">
      {/* Header */}
      <header className="flex h-12 items-center justify-between px-3 shrink-0 bg-xibe-bg z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLeftPanelOpen((v) => !v)}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              leftPanelOpen
                ? "text-xibe-text bg-xibe-surface-hover"
                : "text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover"
            )}
            title={leftPanelOpen ? 'Hide history' : 'Show history'}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-xibe-text">XibeCode</span>
            <span className="text-xibe-text-dim text-xs">/</span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] text-xibe-text-secondary hover:bg-xibe-surface hover:text-xibe-text transition-colors"
            >
              <span className="truncate max-w-[150px]">{activeModel.split('/').pop() || 'No model'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="rounded-md p-1.5 text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover transition-colors"
            title="Commands"
          >
            <Command className="h-4 w-4" />
          </button>
          <button
            onClick={() => setRightPanelOpen((v) => !v)}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              rightPanelOpen
                ? "text-xibe-text bg-xibe-surface-hover"
                : "text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover"
            )}
            title={rightPanelOpen ? 'Hide panel' : 'Show panel'}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main body: left panel | chat | right panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Left panel: Chat history + settings shortcut */}
        <aside
          className="shrink-0 bg-[#0c0c0f] flex flex-col overflow-hidden transition-[width] duration-200 ease-in-out border-r border-xibe-border/40"
          style={{ width: leftPanelOpen ? 240 : 0 }}
        >
            <div className="flex-1 min-h-0 flex flex-col p-3.5 pb-2">
              <ChatHistory
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onNewChat={handleNewChat}
              />
            </div>
            {/* Settings shortcut at bottom */}
            <div className="shrink-0 p-3 border-t border-xibe-border/30 bg-[#0c0c0f]/80 backdrop-blur-sm">
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-xibe-text-secondary hover:bg-xibe-surface-hover/60 hover:text-xibe-text transition-all duration-200 group border border-transparent hover:border-xibe-border/30"
              >
                <Settings className="h-4 w-4 text-xibe-text-dim group-hover:text-xibe-brand-purple group-hover:rotate-45 transition-transform duration-300" />
                <span>Settings</span>
              </button>
            </div>
          </aside>

        {/* Center: Chat — flex column + min-h-0 so ChatPanel flex-1 / scroll region get a real height */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            onCommand={handleCommand}
            isRunning={isRunning}
            activeModel={activeModel}
            activeProvider={activeProvider}
            wireFormat={wireFormat}
            appVersion={appVersion}
            needsSetup={needsSetup}
            onOpenSetup={() => setShowSetup(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            modeState={modeState}
            onModeSwitch={handleModeSwitch}
          />
        </div>

        {/* Right panel: Tabbed (Web + Folder) */}
        <div
          className="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
          style={{ width: rightPanelOpen ? 320 : 0 }}
        >
          <TabbedRightPanel
            workingDir={workingDir}
            currentMode={modeState.current}
            onModeSwitch={handleModeSwitch}
            onClose={() => setRightPanelOpen(false)}
          />
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        mode={modeState.current}
        workingDir={workingDir}
        isRunning={isRunning}
        activeModel={activeModel}
        activeProvider={activeProvider}
        wireFormat={wireFormat}
        costMode={costMode}
        onToggleSidebar={() => setLeftPanelOpen((v) => !v)}
        onTogglePreview={() => setRightPanelOpen((v) => !v)}
      />

      {/* Overlays */}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} onModelChange={handleModelChange} onProviderChange={handleProviderChange} activeModel={activeModel} activeProvider={activeProvider} />}
      {commandPaletteOpen && <CommandPalette onClose={() => setCommandPaletteOpen(false)} onCommand={handleCommand} />}
      {showSetup && <SetupWizard onComplete={handleSetupComplete} onClose={() => { if (!needsSetup) setShowSetup(false); }} />}
    </div>
  );
}
