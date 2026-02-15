import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Search, Trash2, MessageSquare, RefreshCw,
  Plus, Bot, AlertCircle
} from 'lucide-react';
import { history as historyApi, type ConversationSummary } from '../../utils/api';
import { useChatStore } from '../../stores/chatStore';

interface HistoryPanelProps {
  onConversationLoad?: () => void;
}

export function HistoryPanel({ onConversationLoad }: HistoryPanelProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { loadConversation, newConversation, conversationId } = useChatStore();

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await historyApi.list();
      if (result.success) {
        setConversations(result.conversations || []);
      } else {
        setError('Failed to load history');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleLoadConversation = async (id: string) => {
    await loadConversation(id);
    onConversationLoad?.();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await historyApi.delete(id);
      setConversations(prev => prev.filter(c => c.id !== id));
    } catch {
      // ignore
    }
  };

  const handleNewChat = () => {
    newConversation();
    onConversationLoad?.();
  };

  // Filter conversations by search
  const filtered = searchQuery
    ? conversations.filter(c =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  // Group by date
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: ConversationSummary[] }[] = [];
  const todayItems = filtered.filter(c => new Date(c.updated) >= today);
  const yesterdayItems = filtered.filter(c => {
    const d = new Date(c.updated);
    return d >= yesterday && d < today;
  });
  const thisWeekItems = filtered.filter(c => {
    const d = new Date(c.updated);
    return d >= weekAgo && d < yesterday;
  });
  const olderItems = filtered.filter(c => new Date(c.updated) < weekAgo);

  if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems });
  if (thisWeekItems.length > 0) groups.push({ label: 'This Week', items: thisWeekItems });
  if (olderItems.length > 0) groups.push({ label: 'Older', items: olderItems });

  // Relative time helper
  const relativeTime = (dateStr: string): string => {
    const diff = now.getTime() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    return `${months}mo`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0c0c0c]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={20} className="text-zinc-500 animate-spin" />
          <span className="text-xs text-zinc-500">Loading history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0c0c0c] overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-zinc-800/60 flex items-center px-4 gap-3 bg-[#0a0a0a] flex-shrink-0">
        <Clock size={14} className="text-zinc-400" />
        <span className="text-xs font-medium text-zinc-300">Chat History</span>
        <div className="flex-1" />
        <button
          onClick={fetchHistory}
          className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Search + New Chat */}
      <div className="px-3 py-2.5 border-b border-zinc-800/40 bg-[#0d0d0d] flex flex-col gap-2">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium border border-zinc-700/60 transition-colors"
        >
          <Plus size={13} />
          New Chat
        </button>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-zinc-900/80 border border-zinc-800/60 rounded-md px-3 py-1.5 pl-8 text-[11px] text-zinc-300 outline-none focus:border-zinc-700 placeholder-zinc-600 transition-colors"
          />
          <Search size={12} className="absolute left-2.5 top-2 text-zinc-600" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <AlertCircle size={12} className="text-red-400 flex-shrink-0" />
          <span className="text-[10px] text-red-400">{error}</span>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <MessageSquare size={24} className="text-zinc-700 mb-3" />
            <p className="text-[11px] text-zinc-600 text-center mb-1">No conversations yet</p>
            <p className="text-[10px] text-zinc-700 text-center">Start a chat and it will appear here</p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-4 py-1.5 text-[9px] font-semibold text-zinc-600 uppercase tracking-wider bg-zinc-900/30">
              {group.label}
            </div>
            {group.items.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleLoadConversation(conv.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors group border-b border-zinc-800/20 ${
                  conv.id === conversationId
                    ? 'bg-zinc-800/40'
                    : 'hover:bg-zinc-800/20'
                }`}
              >
                <MessageSquare size={14} className="text-zinc-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-zinc-300 font-medium truncate leading-tight">
                    {conv.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-zinc-600">{relativeTime(conv.updated)}</span>
                    {conv.messageCount > 0 && (
                      <span className="text-[9px] text-zinc-700">{conv.messageCount} msgs</span>
                    )}
                    {conv.model && (
                      <span className="flex items-center gap-0.5 text-[9px] text-zinc-700">
                        <Bot size={8} />
                        {conv.model.replace(/-\d{8}$/, '').split('-').slice(0, 3).join('-')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                  title="Delete conversation"
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
