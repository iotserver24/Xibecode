import { useEffect, useRef, useState } from 'react';
import { useChatStore, ChatMessage, AgentMode } from '../../stores/chatStore';
import { useEditorStore } from '../../stores/editorStore';
import { createWebSocket, api } from '../../utils/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Bot, User, Terminal,
  ChevronDown, FileCode, Sparkles, Hash,
  Layout, Shield, Search, Zap, Check, AlertCircle,
  ArrowUp, Plus, Paperclip, X, Loader2,
  FileText, Play, Eye
} from 'lucide-react';
import { PlanQuestionsOverlay, type PlanQuestion } from '../PlanQuestions';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const COMMANDS = [
  { id: 'clear', name: '/clear', icon: <Zap size={14} />, desc: 'Clear chat messages' },
  { id: 'help', name: '/help', icon: <AlertCircle size={14} />, desc: 'Show available commands' },
  { id: 'diff', name: '/diff', icon: <FileCode size={14} />, desc: 'Show git diff' },
  { id: 'status', name: '/status', icon: <Hash size={14} />, desc: 'Show git status' },
  { id: 'test', name: '/test', icon: <Terminal size={14} />, desc: 'Run project tests' },
  { id: 'format', name: '/format', icon: <Sparkles size={14} />, desc: 'Format code in project' },
  { id: 'reset', name: '/reset', icon: <X size={14} />, desc: 'Reset chat session' },
  { id: 'files', name: '/files', icon: <Paperclip size={14} />, desc: 'List project files' },
];

const MODES: { id: AgentMode; name: string; icon: any; desc: string; color: string }[] = [
  { id: 'agent', name: 'Agent', icon: <Bot size={16} />, desc: 'Autonomous coding assistant', color: 'text-emerald-400' },
  { id: 'plan', name: 'Plan', icon: <Layout size={16} />, desc: 'Interactive planning with web research', color: 'text-orange-400' },
  { id: 'tester', name: 'Tester', icon: <Terminal size={16} />, desc: 'Testing and QA specialist', color: 'text-pink-400' },
  { id: 'debugger', name: 'Debugger', icon: <AlertCircle size={16} />, desc: 'Bug investigation expert', color: 'text-amber-400' },
  { id: 'security', name: 'Security', icon: <Shield size={16} />, desc: 'Security analysis', color: 'text-red-400' },
  { id: 'review', name: 'Reviewer', icon: <Check size={16} />, desc: 'Code review specialist', color: 'text-purple-400' },
  { id: 'architect', name: 'Architect', icon: <Layout size={16} />, desc: 'System design expert', color: 'text-violet-400' },
  { id: 'engineer', name: 'Engineer', icon: <Terminal size={16} />, desc: 'Implementation focused', color: 'text-green-400' },
  { id: 'seo', name: 'SEO', icon: <Search size={16} />, desc: 'SEO optimization', color: 'text-sky-400' },
  { id: 'product', name: 'Product', icon: <Sparkles size={16} />, desc: 'Product strategy', color: 'text-orange-400' },
  { id: 'data', name: 'Data', icon: <Hash size={16} />, desc: 'Data analysis', color: 'text-teal-400' },
  { id: 'researcher', name: 'Researcher', icon: <Search size={16} />, desc: 'Deep research mode', color: 'text-rose-400' },
];

interface ChatPanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  width?: number;
}

type PopupType = 'slash' | 'files' | 'modes' | null;

