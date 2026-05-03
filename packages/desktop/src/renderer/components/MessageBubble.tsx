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
      <div className="flex justify-end animate-fade-in w-full group">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-sm bg-xibe-surface-raised border border-xibe-border-subtle px-4 py-3 text-[15px] leading-relaxed text-xibe-text whitespace-pre-wrap shadow-sm">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col w-full group">
      <div className="prose prose-invert max-w-none text-[15px] leading-relaxed text-xibe-text
        prose-p:my-3 prose-headings:my-4 prose-ul:my-3 prose-ol:my-3 prose-li:my-1
        prose-pre:my-4 prose-pre:bg-transparent prose-pre:p-0
        prose-blockquote:my-4 prose-blockquote:border-l-xibe-border-focus prose-blockquote:text-xibe-text-dim
        prose-a:text-xibe-brand-blue prose-a:no-underline hover:prose-a:underline hover:prose-a:underline-offset-2
        prose-strong:text-xibe-text prose-strong:font-semibold
        prose-code:text-xibe-text-secondary prose-code:bg-xibe-surface-raised prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
        prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h1:font-semibold prose-h2:font-semibold prose-h3:font-semibold">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre: ({ children }) => (
              <pre className="overflow-x-auto rounded-xl bg-xibe-bg border border-xibe-border-subtle p-4 text-[13px] font-mono leading-relaxed shadow-sm my-4">{children}</pre>
            ),
            code: ({ className, children }) => {
              const isInline = !className;
              return isInline ? (
                <code className="rounded-md bg-xibe-surface-raised border border-xibe-border-subtle/50 px-1.5 py-0.5 text-[13px] font-mono text-xibe-text-secondary">{children}</code>
              ) : (
                <code className={`${className ?? ''} text-[13px] font-mono`}>{children}</code>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {isStreaming && <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-xibe-text-dim/50 ml-1 mt-1" />}
    </div>
  );
});

export default MessageBubble;
