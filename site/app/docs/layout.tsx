export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="prose prose-invert prose-zinc max-w-none prose-headings:text-white prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline prose-code:text-fuchsia-300 prose-code:bg-zinc-800/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-white/5 prose-strong:text-white">
          {children}
        </div>
      </div>
    </div>
  );
}
