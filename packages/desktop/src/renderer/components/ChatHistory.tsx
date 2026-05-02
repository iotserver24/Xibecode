import { useState, useEffect, useCallback } from 'react';

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

export default function ChatHistory({ activeSessionId, onSelectSession, onNewChat }: ChatHistoryProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
        className="flex items-center gap-2 rounded-lg border border-xibe-border-subtle px-3 py-2 text-xs text-xibe-text-dim hover:bg-xibe-surface-hover hover:text-xibe-text transition-colors mb-3"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        New Chat
      </button>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {groups.length === 0 && (
          <p className="text-[10px] text-xibe-text-dim/40 text-center py-4">No conversations yet</p>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-xibe-text-dim/40">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors group ${
                    activeSessionId === s.id
                      ? 'bg-xibe-accent-muted text-xibe-text'
                      : 'text-xibe-text-secondary hover:bg-xibe-surface-hover hover:text-xibe-text'
                  }`}
                >
                  <svg className="h-3 w-3 shrink-0 text-xibe-text-dim/30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
                  <span className="flex-1 truncate text-[11px]">{s.title}</span>
                  {hoveredId === s.id && (
                    <button
                      onClick={(e) => handleDelete(e, s.id)}
                      className="shrink-0 rounded p-0.5 text-xibe-text-dim/30 hover:text-xibe-error transition-colors"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  <span className="shrink-0 text-[9px] text-xibe-text-dim/25 tabular-nums">{relativeTime(s.updated)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
