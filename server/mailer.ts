import { config } from './config.ts';

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; provider: 'resend' | 'none'; error?: string }> {
  const apiKey = config.resendApiKey;
  if (!apiKey) {
    return { sent: false, provider: 'none' };
  }

  const from = config.emailFrom || 'SPOILER AI <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { sent: false, provider: 'resend', error: errText || `HTTP ${res.status}` };
    }
    return { sent: true, provider: 'resend' };
  } catch (err: unknown) {
    return {
      sent: false,
      provider: 'resend',
      error: err instanceof Error ? err.message : 'Email delivery error',
    };
  }
}
