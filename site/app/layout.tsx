import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Xoding AI Tool - Autonomous Coding Assistant',
  description: 'Production-ready autonomous coding agent powered by Claude AI. Open-source, customizable, with advanced context management.',
  keywords: ['AI', 'coding assistant', 'autonomous agent', 'Claude', 'development tools'],
  authors: [{ name: 'iotserver24', url: 'https://github.com/iotserver24' }],
  openGraph: {
    title: 'Xoding AI Tool - Autonomous Coding Assistant',
    description: 'Production-ready autonomous coding agent powered by Claude AI',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="min-h-screen flex flex-col">
            <Navigation />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
