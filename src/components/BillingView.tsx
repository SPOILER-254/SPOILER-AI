import React, { useEffect, useState } from 'react';
import { CreditCard, Smartphone, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { PlanTier, SubscriptionInfo } from '../types';

interface BillingResponse {
  subscription: SubscriptionInfo;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    provider: string;
    reference: string;
    phone_number: string | null;
    plan: string;
    status: string;
    created_at: string;
  }>;
  plans: Record<
    PlanTier,
    { name: string; monthlyUsd: number; monthlyKes: number; aiQuota: number; bots: number; accounts: number }
  >;
  mpesaConfigured: boolean;
  stripeConfigured: boolean;
}

export function BillingView({ onUpdated }: { onUpdated: () => void }) {
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [checkoutPlan, setCheckoutPlan] = useState<'PRO' | 'BUSINESS' | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState('0712345678');
  const [processing, setProcessing] = useState(false);

  const loadBilling = async () => {
    try {
      const res = await apiRequest<BillingResponse>('/api/billing');
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBilling();
  }, []);

  const handleMpesaPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;
    setProcessing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ message: string; reference: string }>('/api/payments/mpesa/stk-push', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: mpesaPhone, plan: checkoutPlan }),
      });
      setNotice(`${res.message} Reference: ${res.reference}`);
      setCheckoutPlan(null);
      await loadBilling();
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCardCheckout = async () => {
    if (!checkoutPlan) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await apiRequest<{ checkoutUrl: string }>('/api/payments/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: checkoutPlan }),
      });
      window.location.assign(res.checkoutUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDowngrade = async () => {
    await apiRequest('/api/billing/downgrade', { method: 'POST' });
    setNotice('Subscription downgraded to Free tier.');
    await loadBilling();
    onUpdated();
  };

  if (loading || !data) {
    return <div className="h-64 rounded-xl bg-[#111114] border border-white/8 animate-pulse" />;
  }

  const sub = data.subscription;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">Subscriptions &amp; Payments</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Upgrade with Safaricom M-Pesa STK Push (Kenya) or International Card Checkout. Server-verified payment callbacks.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200">{error}</div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">{notice}</div>
      )}

      {/* Current Subscription Status */}
      <div className="p-5 rounded-xl bg-[#111114] border border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-400">Active Subscription</p>
          <p className="font-display text-2xl font-bold text-white">
            {sub.plan} Tier · {sub.status}
          </p>
          <p className="mt-1 text-xs text-zinc-400 tabular-nums">
            {sub.ai_usage_count} / {sub.ai_quota_limit} AI replies · {sub.bot_limit} AI bots · {sub.account_limit} social accounts
          </p>
        </div>
        {sub.plan !== 'FREE' && (
          <button
            type="button"
            onClick={handleDowngrade}
            className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/12 text-xs font-medium text-zinc-300 hover:text-white cursor-pointer"
          >
            Downgrade to Free
          </button>
        )}
      </div>

      {/* Pricing Tiers */}
      <div className="grid md:grid-cols-3 gap-5">
        {(['FREE', 'PRO', 'BUSINESS'] as PlanTier[]).map((tier) => {
          const p = data.plans[tier];
          const isCurrent = sub.plan === tier;
          return (
            <div
              key={tier}
              className={`p-6 rounded-xl border flex flex-col justify-between gap-5 ${
                tier === 'PRO'
                  ? 'bg-[#141115] border-red-500/50 shadow-[0_0_28px_-8px_rgba(239,68,68,0.35)]'
                  : 'bg-[#111114] border-white/10'
              }`}
            >
              <div>
                <p className="text-xs font-semibold text-red-400">
                  {tier === 'FREE' ? 'For solo testing' : tier === 'PRO' ? 'For scaling creators & SMBs' : 'For multi-channel teams'}
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-white">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-white tabular-nums">${p.monthlyUsd}</span>
                  <span className="text-xs text-zinc-400">/ month · KES {p.monthlyKes.toLocaleString()}</span>
                </div>

                <ul className="mt-5 space-y-2.5 text-xs text-zinc-300 border-t border-white/8 pt-4">
                  <li className="tabular-nums">{p.aiQuota.toLocaleString()} AI replies &amp; ReplyImg calls / mo</li>
                  <li className="tabular-nums">Up to {p.bots} active AI bots</li>
                  <li className="tabular-nums">Up to {p.accounts} connected social accounts</li>
                  <li>{tier === 'FREE' ? 'Manual & basic automation' : 'Full workflow automation + ReplyImg vision'}</li>
                  {tier === 'BUSINESS' && <li>Team workspace &amp; priority analytics</li>}
                </ul>
              </div>

              {isCurrent ? (
                <div className="py-2.5 text-center rounded-lg bg-zinc-900 border border-white/10 text-xs font-semibold text-zinc-400">
                  Current Plan
                </div>
              ) : tier === 'FREE' ? (
                <button
                  type="button"
                  onClick={handleDowngrade}
                  className="py-2.5 px-4 rounded-lg bg-zinc-900 border border-white/12 text-xs font-semibold text-white cursor-pointer"
                >
                  Switch to Free
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setCheckoutPlan(tier);
                  }}
                  className="py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
                >
                  Upgrade to {p.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment History */}
      <div className="p-5 rounded-xl bg-[#111114] border border-white/10">
        <h3 className="font-display text-base font-bold text-white mb-4">Payment History</h3>
        {data.payments.length === 0 ? (
          <p className="text-xs text-zinc-500">No transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 border-b border-white/8">
                <tr>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {data.payments.map((pay) => (
                  <tr key={pay.id} className="text-zinc-200">
                    <td className="py-2.5 pr-4 font-mono">{pay.reference}</td>
                    <td className="py-2.5 pr-4">{pay.plan}</td>
                    <td className="py-2.5 pr-4">{pay.provider}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                      {pay.currency} {pay.amount.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold">{pay.status}</td>
                    <td className="py-2.5 font-mono text-zinc-500">{pay.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Checkout Modal (M-Pesa + Card) */}
      {checkoutPlan && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#111114] border border-white/12 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Upgrade to {checkoutPlan}</h3>
                <p className="text-xs text-zinc-400">
                  KES {data.plans[checkoutPlan].monthlyKes.toLocaleString()} / ${data.plans[checkoutPlan].monthlyUsd} monthly
                </p>
              </div>
              <button type="button" onClick={() => setCheckoutPlan(null)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMpesaPay} className="p-4 rounded-xl bg-black/60 border border-white/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Smartphone className="w-4 h-4" />
                <span>Lipa na M-Pesa (Safaricom Daraja STK Push)</span>
              </div>
              <input
                type="tel"
                required
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                placeholder="0712345678 or 254712345678"
                className="w-full px-3 py-2 rounded-lg bg-[#111114] border border-white/12 text-xs font-mono text-white"
              />
              <button
                type="submit"
                disabled={processing}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {processing ? 'Sending STK Push...' : `Pay KES ${data.plans[checkoutPlan].monthlyKes.toLocaleString()} via M-Pesa`}
              </button>
            </form>

            <div className="p-4 rounded-xl bg-black/60 border border-white/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <CreditCard className="w-4 h-4 text-red-400" />
                <span>International Card Payment (Stripe)</span>
              </div>
              <button
                type="button"
                disabled={processing}
                onClick={handleCardCheckout}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                Pay ${data.plans[checkoutPlan].monthlyUsd} with Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
