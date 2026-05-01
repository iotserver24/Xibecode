import { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
  onModelChange: (model: string) => void;
  onProviderChange: (provider: string) => void;
  activeModel: string;
  activeProvider: string;
}

const xibe = (window as any).xibecode;

const PROVIDERS = [
  { id: '', label: 'Auto-detect' },
  { id: 'routingrun', label: 'Routing.run' },
  { id: 'zenllm', label: 'zenllm.org' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'grok', label: 'Grok (xAI)' },
  { id: 'groq', label: 'Groq' },
  { id: 'kimi', label: 'Moonshot (Kimi)' },
  { id: 'zai', label: 'Zhipu AI (z.ai)' },
];

type ConfigSection = 'provider' | 'apiKey' | 'model' | 'baseUrl' | 'costMode' | 'economyModel' | 'wireFormat' | 'summary';

export default function SettingsPanel({ onClose, onModelChange, onProviderChange, activeModel, activeProvider }: Props) {
  const [section, setSection] = useState<ConfigSection>('summary');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [economyModel, setEconomyModel] = useState('');
  const [costMode, setCostModeLocal] = useState('normal');
  const [wireFormat, setWireFormatLocal] = useState('auto');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [summary, setSummary] = useState<Record<string, string>>({});
  const [modelFilter, setModelFilter] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      const all = await xibe.config.getAll();
      setSummary(all);
      setCostModeLocal(await xibe.config.getCostMode());
      setWireFormatLocal((await xibe.config.get('requestFormat')) || 'auto');
      setEconomyModel((await xibe.config.get('economyModel')) || '');
      setBaseUrl(await xibe.config.getBaseUrl() || '');
      const key = await xibe.config.getApiKey();
      setApiKey(key ? key.slice(0, 8) + '...' + key.slice(-4) : '');
    })();
  }, []);

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const list = await xibe.config.fetchModels();
      setModels(list);
      setSelectedModelIdx(0);
      setModelFilter('');
    } catch (err: any) {
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-xibe-border bg-xibe-surface-raised px-3 py-2 text-sm text-xibe-text placeholder-xibe-text-dim/40 focus:border-xibe-border-focus focus:ring-1 focus:ring-xibe-accent/30 focus:outline-none transition-all";

  const navItem = (id: ConfigSection, label: string) => (
    <button onClick={() => setSection(id)} className={`w-full text-left rounded-md px-3 py-1.5 text-xs transition-colors ${section === id ? 'bg-xibe-accent-muted text-xibe-brand-blue font-medium' : 'text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover'}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl h-[70vh] rounded-xl border border-xibe-border bg-xibe-surface shadow-2xl flex flex-col animate-slide-up overflow-hidden">
        <div className="flex items-center justify-between border-b border-xibe-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-xibe-text">Settings</h2>
          <button onClick={onClose} className="rounded-md p-1 text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-44 shrink-0 border-r border-xibe-border-subtle p-2 space-y-0.5">
            {navItem('summary', 'Config Summary')}
            {navItem('provider', 'Provider')}
            {navItem('apiKey', 'API Key')}
            {navItem('model', 'Model')}
            {navItem('baseUrl', 'Base URL')}
            {navItem('wireFormat', 'Wire Format')}
            {navItem('costMode', 'Cost Mode')}
            {navItem('economyModel', 'Economy Model')}
          </nav>
          <div className="flex-1 overflow-y-auto p-5">
            {section === 'summary' && (
              <div className="space-y-2">
                {Object.entries(summary).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-1 border-b border-xibe-border-subtle">
                    <span className="text-xs text-xibe-text-dim">{k}</span>
                    <span className="text-xs font-mono text-xibe-text-secondary">{v}</span>
                  </div>
                ))}
              </div>
            )}
            {section === 'provider' && (
              <div className="space-y-1.5">
                <p className="text-xs text-xibe-text-dim mb-2">Select your AI provider</p>
                {PROVIDERS.map((p) => (
                  <button key={p.id || 'auto'} onClick={async () => { await onProviderChange(p.id); setSection('summary'); }} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${activeProvider === p.id ? 'border-xibe-brand-blue/30 bg-xibe-accent-muted text-xibe-brand-blue' : 'border-xibe-border-subtle text-xibe-text-secondary hover:border-xibe-border'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {section === 'apiKey' && (
              <div className="space-y-3">
                <p className="text-xs text-xibe-text-dim mb-2">Your API key (stored locally)</p>
                <p className="font-mono text-xs text-xibe-text-dim bg-xibe-surface-raised rounded-lg px-3 py-2 border border-xibe-border-subtle">{apiKey || 'Not set'}</p>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} placeholder="Enter new API key..." className={`${inputCls} pr-9`} onChange={(e) => setApiKey(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && apiKey.length >= 10) { await xibe.config.set('apiKey', apiKey); setSection('summary'); } }} />
                  <button onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xibe-text-dim/40 hover:text-xibe-text-dim"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
                </div>
                <button onClick={async () => { if (apiKey.length >= 10) { await xibe.config.set('apiKey', apiKey); setSection('summary'); } }} className="rounded-lg bg-xibe-brand-blue px-4 py-2 text-xs font-medium text-xibe-bg hover:bg-xibe-accent-hover transition-colors">Save Key</button>
              </div>
            )}
            {section === 'model' && (
              <div className="space-y-3">
                <p className="text-xs text-xibe-text-dim">Current model: <span className="font-mono text-xibe-text">{activeModel}</span></p>
                <div className="flex gap-2">
                  <input type="text" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder="Filter models..." className={inputCls} />
                  <button onClick={fetchModels} disabled={loadingModels} className="shrink-0 rounded-lg bg-xibe-brand-blue px-3 py-2 text-xs font-medium text-xibe-bg hover:bg-xibe-accent-hover disabled:opacity-50 transition-colors">
                    {loadingModels ? 'Loading...' : 'Fetch Models'}
                  </button>
                </div>
                {models.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-0.5 border border-xibe-border-subtle rounded-lg p-1">
                    {models.filter((m) => m.toLowerCase().includes(modelFilter.toLowerCase())).map((m, i) => (
                      <button key={m} onClick={async () => { await onModelChange(m); setSection('summary'); }} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${m === activeModel ? 'bg-xibe-accent-muted text-xibe-brand-blue' : 'text-xibe-text-secondary hover:bg-xibe-surface-hover'}`}>
                        <span className="font-mono truncate">{m}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {section === 'baseUrl' && (
              <div className="space-y-3">
                <p className="text-xs text-xibe-text-dim">Override the API endpoint URL</p>
                <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className={inputCls} />
                <button onClick={async () => { await xibe.config.set('baseUrl', baseUrl.replace(/\/+$/, '')); setSection('summary'); }} className="rounded-lg bg-xibe-brand-blue px-4 py-2 text-xs font-medium text-xibe-bg hover:bg-xibe-accent-hover transition-colors">Save</button>
              </div>
            )}
            {section === 'wireFormat' && (
              <div className="space-y-2">
                {(['auto', 'openai', 'anthropic'] as const).map((f) => (
                  <button key={f} onClick={async () => { await xibe.config.set('requestFormat', f); setWireFormatLocal(f); setSection('summary'); }} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${wireFormat === f ? 'border-xibe-brand-blue/30 bg-xibe-accent-muted' : 'border-xibe-border-subtle hover:border-xibe-border'}`}>
                    <span className={`h-2 w-2 rounded-full ${wireFormat === f ? 'bg-xibe-brand-blue' : 'bg-xibe-text-dim/30'}`} />
                    <div>
                      <div className="text-xs font-medium text-xibe-text">{f.charAt(0).toUpperCase() + f.slice(1)}</div>
                      <div className="text-[10px] text-xibe-text-dim">{f === 'auto' ? 'Follow provider default' : f === 'openai' ? 'OpenAI Chat Completions' : 'Anthropic Messages API'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {section === 'costMode' && (
              <div className="space-y-2">
                {(['normal', 'economy'] as const).map((m) => (
                  <button key={m} onClick={async () => { await xibe.config.set('costMode', m); setCostModeLocal(m); setSection('summary'); }} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${costMode === m ? 'border-xibe-brand-blue/30 bg-xibe-accent-muted' : 'border-xibe-border-subtle hover:border-xibe-border'}`}>
                    <span className={`h-2 w-2 rounded-full ${costMode === m ? 'bg-xibe-brand-blue' : 'bg-xibe-text-dim/30'}`} />
                    <div>
                      <div className="text-xs font-medium text-xibe-text capitalize">{m}</div>
                      <div className="text-[10px] text-xibe-text-dim">{m === 'normal' ? 'Use primary model' : 'Use cheaper economy model'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {section === 'economyModel' && (
              <div className="space-y-3">
                <p className="text-xs text-xibe-text-dim">Model used when cost mode is "economy"</p>
                <input type="text" value={economyModel} onChange={(e) => setEconomyModel(e.target.value)} placeholder="e.g. gpt-4o-mini" className={inputCls} />
                <button onClick={async () => { await xibe.config.set('economyModel', economyModel); setSection('summary'); }} className="rounded-lg bg-xibe-brand-blue px-4 py-2 text-xs font-medium text-xibe-bg hover:bg-xibe-accent-hover transition-colors">Save</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
