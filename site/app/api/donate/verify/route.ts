import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/mongodb';

export async function POST(req: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      name,
      email,
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

    // Verify signature: HMAC SHA256 of "order_id|payment_id" with key secret
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    // Payment verified - store sponsor in MongoDB
    const db = await getDb();
    await db.collection('sponsors').insertOne({
      name: name || 'Anonymous',
      email: email || '',
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
