import { useState, useEffect, useRef, useCallback } from 'react';

interface Props { onClose: () => void }
const xibe = (window as any).xibecode;

export default function WebPreview({ onClose }: Props) {
  const [url, setUrl] = useState('http://localhost:3000');
  const [previewUrl, setPreviewUrl] = useState('');
  const [serving, setServing] = useState(false);
  const [port, setPort] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const nav = useCallback(async (u: string) => {
    await xibe.preview.navigate(u);
    setPreviewUrl(u);
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      await xibe.preview.resize({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    }
  }, []);

  const serve = async () => {
    if (serving) { await xibe.preview.stop(); setServing(false); setPort(null); return; }
    const cwd = await xibe.app.getWorkingDir();
    const res = await xibe.preview.start(cwd, 3847);
    setPort(res.port); setServing(true);
    const addr = `http://127.0.0.1:${res.port}`;
    setUrl(addr); nav(addr);
  };

  useEffect(() => { return () => { xibe.preview.close(); }; }, []);
  useEffect(() => {
    const h = () => { if (ref.current && previewUrl) { const r = ref.current.getBoundingClientRect(); xibe.preview.resize({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }); } };
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h);
  }, [previewUrl]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-xibe-border-subtle bg-xibe-surface px-2.5 py-1.5">
        <button onClick={onClose} className="rounded-md p-1 text-xibe-text-dim hover:text-xibe-text hover:bg-xibe-surface-hover transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <button onClick={serve} className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-all ${serving ? 'bg-red-500/10 text-red-400 border border-red-400/15' : 'bg-xibe-accent-muted text-xibe-accent border border-xibe-accent/15'}`}>
          {serving ? `Stop :${port}` : 'Serve'}
        </button>
        <div className="flex flex-1 items-center gap-1.5 rounded-md border border-xibe-border-subtle bg-xibe-surface-raised px-2 py-1">
          <svg className="h-3 w-3 shrink-0 text-xibe-text-dim/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" /></svg>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') nav(url.trim()); }} placeholder="http://localhost:3000" className="flex-1 bg-transparent text-[11px] font-mono text-xibe-text-secondary placeholder-xibe-text-dim/25 focus:outline-none" />
          <button onClick={() => nav(url.trim())} className="text-xibe-text-dim/30 hover:text-xibe-accent transition-colors">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
          </button>
        </div>
      </div>
      <div ref={ref} className="flex-1 bg-white">
        {!previewUrl && (
          <div className="flex h-full items-center justify-center bg-xibe-bg">
            <div className="text-center animate-fade-in">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-xibe-surface-raised border border-xibe-border-subtle">
                <svg className="h-6 w-6 text-xibe-text-dim/20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582" /></svg>
              </div>
              <p className="text-xs text-xibe-text-dim">Enter a URL or serve local files</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
