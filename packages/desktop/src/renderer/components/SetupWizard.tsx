import { useState, useEffect } from 'react';

interface Props {
  onComplete: () => void;
  onClose: () => void;
}

type Step = 'pickProvider' | 'apiKey' | 'loadingModels' | 'pickModel' | 'done';

const xibe = (window as any).xibecode;

const PROVIDER_PRESETS = [
  { id: 'routingrun', label: 'Routing.run', tag: 'Recommended' },
  { id: 'zenllm', label: 'zenllm.org', tag: '200+ models' },
  { id: 'openai', label: 'OpenAI', tag: '' },
  { id: 'anthropic', label: 'Anthropic', tag: '' },
  { id: 'openrouter', label: 'OpenRouter', tag: '' },
  { id: 'deepseek', label: 'DeepSeek', tag: '' },
  { id: 'google', label: 'Google (Gemini)', tag: '' },
  { id: 'grok', label: 'Grok (xAI)', tag: '' },
  { id: 'groq', label: 'Groq', tag: '' },
  { id: 'kimi', label: 'Moonshot (Kimi)', tag: '' },
  { id: 'zai', label: 'Zhipu AI (z.ai)', tag: '' },
  { id: 'custom', label: 'Custom endpoint', tag: '' },
];

export default function SetupWizard({ onComplete, onClose }: Props) {
  const [step, setStep] = useState<Step>('pickProvider');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const selectProvider = async (id: string) => {
    setSelectedProvider(id);
    if (id === 'custom') {
      setStep('apiKey');
      return;
    }
    const providers = await xibe.config.getProviders();
    const cfg = providers.find((p: any) => p.id === id);
    if (cfg) {
      await xibe.config.set('provider', id);
      await xibe.config.set('baseUrl', cfg.baseUrl);
      await xibe.config.set('requestFormat', cfg.format);
    }
    setStep('apiKey');
  };

  const submitApiKey = async () => {
    if (apiKey.length < 10) { setError('API key seems too short. Paste the full key.'); return; }
    setError('');
    await xibe.config.set('apiKey', apiKey);
    if (selectedProvider === 'custom' && customBaseUrl) {
      await xibe.config.set('baseUrl', customBaseUrl.replace(/\/+$/, ''));
      if (!await xibe.config.getProvider()) {
        await xibe.config.set('provider', 'openai');
        await xibe.config.set('requestFormat', 'openai');
      }
    }
    setStep('loadingModels');
    try {
      const modelList = await xibe.config.fetchModels();
      if (modelList.length === 0) throw new Error('No models returned');
      setModels(modelList);
      setSelectedModelIdx(0);
      setStep('pickModel');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch models. You can set a model manually in Settings.');
      setStep('done');
    }
  };

  const pickModel = async (model: string) => {
    await xibe.config.set('model', model);
    setStep('done');
  };

  const finish = () => { onComplete(); };

  const inputCls = "w-full rounded-lg border border-xibe-border bg-xibe-surface-raised px-4 py-2.5 text-sm text-xibe-text placeholder-xibe-text-dim/40 focus:border-xibe-border-focus focus:ring-1 focus:ring-xibe-accent/30 focus:outline-none transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md">
      <div className="w-full max-w-md rounded-xl border border-xibe-border bg-xibe-surface shadow-lg animate-slide-up">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-xibe-text">Setup XibeCode</h2>
              <p className="text-xs text-xibe-text-dim mt-0.5">Configure your provider connection to get started</p>
            </div>
            <div className="flex gap-1">
              {['pickProvider', 'apiKey', 'loadingModels', 'pickModel', 'done'].map((s, i) => (
                <div key={s} className={`h-1 w-6 rounded-full transition-colors ${['pickProvider', 'apiKey'].includes(step) ? (i <= 1 ? 'bg-xibe-accent' : 'bg-xibe-border') : i <= ['pickProvider', 'apiKey', 'loadingModels', 'pickModel', 'done'].indexOf(step) ? 'bg-xibe-accent' : 'bg-xibe-border'}`} />
              ))}
            </div>
          </div>

          {step === 'pickProvider' && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {PROVIDER_PRESETS.map((p) => (
                <button key={p.id} onClick={() => selectProvider(p.id)} className="flex w-full items-center gap-3 rounded-lg border border-xibe-border-subtle px-3 py-2.5 text-left hover:border-xibe-accent/30 hover:bg-xibe-accent-subtle transition-all group">
                  <span className="text-sm font-medium text-xibe-text group-hover:text-xibe-accent">{p.label}</span>
                  {p.tag && <span className="ml-auto text-[10px] text-xibe-accent/60 bg-xibe-accent-muted rounded px-1.5 py-0.5">{p.tag}</span>}
                </button>
              ))}
            </div>
          )}

          {step === 'apiKey' && (
            <div className="space-y-3">
              {selectedProvider === 'custom' && (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-xibe-text-dim/50">Base URL</label>
                  <input type="text" value={customBaseUrl} onChange={(e) => setCustomBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className={inputCls} />
                </div>
              )}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-xibe-text-dim/50">API Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => { setApiKey(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') submitApiKey(); }} placeholder="sk-..." className={`${inputCls} pr-9`} autoFocus />
                  <button onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xibe-text-dim/40 hover:text-xibe-text-dim transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>
              </div>
              {error && <p className="text-xs text-xibe-error">{error}</p>}
              <button onClick={submitApiKey} className="w-full rounded-lg bg-xibe-accent py-2.5 text-sm font-medium text-xibe-bg hover:bg-xibe-accent-hover transition-colors">Continue</button>
            </div>
          )}

          {step === 'loadingModels' && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-xibe-accent border-t-transparent" />
                <p className="text-sm text-xibe-text-dim">Fetching models from provider...</p>
              </div>
            </div>
          )}

          {step === 'pickModel' && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <p className="text-xs text-xibe-text-dim mb-2">Select a model ({models.length} available)</p>
              {models.map((m, i) => (
                <button key={m} onClick={() => pickModel(m)} className="flex w-full items-center gap-2 rounded-lg border border-xibe-border-subtle px-3 py-2 text-left hover:border-xibe-accent/30 hover:bg-xibe-accent-subtle transition-all">
                  <span className="font-mono text-xs text-xibe-text">{m}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-xibe-brand-green/10">
                <svg className="h-6 w-6 text-xibe-brand-green" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-sm text-xibe-text mb-1">Setup complete</p>
              <p className="text-xs text-xibe-text-dim mb-4">You can change these settings anytime from the Settings panel.</p>
              {error && <p className="text-xs text-xibe-warning mb-3">{error}</p>}
              <button onClick={finish} className="rounded-lg bg-xibe-accent px-6 py-2.5 text-sm font-medium text-xibe-bg hover:bg-xibe-accent-hover transition-colors">Start Chatting</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
