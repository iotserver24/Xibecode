import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Note: xterm.js will be dynamically imported to avoid SSR issues
export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let terminal: any = null;
    let fitAddon: any = null;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const initTerminal = async () => {
      try {
        // Dynamic import of xterm
        const { Terminal: XTerm } = await import('xterm');
        const { FitAddon } = await import('xterm-addon-fit');
        const { WebLinksAddon } = await import('xterm-addon-web-links');

        // xterm CSS is imported via main.tsx

        if (!terminalRef.current) return;

        terminal = new XTerm({
          theme: {
            background: '#09090b', // zinc-950
            foreground: '#e4e4e7', // zinc-200
            cursor: '#6366f1', // indigo-500
            cursorAccent: '#09090b',
            selectionBackground: '#3f3f46', // zinc-700
            black: '#09090b',
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#eab308',
            blue: '#3b82f6',
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: '#f4f4f5',
            brightBlack: '#52525b',
            brightRed: '#f87171',
            brightGreen: '#4ade80',
            brightYellow: '#fde047',
            brightBlue: '#60a5fa',
            brightMagenta: '#c084fc',
            brightCyan: '#22d3ee',
            brightWhite: '#ffffff',
          },
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontSize: 13,
          lineHeight: 1.3,
          cursorBlink: true,
          cursorStyle: 'block',
          scrollback: 10000,
          allowTransparency: true,
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        terminal.open(terminalRef.current);
        fitAddon.fit();

        // Connect WebSocket for terminal
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        ws = new WebSocket(`${protocol}//${host}?mode=terminal`);

        ws.onopen = () => {
          terminal.write('\r\n\x1b[38;2;99;102;241m⚡ XibeCode Terminal\x1b[0m\r\n\r\n');
          terminal.write('\x1b[90mTerminal ready. (Connected to shell)\x1b[0m\r\n\r\n');

          // Request terminal creation
          ws?.send(JSON.stringify({ type: 'terminal:create', cwd: '.' }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'terminal:output') {
              terminal.write(data.data);
            } else if (data.type === 'terminal:created') {
              // terminal.write(`\x1b[90mShell started (PID: ${data.pid})\x1b[0m\r\n\r\n`);
            }
          } catch (e) {
            // Raw text output
            terminal.write(event.data);
          }
        };

        ws.onclose = () => {
          terminal.write('\r\n\x1b[90mTerminal disconnected.\x1b[0m\r\n');
        };

        // Send terminal input to WebSocket
        terminal.onData((data: string) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'terminal:input', data }));
          }
        });

        // Handle resize
        resizeObserver = new ResizeObserver(() => {
          if (!terminal) return;
          try {
            fitAddon?.fit();
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'terminal:resize',
                cols: terminal.cols,
                rows: terminal.rows,
              }));
            }
          } catch (e) {
            console.error('Terminal fit error:', e);
          }
        });

        resizeObserver.observe(terminalRef.current);
        setIsLoading(false);

      } catch (err: any) {
        console.error("Terminal initialization error:", err);
        setError(err.message || 'Failed to load terminal');
        setIsLoading(false);
      }
    };

    initTerminal();

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      terminal?.dispose();
      ws?.close();
    };
  }, []);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-red-400 gap-2 bg-zinc-900">
        <AlertCircle size={20} />
        <span className="text-sm">Failed to load terminal: {error}</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-zinc-950 relative overflow-hidden group">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-2 z-10 bg-zinc-900/50 backdrop-blur-sm">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-xs font-mono">Initializing Terminal...</span>
        </div>
      )}
      <div
        ref={terminalRef}
        className={cn("h-full w-full p-3 transition-opacity duration-300", isLoading ? 'opacity-0' : 'opacity-100')}
      />
    </div>
  );
}
