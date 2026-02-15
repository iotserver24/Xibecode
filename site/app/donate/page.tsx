'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, ArrowLeft, Check, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const TIERS_USD = [5, 10, 25, 50, 100];
const TIERS_INR = [100, 500, 1000, 2500, 5000];

export default function DonatePage() {
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const tiers = currency === 'INR' ? TIERS_INR : TIERS_USD;
  const symbol = currency === 'INR' ? '\u20B9' : '$';

  // Load Razorpay script
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    document.body.appendChild(script);
  }, []);

  const handleTierClick = (tier: number) => {
    setAmount(tier);
    setIsCustom(false);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (val: string) => {
    setCustomAmount(val);
    setIsCustom(true);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setAmount(num);
    }
  };

  const finalAmount = isCustom ? parseFloat(customAmount) || 0 : amount;

  const handleDonate = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email'); return; }
    if (finalAmount < 1) { setError('Please enter a valid amount'); return; }
    if (!scriptLoaded) { setError('Payment system is loading, please wait...'); return; }

    setError('');
    setLoading(true);

    try {
      // 1. Create Razorpay order
      const res = await fetch('/api/donate/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: finalAmount, currency, name, email }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create order');
      }

      const { orderId } = await res.json();

      // 2. Open Razorpay checkout
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: Math.round(finalAmount * 100),
        currency,
        name: 'XibeCode',
        description: `Donation of ${symbol}${finalAmount}`,
        order_id: orderId,
        prefill: { name, email },
        theme: { color: '#8b5cf6' },
        handler: async (response: any) => {
          // 3. Verify payment
          try {
            const verifyRes = await fetch('/api/donate/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                name,
                email,
                amount: finalAmount,
                currency,
              }),
            });

            if (verifyRes.ok) {
              setSuccess(true);
            } else {
              setError('Payment verification failed. Please contact support.');
            }
          } catch {
            setError('Payment verification failed. Please contact support.');
          }
          setLoading(false);
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        setError(`Payment failed: ${response.error.description}`);
        setLoading(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Check className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Thank You!</h1>
          <p className="text-zinc-400 mb-2">
            Your donation of <span className="text-white font-semibold">{symbol}{finalAmount}</span> has been received.
          </p>
          <p className="text-zinc-500 text-sm mb-8">
            You are now a proud XibeCode sponsor. Your support helps keep this project alive and growing.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sponsors" className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-medium transition-all">
              View Sponsors
            </Link>
            <Link href="/" className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full font-medium transition-all">
              Back Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] max-w-2xl mx-auto px-4 py-16 md:py-24">
      {/* Back link */}
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-violet-400 text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back home
      </Link>

      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Heart className="w-8 h-8 text-violet-400" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">Support XibeCode</h1>
        <p className="text-zinc-400 max-w-lg mx-auto">
          XibeCode is open-source and free. Your donation helps fund development, hosting, and keeps the project sustainable.
        </p>
      </div>

      {/* Currency Selector */}
      <div className="flex justify-center gap-2 mb-8">
        {(['INR', 'USD'] as const).map((c) => (
          <button
            key={c}
            onClick={() => { setCurrency(c); setIsCustom(false); setAmount(c === 'INR' ? 500 : 10); setCustomAmount(''); }}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              currency === c
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {c === 'INR' ? '\u20B9 INR' : '$ USD'}
          </button>
        ))}
      </div>

      {/* Tier Buttons */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {tiers.map((tier) => (
          <button
            key={tier}
            onClick={() => handleTierClick(tier)}
            className={`py-3 rounded-xl text-sm font-semibold transition-all ${
              !isCustom && amount === tier
                ? 'bg-violet-600 text-white ring-2 ring-violet-400 ring-offset-2 ring-offset-zinc-950'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
            }`}
          >
            {symbol}{tier}
          </button>
        ))}
      </div>

      {/* Custom Amount */}
      <div className="mb-8">
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
          isCustom ? 'border-violet-500 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/50'
        }`}>
          <span className="text-zinc-400 font-medium">{symbol}</span>
          <input
            type="number"
            placeholder="Custom amount"
            value={customAmount}
            onChange={(e) => handleCustomAmountChange(e.target.value)}
            onFocus={() => setIsCustom(true)}
            className="flex-1 bg-transparent text-white placeholder-zinc-600 outline-none text-lg"
            min="1"
          />
        </div>
      </div>

      {/* Name & Email */}
      <div className="space-y-4 mb-8">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/50 text-white placeholder-zinc-600 outline-none focus:border-violet-500 transition-colors"
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/50 text-white placeholder-zinc-600 outline-none focus:border-violet-500 transition-colors"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Donate Button */}
      <button
        onClick={handleDonate}
        disabled={loading || finalAmount < 1}
        className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Heart className="w-5 h-5" />
            Donate {symbol}{finalAmount > 0 ? finalAmount : ''}
          </>
        )}
      </button>

      <p className="text-center text-zinc-600 text-xs mt-4">
        Secure payment powered by Razorpay. Your donation info will be publicly listed on the sponsors page (amount only, email stays private).
      </p>
    </div>
  );
}
