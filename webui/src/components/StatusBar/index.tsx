import { useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useChatStore } from '../../stores/chatStore';
import { Bot } from 'lucide-react';

interface StatusBarProps {
  onTogglePanel: () => void;
}

export function StatusBar({ onTogglePanel: _onTogglePanel }: StatusBarProps) {
  const { openFiles, activeFilePath, cursorPosition } = useEditorStore();
  const { isConnected, currentMode } = useChatStore();
  const [currentModel, setCurrentModel] = useState<string>('');

  const activeFile = activeFilePath ? openFiles.get(activeFilePath) : null;

  // Fetch current model from backend config
  useEffect(() => {
    const fetchModel = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          if (data.currentModel) {
            setCurrentModel(data.currentModel);
          }
        }
      } catch {
        // Backend may not be reachable
      }
    };

    fetchModel();
    // Re-fetch every 30 seconds in case user changes model
    const interval = setInterval(fetchModel, 30000);
    return () => clearInterval(interval);
  }, []);

  // Shorten model name for display (e.g., "claude-sonnet-4-5-20250929" -> "claude-sonnet-4-5")
  const displayModel = currentModel
    ? currentModel.replace(/-\d{8}$/, '') // remove date suffix
    : '';

  return (
    <div className="h-6 bg-[#0a0a0a] border-t border-zinc-800/60 flex items-center justify-between px-3 text-[11px] text-zinc-600 select-none flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        {currentMode && (
          <span className="text-zinc-500 uppercase tracking-wider font-medium text-[10px]">{currentMode}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Current Model */}
        {displayModel && (
          <div className="flex items-center gap-1 text-zinc-500" title={currentModel}>
            <Bot size={11} />
            <span className="text-[10px] font-medium">{displayModel}</span>
          </div>
        )}

        {activeFile && (
          <>
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
