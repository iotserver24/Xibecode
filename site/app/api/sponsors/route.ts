import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();

    // Get all sponsors sorted by date descending
    const sponsors = await db
      .collection('sponsors')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Strip email for privacy, only return public info
    const publicSponsors = sponsors.map((s) => ({
      name: s.name,
      amount: s.amount,
      currency: s.currency,
      date: s.date,
    }));

    // Calculate stats
    const totalSponsors = sponsors.length;
    const totalRaisedINR = sponsors
      .filter((s) => s.currency === 'INR')
      .reduce((sum, s) => sum + (s.amount || 0), 0);
    const totalRaisedUSD = sponsors
      .filter((s) => s.currency === 'USD')
      .reduce((sum, s) => sum + (s.amount || 0), 0);

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
    return NextResponse.json({
      sponsors: [],
      stats: { totalSponsors: 0, totalRaisedINR: 0, totalRaisedUSD: 0 },
    });
  }
}
