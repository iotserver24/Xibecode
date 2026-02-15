'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, ArrowLeft, Users, DollarSign, IndianRupee, Loader2 } from 'lucide-react';

interface Sponsor {
  name: string;
  amount: number;
  currency: string;
  date: string;
}

interface SponsorsData {
  sponsors: Sponsor[];
  stats: {
    totalSponsors: number;
    totalRaisedINR: number;
    totalRaisedUSD: number;
  };
}

export default function SponsorsPage() {
  const [data, setData] = useState<SponsorsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sponsors')
      .then((res) => res.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    const symbol = currency === 'INR' ? '\u20B9' : '$';
    return `${symbol}${amount.toLocaleString()}`;
  };

  return (
    <div className="min-h-[80vh] max-w-4xl mx-auto px-4 py-16 md:py-24">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-violet-400 text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back home
      </Link>

      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">Our Sponsors</h1>
        <p className="text-zinc-400 max-w-lg mx-auto">
          These amazing people support XibeCode's development. Thank you for keeping open-source alive.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats */}
          {data && (
            <div className="grid grid-cols-3 gap-4 mb-12">
              <div className="text-center p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
                <Users className="w-5 h-5 text-violet-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{data.stats.totalSponsors}</div>
                <div className="text-zinc-500 text-sm">Sponsors</div>
              </div>
              <div className="text-center p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
                <IndianRupee className="w-5 h-5 text-violet-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{'\u20B9'}{data.stats.totalRaisedINR.toLocaleString()}</div>
                <div className="text-zinc-500 text-sm">Raised (INR)</div>
              </div>
              <div className="text-center p-5 rounded-xl border border-zinc-800 bg-zinc-900/30">
                <DollarSign className="w-5 h-5 text-violet-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">${data.stats.totalRaisedUSD.toLocaleString()}</div>
                <div className="text-zinc-500 text-sm">Raised (USD)</div>
              </div>
            </div>
          )}

          {/* Sponsor List */}
          {data && data.sponsors.length > 0 ? (
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50">
                    <th className="text-left py-3 px-5 text-sm font-medium text-zinc-400">Sponsor</th>
                    <th className="text-right py-3 px-5 text-sm font-medium text-zinc-400">Amount</th>
                    <th className="text-right py-3 px-5 text-sm font-medium text-zinc-400 hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sponsors.map((s, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 text-sm font-bold">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-white text-sm font-medium">{s.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <span className="text-emerald-400 font-semibold text-sm">{formatAmount(s.amount, s.currency)}</span>
                      </td>
                      <td className="py-3 px-5 text-right text-zinc-500 text-sm hidden sm:table-cell">
                        {formatDate(s.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-20 rounded-xl border border-zinc-800 bg-zinc-900/20">
              <Heart className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-zinc-400 mb-2">No sponsors yet</h3>
              <p className="text-zinc-600 mb-6">Be the first to support XibeCode!</p>
              <Link href="/donate" className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-medium transition-all">
                Become a Sponsor
              </Link>
            </div>
          )}

          {/* CTA */}
          {data && data.sponsors.length > 0 && (
            <div className="text-center mt-10">
              <Link href="/donate" className="inline-flex items-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-semibold transition-all">
                <Heart className="w-4 h-4" />
                Become a Sponsor
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
