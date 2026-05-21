import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Plus, MessageSquare, Trash2, Folder, History, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface SessionItem {
  id: string;
  title: string;
  model: string;
  cwd: string;
  created: string;
  updated: string;
}

interface ChatHistoryProps {
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
}

const xibe = (window as any).xibecode;

function relativeTimeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const mos = Math.floor(days / 30);
  if (mos < 12) return `${mos}mo`;
  const yrs = Math.floor(mos / 12);
  return `${yrs}yr`;
}

function getFolderName(path: string): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  
  // Search for common workspaces roots like "/codes/", "/projects/", "/src/", etc.
  const codesIdx = normalized.toLowerCase().indexOf('/codes/');
  if (codesIdx !== -1) {
    return normalized.slice(codesIdx + 7);
  }
  
  const projectsIdx = normalized.toLowerCase().indexOf('/projects/');
  if (projectsIdx !== -1) {
    return normalized.slice(projectsIdx + 10);
  }

  const homeIdx = normalized.toLowerCase().indexOf('/home/');
  if (homeIdx !== -1) {
    const parts = normalized.slice(homeIdx + 6).split('/');
    if (parts.length > 1) {
      // skip the username
      return parts.slice(1).join('/');
    }
  }

  const usersIdx = normalized.toLowerCase().indexOf('/users/');
  if (usersIdx !== -1) {
    const parts = normalized.slice(usersIdx + 7).split('/');
    if (parts.length > 1) {
      // skip the username
      return parts.slice(1).join('/');
    }
  }
  
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

const ChatHistoryItem = memo(function ChatHistoryItem({
  session,
  isActive,
  onSelect,
  onDelete,
  isGeneral
}: {
  session: SessionItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  isGeneral: boolean;
}) {
  return (
    <button
      onClick={() => onSelect(session.id)}
      className={cn(
        "relative flex w-full items-center justify-between gap-2 rounded-lg pr-2 py-2.5 text-left transition-all duration-150 group border border-transparent select-none cursor-pointer",
        isGeneral ? "pl-4" : "pl-10",
        isActive
          ? "text-xibe-text font-medium bg-xibe-surface-hover/75 border-xibe-border/40 shadow-sm"
          : "text-xibe-text-secondary hover:bg-xibe-surface-hover/30 hover:text-xibe-text"
      )}
    >
      {isActive && (
        <span className={cn(
          "absolute top-2.5 bottom-2.5 w-[3px] rounded-r-md bg-xibe-brand-purple animate-fade-in",
          isGeneral ? "left-0" : "left-3.5"
        )} />
      )}
      
      <span className="flex-1 truncate text-[13px] leading-tight font-sans">
        {session.title}
      </span>

      {/* Delete button (shows on hover) */}
      <span
        onClick={(e) => onDelete(e, session.id)}
        className="shrink-0 rounded p-1 text-xibe-text-dim/60 hover:text-xibe-error hover:bg-xibe-error/10 transition-colors hidden group-hover:block cursor-pointer z-10"
        title="Delete chat"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </span>

      {/* Relative time (hidden on hover) */}
      <span className="shrink-0 text-[11px] text-xibe-text-dim/40 font-mono tabular-nums block group-hover:hidden pr-1">
        {relativeTimeShort(session.updated)}
      </span>
    </button>
  );
});

const ChatHistory = memo(function ChatHistory({ activeSessionId, onSelectSession, onNewChat }: ChatHistoryProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const list = await xibe.session.list();
    setSessions(list);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await xibe.session.delete(id);
    refresh();
  }, [refresh]);

  const toggleFolder = useCallback((name: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const grouped = useMemo(() => {
    const folders: Record<string, SessionItem[]> = {};
    const general: SessionItem[] = [];

    sessions.forEach((session) => {
      const folder = getFolderName(session.cwd);
      if (folder && folder.toLowerCase() !== 'general') {
        if (!folders[folder]) folders[folder] = [];
        folders[folder].push(session);
      } else {
        general.push(session);
      }
    });

    // Sort folder names alphabetically (folderwise)
    const sortedFolderNames = Object.keys(folders).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    sortedFolderNames.forEach((name) => {
      folders[name].sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    });

    general.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

    return {
      folders: sortedFolderNames.map((name) => ({ name, items: folders[name] })),
      general
    };
  }, [sessions]);

  return (
    <div className="flex h-full flex-col">
      {/* Top navigation actions */}
      <div className="space-y-2.5 mb-5 shrink-0">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2.5 rounded-lg border border-xibe-border/60 bg-xibe-surface-raised/40 hover:bg-xibe-surface-hover/80 hover:border-xibe-border-focus/50 px-3 py-2.5 text-[13px] font-medium text-xibe-text transition-all duration-200 cursor-pointer select-none group"
        >
          <Plus className="h-4 w-4 text-xibe-brand-purple group-hover:scale-110 transition-transform duration-200" />
          <span className="font-sans">New Conversation</span>
        </button>

        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-xibe-text bg-xibe-surface-hover/40 border border-xibe-border/20 select-none cursor-pointer">
          <History className="h-4 w-4 text-xibe-brand-purple" />
          <span className="font-sans">Conversation History</span>
        </div>

        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-xibe-text-secondary hover:bg-xibe-surface-hover/30 hover:text-xibe-text transition-colors select-none cursor-pointer">
          <Clock className="h-4 w-4 text-xibe-text-dim" />
          <span className="font-sans">Scheduled Tasks</span>
        </div>
      </div>

      <div className="h-[1px] bg-xibe-border/20 mb-6 shrink-0" />

      {/* Session list */}
      <div className="flex-1 overflow-y-auto space-y-7 min-h-0 pr-1 select-none">
        {grouped.folders.length === 0 && grouped.general.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <MessageSquare className="h-6 w-6 text-xibe-text-dim/20 mb-2" />
            <p className="text-[11px] text-xibe-text-dim/60">No conversations yet</p>
          </div>
        )}

        {/* Folder grouped chats */}
        {grouped.folders.map((folder) => (
          <div key={folder.name} className="space-y-2">
            <div
              onClick={() => toggleFolder(folder.name)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-xibe-surface-hover/30 text-xibe-text-secondary hover:text-xibe-text text-[13px] font-semibold cursor-pointer transition-colors group mb-0.5"
            >
              <Folder className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                collapsedFolders[folder.name] ? "text-xibe-text-dim/50" : "text-xibe-text-dim group-hover:text-xibe-brand-purple"
              )} />
              <span className="flex-1 truncate font-sans">{folder.name}</span>
            </div>
            
            {!collapsedFolders[folder.name] && (
              <div className="space-y-2.5 mt-2 ml-1">
                {folder.items.map((s) => (
                  <ChatHistoryItem
                    key={s.id}
                    session={s}
                    isActive={activeSessionId === s.id}
                    onSelect={onSelectSession}
                    onDelete={handleDelete}
                    isGeneral={false}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Fallback Conversations section */}
        {grouped.general.length > 0 && (
          <div className="space-y-2 mt-4">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-xibe-text-dim/40 select-none mb-1.5">
              Conversations
            </div>
            <div className="space-y-2.5">
              {grouped.general.map((s) => (
                <ChatHistoryItem
                  key={s.id}
                  session={s}
                  isActive={activeSessionId === s.id}
                  onSelect={onSelectSession}
                  onDelete={handleDelete}
                  isGeneral={true}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatHistory;
