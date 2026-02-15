import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SPONSORS_PATH = path.join(process.cwd(), 'data', 'sponsors.json');

export async function GET() {
  try {
    let sponsors: any[] = [];
    try {
      const data = fs.readFileSync(SPONSORS_PATH, 'utf-8');
      sponsors = JSON.parse(data);
    } catch {
      sponsors = [];
    }

    // Sort by date descending (most recent first)
    sponsors.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Strip email for privacy, only return public info
    const publicSponsors = sponsors.map((s: any) => ({
      name: s.name,
      amount: s.amount,
      currency: s.currency,
      date: s.date,
    }));

    // Calculate stats
    const totalSponsors = sponsors.length;
    const totalRaisedINR = sponsors
      .filter((s: any) => s.currency === 'INR')
      .reduce((sum: number, s: any) => sum + s.amount, 0);
    const totalRaisedUSD = sponsors
      .filter((s: any) => s.currency === 'USD')
      .reduce((sum: number, s: any) => sum + s.amount, 0);

    return NextResponse.json({
      sponsors: publicSponsors,
      stats: {
        totalSponsors,
        totalRaisedINR,
        totalRaisedUSD,
      },
    });
  } catch (error) {
    console.error('Sponsors API error:', error);
    return NextResponse.json({ sponsors: [], stats: { totalSponsors: 0, totalRaisedINR: 0, totalRaisedUSD: 0 } });
  }
}
