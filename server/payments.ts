import crypto from 'crypto';
import { config } from './config.ts';
import { db } from './db.ts';

export const PLAN_CATALOG = {
  FREE: { name: 'Free', monthlyUsd: 0, monthlyKes: 0, aiQuota: 250, bots: 1, accounts: 2 },
  PRO: { name: 'Pro', monthlyUsd: 29, monthlyKes: 3800, aiQuota: 5000, bots: 5, accounts: 10 },
  BUSINESS: { name: 'Business', monthlyUsd: 99, monthlyKes: 12900, aiQuota: 30000, bots: 25, accounts: 50 },
} as const;

export type PlanTier = keyof typeof PLAN_CATALOG;

function mpesaBaseUrl() {
  return config.mpesa.env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function safeJson(res: Response): Promise<{ parsed: any; rawText: string }> {
  const rawText = await res.text();
  if (!rawText) return { parsed: null, rawText: '' };
  try {
    return { parsed: JSON.parse(rawText), rawText };
  } catch {
    return { parsed: null, rawText };
  }
}

export async function initiateMpesaStkPush(params: {
  userId: string;
  phoneNumber: string;
  plan: PlanTier;
  callbackBaseUrl?: string;
}): Promise<{ ok: boolean; checkoutRequestId?: string; reference?: string; message?: string; error?: string }> {
  const { consumerKey, consumerSecret, shortcode, passkey } = config.mpesa;
  if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
    return {
      ok: false,
      error:
        'M-Pesa Daraja API credentials (MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY) are not configured on the server. Open Admin API Credentials or add them to your environment secrets.',
    };
  }

  const planSpec = PLAN_CATALOG[params.plan];
  if (!planSpec || planSpec.monthlyKes <= 0) {
    return { ok: false, error: 'Selected plan does not require a paid M-Pesa checkout.' };
  }

  // Normalize Kenyan phone number to 2547XXXXXXXX
  let normalizedPhone = params.phoneNumber.replace(/\D/g, '');
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '254' + normalizedPhone.slice(1);
  } else if (normalizedPhone.startsWith('+')) {
    normalizedPhone = normalizedPhone.slice(1);
  }
  if (!/^254\d{9}$/.test(normalizedPhone)) {
    return { ok: false, error: 'Enter a valid Kenyan M-Pesa phone number (e.g., 0712345678 or 254712345678).' };
  }

  try {
    const authToken = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const oauthRes = await fetch(`${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${authToken}` },
    });
    const { parsed: oauthData, rawText: oauthRaw } = await safeJson(oauthRes);
    if (!oauthRes.ok || !oauthData?.access_token) {
      return {
        ok: false,
        error:
          oauthData?.errorMessage ||
          oauthRaw ||
          `Safaricom Daraja OAuth rejected the configured M-Pesa credentials (HTTP ${oauthRes.status}). Verify MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.`,
      };
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const reference = `SP_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const baseUrl = (params.callbackBaseUrl || config.appUrl).replace(/\/+$/, '');

    const stkRes = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oauthData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: planSpec.monthlyKes,
        PartyA: normalizedPhone,
        PartyB: shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: `${baseUrl}/api/payments/mpesa/callback`,
        AccountReference: reference,
        TransactionDesc: `SPOILER AI ${planSpec.name} Plan`,
      }),
    });

    const { parsed: stkData, rawText: stkRaw } = await safeJson(stkRes);

    if (!stkRes.ok || stkData?.ResponseCode !== '0' || !stkData?.CheckoutRequestID) {
      return {
        ok: false,
        error: stkData?.errorMessage || stkRaw || `M-Pesa STK Push initiation failed (HTTP ${stkRes.status}).`,
      };
    }

    db.prepare(`
      INSERT INTO payments (id, user_id, amount, currency, provider, reference, checkout_request_id, phone_number, plan, status)
      VALUES (?, ?, ?, 'KES', 'MPESA', ?, ?, ?, ?, 'PENDING')
    `).run(
      `pay_${crypto.randomUUID()}`,
      params.userId,
      planSpec.monthlyKes,
      reference,
      stkData.CheckoutRequestID,
      normalizedPhone,
      params.plan
    );

    return {
      ok: true,
      checkoutRequestId: stkData.CheckoutRequestID,
      reference,
      message: stkData.CustomerMessage || 'STK Push sent to your phone. Enter M-Pesa PIN to complete.',
    };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'M-Pesa network request failed' };
  }
}

export async function initiateStripeCheckout(params: {
  userId: string;
  userEmail: string;
  plan: PlanTier;
  callbackBaseUrl?: string;
}): Promise<{ ok: boolean; checkoutUrl?: string; reference?: string; error?: string }> {
  if (!config.stripeSecretKey) {
    return {
      ok: false,
      error:
        'Stripe payment gateway (STRIPE_SECRET_KEY) is not configured on the server. Add your Stripe secret key in Admin API Credentials or environment secrets.',
    };
  }

  const planSpec = PLAN_CATALOG[params.plan];
  if (!planSpec || planSpec.monthlyUsd <= 0) {
    return { ok: false, error: 'Selected plan does not require card checkout.' };
  }

  try {
    const reference = `CARD_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const baseUrl = (params.callbackBaseUrl || config.appUrl).replace(/\/+$/, '');
    const formBody = new URLSearchParams({
      mode: 'payment',
      customer_email: params.userEmail,
      success_url: `${baseUrl}/?payment=success&ref=${reference}`,
      cancel_url: `${baseUrl}/?payment=cancelled`,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `SPOILER AI ${planSpec.name} Subscription`,
      'line_items[0][price_data][unit_amount]': String(planSpec.monthlyUsd * 100),
      'line_items[0][quantity]': '1',
      'metadata[reference]': reference,
      'metadata[userId]': params.userId,
      'metadata[plan]': params.plan,
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });
    const { parsed: data, rawText } = await safeJson(res);
    if (!res.ok || !data?.url) {
      return { ok: false, error: data?.error?.message || rawText || `Stripe Checkout creation failed (HTTP ${res.status})` };
    }

    db.prepare(`
      INSERT INTO payments (id, user_id, amount, currency, provider, reference, checkout_request_id, plan, status)
      VALUES (?, ?, ?, 'USD', 'CARD', ?, ?, ?, 'PENDING')
    `).run(`pay_${crypto.randomUUID()}`, params.userId, planSpec.monthlyUsd, reference, data.id || null, params.plan);

    return { ok: true, checkoutUrl: data.url, reference };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stripe API connection failed' };
  }
}

export function applySubscriptionUpgrade(userId: string, plan: PlanTier) {
  const spec = PLAN_CATALOG[plan];
  const renewsAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  db.prepare(`
    UPDATE subscriptions
    SET plan = ?, status = 'ACTIVE', ai_quota_limit = ?, bot_limit = ?, account_limit = ?, renews_at = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(plan, spec.aiQuota, spec.bots, spec.accounts, renewsAt, userId);
}
