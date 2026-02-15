import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileKey, FolderOpen, Plus, Trash2, Save, RefreshCw,
  AlertCircle, CheckCircle2, Eye, EyeOff, FileText,
  ChevronDown, ChevronRight, GripVertical, MessageSquare
} from 'lucide-react';
import { env, type EnvVariable } from '../../utils/api';

interface EnvEntry {
  id: string;
  key: string;
  value: string;
  comment?: string;
  isComment: boolean;
  isNew?: boolean;
  showValue?: boolean;
  note?: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function EnvPanel() {
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [envPath, setEnvPath] = useState<string>('.env');
  const [envFullPath, setEnvFullPath] = useState<string>('');
  const [envExists, setEnvExists] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [rawContent, setRawContent] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['variables']));
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCounterRef = useRef(0);

  const generateId = () => {
    idCounterRef.current += 1;
    return `env_${Date.now()}_${idCounterRef.current}`;
  };

  // Auto-fetch env file on mount
  const fetchEnv = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await env.get();
      if (data.success) {
        setEnvExists(data.exists);
        setEnvPath(data.path);
        setEnvFullPath(data.fullPath);
        setRawContent(data.raw || '');

        if (data.exists && data.variables) {
          const mapped: EnvEntry[] = data.variables
            .filter(v => !(v.key === '' && v.value === '' && !v.isComment))
            .map(v => ({
              id: generateId(),
              key: v.key,
              value: v.value,
              comment: v.comment,
              isComment: v.isComment,
              showValue: false,
              note: '',
            }));
          setEntries(mapped);
        } else {
          setEntries([]);
        }
      } else {
        setError('Failed to load environment file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load environment file');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnv();
  }, [fetchEnv]);

  // Auto-save with debounce (live edit)
  const autoSave = useCallback(async (entriesToSave: EnvEntry[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const variables: EnvVariable[] = entriesToSave.map(e => ({
          key: e.key,
          value: e.value,
          comment: e.comment,
          isComment: e.isComment,
          raw: e.isComment ? `# ${e.comment || ''}` : `${e.key}=${e.value}`,
        }));

        const result = await env.update({ path: envPath, variables });
        if (result.success) {
          setSaveStatus('saved');
          if (!envExists) setEnvExists(true);
          setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
          setSaveStatus('error');
          setError(result.error || 'Save failed');
        }
      } catch (err: any) {
        setSaveStatus('error');
        setError(err.message || 'Save failed');
      }
    }, 600);
  }, [envPath, envExists]);

  // Save raw content
  const saveRaw = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const result = await env.update({ path: envPath, raw: rawContent });
      if (result.success) {
        setSaveStatus('saved');
        if (!envExists) setEnvExists(true);
        setTimeout(() => {
          setSaveStatus('idle');
          // Re-fetch to sync structured view
          fetchEnv();
        }, 1000);
      } else {
        setSaveStatus('error');
        setError(result.error || 'Save failed');
      }
    } catch (err: any) {
      setSaveStatus('error');
      setError(err.message || 'Save failed');
    }
  }, [envPath, rawContent, envExists, fetchEnv]);

  const updateEntry = (id: string, field: 'key' | 'value' | 'comment' | 'note', newValue: string) => {
    setEntries(prev => {
      const updated = prev.map(e =>
        e.id === id ? { ...e, [field]: newValue } : e
      );
      // Auto-save on change (only for key/value/comment changes)
      if (field !== 'note') {
        autoSave(updated);
      }
      return updated;
    });
  };

  const addEntry = () => {
    const newEntry: EnvEntry = {
      id: generateId(),
      key: '',
      value: '',
      isComment: false,
      isNew: true,
      showValue: true,
      note: '',
    };
    setEntries(prev => [...prev, newEntry]);
  };

  const addComment = () => {
    const newEntry: EnvEntry = {
      id: generateId(),
      key: '',
      value: '',
      comment: '',
      isComment: true,
      isNew: true,
      note: '',
    };
    setEntries(prev => [...prev, newEntry]);
  };

  const removeEntry = (id: string) => {
    setEntries(prev => {
      const updated = prev.filter(e => e.id !== id);
      autoSave(updated);
      return updated;
    });
  };

  const toggleValueVisibility = (id: string) => {
    setEntries(prev =>
      prev.map(e =>
        e.id === id ? { ...e, showValue: !e.showValue } : e
      )
    );
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Determine if value looks like a secret
  const isSecret = (key: string): boolean => {
    const secretPatterns = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASS', 'AUTH', 'CREDENTIAL', 'PRIVATE'];
    return secretPatterns.some(p => key.toUpperCase().includes(p));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0c0c0c]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={20} className="text-zinc-500 animate-spin" />
          <span className="text-xs text-zinc-500">Loading environment...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0c0c0c] overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-zinc-800/60 flex items-center px-4 gap-3 bg-[#0a0a0a] flex-shrink-0">
        <FileKey size={14} className="text-emerald-400" />
        <span className="text-xs font-medium text-zinc-300">Environment Variables</span>
        <div className="flex-1" />

        {/* Save status indicator */}
        <div className="flex items-center gap-1.5">
          {saveStatus === 'saving' && (
            <>
              <RefreshCw size={12} className="text-amber-400 animate-spin" />
              <span className="text-[10px] text-amber-400">Saving...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span className="text-[10px] text-emerald-400">Saved</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <AlertCircle size={12} className="text-red-400" />
              <span className="text-[10px] text-red-400">Error</span>
            </>
          )}
        </div>

        {/* Toggle raw/structured view */}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
            showRaw
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`}
          title={showRaw ? 'Switch to structured view' : 'Switch to raw view'}
        >
          <FileText size={11} />
          {showRaw ? 'Raw' : 'Editor'}
        </button>

        {/* Refresh button */}
        <button
          onClick={fetchEnv}
          className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* File location bar */}
      <div className="px-4 py-2.5 border-b border-zinc-800/40 bg-[#0d0d0d]">
        <div className="flex items-center gap-2">
          <FolderOpen size={12} className="text-zinc-500 flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">File Location</span>
            <span className="text-[11px] text-zinc-400 truncate font-mono" title={envFullPath}>
              {envFullPath || 'No .env file found'}
            </span>
          </div>
          {envExists ? (
            <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 size={9} />
              Found
            </span>
          ) : (
            <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertCircle size={9} />
              Will Create
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <AlertCircle size={12} className="text-red-400 flex-shrink-0" />
          <span className="text-[11px] text-red-400 flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {showRaw ? (
          /* Raw editor view */
          <div className="flex flex-col h-full">
            <textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              className="flex-1 w-full bg-transparent text-zinc-300 font-mono text-xs p-4 resize-none outline-none leading-relaxed placeholder-zinc-600"
              placeholder="# Add your environment variables here&#10;KEY=value&#10;ANOTHER_KEY=another_value"
              spellCheck={false}
            />
            <div className="px-4 py-2 border-t border-zinc-800/40 flex justify-end">
              <button
                onClick={saveRaw}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition-colors"
              >
                <Save size={12} />
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          /* Structured editor view */
          <div className="p-3 space-y-2">
            {/* Variables section */}
            <div>
              <button
                onClick={() => toggleSection('variables')}
                className="flex items-center gap-1.5 w-full px-1 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-400 transition-colors"
              >
                {expandedSections.has('variables') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Variables ({entries.filter(e => !e.isComment).length})
              </button>

              {expandedSections.has('variables') && (
                <div className="space-y-1.5 mt-1">
                  {entries.length === 0 && (
                    <div className="text-center py-8">
                      <FileKey size={24} className="text-zinc-700 mx-auto mb-2" />
                      <p className="text-[11px] text-zinc-600 mb-1">No environment variables found</p>
                      <p className="text-[10px] text-zinc-700">Click "Add Variable" to create your first entry</p>
                    </div>
                  )}

                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`group rounded-lg border transition-all ${
                        entry.isComment
                          ? 'bg-zinc-900/30 border-zinc-800/40'
                          : entry.isNew
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : 'bg-zinc-900/50 border-zinc-800/40 hover:border-zinc-700/60'
                      }`}
                    >
                      {entry.isComment ? (
                        /* Comment entry */
                        <div className="flex items-center gap-2 px-3 py-2">
                          <MessageSquare size={11} className="text-zinc-600 flex-shrink-0" />
                          <span className="text-zinc-600 text-[10px] flex-shrink-0">#</span>
                          <input
                            type="text"
                            value={entry.comment || ''}
                            onChange={(e) => updateEntry(entry.id, 'comment', e.target.value)}
                            className="flex-1 bg-transparent text-[11px] text-zinc-500 outline-none placeholder-zinc-700 font-mono"
                            placeholder="Comment..."
                          />
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Remove"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ) : (
                        /* Variable entry */
                        <div className="px-3 py-2.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <GripVertical size={11} className="text-zinc-700 flex-shrink-0 opacity-0 group-hover:opacity-50 cursor-grab" />

                            {/* Key input */}
                            <input
                              type="text"
                              value={entry.key}
                              onChange={(e) => updateEntry(entry.id, 'key', e.target.value)}
                              className="flex-1 min-w-0 bg-zinc-800/50 border border-zinc-700/50 rounded-md px-2.5 py-1.5 text-[11px] text-zinc-200 outline-none font-mono placeholder-zinc-600 focus:border-zinc-600 transition-colors"
                              placeholder="KEY_NAME"
                              spellCheck={false}
                            />

                            <span className="text-zinc-600 text-xs">=</span>

                            {/* Value input */}
                            <div className="flex-1 min-w-0 relative">
                              <input
                                type={entry.showValue || !isSecret(entry.key) ? 'text' : 'password'}
                                value={entry.value}
                                onChange={(e) => updateEntry(entry.id, 'value', e.target.value)}
                                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-md px-2.5 py-1.5 pr-8 text-[11px] text-zinc-300 outline-none font-mono placeholder-zinc-600 focus:border-zinc-600 transition-colors"
                                placeholder="value"
                                spellCheck={false}
                              />
                              {isSecret(entry.key) && (
                                <button
                                  onClick={() => toggleValueVisibility(entry.id)}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
                                  title={entry.showValue ? 'Hide value' : 'Show value'}
                                >
                                  {entry.showValue ? <EyeOff size={11} /> : <Eye size={11} />}
                                </button>
                              )}
                            </div>

                            {/* Remove button */}
                            <button
                              onClick={() => removeEntry(entry.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                              title="Remove variable"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>

                          {/* Optional note (local only, not saved to .env) */}
                          {entry.note !== undefined && entry.note !== '' && (
                            <div className="ml-6 flex items-center gap-1.5">
                              <MessageSquare size={9} className="text-zinc-700" />
                              <span className="text-[9px] text-zinc-600 italic">{entry.note}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2 pb-4">
              <button
                onClick={addEntry}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium border border-zinc-700/60 transition-colors"
              >
                <Plus size={12} />
                Add Variable
              </button>
              <button
                onClick={addComment}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800/50 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-[11px] font-medium border border-zinc-800/60 transition-colors"
              >
                <MessageSquare size={11} />
                Add Comment
              </button>
            </div>

            {/* Info footer */}
            <div className="border-t border-zinc-800/40 pt-3 pb-2">
              <div className="flex items-start gap-2 px-1">
                <AlertCircle size={11} className="text-zinc-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    Changes are automatically saved to <span className="font-mono text-zinc-500">{envPath}</span>.
                    Sensitive values like API keys are masked by default.
                  </p>
                  <p className="text-[10px] text-zinc-700 leading-relaxed">
                    Tip: Use the Raw view to edit the file directly as plain text.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
