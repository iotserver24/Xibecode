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

  const avatar = isUser ? (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-xibe-surface-raised text-[10px] font-bold text-xibe-text-secondary mt-0.5">
      U
    </div>
  ) : (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-xibe-text text-[10px] font-bold text-xibe-bg mt-0.5">
      X
    </div>
  );

  return (
    <div className="flex w-full animate-fade-in group gap-4 py-2">
      {avatar}
      <div className="flex-1 min-w-0">
        {isUser ? (
          <div className="text-[15px] leading-relaxed text-xibe-text whitespace-pre-wrap">
            {content}
          </div>
        ) : (
          <div className="prose prose-invert max-w-none text-[15px] leading-relaxed text-xibe-text
            prose-p:my-1.5 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
            prose-pre:my-3 prose-pre:bg-transparent prose-pre:p-0
            prose-blockquote:my-4 prose-blockquote:border-l-2 prose-blockquote:border-xibe-border-subtle prose-blockquote:pl-4 prose-blockquote:text-xibe-text-dim
            prose-a:text-xibe-text-secondary hover:prose-a:text-xibe-text prose-a:underline prose-a:underline-offset-2
            prose-strong:text-xibe-text prose-strong:font-semibold
            prose-code:text-xibe-text-secondary prose-code:bg-transparent prose-code:px-0 prose-code:py-0 prose-code:rounded-none prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h1:font-semibold prose-h2:font-semibold prose-h3:font-semibold">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre: ({ children }) => (
                  <pre className="overflow-x-auto bg-transparent border-y border-xibe-border-subtle py-4 text-[13px] font-mono leading-relaxed my-4">{children}</pre>
                ),
                code: ({ className, children }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="text-[13px] font-mono text-xibe-brand-blue">{children}</code>
                  ) : (
                    <code className={`${className ?? ''} text-[13px] font-mono`}>{children}</code>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
        {isStreaming && <span className="inline-block h-4 w-2 animate-pulse bg-xibe-text-dim/50 ml-1 mt-1 align-middle" />}
      </div>
    </div>
  );
});

export default MessageBubble;
