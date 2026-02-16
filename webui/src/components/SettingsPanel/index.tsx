import { useState, useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import Editor from '@monaco-editor/react';
import {
  X, Bot, Cpu, Keyboard, Loader2,
  Wrench, Eye, Save, AlertTriangle
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface RawConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  anthropicBaseUrl: string;
  openaiBaseUrl: string;
  maxIterations: number;
  theme: string;
  showDetails: boolean;
  showThinking: boolean;
  compactThreshold: number;
  preferredPackageManager: string;
  enableDryRunByDefault: boolean;
  gitCheckpointStrategy: string;
  testCommandOverride: string;
  defaultEditor: string;
  statusBarEnabled: boolean;
  headerMinimal: boolean;
  sessionDirectory: string;
  plugins: string[];
}

interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  tier: string;
}

type SettingsCategory = 'ai' | 'display' | 'dev' | 'mcp' | 'shortcuts';

const CATEGORIES: { id: SettingsCategory; label: string; icon: any }[] = [
  { id: 'ai', label: 'AI Provider', icon: Bot },
  { id: 'display', label: 'Display', icon: Eye },
  { id: 'dev', label: 'Development', icon: Wrench },
  { id: 'mcp', label: 'MCP Servers', icon: Cpu },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'S'], description: 'Save file' },
  { keys: ['Ctrl', 'P'], description: 'Quick open file' },
  { keys: ['Ctrl', 'Shift', 'P'], description: 'Command palette' },
  { keys: ['Ctrl', 'B'], description: 'Toggle sidebar' },
  { keys: ['Ctrl', 'J'], description: 'Toggle panel' },
  { keys: ['Ctrl', '`'], description: 'Toggle terminal' },
  { keys: ['Ctrl', 'F'], description: 'Find in file' },
  { keys: ['Ctrl', 'H'], description: 'Find and replace' },
  { keys: ['Ctrl', 'Shift', 'F'], description: 'Find in files' },
  { keys: ['Ctrl', '/'], description: 'Toggle comment' },
  { keys: ['Ctrl', 'Z'], description: 'Undo' },
  { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
  { keys: ['Alt', '\u2191'], description: 'Move line up' },
  { keys: ['Alt', '\u2193'], description: 'Move line down' },
  { keys: ['Ctrl', 'D'], description: 'Select next occurrence' },
  { keys: ['Ctrl', 'Enter'], description: 'Send message (chat)' },
];

