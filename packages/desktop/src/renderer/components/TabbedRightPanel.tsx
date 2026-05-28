import { useState } from 'react';
import WebPreview from './WebPreview';
import FileExplorer from './FileExplorer';
import ModeSelector from './ModeSelector';

interface TabbedRightPanelProps {
  workingDir: string;
  currentMode: string;
  onModeSwitch: (mode: string, reason: string) => void;
  onClose: () => void;
}

type RightTab = 'web' | 'folder';

export default function TabbedRightPanel({
  workingDir,
  currentMode,
  onModeSwitch,
  onClose,
}: TabbedRightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightTab>('folder');

  return (
    <div className="flex h-full flex-col bg-xibe-surface">
      {/* Tab bar */}
      <div className="flex items-center shrink-0">
        <button
          onClick={() => setActiveTab('folder')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'folder'
              ? 'border-xibe-text text-xibe-text'
              : 'border-transparent text-xibe-text-dim hover:text-xibe-text'
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
          Folder
        </button>
        <button
          onClick={() => setActiveTab('web')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'web'
              ? 'border-xibe-text text-xibe-text'
              : 'border-transparent text-xibe-text-dim hover:text-xibe-text'
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582" /></svg>
          Web
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="mr-2 rounded-md p-1 text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover transition-colors"
          title="Close panel"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'folder' && (
          <div className="p-3 space-y-4">
            <ModeSelector currentMode={currentMode} onModeSwitch={onModeSwitch} />
            <div className="border-t border-xibe-border-subtle" />
            <FileExplorer workingDir={workingDir} />
          </div>
        )}
        {activeTab === 'web' && (
          <WebPreview onClose={onClose} />
        )}
      </div>
    </div>
  );
}
