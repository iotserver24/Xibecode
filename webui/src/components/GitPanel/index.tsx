import { useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { api } from '../../utils/api';
import {
  GitBranch, RefreshCw, ChevronDown, ChevronRight,
  Plus, Minus, Undo2, Loader2, AlertCircle, GitCommitHorizontal
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface GitFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
  staged: boolean;
}

interface GitStatus {
  branch: string;
  files: GitFile[];
  ahead: number;
  behind: number;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  refs: string;
}

type GitTab = 'changes' | 'history';

export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [_graphLines, setGraphLines] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<GitTab>('changes');
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const { openFile } = useEditorStore();

  const fetchStatus = async () => {
    try {
      const data = await api.git.status();
      setStatus({
        branch: data.branch || 'unknown',
        files: Array.isArray(data.files) ? data.files : [],
        ahead: data.ahead || 0,
        behind: data.behind || 0,
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch git status');
    }
  };

  const fetchLog = async () => {
    try {
      const res = await fetch('/api/git/log');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCommits(data.commits || []);
          setGraphLines(data.graph || []);
        }
      }
    } catch {
      // Optional - don't set error for log failures
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLog();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStage = async (path: string) => {
    try { await api.git.stage([path]); fetchStatus(); } catch (err: any) { setError(err.message); }
  };
  const handleUnstage = async (path: string) => {
    try { await api.git.unstage([path]); fetchStatus(); } catch (err: any) { setError(err.message); }
  };
  const handleStageAll = async () => {
    if (!status) return;
    const unstaged = status.files.filter(f => !f.staged).map(f => f.path);
    if (unstaged.length > 0) { try { await api.git.stage(unstaged); fetchStatus(); } catch (err: any) { setError(err.message); } }
  };
  const handleUnstageAll = async () => {
    if (!status) return;
    const staged = status.files.filter(f => f.staged).map(f => f.path);
    if (staged.length > 0) { try { await api.git.unstage(staged); fetchStatus(); } catch (err: any) { setError(err.message); } }
  };
  const handleDiscard = async (path: string) => {
    if (confirm(`Discard changes to ${path}?`)) {
      try { await api.git.discard([path]); fetchStatus(); } catch (err: any) { setError(err.message); }
    }
  };
  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setLoading(true);
    try { await api.git.commit(commitMessage); setCommitMessage(''); fetchStatus(); fetchLog(); } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };
  const handleViewDiff = async (path: string, staged: boolean) => {
    try {
      const diff = await api.git.fileDiff(path, staged);
      openFile({ path: `diff://${path}`, name: `${path} (diff)`, content: diff, language: 'diff', isDirty: false });
    } catch (err: any) { setError(err.message); }
  };

  const getStatusBadge = (s: GitFile['status']) => {
    const map: Record<string, { letter: string; color: string }> = {
      modified: { letter: 'M', color: 'text-yellow-500' },
      added: { letter: 'A', color: 'text-green-500' },
      deleted: { letter: 'D', color: 'text-red-500' },
      untracked: { letter: 'U', color: 'text-cyan-500' },
      renamed: { letter: 'R', color: 'text-purple-500' },
    };
    const d = map[s] || { letter: '?', color: 'text-zinc-500' };
    return <span className={cn("text-[10px] font-mono font-bold w-4 text-center", d.color)}>{d.letter}</span>;
  };

  if (error && !status) {
    return (
      <div className="p-3 text-center">
        <div className="text-xs text-red-400 mb-2">{error}</div>
        <button onClick={fetchStatus} className="text-[10px] text-zinc-400 hover:text-zinc-200 underline">Retry</button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-600">
        <Loader2 className="animate-spin mr-2" size={14} />
        <span className="text-xs">Loading...</span>
      </div>
    );
  }

  const files = status.files || [];
  const stagedFiles = files.filter(f => f.staged);
  const unstagedFiles = files.filter(f => !f.staged);

  return (
    <div className="h-full flex flex-col text-xs select-none">
      {/* Branch header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-1.5 text-zinc-300">
          <GitBranch size={13} />
          <span className="font-medium">{status.branch}</span>
          {(status.ahead > 0 || status.behind > 0) && (
            <span className="text-[10px] text-zinc-500">
              {status.ahead > 0 && `↑${status.ahead}`}
              {status.behind > 0 && `↓${status.behind}`}
            </span>
          )}
        </div>
        <button onClick={() => { fetchStatus(); fetchLog(); }} className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-zinc-800/60">
        <button
          onClick={() => setTab('changes')}
          className={cn("flex-1 py-1.5 text-[10px] uppercase tracking-wider font-medium transition-colors relative",
            tab === 'changes' ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          Changes {files.length > 0 && <span className="ml-1 text-zinc-500">({files.length})</span>}
          {tab === 'changes' && <div className="absolute bottom-0 left-0 right-0 h-px bg-zinc-400" />}
        </button>
        <button
          onClick={() => { setTab('history'); if (commits.length === 0) fetchLog(); }}
          className={cn("flex-1 py-1.5 text-[10px] uppercase tracking-wider font-medium transition-colors relative",
            tab === 'history' ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          History
          {tab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-px bg-zinc-400" />}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 bg-red-500/10 text-red-400 text-[10px] flex items-center gap-1">
          <AlertCircle size={10} /> {error}
        </div>
      )}

      {/* Changes tab */}
      {tab === 'changes' && (
        <div className="flex-1 overflow-y-auto">
          {/* Commit input */}
          <div className="p-2 border-b border-zinc-800/60">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message"
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 resize-none focus:border-zinc-700 focus:outline-none"
            />
            <button
              onClick={handleCommit}
              disabled={loading || !commitMessage.trim() || stagedFiles.length === 0}
              className="w-full mt-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-md text-[11px] font-medium transition-colors"
            >
              {loading ? 'Committing...' : `Commit${stagedFiles.length > 0 ? ` (${stagedFiles.length})` : ''}`}
            </button>
          </div>

          {/* Staged */}
          {stagedFiles.length > 0 && (
            <div>
              <button onClick={() => setStagedOpen(!stagedOpen)} className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30">
                <div className="flex items-center gap-1">
                  {stagedOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  <span className="uppercase tracking-wider font-medium">Staged ({stagedFiles.length})</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleUnstageAll(); }} className="text-zinc-500 hover:text-zinc-300" title="Unstage all">
                  <Minus size={11} />
                </button>
              </button>
              {stagedOpen && stagedFiles.map(f => (
                <FileRow key={f.path} file={f} onDiff={() => handleViewDiff(f.path, true)} onAction={() => handleUnstage(f.path)} actionIcon={<Minus size={11} />} actionTitle="Unstage" getStatusBadge={getStatusBadge} />
              ))}
            </div>
          )}

          {/* Unstaged */}
          {unstagedFiles.length > 0 && (
            <div>
              <button onClick={() => setUnstagedOpen(!unstagedOpen)} className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30">
                <div className="flex items-center gap-1">
                  {unstagedOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  <span className="uppercase tracking-wider font-medium">Changes ({unstagedFiles.length})</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleStageAll(); }} className="text-zinc-500 hover:text-zinc-300" title="Stage all">
                  <Plus size={11} />
                </button>
              </button>
              {unstagedOpen && unstagedFiles.map(f => (
                <FileRow key={f.path} file={f} onDiff={() => handleViewDiff(f.path, false)} onAction={() => handleStage(f.path)} onDiscard={() => handleDiscard(f.path)} actionIcon={<Plus size={11} />} actionTitle="Stage" getStatusBadge={getStatusBadge} />
              ))}
            </div>
          )}

          {files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
              <GitCommitHorizontal size={16} className="mb-1.5 opacity-40" />
              <span className="text-[11px]">No changes</span>
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto">
          {commits.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-zinc-600 text-[11px]">No commit history</div>
          ) : (
            <div className="py-1">
              {commits.map((commit, i) => (
                <div key={commit.hash} className="flex items-start gap-2 px-3 py-1.5 hover:bg-zinc-800/30 transition-colors group">
                  {/* Graph line */}
                  <div className="flex flex-col items-center flex-shrink-0 w-4 mt-0.5">
                    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", i === 0 ? "bg-indigo-500" : "bg-zinc-600")} />
                    {i < commits.length - 1 && <div className="w-px flex-1 bg-zinc-800 min-h-[16px]" />}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-zinc-200 truncate font-medium">{commit.message}</span>
                      {commit.refs && (
                        <div className="flex gap-1 flex-shrink-0">
                          {commit.refs.split(',').map((ref, j) => {
                            const r = ref.trim();
                            if (!r) return null;
                            const isBranch = r.includes('HEAD') || r.includes('origin');
                            return (
                              <span key={j} className={cn(
                                "text-[8px] px-1 py-0.5 rounded font-mono",
                                isBranch ? "bg-indigo-500/20 text-indigo-400" : "bg-zinc-800 text-zinc-500"
                              )}>
                                {r.replace('HEAD -> ', '').trim()}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-zinc-600 mt-0.5">
                      <span className="font-mono">{commit.shortHash}</span>
                      <span>{commit.author}</span>
                      <span>{formatDate(commit.date)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({ file, onDiff, onAction, onDiscard, actionIcon, actionTitle, getStatusBadge }: {
  file: GitFile; onDiff: () => void; onAction: () => void; onDiscard?: () => void;
  actionIcon: React.ReactNode; actionTitle: string;
  getStatusBadge: (s: GitFile['status']) => React.ReactNode;
}) {
  const name = file.path.split('/').pop() || file.path;
  return (
    <div className="flex items-center gap-1 px-3 py-1 hover:bg-zinc-800/30 group transition-colors">
      {getStatusBadge(file.status)}
      <span className="flex-1 text-[11px] text-zinc-400 truncate cursor-pointer hover:text-zinc-200" onClick={onDiff} title={file.path}>
        {name}
      </span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onDiscard && (
          <button onClick={onDiscard} className="p-0.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800" title="Discard">
            <Undo2 size={11} />
          </button>
        )}
        <button onClick={onAction} className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800" title={actionTitle}>
          {actionIcon}
        </button>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}