export function SettingsPanel() {
  const { isSettingsOpen, setIsSettingsOpen } = useUIStore();
  const [category, setCategory] = useState<SettingsCategory>('ai');
  const [config, setConfig] = useState<RawConfig | null>(null);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      const data = await res.json();
      if (data.raw) {
        setConfig(data.raw);
      }
      if (data.availableModels) {
        setModels(data.availableModels);
      }
      if (data.providerConfigs) {
        (window as any).__PROVIDER_CONFIGS__ = data.providerConfigs;
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (isSettingsOpen) loadConfig();
  }, [isSettingsOpen, loadConfig]);

  // Use functional update to prevent state overwrites when multiple updates happen in the same render cycle
  const updateConfig = (key: keyof RawConfig, value: any) => {
    setConfig(prev => {
      if (!prev) return null;
      return { ...prev, [key]: value };
    });
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />

      {/* Modal */}
      <div className="relative w-[760px] max-w-[90vw] h-[560px] max-h-[85vh] bg-[#111111] border border-zinc-800 rounded-xl shadow-2xl flex overflow-hidden">
        {/* Close button */}
        <button onClick={() => setIsSettingsOpen(false)} className="absolute top-3 right-3 p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors z-10">
          <X size={16} />
        </button>

        {/* Sidebar */}
        <div className="w-44 bg-[#0c0c0c] border-r border-zinc-800/60 p-2 flex flex-col gap-0.5 flex-shrink-0">
          <div className="px-2 py-2 mb-1">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Settings</span>
          </div>
          {CATEGORIES.map((cat) => {
            const isActive = category === cat.id;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors text-left w-full",
                  isActive ? "bg-zinc-800 text-zinc-100 font-medium" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                )}
                onClick={() => setCategory(cat.id)}
              >
                <Icon size={15} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-500 gap-2">
              <Loader2 className="animate-spin" size={18} />
              <span className="text-sm">Loading settings...</span>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center justify-between px-3 py-2 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300"><X size={14} /></button>
                </div>
              )}

              {/* AI Provider */}
              {category === 'ai' && config && (
                <AIProviderSettings
                  config={config}
                  models={models}
                  updateConfig={updateConfig}
                  saving={saving}
                  saveSuccess={saveSuccess}
                  saveConfig={saveConfig}
                  providerConfigs={(window as any).__PROVIDER_CONFIGS__ || {}}
                />
              )}

              {/* Display */}
              {category === 'display' && config && (
                <div className="space-y-5">
                  <h3 className="text-sm font-semibold text-zinc-200">Display Settings</h3>
                  <p className="text-[11px] text-zinc-500 -mt-3">Control what information is shown in the UI.</p>

                  <SettingRow label="Theme">
                    <select value={config.theme} onChange={(e) => updateConfig('theme', e.target.value)} className="setting-input w-36">
                      <option value="default">Default</option>
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </SettingRow>

                  <SettingRow label="Show Tool Details">
                    <ToggleSwitch checked={config.showDetails} onChange={(v) => updateConfig('showDetails', v)} />
                  </SettingRow>
                  <SettingHint>Show detailed output from tool calls and file operations.</SettingHint>

                  <SettingRow label="Show AI Thinking">
                    <ToggleSwitch checked={config.showThinking} onChange={(v) => updateConfig('showThinking', v)} />
                  </SettingRow>
                  <SettingHint>Display AI thinking/reasoning blocks in chat.</SettingHint>

                  <SettingRow label="Compact Threshold">
                    <input type="number" value={config.compactThreshold} onChange={(e) => updateConfig('compactThreshold', parseInt(e.target.value) || 50000)} min={1000} className="setting-input w-28" />
                  </SettingRow>
                  <SettingHint>Character count threshold before switching to compact display mode.</SettingHint>

                  <SettingRow label="Status Bar Enabled">
                    <ToggleSwitch checked={config.statusBarEnabled} onChange={(v) => updateConfig('statusBarEnabled', v)} />
                  </SettingRow>

                  <SettingRow label="Minimal Header">
                    <ToggleSwitch checked={config.headerMinimal} onChange={(v) => updateConfig('headerMinimal', v)} />
                  </SettingRow>
                  <SettingHint>Use a compact header in the terminal UI.</SettingHint>

                  <SaveButton saving={saving} success={saveSuccess} onClick={saveConfig} />
                </div>
              )}

              {/* Development */}
              {category === 'dev' && config && (
                <div className="space-y-5">
                  <h3 className="text-sm font-semibold text-zinc-200">Development Settings</h3>
                  <p className="text-[11px] text-zinc-500 -mt-3">Configure development workflow preferences.</p>

                  <SettingRow label="Package Manager">
                    <select value={config.preferredPackageManager} onChange={(e) => updateConfig('preferredPackageManager', e.target.value)} className="setting-input w-36">
                      <option value="pnpm">pnpm</option>
                      <option value="bun">bun</option>
                      <option value="npm">npm</option>
                    </select>
                  </SettingRow>

                  <SettingRow label="Dry Run by Default">
                    <ToggleSwitch checked={config.enableDryRunByDefault} onChange={(v) => updateConfig('enableDryRunByDefault', v)} />
                  </SettingRow>

                  <SettingRow label="Git Checkpoint Strategy">
                    <select value={config.gitCheckpointStrategy} onChange={(e) => updateConfig('gitCheckpointStrategy', e.target.value)} className="setting-input w-36">
                      <option value="stash">Stash</option>
                      <option value="commit">Commit</option>
                    </select>
                  </SettingRow>

                  <SettingRow label="Test Command Override">
                    <input type="text" value={config.testCommandOverride} onChange={(e) => updateConfig('testCommandOverride', e.target.value)} placeholder="e.g., npm test, bun test" className="setting-input w-56" />
                  </SettingRow>

                  <SettingRow label="Default Editor">
                    <input type="text" value={config.defaultEditor} onChange={(e) => updateConfig('defaultEditor', e.target.value)} placeholder="vim, code, nano..." className="setting-input w-36" />
                  </SettingRow>

                  <SettingRow label="Session Directory">
                    <input type="text" value={config.sessionDirectory} onChange={(e) => updateConfig('sessionDirectory', e.target.value)} placeholder="Default (~/.xibecode/sessions)" className="setting-input w-56" />
                  </SettingRow>

                  <SaveButton saving={saving} success={saveSuccess} onClick={saveConfig} />
                </div>
              )}

              {/* MCP Servers */}
              {category === 'mcp' && (
                <MCPEditorPanel />
              )}

              {/* Shortcuts */}
              {category === 'shortcuts' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200">Keyboard Shortcuts</h3>
                  <div className="divide-y divide-zinc-800/60">
                    {SHORTCUTS.map((shortcut, index) => (
                      <div key={index} className="flex items-center justify-between py-2.5">
                        <div className="flex gap-1">
                          {shortcut.keys.map((key, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <kbd className="text-[10px] font-mono bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700/50">{key}</kbd>
                              {i < shortcut.keys.length - 1 && <span className="text-zinc-600 text-[10px]">+</span>}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-zinc-500">{shortcut.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/40">
      <label className="text-xs text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

function SettingHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-zinc-600 -mt-3 pl-0.5">{children}</p>;
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "w-9 h-5 rounded-full transition-colors relative flex-shrink-0",
        checked ? "bg-indigo-600" : "bg-zinc-700"
      )}
    >
      <div className={cn(
        "w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform",
        checked ? "translate-x-[18px]" : "translate-x-[3px]"
      )} />
    </button>
  );
}

function SaveButton({ saving, success, onClick }: { saving: boolean; success: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={cn(
        "mt-2 px-4 py-1.5 text-xs rounded-lg transition-colors",
        success
          ? "bg-emerald-600 text-white"
          : "bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white"
      )}
    >
      {saving ? 'Saving...' : success ? 'Saved!' : 'Save Settings'}
    </button>
  );
}

function MCPEditorPanel() {
  const [content, setContent] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    const loadFile = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/mcp/file');
        if (!res.ok) throw new Error('Failed to load MCP config');
        const data = await res.json();
        if (data.success) {
          setContent(data.content);
          setFilePath(data.path);
        }
        setFetchError(null);
      } catch (err: any) {
        setFetchError(err.message || 'Failed to load MCP servers file');

        setContent(JSON.stringify({
          mcpServers: {
            "example-server": {
              command: "npx",
              args: ["-y", "@example/mcp-server"],
              env: {}
            }
          }
        }, null, 2));
      } finally {
        setLoading(false);
      }
    };
    loadFile();
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    const val = value || '';
    setContent(val);
    setSaveSuccess(false);
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message);
    }
  };

  const handleSave = async () => {
    if (jsonError) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/mcp/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        setJsonError(data.error || 'Failed to save');
      }
    } catch (err: any) {
      setJsonError(err.message || 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor;
    editor.addCommand(2097, () => {
      handleSave();
    });
  };

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">MCP Servers</h3>
          {filePath && (
            <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{filePath}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {jsonError && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400">
              <AlertTriangle size={12} />
              <span>Invalid JSON</span>
            </div>
          )}
          {saveSuccess && (
            <span className="text-[10px] text-emerald-400 font-medium">Saved!</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !!jsonError}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors",
              jsonError
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : saveSuccess
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
            )}
          >
            <Save size={12} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500 gap-2">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm">Loading mcp-servers.json...</span>
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
            <AlertTriangle size={20} />
            <p className="text-xs">{fetchError}</p>
            <p className="text-[10px] text-zinc-600">Showing default template. Save to create the file.</p>
            <div className="w-full flex-1 min-h-0">
              <Editor
                height="100%"
                language="json"
                value={content}
                theme="vs-dark"
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                options={{
                  fontSize: 13,
                  tabSize: 2,
                  minimap: { enabled: false },
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                  lineNumbers: 'on',
                  renderLineHighlight: 'line',
                  cursorBlinking: 'smooth',
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontLigatures: true,
                  wordWrap: 'on',
                  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                }}
              />
            </div>
          </div>
        ) : (
          <Editor
            height="100%"
            language="json"
            value={content}
            theme="vs-dark"
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              fontSize: 13,
              tabSize: 2,
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              wordWrap: 'on',
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            }}
          />
        )}
      </div>

      <div className="px-5 py-2 border-t border-zinc-800/60 flex-shrink-0">
        <p className="text-[10px] text-zinc-600">
          Edit the JSON directly. Add servers under <code className="text-zinc-500 bg-zinc-900 px-1 rounded">mcpServers</code>. Press <kbd className="text-zinc-500 bg-zinc-900 px-1 rounded">Ctrl+S</kbd> to save.
        </p>
      </div>
    </div>
  );
}

