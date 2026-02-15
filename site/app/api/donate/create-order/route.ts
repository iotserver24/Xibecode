import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { amount, currency, name, email, github, description } = await req.json();

    if (!amount || !currency || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validCurrencies = ['INR', 'USD'];
    if (!validCurrencies.includes(currency)) {
      return NextResponse.json({ error: 'Invalid currency. Use INR or USD.' }, { status: 400 });
    }

    if (amount < 1) {
      return NextResponse.json({ error: 'Amount must be at least 1' }, { status: 400 });
    }

    const amountInSmallestUnit = Math.round(amount * 100);

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay not configured' }, { status: 500 });
    }

    // Store ALL donor info in order notes so the webhook can read it
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: amountInSmallestUnit,
        currency,
        receipt: `donate_${Date.now()}`,
        notes: {
          donor_name: name,
          donor_email: email,
          donor_github: (github || '').trim(),
          donor_description: (description || '').trim().slice(0, 280),
          donor_amount: String(amount),
          donor_currency: currency,
          source: 'xibecode-website',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Razorpay order error:', err);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    const order = await response.json();

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Create order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
