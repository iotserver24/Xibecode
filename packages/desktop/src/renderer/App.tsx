import { useState, useCallback, useEffect, useRef } from 'react';
import type { HostedAgentEvent, ModeState } from '../preload/index';
import ChatPanel from './components/ChatPanel';
import ChatHistory from './components/ChatHistory';
import SettingsPanel from './components/SettingsPanel';
import CommandPalette from './components/CommandPalette';
import SetupWizard from './components/SetupWizard';
import StatusBar from './components/StatusBar';
import TabbedRightPanel from './components/TabbedRightPanel';

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

const SPINNER_VERBS = [
  'Thinking', 'Analyzing', 'Processing', 'Writing code', 'Reading files',
  'Running commands', 'Searching', 'Debugging', 'Building', 'Testing',
  'Reviewing', 'Planning', 'Implementing', 'Refactoring', 'Optimizing',
  'Generating', 'Compiling', 'Deploying', 'Cooking', 'Locked in',
];

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
  const [spinnerVerb, setSpinnerVerb] = useState('');
  const [runElapsed, setRunElapsed] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [costMode, setCostMode] = useState('normal');
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const spinnerIndexRef = useRef(0);

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

  useEffect(() => {
    if (!isRunning) { setRunElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setRunElapsed(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    spinnerIndexRef.current = Math.floor(Math.random() * SPINNER_VERBS.length);
    setSpinnerVerb(SPINNER_VERBS[spinnerIndexRef.current]);
    const id = setInterval(() => {
      spinnerIndexRef.current = (spinnerIndexRef.current + 1) % SPINNER_VERBS.length;
      setSpinnerVerb(SPINNER_VERBS[spinnerIndexRef.current]);
    }, 2400);
    return () => clearInterval(id);
  }, [isRunning]);

  const handleAgentEvents = useCallback((batch: HostedAgentEvent[]) => {
    setMessages((prev) => {
      const updated = [...prev];
      for (const event of batch) {
        const d = event.data as any;
        switch (event.type) {
          case 'stream_text': {
            const text = d?.text ?? '';
            if (!text) break;
            const last = updated.findIndex((m) => m.role === 'assistant' && m.isStreaming);
            if (last >= 0) updated[last] = { ...updated[last], content: updated[last].content + text };
            else updated.push({ id: uid(), role: 'assistant', content: text, timestamp: event.timestamp, isStreaming: true });
            break;
          }
          case 'response': {
            const text = d?.text ?? '';
            if (!text) break;
            const last = updated.findIndex((m) => m.role === 'assistant' && m.isStreaming);
            if (last >= 0) updated[last] = { ...updated[last], content: updated[last].content + text };
            else updated.push({ id: uid(), role: 'assistant', content: text, timestamp: event.timestamp, isStreaming: true });
            break;
          }
          case 'stream_end': {
            const last = updated.findIndex((m) => m.role === 'assistant' && m.isStreaming);
            if (last >= 0) updated[last] = { ...updated[last], isStreaming: false };
            break;
          }
          case 'tool_call': {
            updated.push({ id: uid(), role: 'tool', content: '', toolName: d?.name ?? 'unknown', toolInput: d?.input, timestamp: event.timestamp });
            break;
          }
          case 'tool_result': {
            const idx = [...updated].reverse().findIndex((m) => m.role === 'tool' && m.toolName && !m.toolOutput);
            if (idx >= 0) {
              const i = updated.length - 1 - idx;
              updated[i] = { ...updated[i], toolOutput: d, content: typeof d === 'string' ? d : JSON.stringify(d, null, 2) };
            }
            break;
          }
          case 'complete': {
            const last = updated.findIndex((m) => m.role === 'assistant' && m.isStreaming);
            if (last >= 0) updated[last] = { ...updated[last], isStreaming: false };
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
    <div className="flex h-screen flex-col bg-xibe-bg text-xibe-text font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-xibe-border-subtle shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLeftPanelOpen((v) => !v)}
            className={`rounded-md p-1 transition-colors ${leftPanelOpen ? 'text-xibe-brand-blue' : 'text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover'}`}
            title={leftPanelOpen ? 'Hide history' : 'Show history'}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
          </button>
          <span className="text-sm font-semibold text-xibe-text">XibeCode</span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-xibe-border-subtle px-2 py-0.5 text-xs text-xibe-text-dim hover:bg-xibe-surface-hover hover:text-xibe-text transition-colors"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {activeModel.split('/').pop() || 'No model'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRightPanelOpen((v) => !v)}
            className={`rounded-md p-1 transition-colors ${rightPanelOpen ? 'text-xibe-brand-blue' : 'text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover'}`}
            title={rightPanelOpen ? 'Hide panel' : 'Show panel'}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
          </button>
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="rounded-md p-1 text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover transition-colors"
            title="Commands"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          </button>
        </div>
      </header>

      {/* Main body: left panel | chat | right panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: Chat history + settings shortcut */}
        {leftPanelOpen && (
          <aside className="w-60 shrink-0 border-r border-xibe-border-subtle bg-xibe-surface flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <ChatHistory
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onNewChat={handleNewChat}
              />
            </div>
            {/* Settings shortcut at bottom */}
            <div className="shrink-0 border-t border-xibe-border-subtle p-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-xibe-text-dim hover:bg-xibe-surface-hover hover:text-xibe-text transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Settings
              </button>
            </div>
          </aside>
        )}

        {/* Center: Chat */}
        <div className="flex-1 min-w-0">
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            onCommand={handleCommand}
            isRunning={isRunning}
            spinnerVerb={spinnerVerb}
            runElapsed={runElapsed}
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
        {rightPanelOpen && (
          <div className="w-80 shrink-0 border-l border-xibe-border-subtle">
            <TabbedRightPanel
              workingDir={workingDir}
              currentMode={modeState.current}
              onModeSwitch={handleModeSwitch}
              onClose={() => setRightPanelOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar
        mode={modeState.current}
        workingDir={workingDir}
        isRunning={isRunning}
        spinnerVerb={spinnerVerb}
        runElapsed={runElapsed}
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
