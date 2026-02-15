import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { amount, currency, name, email } = await req.json();

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

    // Convert to smallest unit (paise for INR, cents for USD)
    const amountInSmallestUnit = Math.round(amount * 100);

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay not configured' }, { status: 500 });
    }

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
        notes: { name, email, source: 'xibecode-website' },
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
