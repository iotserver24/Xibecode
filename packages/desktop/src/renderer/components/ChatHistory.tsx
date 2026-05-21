import { useState, useEffect, useCallback, memo } from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ChatHistory = memo(function ChatHistory({ activeSessionId, onSelectSession, onNewChat }: ChatHistoryProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  const refresh = useCallback(async () => {
    const list = await xibe.session.list();
    setSessions(list);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await xibe.session.delete(id);
    refresh();
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; items: SessionItem[] }[] = [];
  const todayItems = sessions.filter((s) => new Date(s.updated) >= today);
  const yesterdayItems = sessions.filter((s) => { const d = new Date(s.updated); return d >= yesterday && d < today; });
  const weekItems = sessions.filter((s) => { const d = new Date(s.updated); return d >= weekAgo && d < yesterday; });
  const olderItems = sessions.filter((s) => new Date(s.updated) < weekAgo);

  if (todayItems.length) groups.push({ label: 'Today', items: todayItems });
  if (yesterdayItems.length) groups.push({ label: 'Yesterday', items: yesterdayItems });
  if (weekItems.length) groups.push({ label: 'This Week', items: weekItems });
  if (olderItems.length) groups.push({ label: 'Older', items: olderItems });

  return (
    <div className="flex h-full flex-col">
      {/* New chat button */}
      <button
        onClick={onNewChat}
        className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-xibe-text hover:bg-xibe-surface-hover transition-colors mb-2"
      >
        <Plus className="h-4 w-4 text-xibe-text" />
        New Chat
      </button>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <MessageSquare className="h-6 w-6 text-xibe-text-dim/20 mb-2" />
            <p className="text-[11px] text-xibe-text-dim/60">No conversations yet</p>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-xibe-text-dim/50">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-all duration-200 group",
                    activeSessionId === s.id
                      ? "text-xibe-text font-medium bg-xibe-surface-hover"
                      : "text-xibe-text-secondary hover:bg-xibe-surface-hover hover:text-xibe-text"
                  )}
                >
                  <span className="flex-1 truncate text-[13px] leading-tight">{s.title}</span>

                  {/* ⚡ Bolt: Used CSS group-hover instead of React state to toggle delete button visibility to prevent O(N) re-renders of the entire list on hover */}
                  <span
                    onClick={(e) => handleDelete(e, s.id)}
                    className="shrink-0 rounded p-1 text-xibe-text-dim/50 hover:text-xibe-error hover:bg-xibe-error/10 transition-colors animate-fade-in hidden group-hover:block"
                    title="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>

                  {/* ⚡ Bolt: Hide timestamp on hover using group-hover to make room for delete button without React state overhead */}
                  <span className="shrink-0 text-[10px] text-xibe-text-dim/40 tabular-nums block group-hover:hidden">{relativeTime(s.updated)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default ChatHistory;
