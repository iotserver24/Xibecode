import React, { useState, useEffect } from 'react';

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

// Icons for settings navigation categories
const SummaryIcon = () => (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ProviderIcon = () => (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const KeyIcon = () => (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-3.418 3.418l-3.182 3.182a1.5 1.5 0 00-.439 1.061v2.357a.5.5 0 01-.5.5H8a.5.5 0 01-.5-.5v-1a.5.5 0 00-.5-.5H6a.5.5 0 01-.5-.5v-1a.5.5 0 00-.5-.5H4a.5.5 0 01-.5-.5v-1.357a1.5 1.5 0 00-.44-1.06l3.181-3.182m0 0A5.5 5.5 0 1113.5 6.5a5.5 5.5 0 01-2.918 5.418z" />
  </svg>
);

const ModelIcon = () => (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);

const CodeIcon = () => (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const CoinsIcon = () => (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PiggyIcon = () => (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

// Map provider identifier to styled badge
const getProviderInitialsAndColor = (id: string) => {
  switch (id) {
    case 'routingrun': return { text: 'R', bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400' };
    case 'zenllm': return { text: 'Z', bg: 'bg-purple-500/10 border-purple-500/20 text-purple-400' };
    case 'openai': return { text: 'O', bg: 'bg-teal-500/10 border-teal-500/20 text-teal-400' };
    case 'anthropic': return { text: 'A', bg: 'bg-amber-500/10 border-amber-500/20 text-amber-500' };
    case 'openrouter': return { text: 'O', bg: 'bg-pink-500/10 border-pink-500/20 text-pink-400' };
    case 'deepseek': return { text: 'D', bg: 'bg-sky-500/10 border-sky-500/20 text-sky-400' };
    case 'google': return { text: 'G', bg: 'bg-red-500/10 border-red-500/20 text-red-400' };
    case 'grok': return { text: 'X', bg: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400' };
    case 'groq': return { text: 'Q', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' };
    case 'kimi': return { text: 'K', bg: 'bg-orange-500/10 border-orange-500/20 text-orange-400' };
    case 'zai': return { text: 'H', bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' };
    default: return { text: '*', bg: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400' };
  }
};

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
  const [copiedPath, setCopiedPath] = useState(false);

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

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const getSectionTitleAndDesc = (sec: ConfigSection) => {
    switch (sec) {
      case 'summary':
        return {
          title: 'Config Summary',
          desc: 'Overview of currently active settings and on-disk file locations.'
        };
      case 'provider':
        return {
          title: 'AI Provider',
          desc: 'Select the active AI platform vendor for processing code requests.'
        };
      case 'apiKey':
        return {
          title: 'API Authentication Key',
          desc: 'Enter your secure API key. Keys are saved locally on your device.'
        };
      case 'model':
        return {
          title: 'AI Model',
          desc: 'Filter, select, or pull models associated with your configuration.'
        };
      case 'baseUrl':
        return {
          title: 'Base URL Endpoint',
          desc: 'Provide custom URLs for proxy endpoints or local models.'
        };
      case 'wireFormat':
        return {
          title: 'Wire Format Protocol',
          desc: 'Select the wire format protocol structure sent to host servers.'
        };
      case 'costMode':
        return {
          title: 'Cost Strategy Mode',
          desc: 'Configure strategies to control billing and model switching.'
        };
      case 'economyModel':
        return {
          title: 'Economy Model',
          desc: 'Name of the budget model mapped to economy cost operations.'
        };
    }
  };

  const inputCls = "w-full rounded-xl border border-xibe-border bg-xibe-surface-raised px-4.5 py-3 text-sm text-xibe-text placeholder-xibe-text-dim/40 focus:border-xibe-brand-blue/50 focus:ring-2 focus:ring-xibe-brand-blue/15 focus:outline-none transition-all duration-200 shadow-inner";

  const navItem = (id: ConfigSection, label: string, icon: React.ReactNode) => (
    <button 
      onClick={() => setSection(id)} 
      className={`flex items-center gap-3.5 w-full text-left rounded-lg px-3.5 py-3.5 text-xs transition-all duration-200 border-l-2 select-none cursor-pointer ${
        section === id 
          ? 'bg-xibe-surface-raised border-xibe-brand-blue text-xibe-brand-blue font-semibold shadow-sm' 
          : 'border-transparent text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover/60'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const activeMeta = getSectionTitleAndDesc(section);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-3xl h-[80vh] rounded-2xl border border-xibe-border bg-xibe-surface/98 backdrop-blur-xl flex flex-col shadow-2xl shadow-black/85 animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-xibe-border-subtle/80 px-6 py-5.5 bg-gradient-to-r from-xibe-surface to-xibe-surface-raised/40">
          <div className="flex items-center gap-3.5">
            <span className="h-6.5 w-6.5 rounded-lg bg-xibe-brand-blue/10 flex items-center justify-center text-xibe-brand-blue">
              <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-semibold text-xibe-text">Settings</h2>
              <p className="text-[10px] text-xibe-text-dim mt-0.5 font-medium">Configure global client profiles & endpoints</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="rounded-full p-2 text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover transition-colors cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Workspace Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Navigation Panel */}
          <nav className="w-56 shrink-0 border-r border-xibe-border-subtle p-4 space-y-2.5 bg-xibe-surface/40 overflow-y-auto">
            {navItem('summary', 'Config Summary', <SummaryIcon />)}
            {navItem('provider', 'Provider', <ProviderIcon />)}
            {navItem('apiKey', 'API Key', <KeyIcon />)}
            {navItem('model', 'Model', <ModelIcon />)}
            {navItem('baseUrl', 'Base URL', <GlobeIcon />)}
            {navItem('wireFormat', 'Wire Format', <CodeIcon />)}
            {navItem('costMode', 'Cost Mode', <CoinsIcon />)}
            {navItem('economyModel', 'Economy Model', <PiggyIcon />)}
          </nav>

          {/* Details Content Panel */}
          <div className="flex-1 overflow-y-auto p-8 flex flex-col">
            {/* Context Header */}
            <div className="mb-7 border-b border-xibe-border-subtle/40 pb-4 shrink-0">
              <h3 className="text-sm font-semibold text-xibe-text">{activeMeta.title}</h3>
              <p className="text-xs text-xibe-text-dim mt-1.5 font-medium leading-relaxed">{activeMeta.desc}</p>
            </div>

            <div className="flex-1 min-w-0">
              {/* Section - Summary */}
              {section === 'summary' && (
                <div className="space-y-6 animate-fade-in">
                  {/* Profile and Path Card */}
                  <div className="bg-xibe-surface-raised/40 border border-xibe-border/60 rounded-xl p-5 space-y-4 shadow-sm">
                    <h4 className="text-[10px] font-bold text-xibe-brand-blue uppercase tracking-wider">Profile & Location</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xibe-text-dim font-medium">Active Config Profile</span>
                        <span className="px-2.5 py-0.5 rounded-md bg-xibe-brand-blue/10 border border-xibe-brand-blue/20 text-xibe-brand-blue font-semibold">{summary['Profile'] || 'default'}</span>
                      </div>
                      <div className="flex flex-col gap-2 pt-3.5 border-t border-xibe-border-subtle/50">
                        <div className="flex items-center justify-between text-xs text-xibe-text-dim">
                          <span className="font-medium">Config File Path</span>
                          <button 
                            onClick={() => copyToClipboard(summary['Config Path'] || '')} 
                            className="flex items-center gap-1.5 text-[10px] text-xibe-brand-blue hover:text-xibe-accent-hover transition-colors font-semibold cursor-pointer"
                          >
                            {copiedPath ? (
                              <>
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                <span>Copy Path</span>
                              </>
                            )}
                          </button>
                        </div>
                        <span className="text-[11px] font-mono text-xibe-text-secondary bg-xibe-surface-raised border border-xibe-border/40 rounded-lg px-3 py-2.5 break-all select-all font-medium">
                          {summary['Config Path']}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* AI Configuration Card */}
                  <div className="bg-xibe-surface-raised/40 border border-xibe-border/60 rounded-xl p-5 space-y-4 shadow-sm">
                    <h4 className="text-[10px] font-bold text-xibe-brand-blue/80 uppercase tracking-wider">AI API Configuration</h4>
                    <div className="divide-y divide-xibe-border-subtle/50 text-xs">
                      <div className="flex items-center justify-between py-3.5">
                        <span className="text-xibe-text-dim font-medium">Active Provider</span>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const p = summary['Provider'] || 'auto-detect';
                            const badg = getProviderInitialsAndColor(p);
                            return (
                              <>
                                <span className="h-5.5 w-5.5 rounded-md flex items-center justify-center border font-bold text-[9px] bg-xibe-surface-raised border-xibe-border" style={{ borderColor: 'var(--color-xibe-border)' }}>
                                  <span className={`h-5 w-5 rounded-md flex items-center justify-center font-bold ${badg.bg}`}>{badg.text}</span>
                                </span>
                                <span className="font-semibold text-xibe-text-secondary capitalize">{p}</span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center justify-between py-3.5">
                        <span className="text-xibe-text-dim font-medium">Primary Model</span>
                        <span className="font-mono text-[11px] text-xibe-brand-blue bg-xibe-brand-blue/5 border border-xibe-brand-blue/10 px-2.5 py-1 rounded-md font-semibold">{summary['Model']}</span>
                      </div>
                      <div className="flex items-center justify-between py-3.5">
                        <span className="text-xibe-text-dim font-medium">Economy Model</span>
                        <span className={`font-mono text-[11px] px-2.5 py-1 rounded-md font-semibold ${summary['Economy Model'] && summary['Economy Model'] !== 'Not set' ? 'text-xibe-brand-orange bg-xibe-brand-orange/5 border border-xibe-brand-orange/10' : 'text-xibe-text-dim/60 bg-xibe-surface-raised border border-xibe-border/30'}`}>{summary['Economy Model']}</span>
                      </div>
                      <div className="flex items-center justify-between py-3.5">
                        <span className="text-xibe-text-dim font-medium">Base URL Override</span>
                        <span className="font-mono text-[11px] text-xibe-text-secondary truncate max-w-[280px] font-medium">{summary['Base URL']}</span>
                      </div>
                      <div className="flex items-center justify-between py-3.5">
                        <span className="text-xibe-text-dim font-medium">API Key Status</span>
                        <span className="font-mono text-[11px] text-xibe-text-secondary font-medium">{summary['API Key']}</span>
                      </div>
                    </div>
                  </div>

                  {/* Agent Preferences Card */}
                  <div className="bg-xibe-surface-raised/40 border border-xibe-border/60 rounded-xl p-5 space-y-4 shadow-sm">
                    <h4 className="text-[10px] font-bold text-xibe-brand-blue/80 uppercase tracking-wider">Agent Runtime Options</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="flex flex-col gap-1.5 p-4 rounded-xl border border-xibe-border/30 bg-xibe-surface-raised/20">
                        <span className="text-[10px] text-xibe-text-dim font-semibold uppercase tracking-wider">Cost Mode</span>
                        <span className="font-semibold text-xibe-text-secondary capitalize">{summary['Cost Mode']}</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-4 rounded-xl border border-xibe-border/30 bg-xibe-surface-raised/20">
                        <span className="text-[10px] text-xibe-text-dim font-semibold uppercase tracking-wider">Wire Format</span>
                        <span className="font-semibold text-xibe-text-secondary capitalize">{summary['Wire Format']}</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-4 rounded-xl border border-xibe-border/30 bg-xibe-surface-raised/20">
                        <span className="text-[10px] text-xibe-text-dim font-semibold uppercase tracking-wider">Max Iterations</span>
                        <span className="font-mono font-semibold text-xibe-text-secondary">{summary['Max Iterations']}</span>
                      </div>
                      <div className="flex flex-col gap-1.5 p-4 rounded-xl border border-xibe-border/30 bg-xibe-surface-raised/20">
                        <span className="text-[10px] text-xibe-text-dim font-semibold uppercase tracking-wider">Show Details</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${summary['Show Details'] === 'true' ? 'bg-xibe-success animate-pulse' : 'bg-xibe-error'}`} />
                          <span className="font-semibold text-xibe-text-secondary uppercase text-[10px]">{summary['Show Details']}</span>
                        </div>
                      </div>
                      <div className="col-span-2 flex flex-col gap-1.5 p-4 rounded-xl border border-xibe-border/30 bg-xibe-surface-raised/20">
                        <span className="text-[10px] text-xibe-text-dim font-semibold uppercase tracking-wider">Show Thinking Blocks</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${summary['Show Thinking'] === 'true' ? 'bg-xibe-success animate-pulse' : 'bg-xibe-error'}`} />
                          <span className="font-semibold text-xibe-text-secondary uppercase text-[10px]">{summary['Show Thinking']}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Section - Provider */}
              {section === 'provider' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-2 gap-4">
                    {PROVIDERS.map((p) => {
                      const badg = getProviderInitialsAndColor(p.id);
                      const isActive = activeProvider === p.id;
                      return (
                        <button
                          key={p.id || 'auto'}
                          onClick={async () => {
                            await onProviderChange(p.id);
                            const all = await xibe.config.getAll();
                            setSummary(all);
                            setSection('summary');
                          }}
                          className={`flex items-center justify-between rounded-xl border p-5 text-left transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'border-xibe-brand-blue/50 bg-xibe-brand-blue/5 ring-1 ring-xibe-brand-blue/15 shadow-md shadow-xibe-brand-blue/5'
                              : 'border-xibe-border/60 hover:border-xibe-border-focus hover:bg-xibe-surface-hover/30'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`h-8.5 w-8.5 rounded-lg flex items-center justify-center border font-bold text-xs select-none shadow-sm shrink-0 ${badg.bg}`}>
                              {badg.text}
                            </span>
                            <div>
                              <div className={`text-xs font-semibold ${isActive ? 'text-xibe-brand-blue' : 'text-xibe-text'}`}>
                                {p.label}
                              </div>
                              <div className="text-[10px] text-xibe-text-dim mt-0.5 font-medium">
                                {p.id === '' ? 'Read environment' : `${p.id}`}
                              </div>
                            </div>
                          </div>
                          {isActive && (
                            <span className="h-5.5 w-5.5 rounded-full bg-xibe-brand-blue/10 flex items-center justify-center text-xibe-brand-blue">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section - API Key */}
              {section === 'apiKey' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="bg-xibe-brand-blue/5 border border-xibe-brand-blue/10 rounded-xl p-5 flex gap-3.5 text-xs text-xibe-text-secondary leading-relaxed">
                    <svg className="h-5 w-5 text-xibe-brand-blue shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <span className="font-semibold text-xibe-text">Secure Storage</span>: Credentials are saved strictly inside config files within your home folder (`~/.xibecode/`). They are only sent over encrypted SSL channels directly to the model endpoint.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-xibe-text-dim uppercase tracking-wider">Active Token Key</label>
                    <div className="font-mono text-xs text-xibe-text-secondary bg-xibe-surface-raised rounded-xl px-4.5 py-3.5 border border-xibe-border/40 select-all break-all font-medium">
                      {apiKey || 'Not set'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-xibe-text-dim uppercase tracking-wider">Set New Key</label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        placeholder="Paste credential token here..."
                        className={`${inputCls} pr-12`}
                        onChange={(e) => setApiKey(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && apiKey.length >= 10) {
                            await xibe.config.set('apiKey', apiKey);
                            const all = await xibe.config.getAll();
                            setSummary(all);
                            setSection('summary');
                          }
                        }}
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-xibe-text-dim hover:text-xibe-text transition-colors cursor-pointer"
                      >
                        {showKey ? (
                          <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2.5">
                    <button
                      onClick={async () => {
                        if (apiKey.length >= 10) {
                          await xibe.config.set('apiKey', apiKey);
                          const all = await xibe.config.getAll();
                          setSummary(all);
                          setSection('summary');
                        }
                      }}
                      className="rounded-xl bg-xibe-brand-blue px-6 py-3 text-xs font-semibold text-xibe-bg hover:bg-xibe-accent-hover transition-all duration-200 cursor-pointer shadow-md shadow-xibe-brand-blue/10 active:scale-98"
                    >
                      Save Key Value
                    </button>
                  </div>
                </div>
              )}

              {/* Section - Model */}
              {section === 'model' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between gap-4 text-xs bg-xibe-surface-raised/40 border border-xibe-border/50 rounded-xl px-5 py-4">
                    <span className="text-xibe-text-dim font-medium">Selected Model</span>
                    <span className="font-mono text-xs font-semibold text-xibe-brand-blue bg-xibe-brand-blue/5 border border-xibe-brand-blue/10 px-3 py-1 rounded-md">
                      {activeModel}
                    </span>
                  </div>

                  <div className="flex gap-3.5">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={modelFilter}
                        onChange={(e) => setModelFilter(e.target.value)}
                        placeholder="Search model registry..."
                        className={`${inputCls} pl-9.5 py-3`}
                      />
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-xibe-text-dim/40" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <button
                      onClick={fetchModels}
                      disabled={loadingModels}
                      className="shrink-0 flex items-center gap-2.5 rounded-xl bg-xibe-brand-blue px-5 py-3 text-xs font-semibold text-xibe-bg hover:bg-xibe-accent-hover disabled:opacity-50 transition-all cursor-pointer select-none active:scale-98"
                    >
                      {loadingModels ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-xibe-bg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Fetching...</span>
                        </>
                      ) : (
                        <>
                          <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2a8.001 8.001 0 11-21.21-3.89M9 11l3-3 3 3m-3-3v12" />
                          </svg>
                          <span>Fetch Models</span>
                        </>
                      )}
                    </button>
                  </div>

                  {models.length > 0 ? (
                    <div className="max-h-56 overflow-y-auto space-y-2 border border-xibe-border/60 rounded-xl p-3 bg-xibe-surface-raised/20">
                      {models
                        .filter((m) => m.toLowerCase().includes(modelFilter.toLowerCase()))
                        .map((m) => {
                          const isCurrent = m === activeModel;
                          return (
                            <button
                              key={m}
                              onClick={async () => {
                                await onModelChange(m);
                                const all = await xibe.config.getAll();
                                setSummary(all);
                                setSection('summary');
                              }}
                              className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-xs transition-all duration-150 cursor-pointer ${
                                isCurrent
                                  ? 'bg-xibe-brand-blue/5 border border-xibe-brand-blue/20 text-xibe-brand-blue font-semibold shadow-sm'
                                  : 'text-xibe-text-secondary hover:bg-xibe-surface-hover hover:text-xibe-text'
                              }`}
                            >
                              <span className="font-mono truncate">{m}</span>
                              {isCurrent && (
                                <svg className="h-4.5 w-4.5 text-xibe-brand-blue shrink-0 ml-2" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-xs text-xibe-text-dim border border-dashed border-xibe-border/40 rounded-xl">
                      No models cached. Query endpoint directory using "Fetch Models" trigger.
                    </div>
                  )}
                </div>
              )}

              {/* Section - Base URL */}
              {section === 'baseUrl' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-xibe-text-dim uppercase tracking-wider">Server Endpoint Url</label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="e.g. https://api.openai.com/v1"
                      className={`${inputCls} py-3`}
                    />
                  </div>

                  <div className="bg-xibe-surface-hover/50 border border-xibe-border-subtle rounded-xl p-5 space-y-4">
                    <h4 className="text-[10px] font-bold text-xibe-text-secondary uppercase tracking-wider">Host URL Presets</h4>
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        { label: 'Routing.run', url: 'https://api.routing.run/v1' },
                        { label: 'OpenAI Default', url: 'https://api.openai.com/v1' },
                        { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
                        { label: 'Local Ollama', url: 'http://localhost:11434/v1' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => setBaseUrl(preset.url)}
                          className="text-[10px] bg-xibe-surface border border-xibe-border-subtle text-xibe-text-secondary hover:text-xibe-text hover:border-xibe-border-focus px-3 py-2 rounded-lg transition-all cursor-pointer font-semibold"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2.5">
                    <button
                      onClick={async () => {
                        await xibe.config.set('baseUrl', baseUrl.trim().replace(/\/+$/, ''));
                        const all = await xibe.config.getAll();
                        setSummary(all);
                        setSection('summary');
                      }}
                      className="rounded-xl bg-xibe-brand-blue px-6 py-3 text-xs font-semibold text-xibe-bg hover:bg-xibe-accent-hover transition-all cursor-pointer shadow-md"
                    >
                      Save Settings
                    </button>
                  </div>
                </div>
              )}

              {/* Section - Wire Format */}
              {section === 'wireFormat' && (
                <div className="space-y-4.5 animate-fade-in">
                  {(['auto', 'openai', 'anthropic'] as const).map((f) => {
                    const isActive = wireFormat === f;
                    return (
                      <button
                        key={f}
                        onClick={async () => {
                          await xibe.config.set('requestFormat', f);
                          setWireFormatLocal(f);
                          const all = await xibe.config.getAll();
                          setSummary(all);
                          setSection('summary');
                        }}
                        className={`flex items-center gap-5 rounded-xl border p-5 text-left transition-all duration-200 cursor-pointer ${
                          isActive
                            ? 'border-xibe-brand-blue/50 bg-xibe-brand-blue/5 shadow-md shadow-xibe-brand-blue/5 ring-1 ring-xibe-brand-blue/10'
                            : 'border-xibe-border/60 hover:border-xibe-border-focus hover:bg-xibe-surface-hover/30'
                        }`}
                      >
                        <span className={`h-5.5 w-5.5 rounded-full border flex items-center justify-center shrink-0 ${isActive ? 'border-xibe-brand-blue bg-xibe-brand-blue/10 text-xibe-brand-blue' : 'border-xibe-border bg-xibe-surface-raised'}`}>
                          {isActive && <span className="h-2.5 w-2.5 rounded-full bg-xibe-brand-blue" />}
                        </span>
                        <div>
                          <div className={`text-xs font-bold ${isActive ? 'text-xibe-brand-blue' : 'text-xibe-text'}`}>
                            {f === 'auto' ? 'Auto Detect Schema' : f === 'openai' ? 'OpenAI Chat Completions Schema' : 'Anthropic Messages SDK Schema'}
                          </div>
                          <div className="text-[10px] text-xibe-text-dim mt-1 font-medium leading-relaxed">
                            {f === 'auto' ? 'Analyzes backend environment keys to formulate query schemas automatically.' : f === 'openai' ? 'Forces standard openai format. Compatible with local providers like Ollama / LMStudio.' : 'Forces standard anthropic payload structures.'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Section - Cost Mode */}
              {section === 'costMode' && (
                <div className="space-y-4.5 animate-fade-in">
                  {(['normal', 'economy'] as const).map((m) => {
                    const isActive = costMode === m;
                    return (
                      <button
                        key={m}
                        onClick={async () => {
                          await xibe.config.set('costMode', m);
                          setCostModeLocal(m);
                          const all = await xibe.config.getAll();
                          setSummary(all);
                          setSection('summary');
                        }}
                        className={`flex items-center gap-5 rounded-xl border p-5 text-left transition-all duration-200 cursor-pointer ${
                          isActive
                            ? 'border-xibe-brand-blue/50 bg-xibe-brand-blue/5 shadow-md shadow-xibe-brand-blue/5 ring-1 ring-xibe-brand-blue/10'
                            : 'border-xibe-border/60 hover:border-xibe-border-focus hover:bg-xibe-surface-hover/30'
                        }`}
                      >
                        <span className={`h-5.5 w-5.5 rounded-full border flex items-center justify-center shrink-0 ${isActive ? 'border-xibe-brand-blue bg-xibe-brand-blue/10' : 'border-xibe-border bg-xibe-surface-raised'}`}>
                          {isActive && <span className="h-2.5 w-2.5 rounded-full bg-xibe-brand-blue" />}
                        </span>
                        <div>
                          <div className={`text-xs font-bold ${isActive ? 'text-xibe-brand-blue' : 'text-xibe-text'} capitalize`}>
                            {m === 'normal' ? 'Standard (Focus Performance)' : 'Economy (Focus Savings)'}
                          </div>
                          <div className="text-[10px] text-xibe-text-dim mt-1 font-medium leading-relaxed">
                            {m === 'normal' ? 'Uses your primary selected LLM model for all agent coding steps.' : 'Routes requests through the cheaper economy model to reduce tokens usage.'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Section - Economy Model */}
              {section === 'economyModel' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-xibe-text-dim uppercase tracking-wider">Economy Model Tag</label>
                    <input
                      type="text"
                      value={economyModel}
                      onChange={(e) => setEconomyModel(e.target.value)}
                      placeholder="e.g. gpt-4o-mini"
                      className={`${inputCls} py-3`}
                    />
                  </div>

                  <div className="bg-xibe-surface-hover/50 border border-xibe-border-subtle rounded-xl p-5 space-y-4">
                    <h4 className="text-[10px] font-bold text-xibe-text-secondary uppercase tracking-wider">Quick Preset Tags</h4>
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        'gpt-4o-mini',
                        'claude-3-5-haiku-20241022',
                        'gemini-1.5-flash',
                        'meta-llama/llama-3-8b-instruct',
                      ].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setEconomyModel(preset)}
                          className="text-[10px] font-mono bg-xibe-surface border border-xibe-border-subtle text-xibe-text-secondary hover:text-xibe-text hover:border-xibe-border-focus px-3.5 py-2 rounded-lg transition-all cursor-pointer font-semibold"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2.5">
                    <button
                      onClick={async () => {
                        await xibe.config.set('economyModel', economyModel.trim());
                        const all = await xibe.config.getAll();
                        setSummary(all);
                        setSection('summary');
                      }}
                      className="rounded-xl bg-xibe-brand-blue px-6 py-3 text-xs font-semibold text-xibe-bg hover:bg-xibe-accent-hover transition-all cursor-pointer shadow-md"
                    >
                      Save Settings
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
