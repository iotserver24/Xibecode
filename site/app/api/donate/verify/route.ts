import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/mongodb';

async function getGitHubAvatar(username: string): Promise<string> {
  if (!username) return '';
  try {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      next: { revalidate: 86400 }, // cache for 24h
    });
    if (res.ok) {
      const data = await res.json();
      return data.avatar_url || '';
    }
  } catch {}
  // Fallback: GitHub serves avatars directly by username
  return `https://github.com/${username}.png`;
}

export async function POST(req: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      name,
      email,
      github,
      description,
      amount,
      currency,
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json({ error: 'Razorpay not configured' }, { status: 500 });
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    // Fetch GitHub avatar if username provided
    const githubUsername = (github || '').trim();
    const avatarUrl = githubUsername ? await getGitHubAvatar(githubUsername) : '';

    // Payment verified - store sponsor in MongoDB
    const db = await getDb();
    await db.collection('sponsors').insertOne({
      name: name || 'Anonymous',
      email: email || '',
      github: githubUsername,
      avatarUrl,
      description: (description || '').trim().slice(0, 280),
      amount: amount || 0,
      currency: currency || 'INR',
      date: new Date().toISOString(),
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, message: 'Thank you for your donation!' });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
