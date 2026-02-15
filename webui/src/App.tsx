import { useState, useCallback, useRef, useEffect } from 'react';
import { ActivityBar } from './components/ActivityBar';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { ChatPanel } from './components/ChatPanel';
import { BottomPanel } from './components/BottomPanel';
import { StatusBar } from './components/StatusBar';
import { SettingsPanel } from './components/SettingsPanel';
import { EnvPanel } from './components/EnvPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { useUIStore } from './stores/uiStore';

export type SidebarPanel = 'explorer' | 'git' | 'search' | 'settings' | null;
export type BottomPanelTab = 'terminal' | 'problems' | 'output';

function App() {
  const {
    activeSidebarPanel,
    setActiveSidebarPanel,
    isChatCollapsed,
    setIsChatCollapsed,
    isBottomPanelCollapsed,
    setIsBottomPanelCollapsed,
    chatWidth,
    setChatWidth,
  } = useUIStore();

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Active activity bar tab - maps to sidebar panels or special views
  const [activeTab, setActiveTab] = useState<string>('git');

  const handleActivityTabChange = (tab: string) => {
    if (tab === 'settings') {
      setActiveTab('settings');
      setActiveSidebarPanel('settings');
    } else if (tab === 'git') {
      setActiveTab('git');
      setActiveSidebarPanel('git');
    } else if (tab === 'env') {
      setActiveTab('env');
    } else if (tab === 'history') {
      setActiveTab('history');
    } else {
      setActiveTab(tab);
    }
  };

  // Resize logic
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Account for activity bar width (56px)
      const newWidth = e.clientX - rect.left - 56;
      const clampedWidth = Math.max(280, Math.min(newWidth, window.innerWidth * 0.5));
      setChatWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, setChatWidth]);

  const handleCollapseChat = () => {
    setIsChatCollapsed(true);
  };

  const handleExpandChat = () => {
    setIsChatCollapsed(false);
  };

  return (
    <div ref={containerRef} className="h-screen w-screen flex flex-col bg-[#0a0a0a] text-zinc-100 overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar (far left) */}
        <ActivityBar
          activeTab={activeTab}
          onTabChange={handleActivityTabChange}
        />

        {/* Chat Panel (left side) */}
        {!isChatCollapsed && (
          <>
            <ChatPanel
              isCollapsed={false}
              onToggleCollapse={handleCollapseChat}
              width={chatWidth}
            />

            {/* Resize Handle */}
            <div
              className={`w-[3px] cursor-col-resize flex-shrink-0 relative group transition-colors ${
                isDragging ? 'bg-indigo-500' : 'bg-zinc-800 hover:bg-indigo-500/50'
              }`}
              onMouseDown={handleMouseDown}
            >
              <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
            </div>
          </>
        )}

        {/* Right Side - Code Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0c]">
          {/* Top toolbar with collapse/expand + preview/code toggle */}
          <div className="h-10 border-b border-zinc-800/80 flex items-center px-3 gap-2 bg-[#0a0a0a] flex-shrink-0">
            {/* Collapse/Expand chat button */}
            <button
              onClick={isChatCollapsed ? handleExpandChat : handleCollapseChat}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xs"
              title={isChatCollapsed ? 'Show chat' : 'Hide chat'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                {isChatCollapsed ? (
                  <path d="M6 3l5 5-5 5" />
                ) : (
                  <path d="M10 3L5 8l5 5" />
                )}
              </svg>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                {isChatCollapsed ? (
                  <path d="M6 3l5 5-5 5" />
                ) : (
                  <path d="M10 3L5 8l5 5" />
                )}
              </svg>
            </button>

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            {/* Preview / Code toggle - v0 style */}
            <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
              <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
                </svg>
                Code
              </button>
            </div>

            <div className="flex-1" />

            {/* Right side toolbar actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (activeSidebarPanel === 'explorer') {
                    setActiveSidebarPanel(null);
                  } else {
                    setActiveSidebarPanel('explorer');
                  }
                }}
                className={`p-1.5 rounded-md transition-colors ${
                  activeSidebarPanel === 'explorer'
                    ? 'text-zinc-200 bg-zinc-800'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
                title="Toggle file explorer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                </svg>
              </button>
              <button
                onClick={() => setIsBottomPanelCollapsed(!isBottomPanelCollapsed)}
                className={`p-1.5 rounded-md transition-colors ${
                  !isBottomPanelCollapsed
                    ? 'text-zinc-200 bg-zinc-800'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
                title="Toggle terminal"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </button>
            </div>
          </div>

          {/* Editor + Sidebar area */}
          <div className="flex-1 flex overflow-hidden">
            {activeTab === 'env' ? (
              <EnvPanel />
            ) : activeTab === 'history' ? (
              <HistoryPanel onConversationLoad={() => setActiveTab('git')} />
            ) : (
              <>
                {/* File explorer sidebar */}
                <Sidebar
                  activePanel={activeSidebarPanel}
                  isCollapsed={activeSidebarPanel === null}
                />

                {/* Editor + Bottom panel */}
                <div className="flex-1 flex flex-col min-w-0">
                  <EditorArea />
                  {!isBottomPanelCollapsed && (
                    <BottomPanel isCollapsed={false} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        onTogglePanel={() => setIsBottomPanelCollapsed(!isBottomPanelCollapsed)}
      />

      {/* Settings Modal */}
      <SettingsPanel />
    </div>
  );
}

export default App;
