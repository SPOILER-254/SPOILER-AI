import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

const BASE = 'http://localhost:3000';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function req(path: string, opts: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    // non-json
  }
  return { status: res.status, data };
}

function generateTotp(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret) {
    const idx = alphabet.indexOf(ch);
    if (idx !== -1) bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

const SAMPLE_JPG_BASE64 = fs
  .readFileSync(path.resolve(process.cwd(), 'src/assets/images/spoiler_ai_logo_1795477724448.jpg'))
  .toString('base64');

async function run() {
  const email = `e2e_${Date.now()}@spoiler.tech`;
  const password = 'SecurePassword123!';

  console.log('1. Health & Public Meta...');
  const health = await req('/api/health');
  assert(health.status === 200 && health.data.status === 'ok', 'Health check failed');

  const meta = await req('/api/public/meta');
  assert(meta.status === 200 && meta.data.plans?.PRO?.monthlyKes === 3800, 'Public meta failed');

  console.log('2. Registration, Email Verification & Login...');
  const reg = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, fullName: 'E2E Operator' }),
  });
  assert(reg.status === 201 && reg.data.token, 'Registration failed');
  let token = reg.data.token as string;
  const verifyCode = reg.data.devVerificationCode as string;
  assert(Boolean(verifyCode), 'Verification code missing');

  const ver = await req('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ code: verifyCode }) }, token);
  assert(ver.status === 200 && ver.data.emailVerified === true, 'Email verification failed');

  console.log('3. TOTP 2FA Setup, Enable, Session Check & Login Verification...');
  const totpSetup = await req('/api/account/2fa/setup', { method: 'POST' }, token);
  assert(totpSetup.status === 200 && totpSetup.data.secret, '2FA setup failed');
  const code2fa = generateTotp(totpSetup.data.secret);
  const totpEnable = await req('/api/account/2fa/enable', { method: 'POST', body: JSON.stringify({ code: code2fa }) }, token);
  assert(totpEnable.status === 200 && totpEnable.data.twoFactorEnabled === true, '2FA enable failed');

  const loginStep1 = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert(loginStep1.status === 200 && loginStep1.data.requires2FA === true, 'Login 2FA challenge failed');

  const loginStep2 = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, totpCode: generateTotp(totpSetup.data.secret) }),
  });
  assert(loginStep2.status === 200 && loginStep2.data.token, 'Login with 2FA failed');
  token = loginStep2.data.token;

  const sessionsRes = await req('/api/account/sessions', {}, token);
  assert(sessionsRes.status === 200 && sessionsRes.data.sessions.length >= 2, 'Sessions check failed');

  console.log('4. Real-Time WebSocket /ws Authenticated Connection...');
  const wsEvents: string[] = [];
  const ws = new WebSocket(`ws://localhost:3000/ws?token=${encodeURIComponent(token)}`);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WebSocket handshake timed out')), 5000);
    ws.on('message', (raw) => {
      try {
        const ev = JSON.parse(raw.toString());
        if (ev.type) wsEvents.push(ev.type);
        if (ev.type === 'ws:connected') {
          clearTimeout(t);
          resolve();
        }
      } catch {
        // ignore
      }
    });
    ws.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
  assert(wsEvents.includes('ws:connected'), 'WebSocket did not emit ws:connected');

  console.log('5. Platform Catalog & Real API Validation Checks...');
  const catalog = await req('/api/platforms/catalog', {}, token);
  assert(catalog.status === 200 && catalog.data.catalog.length === 16, 'Expected 16 platforms in catalog');

  const badTg = await req(
    '/api/platforms/connect/telegram',
    { method: 'POST', body: JSON.stringify({ botToken: '12345:INVALID_TOKEN_TEST' }) },
    token
  );
  assert(badTg.status === 400, 'Expected real Telegram API to reject invalid token');

  const badWaVerify = await fetch(`${BASE}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=CHALLENGE_99`);
  assert(badWaVerify.status === 403, 'Expected 403 on wrong WhatsApp verify token');

  const configuredVerifyToken = catalog.data.webhookEndpoints.whatsappVerifyToken;
  const waVerify = await fetch(
    `${BASE}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(configuredVerifyToken)}&hub.challenge=CHALLENGE_99`
  );
  const waChallenge = await waVerify.text();
  assert(waVerify.status === 200 && waChallenge === 'CHALLENGE_99', 'WhatsApp webhook hub verification failed');

  const badMetaVerify = await fetch(`${BASE}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=META_99`);
  assert(badMetaVerify.status === 403, 'Expected 403 on wrong Meta webhook verify token');

  const metaVerify = await fetch(
    `${BASE}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(configuredVerifyToken)}&hub.challenge=META_99`
  );
  const metaChallenge = await metaVerify.text();
  assert(metaVerify.status === 200 && metaChallenge === 'META_99', 'Meta webhook hub verification failed');

  console.log('6. AI Bot Studio & Multilingual Gemini Reply Engine (Sheng, Swahili, Translate, Summarize)...');
  const botsRes = await req('/api/bots', {}, token);
  assert(botsRes.status === 200 && botsRes.data.bots.length >= 1, 'Starter bot missing');
  const botId = botsRes.data.bots[0].id;

  const shengReply = await req(
    '/api/ai/reply-test',
    {
      method: 'POST',
      body: JSON.stringify({
        botId,
        platform: 'whatsapp',
        senderName: 'Kamau',
        message: 'Niaje bro, bei ya Pro plan ni ngapi na mnaaccept M-Pesa?',
        pushToInbox: true,
      }),
    },
    token
  );
  assert(
    shengReply.status === 200 && shengReply.data.aiResult?.suggestedReply,
    `Sheng AUTO reply failed (${shengReply.status}): ${JSON.stringify(shengReply.data)}`
  );
  console.log(`   -> Sheng detected as: ${shengReply.data.aiResult.detectedLanguage}`);
  console.log(`   -> AI Reply: ${shengReply.data.aiResult.suggestedReply.slice(0, 120)}`);

  const transRes = await req(
    '/api/ai/translate',
    { method: 'POST', body: JSON.stringify({ text: 'Niaje bro, bei ya Pro plan ni ngapi?', targetLanguage: 'English' }) },
    token
  );
  assert(transRes.status === 200 && Boolean(transRes.data.result), 'Translation failed');

  const sumRes = await req('/api/ai/summarize', { method: 'POST', body: JSON.stringify({ conversationId: shengReply.data.conversationId }) }, token);
  assert(sumRes.status === 200 && Boolean(sumRes.data.summary), 'Conversation summarize failed');

  console.log('7. MANUAL Mode + Universal Inbox Approval Queue...');
  await req(`/api/bots/${botId}`, { method: 'PATCH', body: JSON.stringify({ automationMode: 'MANUAL' }) }, token);
  const manualRun = await req(
    '/api/ai/reply-test',
    {
      method: 'POST',
      body: JSON.stringify({
        botId,
        platform: 'telegram',
        senderName: 'Zainab',
        message: 'Habari, ninahitaji msaada wa kuunganisha akaunti yangu ya biashara.',
        pushToInbox: true,
      }),
    },
    token
  );
  assert(
    manualRun.status === 200 && manualRun.data.approvalId,
    `MANUAL mode did not queue approval (${manualRun.status}): ${JSON.stringify(manualRun.data)}`
  );
  const approvals = await req('/api/approvals', {}, token);
  assert(approvals.data.approvals.length >= 1, 'Approvals list empty');

  const approveRes = await req(
    `/api/approvals/${manualRun.data.approvalId}/decision`,
    { method: 'POST', body: JSON.stringify({ decision: 'APPROVE', editedReply: 'Karibu sana! Tutakusaidia sasa hivi.' }) },
    token
  );
  assert(approveRes.status === 200 && approveRes.data.status === 'APPROVED', 'Approval decision failed');

  console.log('8. ReplyImg Multimodal Vision + Authenticated Media Fetch...');
  const imgRes = await req(
    '/api/ai/replyimg',
    {
      method: 'POST',
      body: JSON.stringify({
        imageBase64: SAMPLE_JPG_BASE64,
        mimeType: 'image/jpeg',
        filename: 'spoiler_emblem.jpg',
        question: 'Describe this emblem image, its colors, and suggest a social reply.',
        pushToInbox: false,
      }),
    },
    token
  );
  assert(imgRes.status === 200 && imgRes.data.analysis?.description, `ReplyImg vision call failed: ${JSON.stringify(imgRes.data)}`);
  console.log(`   -> ReplyImg description: ${imgRes.data.analysis.description.slice(0, 100)}`);

  const mediaRes = await fetch(`${BASE}${imgRes.data.mediaUrl}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(mediaRes.status === 200, 'Authenticated media fetch failed');

  console.log('9. Workflows, Scheduled Posts, Emergency STOP & Live WebSocket Event Assertion...');
  const wfList = await req('/api/workflows', {}, token);
  assert(wfList.status === 200 && wfList.data.workflows.length >= 1, 'Starter workflow missing');
  const wfTest = await req(
    `/api/workflows/${wfList.data.workflows[0].id}/test`,
    { method: 'POST', body: JSON.stringify({ sampleMessage: 'Hello, what services do you automate?' }) },
    token
  );
  assert(wfTest.status === 200 && wfTest.data.ok === true, 'Workflow execution test failed');

  const schedCreate = await req(
    '/api/scheduled-posts',
    { method: 'POST', body: JSON.stringify({ platform: 'x', content: 'SPOILER AI E2E scheduled post', scheduledFor: '2026-12-01T09:00' }) },
    token
  );
  assert(schedCreate.status === 201 && schedCreate.data.id, 'Scheduled post creation failed');

  const schedPub = await req(`/api/scheduled-posts/${schedCreate.data.id}/publish`, { method: 'POST' }, token);
  assert(
    schedPub.status === 400 && typeof schedPub.data.error === 'string' && schedPub.data.error.includes('connected'),
    `Expected honest missing-account error when publishing X post without connected account, got: ${JSON.stringify(schedPub)}`
  );

  const stopRes = await req('/api/automation/emergency-stop', { method: 'POST' }, token);
  assert(stopRes.status === 200 && stopRes.data.globalAutomationEnabled === false, 'Emergency stop failed');

  await new Promise((r) => setTimeout(r, 150));
  ws.close();
  assert(wsEvents.includes('inbox:message') && wsEvents.includes('automation:emergency_stop'), `Expected WebSocket live events, got: ${wsEvents.join(', ')}`);

  console.log('10. M-Pesa / Stripe Gateway Validation & Admin RBAC Isolation...');
  const billingInfo = await req('/api/billing', {}, token);
  assert(billingInfo.status === 200, 'Billing endpoint failed');

  const mpesaRes = await req(
    '/api/payments/mpesa/stk-push',
    { method: 'POST', body: JSON.stringify({ phoneNumber: '0712345678', plan: 'PRO' }) },
    token
  );
  assert(
    mpesaRes.status === 200 || (mpesaRes.status === 400 && typeof mpesaRes.data.error === 'string' && !mpesaRes.data.error.includes('Unexpected end of JSON')),
    `M-Pesa gateway check failed: ${JSON.stringify(mpesaRes)}`
  );

  const stripeRes = await req('/api/payments/stripe/checkout', { method: 'POST', body: JSON.stringify({ plan: 'PRO' }) }, token);
  assert(
    stripeRes.status === 200 || (stripeRes.status === 400 && typeof stripeRes.data.error === 'string' && !stripeRes.data.error.includes('Unexpected end of JSON')),
    `Stripe gateway check failed: ${JSON.stringify(stripeRes)}`
  );

  const deniedAdmin = await req('/api/admin/overview', {}, token);
  assert(deniedAdmin.status === 403, 'Non-admin was not blocked from /api/admin/overview');

  const deniedCreds = await req('/api/admin/credentials', {}, token);
  assert(deniedCreds.status === 403, 'Non-admin was not blocked from /api/admin/credentials');

  console.log('11. Cleanup Test Account...');
  const del = await req('/api/account', { method: 'DELETE', body: JSON.stringify({ password }) }, token);
  assert(del.status === 200 && del.data.ok === true, 'Cleanup delete account failed');

  console.log('\nALL 11 E2E VERIFICATION SUITES PASSED.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
