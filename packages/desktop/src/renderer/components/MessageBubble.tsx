import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  timestamp: number;
}

const MessageBubble = memo(function MessageBubble({ role, content, isStreaming }: Props) {
  const isUser = role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[80%] rounded-2xl bg-xibe-user-bubble px-4 py-2.5 text-sm leading-relaxed text-xibe-text whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed
        prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
        prose-pre:my-3 prose-blockquote:my-2 prose-a:text-xibe-brand-blue prose-a:no-underline hover:prose-a:underline
        prose-strong:text-xibe-text prose-code:text-xibe-accent
        prose-h1:text-base prose-h2:text-sm prose-h3:text-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre: ({ children }) => (
              <pre className="overflow-x-auto rounded-lg bg-xibe-bg border border-xibe-border-subtle p-3 text-xs font-mono">{children}</pre>
            ),
            code: ({ className, children }) => {
              const isInline = !className;
              return isInline ? (
                <code className="rounded bg-xibe-surface-raised px-1 py-0.5 text-xs font-mono text-xibe-accent">{children}</code>
              ) : (
                <code className={`${className ?? ''} text-xs font-mono`}>{children}</code>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {isStreaming && <span className="inline-block h-3.5 w-0.5 animate-pulse rounded bg-xibe-accent ml-0.5" />}
    </div>
  );
});

export default MessageBubble;
