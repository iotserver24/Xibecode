import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Loader2, AlertCircle, MessageSquarePlus } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Attachment } from '../../stores/chatStore';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface TerminalProps {
  terminalNumber?: number;
  onAddToChat?: (attachment: Attachment) => void;
}

export interface TerminalHandle {
  getBufferContent: () => string;
}

// Note: xterm.js will be dynamically imported to avoid SSR issues
export const Terminal = forwardRef<TerminalHandle, TerminalProps>(({ terminalNumber = 1, onAddToChat }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    getBufferContent: () => {
      if (!xtermRef.current) return '';
      // Get all lines from the buffer
      const buffer = xtermRef.current.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          lines.push(line.translateToString(true));
        }
      }
      return lines.join('\n');
    }
  }));

  // Selection popup state
  const [selectionPopup, setSelectionPopup] = useState<{
    x: number;
    y: number;
    lineFrom: number;
    lineTo: number;
  } | null>(null);

  const handleAddSelectionToChat = useCallback(() => {
    if (!selectionPopup || !onAddToChat) return;

    // Get text content from selection (needs xterm ref, but we have text in selectionPopup logic or can get it from terminal)
    // Actually, we need the text. Let's assume xtermRef is available.
    const selection = xtermRef.current?.getSelection();

    if (selection) {
      onAddToChat({
        id: `term_sel_${Date.now()}`,
        type: 'terminal',
        content: selection,
        label: `Terminal ${terminalNumber} (L${selectionPopup.lineFrom}-L${selectionPopup.lineTo})`
      });
    }

    setSelectionPopup(null);
    // Clear the selection in xterm
    xtermRef.current?.clearSelection();
  }, [selectionPopup, onAddToChat, terminalNumber]);

  useEffect(() => {
    let terminal: any = null;
    let fitAddon: any = null;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let selectionDisposable: any = null;
    let dataDisposable: any = null;

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

        xtermRef.current = terminal;

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        terminal.open(terminalRef.current);
        fitAddon.fit();

        // Listen for selection changes to show popup
        selectionDisposable = terminal.onSelectionChange(() => {
          const selection = terminal.getSelection();
          if (selection && selection.trim().length > 0) {
            const selPos = terminal.getSelectionPosition();
            if (selPos && terminalRef.current) {
              const cellWidth = terminal.element?.querySelector('.xterm-char-measure-element')?.getBoundingClientRect()?.width || 8;
              const cellHeight = (terminal.element?.querySelector('.xterm-rows')?.getBoundingClientRect()?.height || 200) / terminal.rows;
              const containerRect = terminalRef.current.getBoundingClientRect();
              const xtermRect = terminal.element?.getBoundingClientRect();
              if (!xtermRect) return;

              // Position popup at the end of selection
              const endRow = selPos.end.y;
              const endCol = selPos.end.x;

              // Calculate pixel position relative to the terminal container
              const viewportOffset = terminal.buffer.active.viewportY;
              const visibleRow = endRow - viewportOffset;

              const popupX = (endCol * cellWidth) + (xtermRect.left - containerRect.left) + 12;
              const popupY = (visibleRow * cellHeight) + (xtermRect.top - containerRect.top) + cellHeight + 4;

              setSelectionPopup({
                x: Math.min(popupX, containerRect.width - 140),
                y: Math.min(popupY, containerRect.height - 36),
                lineFrom: selPos.start.y + 1,
                lineTo: selPos.end.y + 1,
              });
            }
          } else {
            setSelectionPopup(null);
          }
        });

        // Hide popup when user types (input clears selection)
        dataDisposable = terminal.onData(() => {
          setSelectionPopup(null);
        });

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
      selectionDisposable?.dispose();
      dataDisposable?.dispose();
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

      {/* Floating "Add to Chat" popup on text selection */}
      {selectionPopup && onAddToChat && (
        <button
          onClick={handleAddSelectionToChat}
          className="absolute z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium shadow-lg shadow-black/40 border border-indigo-500/30 transition-all animate-in fade-in duration-150"
          style={{
            left: selectionPopup.x,
            top: selectionPopup.y,
          }}
          title={`Add terminal ${terminalNumber} lines ${selectionPopup.lineFrom}-${selectionPopup.lineTo} to chat`}
        >
          <MessageSquarePlus size={12} />
          Add to Chat
        </button>
      )}
    </div>
  );
});
