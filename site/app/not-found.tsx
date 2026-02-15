import Link from 'next/link';
import { Home, ArrowRight, BookOpen, Terminal } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-zinc-100">
      {/* Background Gradient */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-violet-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* 404 Number */}
      <div className="relative mb-8">
        <h1 className="text-[150px] md:text-[200px] font-black text-zinc-900 leading-none select-none">
          404
        </h1>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl md:text-7xl font-bold bg-gradient-to-b from-violet-400 to-fuchsia-500 bg-clip-text text-transparent">
            404
          </span>
        </div>
      </div>

      {/* Message */}
      <h2 className="text-2xl md:text-3xl font-semibold text-zinc-100 mb-4 text-center">
        Page Not Found
      </h2>
      <p className="text-zinc-400 text-center max-w-md mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
        Let&apos;s get you back on track.
      </p>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-4 mb-12">
        <Link
          href="/"
          className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-medium transition-all hover:scale-105"
        >
          <Home className="w-4 h-4" />
          Go Home
        </Link>
        <Link
          href="/docs"
          className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-full font-medium transition-all"
        >
          <BookOpen className="w-4 h-4" />
          Browse Docs
        </Link>
      </div>

      {/* Helpful Links */}
      <div className="w-full max-w-md">
        <h3 className="text-sm font-semibold text-zinc-500 mb-4 text-center">
          Popular Pages
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/docs/installation"
            className="flex items-center gap-2 p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors group"
          >
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors" />
            <span className="text-sm text-zinc-300">Installation</span>
          </Link>
          <Link
            href="/docs/quickstart"
            className="flex items-center gap-2 p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors group"
          >
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors" />
            <span className="text-sm text-zinc-300">Quick Start</span>
          </Link>
          <Link
            href="/docs/webui"
            className="flex items-center gap-2 p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors group"
          >
            <Terminal className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors" />
            <span className="text-sm text-zinc-300">WebUI</span>
          </Link>
          <Link
            href="/docs/modes"
            className="flex items-center gap-2 p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors group"
          >
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors" />
            <span className="text-sm text-zinc-300">Agent Modes</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
