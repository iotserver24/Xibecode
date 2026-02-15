import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();

    const sponsors = await db
      .collection('sponsors')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Public info only (no email, no paymentId)
    const publicSponsors = sponsors.map((s) => ({
      name: s.name,
      github: s.github || '',
      avatarUrl: s.avatarUrl || '',
      description: s.description || '',
      amount: s.amount,
      currency: s.currency,
      date: s.date,
    }));

    const totalSponsors = sponsors.length;
    const totalRaisedINR = sponsors
      .filter((s) => s.currency === 'INR')
      .reduce((sum, s) => sum + (s.amount || 0), 0);
    const totalRaisedUSD = sponsors
      .filter((s) => s.currency === 'USD')
      .reduce((sum, s) => sum + (s.amount || 0), 0);

    // Sponsors with descriptions = reviews
    const reviews = publicSponsors.filter((s) => s.description);

    return NextResponse.json({
      sponsors: publicSponsors,
      reviews,
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
      reviews: [],
      stats: { totalSponsors: 0, totalRaisedINR: 0, totalRaisedUSD: 0 },
    });
  }
}
