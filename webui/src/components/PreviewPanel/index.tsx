import { useState, useRef, useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { RefreshCw, ExternalLink, Globe, AlertCircle } from 'lucide-react';

export function PreviewPanel() {
  const { previewUrl, setPreviewUrl } = useUIStore();
  const [urlInput, setUrlInput] = useState(previewUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleNavigate = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      let url = urlInput.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
      }
      setPreviewUrl(url);
      setUrlInput(url);
      setIsLoading(true);
      setHasError(false);
      if (iframeRef.current) {
        iframeRef.current.src = url;
      }
    },
    [urlInput, setPreviewUrl],
  );

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    if (iframeRef.current) {
      iframeRef.current.src = previewUrl;
    }
  }, [previewUrl]);

  const handleOpenExternal = useCallback(() => {
    window.open(previewUrl, '_blank');
  }, [previewUrl]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0c]">
      {/* URL Bar */}
      <div className="h-10 border-b border-zinc-800/60 flex items-center px-2 gap-2 bg-[#111111] flex-shrink-0">
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0"
          title="Refresh"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>

        <form onSubmit={handleNavigate} className="flex-1 flex items-center">
          <div className="flex-1 flex items-center bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1 gap-2 focus-within:border-zinc-600 transition-colors">
            <Globe size={12} className="text-zinc-500 flex-shrink-0" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNavigate();
              }}
              className="flex-1 bg-transparent text-xs text-zinc-300 outline-none placeholder-zinc-600"
              placeholder="http://localhost:3000"
              spellCheck={false}
            />
          </div>
        </form>

        <button
          onClick={handleOpenExternal}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0"
          title="Open in browser"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 relative bg-white">
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0c0c0c] z-10">
            <AlertCircle size={48} className="text-zinc-600 mb-4" />
            <p className="text-sm text-zinc-400 mb-1">Unable to load preview</p>
            <p className="text-xs text-zinc-600 mb-4">
              Make sure a dev server is running at{' '}
              <span className="text-zinc-400 font-mono">{previewUrl}</span>
            </p>
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-md transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={previewUrl}
          className="w-full h-full border-0"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      </div>
    </div>
  );
}
