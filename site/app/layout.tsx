import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'XibeCode — Autonomous AI Coding Assistant',
  description: 'Production-ready autonomous coding agent. Open-source, free, and fully customizable with smart context management, MCP support, and plugin system.',
  keywords: ['XibeCode', 'AI coding assistant', 'autonomous agent', 'CLI tool', 'open source', 'MCP'],
  authors: [{ name: 'Anish Kumar', url: 'https://github.com/iotserver24' }],
  openGraph: {
    title: 'XibeCode — Autonomous AI Coding Assistant',
    description: 'Production-ready autonomous coding agent. Free and open-source.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased noise-bg">
        <div className="min-h-screen flex flex-col">
          <Navigation />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
