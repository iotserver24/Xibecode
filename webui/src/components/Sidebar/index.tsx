import { SidebarPanel } from '../../stores/uiStore';
import { FileExplorer } from '../FileExplorer';
import { GitPanel } from '../GitPanel';
import { Search } from 'lucide-react';

interface SidebarProps {
  activePanel: SidebarPanel;
  isCollapsed: boolean;
  fullWidth?: boolean;
}

const panelTitles: Record<string, string> = {
  explorer: 'FILE EXPLORER',
  git: 'SOURCE CONTROL',
  search: 'SEARCH',
};

export function Sidebar({ activePanel, isCollapsed, fullWidth }: SidebarProps) {
  if (isCollapsed || !activePanel || activePanel === 'settings') {
    return null;
  }

  return (
    <div className={`${fullWidth ? 'flex-1' : 'w-56'} bg-[#111111] border-r border-zinc-800/60 flex flex-col h-full flex-shrink-0`}>
      <div className="h-9 px-3 flex items-center flex-shrink-0 border-b border-zinc-800/60">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider truncate">
          {panelTitles[activePanel] || ''}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {activePanel === 'explorer' && <FileExplorer />}
        {activePanel === 'git' && <GitPanel />}
        {activePanel === 'search' && <SearchPanel />}
      </div>
    </div>
  );
}

function SearchPanel() {
  return (
    <div className="p-3">
      <div className="relative mb-3">
        <input
          type="text"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 pl-8 text-xs text-zinc-300 focus:border-zinc-700 focus:ring-0 placeholder-zinc-600 outline-none transition-all"
          placeholder="Search files..."
        />
        <Search className="absolute left-2.5 top-2 text-zinc-600" size={12} />
      </div>
      <div className="text-center py-8">
        <p className="text-[11px] text-zinc-600">Type to search across all files</p>
      </div>
    </div>
  );
}