export function ChatPanel({ isCollapsed, onToggleCollapse: _onToggleCollapse, width }: ChatPanelProps) {
  const {
    messages, isProcessing, isConnected, currentMode, streamingContent,
    setWebSocket, setConnected, addMessage, updateLastMessage, setProcessing, setCurrentMode,
    setStreamingContent, appendStreamingContent, finalizeStreamingMessage,
    sendMessage, clearMessages,
    attachments, removeAttachment,
  } = useChatStore();

  const { openFile } = useEditorStore();

  const [inputValue, setInputValue] = useState('');
  const [popup, setPopup] = useState<PopupType>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [thinkingText, setThinkingText] = useState<string | null>(null);

  // Plan mode state
  const [planQuestions, setPlanQuestions] = useState<PlanQuestion[] | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [planPath, setPlanPath] = useState<string>('implementations.md');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket connection
  useEffect(() => {
    const socket = createWebSocket();
    wsRef.current = socket;
    socket.onopen = () => { setConnected(true); setWebSocket(socket); };
    socket.onclose = () => { setConnected(false); setWebSocket(null); };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };
    return () => { socket.close(); };
  }, []);

  const handleWSMessage = (data: any) => {
    switch (data.type) {
      case 'user_message':
        if (data.source === 'tui') addMessage({ role: 'user', content: data.data.content, source: 'tui' });
        setProcessing(true);
        setThinkingText('Thinking...');
        break;
      case 'thinking':
        setThinkingText(data.data?.text || 'Thinking...');
        break;
      case 'stream_start':
        setStreamingContent('');
        setThinkingText(null);
        break;
      case 'stream_text': appendStreamingContent(data.data?.text || ''); break;
      case 'stream_end':
        finalizeStreamingMessage();
        setProcessing(false);
        setThinkingText(null);
        break;
      case 'assistant_message':
        addMessage({ role: 'assistant', content: data.data.content });
        setProcessing(false);
        setThinkingText(null);
        break;
      case 'tool_call':
        addMessage({ role: 'tool', content: data.data.name, toolName: data.data.name, toolStatus: 'running' });
        setThinkingText(null);
        break;
      case 'tool_result': {
        const success = data.data?.success !== false;
        updateLastMessage(success ? 'success' : 'error');
        break;
      }
      case 'error':
        addMessage({ role: 'system', content: `Error: ${data.data?.error || data.error}` });
        setProcessing(false);
        setThinkingText(null);
        break;
      case 'history':
        data.data?.messages?.forEach((msg: any) => {
          if (msg.role === 'user') addMessage({ role: 'user', content: msg.content, source: msg.source });
          else if (msg.role === 'assistant') addMessage({ role: 'assistant', content: msg.content });
          else if (msg.role === 'tool') addMessage({ role: 'tool', content: msg.toolName || msg.content, toolName: msg.toolName, toolStatus: msg.toolStatus });
        });
        break;
      case 'plan_questions':
        if (data.data?.questions) {
          setPlanQuestions(data.data.questions);
        }
        break;
      case 'plan_ready':
        if (data.data?.planContent) {
          setPlanContent(data.data.planContent);
          setPlanPath(data.data.planPath || 'implementations.md');
        }
        break;
      case 'clear': clearMessages(); setPlanContent(null); setPlanQuestions(null); break;
    }
  };

  // Smart auto-scroll: only scroll to bottom if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  // Detect when user scrolls up manually
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // If user is within 100px of bottom, consider them "at bottom"
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      userScrolledUpRef.current = !isNearBottom;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset scroll lock when processing finishes (new message complete)
  useEffect(() => {
    if (!isProcessing && !streamingContent) {
      // Small delay then check if we should snap to bottom
      setTimeout(() => {
        const container = messagesContainerRef.current;
        if (container) {
          const { scrollTop, scrollHeight, clientHeight } = container;
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
          if (isNearBottom) {
            userScrolledUpRef.current = false;
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }, 100);
    }
  }, [isProcessing, streamingContent]);



  const loadFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data.files || []);
    } catch { setFiles([]); }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    const lastChar = value.slice(-1);
    const beforeLast = value.slice(0, -1);

    if (lastChar === '/' && (beforeLast === '' || beforeLast.endsWith(' '))) {
      setPopup('slash'); setSelectedIndex(0); return;
    }
    if (lastChar === '@' && (beforeLast === '' || beforeLast.endsWith(' '))) {
      setPopup('files'); setSelectedIndex(0); loadFiles(); return;
    }
    if (popup === 'slash') {
      const match = value.match(/\/[\w]*$/);
      if (!match) setPopup(null);
    } else if (popup === 'files') {
      const match = value.match(/@[\w.\-/]*$/);
      if (!match) setPopup(null);
    }
  };

  const getFilteredSlashItems = () => {
    const match = inputValue.match(/\/(\w*)$/);
    const filter = match ? match[1].toLowerCase() : '';
    const commands = COMMANDS.filter(c => c.name.toLowerCase().includes(filter) || c.desc.toLowerCase().includes(filter));
    const modes = MODES.filter(m => m.name.toLowerCase().includes(filter) || m.id.toLowerCase().includes(filter));
    return { commands, modes };
  };

  const getFilteredFiles = () => {
    const match = inputValue.match(/@([\w.\-/]*)$/);
    const filter = match ? match[1].toLowerCase() : '';
    return files.filter(f => f.toLowerCase().includes(filter)).slice(0, 15);
  };

  const executeCommand = async (cmdId: string) => {
    setInputValue(''); setPopup(null);
    switch (cmdId) {
      case 'clear':
        clearMessages();
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'message', content: '/clear' }));
        break;
      case 'help':
        addMessage({ role: 'assistant', content: `## Available Commands\n\n| Command | Description |\n|---------|-------------|\n| **/clear** | Clear chat messages |\n| **/help** | Show this help |\n| **/diff** | Show git diff |\n| **/status** | Show git status |\n| **/test** | Run project tests |\n| **/format** | Format code |\n| **/reset** | Reset session |\n| **/files** | List project files |` });
        break;
      case 'reset':
        clearMessages(); setCurrentMode('agent');
        addMessage({ role: 'system', content: 'Session reset.' });
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'message', content: '/clear' }));
        break;
      default:
        if (['diff', 'status', 'files'].includes(cmdId)) {
          setProcessing(true);
          try {
            const res = await fetch(`/api/${cmdId === 'files' ? 'files' : 'git/' + cmdId}`);
            const data = await res.json();
            if (data.success) {
              let content = '';
              if (cmdId === 'diff') content = data.diff ? '```diff\n' + data.diff + '\n```' : 'No changes.';
              else if (cmdId === 'status') content = `Branch: ${data.branch}\nStatus: ${data.clean ? 'Clean' : 'Dirty'}`;
              else if (cmdId === 'files') content = '```\n' + data.files.slice(0, 50).join('\n') + '\n```';
              addMessage({ role: 'assistant', content });
            } else {
              addMessage({ role: 'system', content: `Failed: ${data.error || 'Unknown error'}` });
            }
          } catch { addMessage({ role: 'system', content: 'Network error' }); }
          setProcessing(false);
        } else {
          addMessage({ role: 'system', content: `Executing ${cmdId}...` });
          if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'message', content: '/' + cmdId }));
        }
    }
  };

  const switchMode = (modeId: AgentMode) => {
    setInputValue(''); setPopup(null); setShowModeSelector(false); setCurrentMode(modeId);
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'message', content: '/mode ' + modeId }));
  };

  const selectFile = (file: string) => {
    setInputValue(inputValue.replace(/@[\w.\-/]*$/, '@' + file + ' ')); setPopup(null); inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (popup) {
      const { commands, modes } = getFilteredSlashItems();
      const filteredFiles = getFilteredFiles();
      const totalItems = popup === 'slash' ? commands.length + modes.length : filteredFiles.length;

      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, totalItems - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (popup === 'slash') {
          if (selectedIndex < commands.length) executeCommand(commands[selectedIndex].id);
          else switchMode(modes[selectedIndex - commands.length].id);
        } else if (popup === 'files' && filteredFiles[selectedIndex]) selectFile(filteredFiles[selectedIndex]);
      } else if (e.key === 'Escape') setPopup(null);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); handleSend();
    }
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue.trim());
    setInputValue('');
    if (!isProcessing) {
      setThinkingText('Thinking...');
    }
  };

  if (isCollapsed) return null;

  const { commands, modes } = getFilteredSlashItems();
  const filteredFiles = getFilteredFiles();
  const currentModeData = MODES.find(m => m.id === currentMode);

  const handlePlanQuestionsSubmit = (answers: Record<string, string | string[]>) => {
    // Format answers and send back to the AI
    const lines = Object.entries(answers).map(([id, val]) => {
      const q = planQuestions?.find(q => q.id === id);
      const qText = q?.question || id;
      const answerText = Array.isArray(val) ? val.join(', ') : val;
      return `- ${qText}: **${answerText}**`;
    });
    const message = `Here are my answers:\n${lines.join('\n')}`;
    sendMessage(message);
    setPlanQuestions(null);
  };

  return (
    <div
      className="flex flex-col bg-[#0a0a0a] relative border-r border-zinc-800/40"
      style={{ width: width || 380, minWidth: 280 }}
    >
      {/* Plan Questions Overlay */}
      {planQuestions && planQuestions.length > 0 && (
        <PlanQuestionsOverlay
          questions={planQuestions}
          onSubmit={handlePlanQuestionsSubmit}
          onSkip={() => {
            sendMessage('Skip questions - proceed with your best judgment.');
            setPlanQuestions(null);
          }}
        />
      )}

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !streamingContent && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            {/* XibeCode branded welcome */}
            <div className="mb-5">
              <pre className="text-[6px] leading-[7px] font-mono select-none" style={{
                background: 'linear-gradient(90deg, #5995eb, #e06c75)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>{`██╗  ██╗██╗██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ███████╗
╚██╗██╔╝██║██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ╚███╔╝ ██║██████╔╝█████╗  ██║     ██║   ██║██║  ██║█████╗
 ██╔██╗ ██║██╔══██╗██╔══╝  ██║     ██║   ██║██╔══██╗██╔══╝
██╔╝ ██╗██║██████╔╝███████╗╚██████╗╚██████╔╝██████╔╝███████╗
╚═╝  ╚═╝╚═╝╚═════╝ ╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝`}</pre>
            </div>
            <h2 className="text-base font-semibold text-zinc-200 mb-1">What do you want to build?</h2>
            <p className="text-[10px] text-zinc-600 mb-1">AI-powered autonomous coding assistant</p>
            <p className="text-xs text-zinc-500 max-w-[220px] leading-relaxed mb-6">
              Ask me anything. I can help you write, debug, test, and deploy code.
            </p>
            <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
              {[
                { key: '/', desc: 'Commands' },
                { key: '@', desc: 'Files & Context' },
                { key: 'Enter', desc: 'Send Message' }
              ].map(hint => (
                <div key={hint.key} className="flex items-center justify-between text-[11px] text-zinc-500 px-2.5 py-1.5 rounded-md bg-zinc-900/50 border border-zinc-800/50">
                  <span>{hint.desc}</span>
                  <kbd className="font-mono text-zinc-400 text-[10px] bg-zinc-800 px-1 py-0.5 rounded border border-zinc-700/50">{hint.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}

        {/* Thinking / Loading indicator */}
        {isProcessing && !streamingContent && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot size={13} className="text-zinc-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-zinc-500 mb-1">Assistant</div>
              <div className="flex items-center gap-2.5">
                <Loader2 size={14} className="text-zinc-400 animate-spin" />
                <span className="text-[12px] text-zinc-500">{thinkingText || 'Thinking...'}</span>
                <span className="flex gap-1 ml-1">
                  <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Streaming content */}
        {streamingContent && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot size={13} className="text-zinc-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-zinc-500 mb-1 flex items-center gap-1.5">
                Assistant <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-[13px] text-zinc-300 leading-relaxed">
                <div className="markdown-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '')
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{ margin: 0, borderRadius: '0.375rem', fontSize: '0.75rem', background: '#111111' }}
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>{children}</code>
                        )
                      }
                    }}
                  >
                    {streamingContent}
                  </ReactMarkdown>
                </div>
                <span className="inline-block w-1 h-3.5 bg-zinc-400 ml-0.5 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {/* Inline Plan Preview Card */}
        {planContent && (
          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
            {/* Card header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900">
              <FileText size={13} className="text-orange-400" />
              <span className="text-[11px] font-mono text-zinc-400">{planPath}</span>
              <div className="flex-1" />
            </div>

            {/* Rendered plan preview (truncated) */}
            <div className="px-3 py-3 max-h-[280px] overflow-hidden relative">
              <div className="text-[12px] text-zinc-300 leading-relaxed markdown-content plan-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {planContent.split('\n').slice(0, 30).join('\n')}
                </ReactMarkdown>
              </div>
              {/* Fade out gradient */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-900/80 to-transparent pointer-events-none" />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between px-3 py-2.5 border-t border-zinc-800/60 bg-zinc-900/50">
              <button
                onClick={async () => {
                  try {
                    const result = await api.files.read(planPath);
                    if (result.success && result.content !== undefined) {
                      openFile({ path: planPath, content: result.content });
                    }
                  } catch { /* ignore */ }
                }}
                className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors font-medium"
              >
                <Eye size={13} />
                View Plan
              </button>
              <button
                onClick={() => {
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'message', content: '/mode agent' }));
                    setTimeout(() => {
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                          type: 'message',
                          content: 'Execute the plan in implementations.md. Work through each task, check off completed items by changing [ ] to [x]. When all tasks are done, delete implementations.md.'
                        }));
                      }
                    }, 500);
                  }
                  setPlanContent(null);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-semibold transition-colors"
              >
                <Play size={12} />
                Build
                <span className="text-orange-200/50 text-[9px] font-normal ml-0.5">Ctrl+⏎</span>
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - v0 style */}
      <div className="px-3 pb-3 relative">
        {/* Popup */}
        {popup && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto z-50">
            {(popup === 'slash' ? commands : []).map((cmd, i) => (
              <div key={cmd.id} onClick={() => executeCommand(cmd.id)} className={cn("flex items-center gap-3 px-3 py-2 cursor-pointer text-sm", i === selectedIndex ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200")}>
                <div className="text-zinc-500">{cmd.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{cmd.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">{cmd.desc}</div>
                </div>
              </div>
            ))}
            {(popup === 'slash' ? modes : []).map((mode, i) => (
              <div key={mode.id} onClick={() => switchMode(mode.id)} className={cn("flex items-center gap-3 px-3 py-2 cursor-pointer", i + commands.length === selectedIndex ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200")}>
                <div className={cn(mode.color)}>{mode.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{mode.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">{mode.desc}</div>
                </div>
              </div>
            ))}
            {(popup === 'files' ? filteredFiles : []).map((file, i) => (
              <div key={file} onClick={() => selectFile(file)} className={cn("flex items-center gap-3 px-3 py-2 cursor-pointer", i === selectedIndex ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200")}>
                <FileCode size={14} className="text-zinc-500" />
                <div className="text-sm truncate">{file}</div>
              </div>
            ))}
          </div>
        )}

        {/* Mode selector dropdown */}
        {showModeSelector && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 p-2">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 py-1 mb-1">Select Mode</div>
            <div className="grid grid-cols-2 gap-1">
              {MODES.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => switchMode(mode.id)}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg text-left transition-colors",
                    currentMode === mode.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50"
                  )}
                >
                  <span className={cn(mode.color, "flex-shrink-0")}>{mode.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{mode.name}</div>
                    <div className="text-[9px] text-zinc-600 truncate">{mode.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input box - v0 style with rounded container */}
        {/* Input box - v0 style with rounded container */}
        <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 focus-within:border-zinc-700 transition-colors">

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800 text-zinc-300 text-[11px] border border-zinc-700/50 group">
                  <Terminal size={12} className="text-zinc-500" />
                  <span className="max-w-[150px] truncate">{att.label}</span>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="ml-0.5 text-zinc-500 hover:text-zinc-300 opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up..."
            className="w-full bg-transparent border-none px-3.5 pt-3 pb-1 min-h-[44px] max-h-[180px] resize-none focus:ring-0 focus:outline-none text-[13px] text-zinc-200 placeholder-zinc-600"
            rows={1}
            disabled={!isConnected}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              <button
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="New Chat"
                onClick={() => {
                  clearMessages();
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'message', content: '/clear' }));
                  }
                }}
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setShowModeSelector(!showModeSelector)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors text-xs"
              >
                <span className={cn(currentModeData?.color, "flex-shrink-0")}>{currentModeData?.icon}</span>
                <span className="font-medium text-zinc-400">{currentModeData?.name}</span>
                <ChevronDown size={10} className="text-zinc-600" />
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || !isConnected}
              className="p-1.5 rounded-lg bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-20 disabled:bg-zinc-700 disabled:text-zinc-500 transition-all"
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Connection status */}
        {!isConnected && (
          <div className="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-amber-500/80">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Connecting...
          </div>
        )}
      </div>
    </div>
  );
}

// Map tool names to descriptive icons and labels
const TOOL_ICONS: Record<string, { icon: string; label: string }> = {
  read_file: { icon: '📄', label: 'Read' },
  write_file: { icon: '✏️', label: 'Write' },
  edit_file: { icon: '🔧', label: 'Edit' },
  edit_lines: { icon: '🔧', label: 'Edit Lines' },
  verified_edit: { icon: '✅', label: 'Verified Edit' },
  list_directory: { icon: '📂', label: 'List Dir' },
  search_code: { icon: '🔍', label: 'Search' },
  run_command: { icon: '💻', label: 'Run' },
  web_search: { icon: '🌐', label: 'Web Search' },
  fetch_url: { icon: '🔗', label: 'Fetch URL' },
  get_git_status: { icon: '📊', label: 'Git Status' },
  git_diff: { icon: '📝', label: 'Git Diff' },
  run_tests: { icon: '🧪', label: 'Run Tests' },
  delete_file: { icon: '🗑️', label: 'Delete' },
  create_directory: { icon: '📁', label: 'Create Dir' },
};

function MessageItem({ message }: { message: ChatMessage }) {
  if (message.role === 'tool') {
    const toolInfo = TOOL_ICONS[message.toolName || ''] || { icon: '🔧', label: message.toolName || 'Tool' };
    const isRunning = message.toolStatus === 'running';
    const isSuccess = message.toolStatus === 'success';
    const isError = message.toolStatus === 'error';

    return (
      <div className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[11px] transition-all",
        isRunning ? "bg-amber-500/5 border border-amber-500/20" :
          isSuccess ? "bg-emerald-500/5 border border-emerald-500/10" :
            isError ? "bg-red-500/5 border border-red-500/10" :
              "bg-zinc-800/30 border border-zinc-800/30"
      )}>
        <span className="text-sm flex-shrink-0">{toolInfo.icon}</span>
        <span className={cn(
          "font-medium flex-1 truncate",
          isRunning ? "text-amber-400" :
            isSuccess ? "text-zinc-400" :
              isError ? "text-red-400" : "text-zinc-500"
        )}>
          {toolInfo.label}
          {message.toolName && toolInfo.label !== message.toolName && (
            <span className="text-zinc-600 font-normal ml-1.5 font-mono text-[10px]">{message.toolName}</span>
          )}
        </span>
        <span className={cn(
          "flex items-center gap-1 flex-shrink-0",
          isRunning ? "text-amber-500" :
            isSuccess ? "text-emerald-500" :
              isError ? "text-red-400" : "text-zinc-600"
        )}>
          {isRunning && <Loader2 size={10} className="animate-spin" />}
          {isSuccess && <Check size={10} />}
          {isError && <AlertCircle size={10} />}
          <span className="text-[10px]">
            {isRunning ? 'running' : isSuccess ? 'done' : isError ? 'failed' : message.toolStatus}
          </span>
        </span>
      </div>
    );
  }

  if (message.role === 'system') {
    return (
      <div className="flex items-center gap-2 py-1.5 text-[11px] text-zinc-500">
        <AlertCircle size={12} className="flex-shrink-0" />
        <span>{message.content}</span>
      </div>
    );
  }

  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex gap-3">
        <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700/50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={13} className="text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-medium text-zinc-500 mb-1 flex items-center gap-1.5">
            You
            {message.source === 'tui' && <span className="text-[9px] bg-zinc-800 px-1 rounded text-zinc-500">TUI</span>}
          </div>

          {/* Render Context Chips if present */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800/50 text-zinc-400 text-[10px] border border-zinc-700/50 select-none">
                  <Terminal size={10} className="text-zinc-500" />
                  <span className="max-w-[200px] truncate">{att.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700/50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot size={13} className="text-zinc-300" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium text-zinc-500 mb-1">Assistant</div>
        <div className="text-[13px] text-zinc-300 leading-relaxed">
          <div className="markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '')
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{ margin: '0.75rem 0', borderRadius: '0.375rem', fontSize: '0.75rem', background: '#111111', border: '1px solid #1f1f1f' }}
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>{children}</code>
                  )
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
