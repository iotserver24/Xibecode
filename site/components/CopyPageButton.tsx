'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Copy, ChevronDown, ExternalLink, Check } from 'lucide-react';
import Image from 'next/image';

interface CopyPageButtonProps {
    pageTitle: string;
    pageUrl: string;
}

export function CopyPageButton({ pageTitle, pageUrl }: CopyPageButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getFullUrl = (): string => {
        return window.location.href;
    };

    const getPromptWithUrl = (): string => {
        const url = getFullUrl();
        return `I'm going to ask about this documentation page: "${pageTitle}"\n\nURL: ${url}\n\nPlease refer to this page for context.`;
    };

    const handleCopyPage = async () => {
        try {
            const prompt = getPromptWithUrl();
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
        setIsOpen(false);
    };

    const handleViewAsMarkdown = () => {
        // Open the llms.txt version of the page if available
        const url = getFullUrl();
        window.open(url, '_blank');
        setIsOpen(false);
    };

    const handleOpenInChatGPT = () => {
        const url = getFullUrl();
        const query = encodeURIComponent(`I'm going to ask about this documentation page: "${pageTitle}"\n\nURL: ${url}\n\nPlease read and refer to this page for context.`);
        window.open(`https://chat.openai.com/?q=${query}`, '_blank');
        setIsOpen(false);
    };

    const handleOpenInClaude = () => {
        const url = getFullUrl();
        const query = encodeURIComponent(`Read from ${url} so I can ask questions about it.`);
        window.open(`https://claude.ai/new?q=${query}`, '_blank');
        setIsOpen(false);
    };

    const handleOpenInPerplexity = () => {
        const url = getFullUrl();
        const query = encodeURIComponent(`${pageTitle} - ${url}`);
        window.open(`https://www.perplexity.ai/search?q=${query}`, '_blank');
        setIsOpen(false);
    };

    // Custom icon components using the SVG files
    const ChatGPTIcon = () => (
        <Image src="/chatgpt.svg" alt="ChatGPT" width={16} height={16} className="dark:invert" />
    );

    const ClaudeIcon = () => (
        <Image src="/claude-color.svg" alt="Claude" width={16} height={16} />
    );

    const PerplexityIcon = () => (
        <Image src="/perplexity.svg" alt="Perplexity" width={16} height={16} className="dark:invert" />
    );

    const MarkdownIcon = () => (
        <Image src="/markdown-svgrepo-com.svg" alt="Markdown" width={16} height={16} className="dark:invert" />
    );

    const menuItems = [
        {
            icon: Copy,
            iconType: 'lucide' as const,
            label: 'Copy page',
            description: 'Copy page URL with context for LLMs',
            onClick: handleCopyPage,
            external: false,
        },
        {
            icon: MarkdownIcon,
            iconType: 'custom' as const,
            label: 'View as Markdown',
            description: 'Open this page in new tab',
            onClick: handleViewAsMarkdown,
            external: true,
        },
        { divider: true },
        {
            icon: ChatGPTIcon,
            iconType: 'custom' as const,
            label: 'Open in ChatGPT',
            description: 'Ask questions about this page',
            onClick: handleOpenInChatGPT,
            external: true,
        },
        {
            icon: ClaudeIcon,
            iconType: 'custom' as const,
            label: 'Open in Claude',
            description: 'Ask questions about this page',
            onClick: handleOpenInClaude,
            external: true,
        },
        {
            icon: PerplexityIcon,
            iconType: 'custom' as const,
            label: 'Open in Perplexity',
            description: 'Ask questions about this page',
            onClick: handleOpenInPerplexity,
            external: true,
        },
    ];

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg
                   bg-fd-secondary/50 hover:bg-fd-secondary
                   text-fd-foreground/80 hover:text-fd-foreground
                   border border-fd-border/50 hover:border-fd-border
                   transition-all duration-200 ease-in-out"
                aria-expanded={isOpen}
                aria-haspopup="true"
            >
                {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                ) : (
                    <Copy className="w-4 h-4" />
                )}
                <span>{copied ? 'Copied!' : 'Copy page'}</span>
                <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 mt-2 w-72 rounded-xl overflow-hidden
                     bg-black border border-fd-border/30
                     shadow-2xl shadow-black/50
                     z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                >
                    <div className="py-2">
                        {menuItems.map((item, index) => {
                            if ('divider' in item && item.divider) {
                                return (
                                    <div
                                        key={index}
                                        className="my-2 border-t border-white/10"
                                    />
                                );
                            }

                            const IconComponent = item.icon;
                            const isCustomIcon = item.iconType === 'custom';

                            if (!IconComponent) return null;

                            return (
                                <button
                                    key={index}
                                    onClick={item.onClick}
                                    className="w-full flex items-start gap-3 px-4 py-3
                             hover:bg-white/5 transition-colors duration-150
                             text-left group"
                                >
                                    <div
                                        className="flex-shrink-0 mt-0.5 p-1.5 rounded-md bg-white/5 
                               group-hover:bg-white/10 transition-colors"
                                    >
                                        {isCustomIcon ? (
                                            <IconComponent />
                                        ) : (
                                            <IconComponent className="w-4 h-4 text-white/80" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-medium text-white">
                                                {item.label}
                                            </span>
                                            {item.external && (
                                                <ExternalLink className="w-3 h-3 text-white/50" />
                                            )}
                                        </div>
                                        <p className="text-xs text-white/50 mt-0.5">
                                            {item.description}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
