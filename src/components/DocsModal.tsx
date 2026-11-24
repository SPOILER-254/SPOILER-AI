import React from 'react';
import { X } from 'lucide-react';

export function DocsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-[#111114] border border-white/12 p-6 max-h-[88vh] overflow-y-auto space-y-5 text-xs text-zinc-300 leading-relaxed">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="font-display text-xl font-bold text-white">SPOILER AI API, Webhook &amp; Deployment Reference</h2>
            <p className="text-zinc-400">Powered by SPOILER-TECH</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <section className="space-y-1.5">
          <h3 className="font-display text-sm font-bold text-white">1. Core API Endpoints</h3>
          <div className="p-3 rounded-lg bg-black border border-white/8 font-mono space-y-1 text-[11px]">
            <p>POST /api/auth/register · /api/auth/login · /api/auth/verify-email</p>
            <p>GET  /api/platforms/catalog · POST /api/platforms/connect/telegram · /whatsapp · /token</p>
            <p>GET  /api/oauth/:platform/url · GET /api/oauth/:platform/callback</p>
            <p>GET  /api/webhooks/whatsapp · POST /api/webhooks/whatsapp</p>
            <p>GET  /api/webhooks/meta · POST /api/webhooks/meta</p>
            <p>POST /api/webhooks/telegram/:accountId · POST /api/webhooks/slack/:accountId</p>
            <p>POST /api/ai/reply-test · POST /api/ai/replyimg · POST /api/ai/translate · POST /api/ai/summarize</p>
            <p>GET  /api/inbox/conversations · POST /api/approvals/:id/decision</p>
            <p>POST /api/scheduled-posts/:id/publish</p>
            <p>POST /api/payments/mpesa/stk-push · POST /api/payments/mpesa/callback</p>
            <p>GET  /api/admin/credentials · PUT /api/admin/credentials</p>
            <p>WS   /ws?token=&lt;bearer_session_token&gt;</p>
          </div>
        </section>

        <section className="space-y-1.5">
          <h3 className="font-display text-sm font-bold text-white">2. WhatsApp Business Cloud API &amp; Telegram Testing</h3>
          <p>
            Telegram: Create a bot with @BotFather, paste the token in Connection Center. SPOILER AI verifies via Telegram getMe and registers the live HTTPS webhook when APP_URL is HTTPS.
          </p>
          <p>
            WhatsApp &amp; Meta: Enter Phone Number ID and System User Token from Meta Developers. Set Meta Webhook URL to <code className="text-red-300">{window.location.origin}/api/webhooks/whatsapp</code> (or <code className="text-red-300">{window.location.origin}/api/webhooks/meta</code> for Instagram/Messenger) and Verify Token to your <code className="text-red-300">WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>.
          </p>
        </section>

        <section className="space-y-1.5">
          <h3 className="font-display text-sm font-bold text-white">3. Production Deployment (Render, Railway &amp; Cloud Run)</h3>
          <p>
            Set required server secrets (<code className="text-white">GEMINI_API_KEY</code>, <code className="text-white">SESSION_SECRET</code>, <code className="text-white">TOKEN_ENCRYPTION_KEY</code>, <code className="text-white">ADMIN_PASSCODE</code>) and mount persistent storage at <code className="text-white">DATA_DIR=/var/data</code> (Render) or <code className="text-white">/data</code> (Railway). Build and launch with <code className="text-white">npm run build &amp;&amp; npm start</code> (Node &ge; 22), then manage optional Meta, M-Pesa, Stripe, Resend, and OAuth secrets securely in the Admin &rarr; API Credentials Vault.
          </p>
        </section>
      </div>
    </div>
  );
}
