"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Bot, ArrowUp, Trash2, Maximize2, Copy, Check, ThumbsUp, ThumbsDown, Loader2, Search } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Helper component for Code Block Copy
const CopyButton = ({ text, className = "", label = "" }: { text: string, className?: string, label?: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className={`p-1 hover:bg-zinc-700 rounded transition-colors ${className}`}
            title="Copy"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {label && <span className="ml-1">{copied ? "Copied!" : label}</span>}
        </button>
    );
};

export function AIChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: string; content: string; searchQuery?: string; sources?: { title: string; url: string }[] }[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const barInputRef = useRef<HTMLTextAreaElement>(null);
    const sidebarInputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isOpen]);

    // Handle Ctrl+I shortcut to focus floating bar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                e.preventDefault();
                if (!isOpen) {
                    barInputRef.current?.focus();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Focus sidebar input when sidebar opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => sidebarInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Auto-resize textarea
    const adjustHeight = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px'; // Limit to ~10 lines
    };

    useEffect(() => {
        // Adjust for sidebar
        adjustHeight(sidebarInputRef.current);
    }, [input]);

    const sendMessage = async (messageText: string) => {
        if (!messageText.trim() || loading) return;

        const userMsg = { role: "user", content: messageText };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setLoading(true);
        setIsFocused(false);

        // Reset heights
        if (barInputRef.current) barInputRef.current.style.height = 'auto';
        if (sidebarInputRef.current) sidebarInputRef.current.style.height = 'auto';

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [...messages, userMsg] }),
            });

            if (!response.body) throw new Error("No response body");

            // Capture search query and sources from headers
            const searchQuery = response.headers.get("X-Search-Term")
                ? decodeURIComponent(response.headers.get("X-Search-Term")!)
                : undefined;

            let sources: { title: string; url: string }[] = [];
            const sourcesHeader = response.headers.get("X-Sources");
            if (sourcesHeader) {
                try {
                    sources = JSON.parse(sourcesHeader);
                } catch (e) {
                    console.error("Failed to parse sources header", e);
                }
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiMsg = { role: "assistant", content: "", searchQuery, sources };

            setMessages((prev) => [...prev, aiMsg]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                aiMsg.content += chunk;
                setMessages((prev) => {
                    const newHistory = [...prev];
                    newHistory[newHistory.length - 1] = { ...aiMsg };
                    return newHistory;
                });
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        } catch (err) {
            console.error(err);
            setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
        } finally {
            setLoading(false);
            setTimeout(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }, 100);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, source: 'bar' | 'sidebar') => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!input.trim()) return;
            if (source === 'bar') setIsOpen(true);
            sendMessage(input);
        }
    };

    const clearChat = () => {
        setMessages([]);
        setIsOpen(false);
        setInput("");
    };

    return (
        <>
            {/* 1. Floating Action Bar (Orange Style) */}
            <div
                suppressHydrationWarning
                className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[40] transition-all duration-500 transform 
        ${isOpen ? 'translate-y-[150%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}
        ${isFocused || input.length > 0 ? 'w-full max-w-2xl px-4' : 'w-auto'}`}
            >
                <div className="relative group flex justify-center" suppressHydrationWarning>
                    {/* Dark container with Orange Border */}
                    <div
                        suppressHydrationWarning
                        className={`relative flex items-center gap-2 p-1.5 bg-black border border-orange-500/50 rounded-full shadow-2xl shadow-orange-500/10 cursor-text transition-all duration-500 ease-in-out h-[52px]
                ${isFocused || input.length > 0 ? 'w-full max-w-2xl rounded-[2rem] px-2' : 'w-[340px]'}`}
                        onClick={() => barInputRef.current?.focus()}
                    >
                        <textarea
                            ref={barInputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, 'bar')}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                            placeholder={messages.length > 0 ? "Continue..." : "Ask a question..."}
                            className={`bg-transparent text-base text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none no-scrollbar transition-all whitespace-nowrap overflow-x-auto overflow-y-hidden h-full py-2
                    ${isFocused || input.length > 0 ? 'flex-1 px-4' : 'w-full pl-5'}`}
                            rows={1}
                        />

                        {/* Collapsed State: Ctrl+I Hint */}
                        {(!isFocused && input.length === 0) && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 pr-2 pointer-events-none">
                                <span className="text-[10px] text-zinc-600 font-medium font-mono">Ctrl+I</span>
                                <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                    <ArrowUp className="w-4 h-4 text-orange-200" />
                                </div>
                            </div>
                        )}

                        {/* Expanded State: Send Button - Always visible on right */}
                        {(isFocused || input.length > 0) && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsOpen(true);
                                    sendMessage(input);
                                }}
                                disabled={!input.trim()}
                                className="flex-none p-2 mr-1 bg-orange-950/50 hover:bg-orange-900 border border-orange-800 text-orange-200 rounded-full transition-colors disabled:opacity-0 disabled:cursor-not-allowed"
                            >
                                <ArrowUp className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 2. Right Sidebar Drawer */}
            <div
                suppressHydrationWarning
                className={`fixed inset-y-4 right-4 z-[50] w-[450px] max-w-[calc(100vw-32px)]
          bg-zinc-950/95 backdrop-blur-md
          border border-zinc-800 rounded-2xl shadow-2xl
          transform transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          flex flex-col
          ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}
            >
                {/* Header */}
                <div
                    suppressHydrationWarning
                    className="flex-none p-4 flex items-center justify-between border-b border-zinc-800/50"
                >
                    <div className="flex items-center gap-2" suppressHydrationWarning>
                        <Sparkles className="w-4 h-4 text-orange-500" />
                        <span className="font-medium text-zinc-200 text-sm">Assistant</span>
                    </div>
                    <div className="flex items-center gap-1" suppressHydrationWarning>
                        <button className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded-md hover:bg-zinc-800" title="Expand">
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={clearChat} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded-md hover:bg-zinc-800" title="Clear Chat">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded-md hover:bg-zinc-800"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6" suppressHydrationWarning>
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4" suppressHydrationWarning>
                            <h4 className="font-semibold text-zinc-200 mb-2">How can I help?</h4>
                            <p className="text-sm text-zinc-500 max-w-[250px]">
                                Ask me about configuration, installation, or specific features.
                            </p>
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                            {m.role === "assistant" && (
                                <div className="flex flex-col gap-1 mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center text-orange-500">
                                            <Sparkles className="w-3 h-3" />
                                        </div>
                                        <span className="text-xs font-medium text-orange-500">Assistant</span>
                                    </div>

                                    {/* Search Status / Sources Indicator */}
                                    {(m.searchQuery || (m.sources && m.sources.length > 0)) && (
                                        <div className="flex flex-col gap-1 ml-1 mt-1 mb-2 text-xs text-zinc-500">
                                            {/* Query */}
                                            {m.searchQuery && (
                                                <div className="flex items-center gap-2">
                                                    <Search className="w-3 h-3" />
                                                    <span>Searching for <span className="text-zinc-400">"{m.searchQuery}"</span></span>
                                                </div>
                                            )}

                                            {/* Sources List - Vertical with arrows */}
                                            {m.sources && m.sources.length > 0 && m.sources.map((source, idx) => (
                                                <div key={idx} className="flex items-center gap-1.5">
                                                    <span className="text-zinc-600">Referring →</span>
                                                    <a
                                                        href={source.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-zinc-400 hover:text-orange-400 transition-colors underline underline-offset-2"
                                                    >
                                                        {source.title}
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div
                                className={`max-w-[90%] text-sm leading-relaxed overflow-hidden
                ${m.role === "user"
                                        ? "bg-zinc-800 text-zinc-100 px-3 py-2 rounded-2xl rounded-tr-sm"
                                        : "text-zinc-300"
                                    }`}
                            >
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                        ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
                                        ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>,
                                        li: ({ children }) => <li className="mb-0.5">{children}</li>,
                                        h1: ({ children }) => <h1 className="font-bold text-lg mb-2 mt-4">{children}</h1>,
                                        h2: ({ children }) => <h2 className="font-bold text-base mb-2 mt-3">{children}</h2>,
                                        h3: ({ children }) => <h3 className="font-bold text-sm mb-1 mt-2">{children}</h3>,
                                        blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-600 pl-3 italic my-2">{children}</blockquote>,
                                        code: ({ node, className, children, ...props }) => {
                                            const match = /language-(\w+)/.exec(className || '')
                                            const isInline = !match && !String(children).includes('\n')

                                            if (isInline) {
                                                return (
                                                    <code className="bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono text-zinc-200" {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            }

                                            // Code Block Component with Copy logic
                                            const codeString = String(children).replace(/\n$/, '');
                                            return (
                                                <div className="relative my-3 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 group/code">
                                                    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
                                                        <span>{match?.[1] || 'code'}</span>
                                                        <CopyButton text={codeString} />
                                                    </div>
                                                    <div className="overflow-x-auto p-3">
                                                        <code className="text-xs font-mono text-zinc-100 block" {...props}>
                                                            {children}
                                                        </code>
                                                    </div>
                                                </div>
                                            );
                                        },
                                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 underline">{children}</a>
                                    }}
                                >
                                    {m.content}
                                </ReactMarkdown>

                                {/* Message Actions (Footer) - Only for Assistant */}
                                {m.role === "assistant" && (
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-800/50">
                                        <CopyButton text={m.content} label="Copy" className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1" />
                                        <div className="h-3 w-[1px] bg-zinc-800"></div>
                                        <button className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Helpful">
                                            <ThumbsUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Not Helpful">
                                            <ThumbsDown className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="text-zinc-500 text-xs animate-pulse">Thinking...</div>
                    )}
                </div>

                {/* Input (Purple Style) */}
                <div className="flex-none p-4" suppressHydrationWarning>
                    <div
                        suppressHydrationWarning
                        className="flex items-end gap-2 p-1.5 bg-zinc-900 border border-zinc-800 rounded-[26px] focus-within:border-zinc-700 transition-colors"
                    >
                        <textarea
                            ref={sidebarInputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, 'sidebar')}
                            placeholder="Ask a question..."
                            className="flex-1 bg-transparent px-4 py-3 max-h-[200px] min-h-[44px] text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none overflow-y-auto whitespace-pre-wrap"
                            rows={1}
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={loading || !input.trim()}
                            className="mb-1 p-2 bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ArrowUp className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
