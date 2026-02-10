export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="prose prose-gray dark:prose-invert max-w-none">
          {children}
        </div>
      </div>
    </div>
  );
}
