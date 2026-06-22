import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  timestamp: number;
}

const MessageBubble = memo(function MessageBubble({ role, content, isStreaming }: Props) {
  const isUser = role === 'user';

  return (
    <div className="flex animate-fade-in w-full group py-3">
      {/* Avatar */}
      <div className="shrink-0 mr-4 flex flex-col items-center">
        <div className={cn(
          "h-6 w-6 rounded flex items-center justify-center text-[12px] font-bold shrink-0",
          isUser ? "bg-xibe-surface-hover text-xibe-text-secondary" : "bg-xibe-text text-xibe-bg"
        )}>
          {isUser ? 'U' : 'X'}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="prose prose-invert max-w-none text-[15px] leading-relaxed text-xibe-text
          prose-p:my-1 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
          prose-pre:my-3 prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0
          prose-blockquote:my-4 prose-blockquote:border-l-2 prose-blockquote:border-xibe-border-subtle prose-blockquote:pl-4 prose-blockquote:text-xibe-text-dim
          prose-a:text-xibe-text-secondary hover:prose-a:text-xibe-text prose-a:underline prose-a:underline-offset-2
          prose-strong:text-xibe-text prose-strong:font-medium
          prose-code:text-xibe-text-secondary prose-code:bg-transparent prose-code:px-0 prose-code:py-0 prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
          prose-h1:text-lg prose-h2:text-base prose-h3:text-[15px] prose-h1:font-medium prose-h2:font-medium prose-h3:font-medium">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre: ({ children }) => (
                <pre className="overflow-x-auto rounded-md bg-transparent border border-xibe-border-subtle p-3 text-[13px] font-mono leading-relaxed my-3">{children}</pre>
              ),
              code: ({ className, children }) => {
                const isInline = !className;
                return isInline ? (
                  <code className="px-1 py-0.5 rounded text-[13px] font-mono text-xibe-text-secondary bg-xibe-surface-hover/50">{children}</code>
                ) : (
                  <code className={`${className ?? ''} text-[13px] font-mono`}>{children}</code>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
        {isStreaming && <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-xibe-text-dim/50 mt-1" />}
      </div>
    </div>
  );
});

export default MessageBubble;