function AIProviderSettings({
  config, models, updateConfig, saving, saveSuccess, saveConfig, providerConfigs
}: {
  config: RawConfig;
  models: AvailableModel[];
  updateConfig: (key: keyof RawConfig, value: any) => void;
  saving: boolean;
  saveSuccess: boolean;
  saveConfig: () => void;
  providerConfigs: any;
}) {
  const [useCustomModel, setUseCustomModel] = useState(() => {
    return !!config.model && !models.find(m => m.id === config.model);
  });
  const [customModelId, setCustomModelId] = useState(() => {
    return config.model && !models.find(m => m.id === config.model) ? config.model : '';
  });
  const [showApiKey, setShowApiKey] = useState(false);

  const selectedProvider = config.provider || 'openai';

  let displayedBaseUrl = config.baseUrl;
  const isCustomProvider = selectedProvider === 'custom';

  if (!isCustomProvider) {
    const pConfig = providerConfigs && providerConfigs[selectedProvider];

    if (!config.baseUrl && pConfig) {
      displayedBaseUrl = pConfig.baseUrl;
    }

    if (selectedProvider === 'anthropic' && config.anthropicBaseUrl) displayedBaseUrl = config.anthropicBaseUrl;
    if (selectedProvider === 'openai' && config.openaiBaseUrl) displayedBaseUrl = config.openaiBaseUrl;
  }

  const handleProviderChange = (newProvider: string) => {
    updateConfig('provider', newProvider);

    if (newProvider !== 'custom') {
      updateConfig('baseUrl', '');
    }
  };

  const handleModelSelectChange = (value: string) => {
    if (value === '__custom__') {
      setUseCustomModel(true);
    } else {
      setUseCustomModel(false);
      setCustomModelId('');
      updateConfig('model', value);

      const m = models.find(mod => mod.id === value);
      if (m && m.provider && m.provider !== selectedProvider && selectedProvider !== 'custom') {
        const newProvider = m.provider;
        updateConfig('provider', newProvider);
        if (newProvider !== 'custom') {
          updateConfig('baseUrl', '');
        }
      }
    }
  };

  const handleCustomModelApply = () => {
    if (customModelId.trim()) {
      updateConfig('model', customModelId.trim());
    }
  };

  const filteredModels = models.filter(m => {
    if (selectedProvider === 'custom') return true;
    return m.provider === selectedProvider;
  });

  const groupedModels: Record<string, AvailableModel[]> = {};
  filteredModels.forEach(m => {
    const key = m.provider === 'anthropic' ? 'Anthropic' :
      m.provider === 'openai' ? 'OpenAI' :
        m.provider === 'deepseek' ? 'DeepSeek' :
          m.provider === 'zai' ? 'Zhipu AI' :
            m.provider === 'kimi' ? 'Moonshot' :
              m.provider === 'alibaba' ? 'Alibaba' :
                m.provider === 'grok' ? 'Grok' :
                  m.provider === 'groq' ? 'Groq' :
                    m.provider === 'openrouter' ? 'OpenRouter' : 'Other';
    if (!groupedModels[key]) groupedModels[key] = [];
    groupedModels[key].push(m);
  });


  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-zinc-200">AI Provider</h3>
      <p className="text-[11px] text-zinc-500 -mt-3">Configure your AI model and API credentials.</p>

      <SettingRow label="Provider">
        <select
          value={selectedProvider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="setting-input w-44"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="zai">Zhipu AI (GLM)</option>
          <option value="kimi">Moonshot (Kimi)</option>
          <option value="alibaba">Alibaba (Qwen)</option>
          <option value="grok">xAI (Grok)</option>
          <option value="groq">Groq</option>
          <option value="openrouter">OpenRouter</option>
          <option value="custom">Custom (Compatible)</option>
        </select>
      </SettingRow>

      <SettingRow label="Model">
        <select
          value={useCustomModel ? '__custom__' : config.model}
          onChange={(e) => handleModelSelectChange(e.target.value)}
          className="setting-input w-56"
        >
          {Object.entries(groupedModels).map(([group, groupModels]) => (
            groupModels.length > 0 && (
              <optgroup key={group} label={group}>
                {groupModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            )
          ))}
          <optgroup label="Custom">
            <option value="__custom__">+ Add custom model...</option>
          </optgroup>
          {useCustomModel && customModelId && (
            <option value="__custom__" hidden>{customModelId} (custom)</option>
          )}
        </select>
      </SettingRow>

      {useCustomModel && (
        <>
          <div className="ml-0 p-3 bg-zinc-900/50 border border-zinc-800/60 rounded-lg space-y-3">
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Custom Model</div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-zinc-500">Model ID</label>
              <input
                type="text"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                placeholder="e.g., gpt-4-turbo"
                className="setting-input w-56"
                autoFocus
              />
            </div>
            <button
              onClick={handleCustomModelApply}
              disabled={!customModelId.trim()}
              className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 text-zinc-200 text-[11px] rounded-md transition-colors"
            >
              Apply Custom Model
            </button>
          </div>
        </>
      )}

      <SettingRow label="API Key">
        <div className="relative w-56">
          <input
            type={showApiKey ? "text" : "password"}
            value={config.apiKey === '••••••••' && !showApiKey ? '' : config.apiKey}
            onChange={(e) => updateConfig('apiKey', e.target.value)}
            placeholder={config.apiKey === '••••••••' ? '••••••••  (already set)' : 'sk-...'}
            className="setting-input w-full pr-8"
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            <Eye size={12} />
          </button>
        </div>
      </SettingRow>

      <SettingRow label="Base URL">
        <input
          type="text"
          value={displayedBaseUrl || ''}
          onChange={(e) => updateConfig('baseUrl', e.target.value)}
          placeholder="Default"
          disabled={!isCustomProvider}
          className={cn(
            "setting-input w-56",
            !isCustomProvider && "bg-zinc-900/50 text-zinc-500 cursor-not-allowed"
          )}
        />
      </SettingRow>
      {!isCustomProvider && (
        <SettingHint>Base URL is managed automatically by the selected provider.</SettingHint>
      )}
      {isCustomProvider && (
        <SettingHint>Enter the full API endpoint URL.</SettingHint>
      )}

      <SettingRow label="Max Iterations">
        <input type="number" value={config.maxIterations} onChange={(e) => updateConfig('maxIterations', parseInt(e.target.value) || 50)} min={1} max={500} className="setting-input w-24" />
      </SettingRow>

      <SaveButton saving={saving} success={saveSuccess} onClick={saveConfig} />
    </div>
  );
}
