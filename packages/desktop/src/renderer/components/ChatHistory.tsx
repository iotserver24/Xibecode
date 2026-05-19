import { useState, useEffect, useCallback, useMemo, memo } from 'react';
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

const ChatHistoryItem = memo(function ChatHistoryItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: SessionItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(session.id)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-all duration-200 group relative",
        isActive
          ? "text-xibe-text font-semibold before:absolute before:left-0 before:top-1/4 before:bottom-1/4 before:w-1 before:bg-xibe-text before:rounded-r"
          : "text-xibe-text-secondary hover:bg-xibe-surface-hover/30 hover:text-xibe-text"
      )}
    >
      <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-xibe-text" : "text-xibe-text-dim/40 group-hover:text-xibe-text-dim/70")} />
      <span className="flex-1 truncate text-[12px] font-medium leading-tight">{session.title}</span>

      {/* ⚡ Bolt: Used CSS group-hover instead of React state to toggle delete button visibility to prevent O(N) re-renders of the entire list on hover */}
      <span
        onClick={(e) => onDelete(e, session.id)}
        className="shrink-0 rounded p-1 text-xibe-text-dim/50 hover:text-xibe-error hover:bg-xibe-error/10 transition-colors animate-fade-in hidden group-hover:block"
        title="Delete chat"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </span>

      {/* ⚡ Bolt: Hide timestamp on hover using group-hover to make room for delete button without React state overhead */}
      <span className="shrink-0 text-[10px] text-xibe-text-dim/40 tabular-nums block group-hover:hidden">{relativeTime(session.updated)}</span>
    </button>
  );
});

const ChatHistory = memo(function ChatHistory({ activeSessionId, onSelectSession, onNewChat }: ChatHistoryProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);

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

  // ⚡ Bolt: Memoize the grouping of sessions into an O(N) single pass to avoid O(4N) filtering and Date parsing on every render
  const groups = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todayItems: SessionItem[] = [];
    const yesterdayItems: SessionItem[] = [];
    const weekItems: SessionItem[] = [];
    const olderItems: SessionItem[] = [];

    for (const s of sessions) {
      const d = new Date(s.updated);
      if (d >= today) {
        todayItems.push(s);
      } else if (d >= yesterday) {
        yesterdayItems.push(s);
      } else if (d >= weekAgo) {
        weekItems.push(s);
      } else {
        olderItems.push(s);
      }
    }

    const g: { label: string; items: SessionItem[] }[] = [];
    if (todayItems.length) g.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length) g.push({ label: 'Yesterday', items: yesterdayItems });
    if (weekItems.length) g.push({ label: 'This Week', items: weekItems });
    if (olderItems.length) g.push({ label: 'Older', items: olderItems });
    return g;
  }, [sessions]);

  return (
    <div className="flex h-full flex-col">
      {/* New chat button */}
      <button
        onClick={onNewChat}
        className="flex items-center gap-2 rounded-lg bg-xibe-surface px-3 py-2.5 text-xs font-medium text-xibe-text hover:bg-xibe-surface-hover transition-colors mb-4"
      >
        <Plus className="h-4 w-4 text-xibe-text" />
        New Chat
      </button>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto space-y-5 min-h-0 pr-1">
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
                <ChatHistoryItem
                  key={s.id}
                  session={s}
                  isActive={activeSessionId === s.id}
                  onSelect={onSelectSession}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default ChatHistory;
