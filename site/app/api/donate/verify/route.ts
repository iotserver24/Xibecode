import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Lightweight client-side verification for immediate UX feedback.
// The actual sponsor storage happens via the Razorpay webhook.
// This endpoint just confirms the payment signature is valid so the
// client can show "Thank you" immediately without waiting for the webhook.

export async function POST(req: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json({ error: 'Razorpay not configured' }, { status: 500 });
    }

    // Verify client-side signature (order_id|payment_id with API key secret)
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    // Signature valid - the webhook will handle storing the sponsor
    return NextResponse.json({ success: true, message: 'Payment verified. Thank you!' });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
