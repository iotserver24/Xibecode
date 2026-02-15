import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const SPONSORS_PATH = path.join(process.cwd(), 'data', 'sponsors.json');

function readSponsors() {
  try {
    const data = fs.readFileSync(SPONSORS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeSponsors(sponsors: any[]) {
  fs.writeFileSync(SPONSORS_PATH, JSON.stringify(sponsors, null, 2));
}

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

    // Payment verified - store sponsor
    const sponsors = readSponsors();
    sponsors.push({
      name: name || 'Anonymous',
      email: email || '',
      amount: amount || 0,
      currency: currency || 'INR',
      date: new Date().toISOString(),
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
    writeSponsors(sponsors);

    return NextResponse.json({ success: true, message: 'Thank you for your donation!' });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
