import { useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useChatStore } from '../../stores/chatStore';
import { Bot, Wrench, Palette } from 'lucide-react';

interface StatusBarProps {
  onTogglePanel: () => void;
}

interface SessionInfo {
  currentModel: string;
  sessionName: string;
  tools: boolean;
  theme: string;
}

export function StatusBar({ onTogglePanel: _onTogglePanel }: StatusBarProps) {
  const { openFiles, activeFilePath, cursorPosition } = useEditorStore();
  const { isConnected, currentMode } = useChatStore();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    currentModel: '',
    sessionName: 'Untitled Session',
    tools: true,
    theme: 'default',
  });

  const activeFile = activeFilePath ? openFiles.get(activeFilePath) : null;

  // Fetch config from backend
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          setSessionInfo(prev => ({
            ...prev,
            currentModel: data.currentModel || '',
            theme: data.raw?.theme || 'default',
            tools: true, // tools are always on in WebUI
          }));
        }
      } catch {
        // Backend may not be reachable
      }
    };

    fetchConfig();
    const interval = setInterval(fetchConfig, 30000);
    return () => clearInterval(interval);
  }, []);

  // Shorten model name for display
  const displayModel = sessionInfo.currentModel
    ? sessionInfo.currentModel.replace(/-\d{8}$/, '')
    : '';

  return (
    <div className="h-6 bg-[#0a0a0a] border-t border-zinc-800/60 flex items-center justify-between px-3 text-[11px] text-zinc-600 select-none flex-shrink-0">
      {/* Left side: connection + mode + session */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>

        <span className="text-zinc-800">|</span>

        {currentMode && (
          <span className="text-zinc-500 uppercase tracking-wider font-medium text-[10px]">{currentMode}</span>
        )}

        <span className="text-zinc-800">|</span>

        {/* Session name */}
        <span className="text-zinc-600 text-[10px]">{sessionInfo.sessionName}</span>
      </div>

      {/* Right side: model + tools + theme + editor info */}
      <div className="flex items-center gap-2.5">
        {/* Model */}
        {displayModel && (
          <div className="flex items-center gap-1 text-zinc-500" title={sessionInfo.currentModel}>
            <Bot size={11} />
            <span className="text-[10px] font-medium">{displayModel}</span>
          </div>
        )}

        {/* Tools */}
        <div className="flex items-center gap-1 text-zinc-600" title="Tools enabled">
          <Wrench size={10} />
          <span className="text-[10px]">{sessionInfo.tools ? 'on' : 'off'}</span>
        </div>

        {/* Theme */}
        <div className="flex items-center gap-1 text-zinc-600" title={`Theme: ${sessionInfo.theme}`}>
          <Palette size={10} />
          <span className="text-[10px]">{sessionInfo.theme}</span>
        </div>

        {activeFile && (
          <>
            <span className="text-zinc-800">|</span>
            <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
            <span className="capitalize">{activeFile.language || 'Plain Text'}</span>
            <span>UTF-8</span>
          </>
        )}

        <span className="text-zinc-500 font-medium">XibeCode</span>
      </div>
    </div>
  );
}
