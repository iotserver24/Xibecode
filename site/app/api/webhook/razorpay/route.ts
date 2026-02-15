import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/mongodb';

// Convert any date to IST string
function toIST(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

async function getGitHubAvatar(username: string): Promise<string> {
  if (!username) return '';
  try {
    // GitHub serves avatars directly by username - no API rate limits
    return `https://github.com/${username}.png`;
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    // Read raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature: HMAC SHA256 of raw body with webhook secret
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('Webhook signature mismatch');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Signature valid - parse the event
    const event = JSON.parse(rawBody);
    const eventType = event.event;

    console.log(`Razorpay webhook: ${eventType}`);

    // Only handle payment.captured events
    if (eventType === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      if (!payment) {
        return NextResponse.json({ error: 'No payment entity' }, { status: 400 });
      }

      const notes = payment.notes || {};
      const now = new Date();

      // Get donor info from order notes
      const donorName = notes.donor_name || 'Anonymous';
      const donorEmail = notes.donor_email || '';
      const donorGithub = notes.donor_github || '';
      const donorDescription = notes.donor_description || '';
      const amountInSmallestUnit = payment.amount || 0;
      const currency = payment.currency || 'INR';
      // Convert back from smallest unit to main unit
      const amount = amountInSmallestUnit / 100;

      // Fetch GitHub avatar
      const avatarUrl = donorGithub ? await getGitHubAvatar(donorGithub) : '';

      // Store in MongoDB
      const db = await getDb();

      // Check for duplicate payment (idempotency)
      const existing = await db.collection('sponsors').findOne({ paymentId: payment.id });
      if (existing) {
        console.log(`Duplicate webhook for payment ${payment.id}, skipping`);
        return NextResponse.json({ status: 'already_processed' });
      }

      await db.collection('sponsors').insertOne({
        name: donorName,
        email: donorEmail,
        github: donorGithub,
        avatarUrl,
        description: donorDescription,
        amount,
        currency,
        date: now.toISOString(),
        dateIST: toIST(now),
        paymentId: payment.id,
        orderId: payment.order_id,
        method: payment.method || '',
        createdAt: now,
      });

      console.log(`Sponsor saved: ${donorName} - ${currency} ${amount}`);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent Razorpay retries on parse errors
    return NextResponse.json({ status: 'error', message: 'Internal error' }, { status: 200 });
  }
}
