import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';
import { Footer } from '@/components/Footer';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'XibeCode - AI-Powered Autonomous Coding Assistant',
    template: '%s | XibeCode',
  },
  description: 'AI-powered autonomous coding assistant for your terminal and browser. 13 agent modes, 40+ tools, MCP protocol support, and a modern WebUI.',
  keywords: ['AI coding assistant', 'CLI tool', 'autonomous agent', 'code generation', 'MCP protocol', 'WebUI', 'XibeCode'],
  authors: [{ name: 'Anish Kumar (R3AP3R editz)', url: 'https://github.com/iotserver24' }],
  openGraph: {
    title: 'XibeCode - AI-Powered Autonomous Coding Assistant',
    description: 'AI-powered autonomous coding assistant for your terminal and browser.',
    siteName: 'XibeCode',
    type: 'website',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} dark`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen" suppressHydrationWarning>
        <RootProvider
          theme={{
            defaultTheme: 'dark',
            forcedTheme: 'dark',
            enableSystem: false,
          }}
        >
          <main className="flex-1">{children}</main>
          <Footer />
        </RootProvider>
      </body>
    </html>
  );
}
