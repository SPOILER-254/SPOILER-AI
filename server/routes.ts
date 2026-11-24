import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express, { type Express, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { config, resolveAppUrl } from './config.ts';
import { deleteVaultCredential, getCredentialStatuses, setVaultCredentials } from './credentials.ts';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashPassword,
  hashToken,
  safeEqualStrings,
  signSessionToken,
  verifyMetaSignature,
  verifyPassword,
  verifySessionToken,
  verifySlackSignature,
  verifyTotpCode,
} from './crypto.ts';
import { dataDir, db, dbPath, UPLOADS_DIR } from './db.ts';
import { analyzeImageWithReplyImg, generateUniversalReply, translateOrSummarize } from './ai.ts';
import { processInboundMessage } from './automation.ts';
import { sendTransactionalEmail } from './mailer.ts';
import { type AuthRequest, provisionNewUserWorkspace, requireAdmin, requireAuth, writeAuditLog } from './middleware.ts';
import { applySubscriptionUpgrade, initiateMpesaStkPush, initiateStripeCheckout, PLAN_CATALOG, type PlanTier } from './payments.ts';
import {
  downloadWhatsAppMedia,
  fetchOAuthUserProfile,
  getPlatformCatalog,
  publishScheduledPostToPlatform,
  saveEncryptedToken,
  sendPlatformMessage,
  syncTelegramCommands,
  verifyAndConnectTelegram,
  verifyAndConnectWhatsApp,
  verifyDiscordBotToken,
  verifyGmailToken,
  verifySlackBotToken,
} from './platforms.ts';
import { broadcastToUser } from './realtime.ts';

const pkceVerifiers = new Map<string, { verifier: string; exp: number }>();

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function createSessionForUser(user: { id: string; role: string }, req: Request, deviceName?: string) {
  const sessionId = `ses_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const token = signSessionToken({
    sid: sessionId,
    uid: user.id,
    role: user.role,
    exp: Date.now() + 7 * 24 * 3600 * 1000,
  });

  const ua = String(req.headers['user-agent'] || 'Web Browser');
  const resolvedDevice =
    deviceName ||
    (/Mobile|Android|iPhone/i.test(ua) ? 'Mobile Device' : /Macintosh|Mac OS/i.test(ua) ? 'Mac Desktop' : /Windows/i.test(ua) ? 'Windows PC' : 'Web Browser');

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, device_name, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, user.id, hashToken(token), resolvedDevice, getClientIp(req), ua.slice(0, 200), expiresAt);

  return { token, sessionId, expiresAt };
}

let schedulerStarted = false;
function startScheduledPostsWorker() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const timer = setInterval(async () => {
    try {
      const due = db
        .prepare("SELECT * FROM scheduled_posts WHERE status = 'SCHEDULED' AND datetime(scheduled_for) <= datetime('now') LIMIT 5")
        .all() as any[];
      for (const post of due) {
        await publishScheduledPostToPlatform(post);
      }
    } catch {
      // background tick safeguard
    }
  }, 30_000);
  timer.unref();
}

export function registerRoutes(app: Express) {
  startScheduledPostsWorker();
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded. Please wait a moment.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Try again shortly.' },
  });

  app.use('/api', apiLimiter);

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'SPOILER AI',
      poweredBy: 'SPOILER-TECH',
      timestamp: new Date().toISOString(),
    });
  });

  // Public plan catalog & admin bootstrap state
  app.get('/api/public/meta', (_req, res) => {
    const adminCount = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get() as { cnt: number }).cnt;
    const announcementsRow = db.prepare("SELECT value_json FROM platform_settings WHERE key = 'announcements'").get() as { value_json: string } | undefined;
    res.json({
      plans: PLAN_CATALOG,
      adminClaimed: adminCount > 0 || Boolean(config.adminPasscode),
      announcements: announcementsRow ? JSON.parse(announcementsRow.value_json) : [],
    });
  });

  // --- AUTHENTICATION ---
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { email, password, fullName } = req.body || {};
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userId = `usr_${crypto.randomUUID()}`;
    const verificationCode = String(crypto.randomInt(100000, 999999));
    const passwordHash = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, email_verified, verification_code)
      VALUES (?, ?, ?, ?, 'user', 0, ?)
    `).run(userId, normalizedEmail, passwordHash, fullName.trim(), verificationCode);

    provisionNewUserWorkspace(userId, fullName.trim());
    const session = createSessionForUser({ id: userId, role: 'user' }, req);
    writeAuditLog({ userId, action: 'USER_REGISTERED', targetType: 'user', targetId: userId, ipAddress: getClientIp(req) });

    const mail = await sendTransactionalEmail({
      to: normalizedEmail,
      subject: 'SPOILER AI Email Verification Code',
      html: `<p>Welcome to <strong>SPOILER AI</strong>.</p><p>Your verification code is: <strong>${verificationCode}</strong></p>`,
    });

    res.status(201).json({
      token: session.token,
      user: {
        id: userId,
        email: normalizedEmail,
        fullName: fullName.trim(),
        role: 'user',
        emailVerified: false,
        twoFactorEnabled: false,
        globalAutomationEnabled: true,
      },
      emailSent: mail.sent,
      ...(mail.sent ? {} : { devVerificationCode: verificationCode }),
    });
  });

  app.post('/api/auth/login', authLimiter, (req, res) => {
    const { email, password, totpCode } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (user.suspended) {
      res.status(403).json({ error: 'Account suspended by SPOILER-TECH administrator.' });
      return;
    }

    if (user.two_factor_enabled) {
      if (!totpCode) {
        res.status(200).json({ requires2FA: true });
        return;
      }
      const secret = user.two_factor_secret_enc ? decryptSecret(user.two_factor_secret_enc) : null;
      if (!secret || !verifyTotpCode(secret, String(totpCode))) {
        res.status(401).json({ error: 'Invalid 2FA authenticator code.' });
        return;
      }
    }

    const session = createSessionForUser({ id: user.id, role: user.role }, req);
    writeAuditLog({ userId: user.id, action: 'USER_LOGIN', targetType: 'session', targetId: session.sessionId, ipAddress: getClientIp(req) });

    res.json({
      token: session.token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        emailVerified: Boolean(user.email_verified),
        twoFactorEnabled: Boolean(user.two_factor_enabled),
        globalAutomationEnabled: Boolean(user.global_automation_enabled),
      },
    });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthRequest, res) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(req.authUser!.sessionId);
    res.json({ ok: true });
  });

  app.post('/api/auth/verify-email', requireAuth, (req: AuthRequest, res) => {
    const { code } = req.body || {};
    const row = db.prepare('SELECT verification_code FROM users WHERE id = ?').get(req.authUser!.id) as { verification_code: string | null } | undefined;
    if (!row || !row.verification_code || String(code).trim() !== row.verification_code) {
      res.status(400).json({ error: 'Invalid verification code.' });
      return;
    }
    db.prepare('UPDATE users SET email_verified = 1, verification_code = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(req.authUser!.id);
    writeAuditLog({ userId: req.authUser!.id, action: 'EMAIL_VERIFIED', ipAddress: getClientIp(req) });
    res.json({ ok: true, emailVerified: true });
  });

  app.post('/api/auth/resend-verification', requireAuth, async (req: AuthRequest, res) => {
    const code = String(crypto.randomInt(100000, 999999));
    db.prepare('UPDATE users SET verification_code = ? WHERE id = ?').run(code, req.authUser!.id);
    const mail = await sendTransactionalEmail({
      to: req.authUser!.email,
      subject: 'SPOILER AI Verification Code',
      html: `<p>Your SPOILER AI email verification code is: <strong>${code}</strong></p>`,
    });
    res.json({ ok: true, emailSent: mail.sent, ...(mail.sent ? {} : { devVerificationCode: code }) });
  });

  app.post('/api/auth/request-reset', authLimiter, async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as { id: string } | undefined;
    if (!user) {
      res.json({ ok: true, message: 'If that email exists, a reset code was issued.' });
      return;
    }
    const resetCode = String(crypto.randomInt(100000, 999999));
    db.prepare('UPDATE users SET reset_code = ? WHERE id = ?').run(resetCode, user.id);

    const mail = await sendTransactionalEmail({
      to: normalizedEmail,
      subject: 'SPOILER AI Password Reset Code',
      html: `<p>Use this one-time code to reset your SPOILER AI password: <strong>${resetCode}</strong></p>`,
    });

    const isProd = process.env.NODE_ENV === 'production';
    res.json({
      ok: true,
      emailSent: mail.sent,
      ...(!mail.sent && !isProd ? { devResetCode: resetCode } : {}),
      message: mail.sent
        ? 'Password reset code sent to your email address.'
        : isProd
          ? 'Reset code issued. Configure RESEND_API_KEY in Admin API Credentials for automated email delivery or contact your SPOILER-TECH administrator.'
          : 'Password reset code generated.',
    });
  });

  app.post('/api/auth/reset-password', authLimiter, (req, res) => {
    const { email, code, newPassword } = req.body || {};
    if (typeof email !== 'string' || typeof code !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'Email, valid reset code, and new password (8+ chars) required.' });
      return;
    }
    const user = db.prepare('SELECT id, reset_code FROM users WHERE email = ?').get(email.trim().toLowerCase()) as any;
    if (!user || !user.reset_code || user.reset_code !== code.trim()) {
      res.status(400).json({ error: 'Invalid or expired reset code.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, reset_code = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(
      hashPassword(newPassword),
      user.id
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.authUser!.id) as any;
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.authUser!.id) as any;
    const adminCount = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get() as { cnt: number }).cnt;
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        emailVerified: Boolean(user.email_verified),
        twoFactorEnabled: Boolean(user.two_factor_enabled),
        globalAutomationEnabled: Boolean(user.global_automation_enabled),
        createdAt: user.created_at,
      },
      subscription: sub,
      canClaimAdmin: user.role !== 'admin' && (adminCount === 0 || Boolean(config.adminPasscode)),
    });
  });

  // --- ACCOUNT MANAGEMENT & 2FA ---
  app.patch('/api/account/profile', requireAuth, (req: AuthRequest, res) => {
    const { fullName } = req.body || {};
    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Valid name required.' });
      return;
    }
    db.prepare('UPDATE users SET full_name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(fullName.trim(), req.authUser!.id);
    res.json({ ok: true, fullName: fullName.trim() });
  });

  app.post('/api/account/change-password', requireAuth, (req: AuthRequest, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'Current password and new password (8+ chars) required.' });
      return;
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.authUser!.id) as { password_hash: string };
    if (!verifyPassword(currentPassword, user.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      hashPassword(newPassword),
      req.authUser!.id
    );
    writeAuditLog({ userId: req.authUser!.id, action: 'PASSWORD_CHANGED', ipAddress: getClientIp(req) });
    res.json({ ok: true });
  });

  app.post('/api/account/2fa/setup', requireAuth, (req: AuthRequest, res) => {
    const secret = generateTotpSecret();
    db.prepare('UPDATE users SET two_factor_secret_enc = ? WHERE id = ?').run(encryptSecret(secret), req.authUser!.id);
    const otpauthUrl = `otpauth://totp/SPOILER%20AI:${encodeURIComponent(req.authUser!.email)}?secret=${secret}&issuer=SPOILER-TECH`;
    res.json({ secret, otpauthUrl });
  });

  app.post('/api/account/2fa/enable', requireAuth, (req: AuthRequest, res) => {
    const { code } = req.body || {};
    const user = db.prepare('SELECT two_factor_secret_enc FROM users WHERE id = ?').get(req.authUser!.id) as { two_factor_secret_enc: string | null };
    const secret = user.two_factor_secret_enc ? decryptSecret(user.two_factor_secret_enc) : null;
    if (!secret || !verifyTotpCode(secret, String(code || ''))) {
      res.status(400).json({ error: 'Invalid 6-digit authenticator code.' });
      return;
    }
    db.prepare('UPDATE users SET two_factor_enabled = 1 WHERE id = ?').run(req.authUser!.id);
    writeAuditLog({ userId: req.authUser!.id, action: '2FA_ENABLED', ipAddress: getClientIp(req) });
    res.json({ ok: true, twoFactorEnabled: true });
  });

  app.post('/api/account/2fa/disable', requireAuth, (req: AuthRequest, res) => {
    const { password } = req.body || {};
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.authUser!.id) as { password_hash: string };
    if (!verifyPassword(String(password || ''), user.password_hash)) {
      res.status(400).json({ error: 'Password verification failed.' });
      return;
    }
    db.prepare('UPDATE users SET two_factor_enabled = 0, two_factor_secret_enc = NULL WHERE id = ?').run(req.authUser!.id);
    writeAuditLog({ userId: req.authUser!.id, action: '2FA_DISABLED', ipAddress: getClientIp(req) });
    res.json({ ok: true, twoFactorEnabled: false });
  });

  app.get('/api/account/sessions', requireAuth, (req: AuthRequest, res) => {
    const rows = db
      .prepare('SELECT id, device_name, ip_address, last_active_at, created_at FROM sessions WHERE user_id = ? ORDER BY last_active_at DESC')
      .all(req.authUser!.id) as any[];
    res.json({
      sessions: rows.map((r) => ({ ...r, current: r.id === req.authUser!.sessionId })),
    });
  });

  app.delete('/api/account/sessions/:sessionId', requireAuth, (req: AuthRequest, res) => {
    db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.sessionId, req.authUser!.id);
    res.json({ ok: true });
  });

  app.delete('/api/account', requireAuth, (req: AuthRequest, res) => {
    const { password } = req.body || {};
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.authUser!.id) as { password_hash: string };
    if (!verifyPassword(String(password || ''), user.password_hash)) {
      res.status(400).json({ error: 'Confirm your password before deleting your account.' });
      return;
    }

    const mediaRows = db
      .prepare('SELECT id, mime_type FROM media_files WHERE user_id = ?')
      .all(req.authUser!.id) as Array<{ id: string; mime_type: string }>;
    const uploadsBase = path.resolve(UPLOADS_DIR);
    for (const m of mediaRows) {
      const ext = String(m.mime_type).split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
      const candidate = path.resolve(uploadsBase, `${m.id}.${ext}`);
      if (candidate.startsWith(uploadsBase + path.sep) && fs.existsSync(candidate)) {
        try {
          fs.unlinkSync(candidate);
        } catch {
          // continue cleanup
        }
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  // First-run / Admin Passcode Claim
  app.post('/api/account/admin-claim', requireAuth, (req: AuthRequest, res) => {
    const { passcode } = req.body || {};
    const adminCount = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get() as { cnt: number }).cnt;

    if (config.adminPasscode) {
      if (!safeEqualStrings(String(passcode || ''), config.adminPasscode)) {
        res.status(403).json({ error: 'Invalid SPOILER-TECH administrator passcode.' });
        return;
      }
    } else if (adminCount > 0) {
      res.status(403).json({ error: 'Administrator role has already been claimed. Set ADMIN_PASSCODE in server environment.' });
      return;
    }

    db.prepare("UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE id = ?").run(req.authUser!.id);
    writeAuditLog({ userId: req.authUser!.id, action: 'ADMIN_ROLE_CLAIMED', ipAddress: getClientIp(req) });
    res.json({ ok: true, role: 'admin' });
  });

  // --- DASHBOARD & GLOBAL AUTOMATION ---
  app.get('/api/dashboard', requireAuth, (req: AuthRequest, res) => {
    const uid = req.authUser!.id;
    const user = db.prepare('SELECT global_automation_enabled FROM users WHERE id = ?').get(uid) as { global_automation_enabled: number };
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(uid) as any;

    const connectedAccounts = db
      .prepare('SELECT id, platform, account_name, status, automation_mode, last_error, webhook_verified FROM social_accounts WHERE user_id = ?')
      .all(uid) as any[];
    const activeBots = (db.prepare('SELECT COUNT(*) as cnt FROM ai_bots WHERE user_id = ? AND active = 1').get(uid) as { cnt: number }).cnt;
    const totalIncoming = (db.prepare("SELECT COUNT(*) as cnt FROM messages WHERE user_id = ? AND direction = 'INBOUND'").get(uid) as { cnt: number }).cnt;
    const totalAutoReplies = (db.prepare("SELECT COUNT(*) as cnt FROM messages WHERE user_id = ? AND direction = 'OUTBOUND' AND sender_type = 'AI'").get(uid) as { cnt: number }).cnt;
    const pendingApprovals = (db.prepare("SELECT COUNT(*) as cnt FROM approval_queue WHERE user_id = ? AND status = 'PENDING'").get(uid) as { cnt: number }).cnt;
    const activeWorkflows = (db.prepare('SELECT COUNT(*) as cnt FROM automation_workflows WHERE user_id = ? AND active = 1').get(uid) as { cnt: number }).cnt;
    const scheduledPosts = (db.prepare("SELECT COUNT(*) as cnt FROM scheduled_posts WHERE user_id = ? AND status = 'SCHEDULED'").get(uid) as { cnt: number }).cnt;

    const recentActivity = db
      .prepare('SELECT id, action, target_type, created_at, metadata_json FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8')
      .all(uid);

    const warnings = connectedAccounts
      .filter((a) => a.status !== 'CONNECTED' || a.last_error)
      .map((a) => ({ accountId: a.id, platform: a.platform, accountName: a.account_name, message: a.last_error || `Status: ${a.status}` }));

    const announcementsRow = db.prepare("SELECT value_json FROM platform_settings WHERE key = 'announcements'").get() as { value_json: string } | undefined;

    res.json({
      globalAutomationEnabled: Boolean(user.global_automation_enabled),
      metrics: {
        connectedAccounts: connectedAccounts.filter((a) => a.status === 'CONNECTED').length,
        totalConfiguredAccounts: connectedAccounts.length,
        activeBots,
        totalIncomingMessages: totalIncoming,
        totalAutomaticReplies: totalAutoReplies,
        pendingManualApprovals: pendingApprovals,
        activeWorkflows,
        scheduledPosts,
      },
      aiUsage: {
        used: sub?.ai_usage_count || 0,
        limit: sub?.ai_quota_limit || 250,
        plan: sub?.plan || 'FREE',
        status: sub?.status || 'ACTIVE',
      },
      connectedAccounts,
      recentActivity,
      warnings,
      announcements: announcementsRow ? JSON.parse(announcementsRow.value_json) : [],
    });
  });

  app.post('/api/automation/global-switch', requireAuth, (req: AuthRequest, res) => {
    const enabled = Boolean(req.body?.enabled);
    db.prepare('UPDATE users SET global_automation_enabled = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      enabled ? 1 : 0,
      req.authUser!.id
    );
    writeAuditLog({
      userId: req.authUser!.id,
      action: enabled ? 'GLOBAL_AUTOMATION_ENABLED' : 'GLOBAL_AUTOMATION_PAUSED',
      ipAddress: getClientIp(req),
    });
    broadcastToUser(req.authUser!.id, { type: 'automation:global', payload: { enabled } });
    res.json({ ok: true, globalAutomationEnabled: enabled });
  });

  app.post('/api/automation/emergency-stop', requireAuth, (req: AuthRequest, res) => {
    const uid = req.authUser!.id;
    db.prepare('UPDATE users SET global_automation_enabled = 0, updated_at = datetime(\'now\') WHERE id = ?').run(uid);
    db.prepare('UPDATE automation_workflows SET active = 0 WHERE user_id = ?').run(uid);
    db.prepare("UPDATE social_accounts SET automation_mode = 'MANUAL' WHERE user_id = ?").run(uid);
    db.prepare("UPDATE ai_bots SET automation_mode = 'MANUAL' WHERE user_id = ?").run(uid);

    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body)
      VALUES (?, ?, 'ALERT', 'Emergency Stop Activated', 'All workflows paused and all bots/channels switched to MANUAL mode.')
    `).run(`notif_${crypto.randomUUID()}`, uid);

    writeAuditLog({ userId: uid, action: 'EMERGENCY_STOP_TRIGGERED', ipAddress: getClientIp(req) });
    broadcastToUser(uid, { type: 'automation:emergency_stop', payload: { stoppedAt: new Date().toISOString() } });
    res.json({ ok: true, globalAutomationEnabled: false });
  });

  // --- SOCIAL MEDIA CONNECTION CENTER ---
  app.get('/api/platforms/catalog', requireAuth, (req: AuthRequest, res) => {
    const catalog = getPlatformCatalog();
    const appBaseUrl = resolveAppUrl(req);
    const accounts = db
      .prepare('SELECT id, platform, account_name, external_id, status, automation_mode, permissions_json, features_json, webhook_url, webhook_verified, last_error, created_at FROM social_accounts WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.authUser!.id) as any[];

    res.json({
      catalog,
      accounts: accounts.map((a) => ({
        ...a,
        permissions: JSON.parse(a.permissions_json || '[]'),
        features: JSON.parse(a.features_json || '{}'),
      })),
      webhookEndpoints: {
        whatsapp: `${appBaseUrl}/api/webhooks/whatsapp`,
        whatsappVerifyToken: config.whatsappVerifyToken,
        meta: `${appBaseUrl}/api/webhooks/meta`,
        telegramPattern: `${appBaseUrl}/api/webhooks/telegram/{accountId}`,
        slackPattern: `${appBaseUrl}/api/webhooks/slack/{accountId}`,
      },
    });
  });

  function checkAccountLimit(userId: string): boolean {
    const sub = db.prepare('SELECT account_limit FROM subscriptions WHERE user_id = ?').get(userId) as { account_limit: number } | undefined;
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM social_accounts WHERE user_id = ?').get(userId) as { cnt: number }).cnt;
    return count < (sub?.account_limit || 2);
  }

  app.post('/api/platforms/connect/telegram', requireAuth, async (req: AuthRequest, res) => {
    if (!checkAccountLimit(req.authUser!.id)) {
      res.status(403).json({ error: 'Account connection limit reached for your plan. Upgrade in Billing.' });
      return;
    }
    const { botToken, automationMode } = req.body || {};
    if (typeof botToken !== 'string' || !botToken.includes(':')) {
      res.status(400).json({ error: 'Enter a valid Telegram Bot Token from @BotFather.' });
      return;
    }

    const accountId = `acc_${crypto.randomUUID()}`;
    const appBaseUrl = resolveAppUrl(req);
    const check = await verifyAndConnectTelegram(botToken.trim(), accountId, appBaseUrl);
    if (!check.ok) {
      res.status(400).json({ error: check.error || 'Telegram verification failed.' });
      return;
    }

    db.prepare(`
      INSERT INTO social_accounts (id, user_id, platform, account_name, external_id, status, automation_mode, permissions_json, features_json, webhook_url, webhook_verified)
      VALUES (?, ?, 'telegram', ?, ?, 'CONNECTED', ?, ?, ?, ?, ?)
    `).run(
      accountId,
      req.authUser!.id,
      check.username || 'Telegram Bot',
      check.botId || null,
      automationMode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC',
      JSON.stringify(['bot:messages', 'bot:commands', 'bot:photos', 'webhook:updates']),
      JSON.stringify({ replies: true, images: true, groups: true, commands: true }),
      check.webhookUrl || null,
      check.webhookRegistered ? 1 : 0
    );

    saveEncryptedToken({ socialAccountId: accountId, token: botToken.trim(), tokenType: 'telegram_bot' });
    writeAuditLog({ userId: req.authUser!.id, action: 'PLATFORM_CONNECTED', targetType: 'social_account', targetId: accountId, metadata: { platform: 'telegram' } });

    res.status(201).json({
      ok: true,
      accountId,
      accountName: check.username,
      webhookRegistered: check.webhookRegistered,
      webhookUrl: check.webhookUrl,
    });
  });

  app.post('/api/platforms/connect/whatsapp', requireAuth, async (req: AuthRequest, res) => {
    if (!checkAccountLimit(req.authUser!.id)) {
      res.status(403).json({ error: 'Account connection limit reached for your plan. Upgrade in Billing.' });
      return;
    }
    const { phoneNumberId, accessToken, wabaId, appSecret, automationMode } = req.body || {};
    if (typeof phoneNumberId !== 'string' || typeof accessToken !== 'string' || !phoneNumberId.trim() || !accessToken.trim()) {
      res.status(400).json({ error: 'Phone Number ID and Meta System User Access Token are required.' });
      return;
    }

    const verify = await verifyAndConnectWhatsApp({
      phoneNumberId: phoneNumberId.trim(),
      accessToken: accessToken.trim(),
    });
    if (!verify.ok) {
      res.status(400).json({ error: verify.error || 'WhatsApp Cloud API verification failed.' });
      return;
    }

    const accountId = `acc_${crypto.randomUUID()}`;
    const appBaseUrl = resolveAppUrl(req);
    const displayName = verify.verifiedName
      ? `${verify.verifiedName} (${verify.displayPhone || phoneNumberId.trim()})`
      : verify.displayPhone || phoneNumberId.trim();

    db.prepare(`
      INSERT INTO social_accounts (id, user_id, platform, account_name, external_id, status, automation_mode, permissions_json, features_json, webhook_url, webhook_verified)
      VALUES (?, ?, 'whatsapp', ?, ?, 'CONNECTED', ?, ?, ?, ?, 0)
    `).run(
      accountId,
      req.authUser!.id,
      displayName,
      phoneNumberId.trim(),
      automationMode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC',
      JSON.stringify(['whatsapp_business_messaging', 'whatsapp_business_management']),
      JSON.stringify({ cloudApi: true, templates: true, media: true, wabaId: wabaId || null }),
      `${appBaseUrl}/api/webhooks/whatsapp`
    );

    saveEncryptedToken({
      socialAccountId: accountId,
      token: accessToken.trim(),
      secret: typeof appSecret === 'string' && appSecret.trim() ? appSecret.trim() : undefined,
      tokenType: 'meta_cloud_bearer',
    });

    writeAuditLog({ userId: req.authUser!.id, action: 'PLATFORM_CONNECTED', targetType: 'social_account', targetId: accountId, metadata: { platform: 'whatsapp' } });

    res.status(201).json({
      ok: true,
      accountId,
      accountName: displayName,
      webhookUrl: `${appBaseUrl}/api/webhooks/whatsapp`,
      verifyToken: config.whatsappVerifyToken,
    });
  });

  app.post('/api/platforms/connect/token', requireAuth, async (req: AuthRequest, res) => {
    if (!checkAccountLimit(req.authUser!.id)) {
      res.status(403).json({ error: 'Account connection limit reached for your plan. Upgrade in Billing.' });
      return;
    }
    const { platform, token, automationMode } = req.body || {};
    if (typeof platform !== 'string' || typeof token !== 'string' || !token.trim()) {
      res.status(400).json({ error: 'Platform and valid access/bot token are required.' });
      return;
    }

    let accountName = '';
    let externalId = '';
    let permissions: string[] = [];

    if (platform === 'discord') {
      const result = await verifyDiscordBotToken(token.trim());
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      accountName = result.username || 'Discord Bot';
      externalId = result.botId || '';
      permissions = ['bot', 'messages.read', 'send_messages'];
    } else if (platform === 'slack') {
      const result = await verifySlackBotToken(token.trim());
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      accountName = result.team ? `${result.team} Workspace` : 'Slack Bot';
      externalId = result.botUserId || '';
      permissions = ['chat:write', 'channels:read', 'im:read'];
    } else if (platform === 'gmail') {
      const result = await verifyGmailToken(token.trim());
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      accountName = result.emailAddress || 'Gmail Account';
      externalId = result.emailAddress || '';
      permissions = ['gmail.readonly', 'gmail.send'];
    } else {
      res.status(400).json({ error: `Direct token connection is not supported for ${platform}. Use official OAuth.` });
      return;
    }

    const accountId = `acc_${crypto.randomUUID()}`;
    const appBaseUrl = resolveAppUrl(req);
    db.prepare(`
      INSERT INTO social_accounts (id, user_id, platform, account_name, external_id, status, automation_mode, permissions_json, webhook_url)
      VALUES (?, ?, ?, ?, ?, 'CONNECTED', ?, ?, ?)
    `).run(
      accountId,
      req.authUser!.id,
      platform,
      accountName,
      externalId,
      automationMode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC',
      JSON.stringify(permissions),
      platform === 'slack' ? `${appBaseUrl}/api/webhooks/slack/${accountId}` : null
    );

    saveEncryptedToken({ socialAccountId: accountId, token: token.trim(), tokenType: 'bearer' });
    writeAuditLog({ userId: req.authUser!.id, action: 'PLATFORM_CONNECTED', targetType: 'social_account', targetId: accountId, metadata: { platform } });

    res.status(201).json({ ok: true, accountId, accountName });
  });

  // Official OAuth2 Popup Flow (with PKCE for X & profile fetch across official APIs)
  app.get('/api/oauth/:platform/url', requireAuth, (req: AuthRequest, res) => {
    const providers = config.oauthProviders;
    const rawPlatform = String(req.params.platform || '');
    if (!Object.prototype.hasOwnProperty.call(providers, rawPlatform)) {
      res.status(404).json({ error: `OAuth provider configuration not available for ${rawPlatform}.` });
      return;
    }
    const platform = rawPlatform as keyof typeof providers;
    const provider = providers[platform];
    const appBaseUrl = resolveAppUrl(req);

    if (!provider.clientId || !provider.clientSecret) {
      res.status(400).json({
        error: `${platform.toUpperCase()} developer OAuth credentials are not configured on the server. Add them in Admin API Credentials or environment secrets and register callback URL: ${appBaseUrl}/api/oauth/${platform}/callback`,
        callbackUrl: `${appBaseUrl}/api/oauth/${platform}/callback`,
      });
      return;
    }

    const stateToken = signSessionToken({
      sid: req.authUser!.sessionId,
      uid: req.authUser!.id,
      role: platform,
      exp: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: `${appBaseUrl}/api/oauth/${platform}/callback`,
      response_type: 'code',
      scope: provider.scopes,
      state: stateToken,
    });

    if (provider.pkce) {
      const verifier = crypto.randomBytes(32).toString('base64url');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      pkceVerifiers.set(stateToken, { verifier, exp: Date.now() + 10 * 60 * 1000 });
      params.set('code_challenge', challenge);
      params.set('code_challenge_method', 'S256');
    }

    res.json({ url: `${provider.authUrl}?${params.toString()}` });
  });

  app.get(['/api/oauth/:platform/callback', '/api/oauth/:platform/callback/'], async (req, res) => {
    const providers = config.oauthProviders;
    const rawPlatform = String(req.params.platform || '');
    if (!Object.prototype.hasOwnProperty.call(providers, rawPlatform)) {
      res.status(404).send('<html><body><p>Unsupported OAuth provider.</p></body></html>');
      return;
    }
    const platform = rawPlatform as keyof typeof providers;
    const provider = providers[platform];
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');

    const parsedState = state ? verifySessionToken(state) : null;
    if (!provider || !code || !parsedState || parsedState.role !== platform) {
      res.status(400).send('<html><body><p>Invalid OAuth state or authorization code.</p></body></html>');
      return;
    }

    const appBaseUrl = resolveAppUrl(req);
    const pkceEntry = pkceVerifiers.get(state);
    if (pkceEntry) pkceVerifiers.delete(state);

    try {
      const formParams = new URLSearchParams({
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${appBaseUrl}/api/oauth/${platform}/callback`,
      });
      if (pkceEntry) {
        formParams.set('code_verifier', pkceEntry.verifier);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      };
      if (platform === 'x' || platform === 'reddit') {
        headers['Authorization'] = `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString('base64')}`;
      }

      const tokenRes = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers,
        body: formParams.toString(),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
      if (!tokenRes.ok || !tokenData.access_token) {
        const msg = escapeHtml(tokenData.error_description || tokenData.error || 'Unknown error');
        res.status(400).send(`<html><body><p>OAuth token exchange failed: ${msg}</p></body></html>`);
        return;
      }

      const profile = await fetchOAuthUserProfile(platform, tokenData.access_token);
      const accountId = `acc_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO social_accounts (id, user_id, platform, account_name, external_id, status, automation_mode, permissions_json)
        VALUES (?, ?, ?, ?, ?, 'CONNECTED', 'MANUAL', ?)
      `).run(accountId, parsedState.uid, platform, profile.accountName, profile.externalId, JSON.stringify(provider.scopes.split(/[ ,]+/)));

      saveEncryptedToken({
        socialAccountId: accountId,
        token: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: 'oauth2',
      });

      broadcastToUser(parsedState.uid, { type: 'account:update', payload: { accountId, platform, status: 'CONNECTED' } });

      res.send(`
        <html>
          <body style="background:#060608;color:#fff;font-family:sans-serif;padding:24px;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', platform: ${JSON.stringify(platform)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>SPOILER AI connected ${escapeHtml(profile.accountName)}. This window will close automatically.</p>
          </body>
        </html>
      `);
    } catch (err: unknown) {
      const msg = escapeHtml(err instanceof Error ? err.message : 'Server error');
      res.status(500).send(`<html><body><p>OAuth error: ${msg}</p></body></html>`);
    }
  });

  app.patch('/api/platforms/:accountId/mode', requireAuth, (req: AuthRequest, res) => {
    const mode = req.body?.automationMode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC';
    db.prepare('UPDATE social_accounts SET automation_mode = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(
      mode,
      req.params.accountId,
      req.authUser!.id
    );
    res.json({ ok: true, automationMode: mode });
  });

  app.post('/api/platforms/:accountId/reconnect', requireAuth, async (req: AuthRequest, res) => {
    const acc = db.prepare('SELECT * FROM social_accounts WHERE id = ? AND user_id = ?').get(req.params.accountId, req.authUser!.id) as any;
    const tok = db.prepare('SELECT encrypted_token FROM platform_tokens WHERE social_account_id = ?').get(req.params.accountId) as { encrypted_token: string } | undefined;
    if (!acc || !tok) {
      res.status(404).json({ error: 'Account credentials not found.' });
      return;
    }
    const plain = decryptSecret(tok.encrypted_token);
    if (!plain) {
      db.prepare('UPDATE social_accounts SET status = ?, last_error = ? WHERE id = ?').run('NEEDS_REAUTH', 'Encryption key mismatch; re-enter token.', acc.id);
      res.status(400).json({ error: 'Stored token could not be decrypted. Please disconnect and reconnect.' });
      return;
    }

    let ok = true;
    let errMsg = '';
    if (acc.platform === 'telegram') {
      const r = await verifyAndConnectTelegram(plain, acc.id);
      ok = r.ok;
      errMsg = r.error || '';
    } else if (acc.platform === 'whatsapp' && acc.external_id) {
      const r = await verifyAndConnectWhatsApp({ phoneNumberId: acc.external_id, accessToken: plain });
      ok = r.ok;
      errMsg = r.error || '';
    } else if (acc.platform === 'discord') {
      const r = await verifyDiscordBotToken(plain);
      ok = r.ok;
      errMsg = r.error || '';
    } else if (acc.platform === 'slack') {
      const r = await verifySlackBotToken(plain);
      ok = r.ok;
      errMsg = r.error || '';
    } else if (acc.platform === 'gmail') {
      const r = await verifyGmailToken(plain);
      ok = r.ok;
      errMsg = r.error || '';
    }

    if (!ok) {
      db.prepare('UPDATE social_accounts SET status = ?, last_error = ?, updated_at = datetime(\'now\') WHERE id = ?').run('ERROR', errMsg, acc.id);
      res.status(400).json({ error: errMsg || 'Reconnection verification failed.' });
      return;
    }
    db.prepare('UPDATE social_accounts SET status = ?, last_error = NULL, updated_at = datetime(\'now\') WHERE id = ?').run('CONNECTED', acc.id);
    res.json({ ok: true, status: 'CONNECTED' });
  });

  app.delete('/api/platforms/:accountId', requireAuth, (req: AuthRequest, res) => {
    db.prepare('DELETE FROM social_accounts WHERE id = ? AND user_id = ?').run(req.params.accountId, req.authUser!.id);
    writeAuditLog({ userId: req.authUser!.id, action: 'PLATFORM_DISCONNECTED', targetType: 'social_account', targetId: String(req.params.accountId) });
    res.json({ ok: true });
  });

  app.post('/api/platforms/whatsapp/send-template', requireAuth, async (req: AuthRequest, res) => {
    const { accountId, recipientPhone, templateName, templateLanguage } = req.body || {};
    if (!accountId || !recipientPhone || !templateName) {
      res.status(400).json({ error: 'accountId, recipientPhone, and templateName are required.' });
      return;
    }
    const acc = db
      .prepare("SELECT id FROM social_accounts WHERE id = ? AND user_id = ? AND platform = 'whatsapp'")
      .get(accountId, req.authUser!.id);
    if (!acc) {
      res.status(404).json({ error: 'WhatsApp account not found.' });
      return;
    }
    const dispatch = await sendPlatformMessage({
      socialAccountId: accountId,
      platform: 'whatsapp',
      recipientExternalId: String(recipientPhone).replace(/[^\d]/g, ''),
      text: `[Template: ${templateName}]`,
      templateName: String(templateName),
      templateLanguage: String(templateLanguage || 'en_US'),
    });
    if (!dispatch.delivered) {
      res.status(400).json({ error: dispatch.error || 'Template dispatch failed.' });
      return;
    }
    res.json({ ok: true, externalMessageId: dispatch.externalMessageId });
  });

  app.post('/api/platforms/telegram/:accountId/sync-commands', requireAuth, async (req: AuthRequest, res) => {
    const acc = db
      .prepare("SELECT id FROM social_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram'")
      .get(req.params.accountId, req.authUser!.id);
    const tok = db
      .prepare('SELECT encrypted_token FROM platform_tokens WHERE social_account_id = ?')
      .get(req.params.accountId) as { encrypted_token: string } | undefined;
    if (!acc || !tok) {
      res.status(404).json({ error: 'Telegram bot account not found.' });
      return;
    }
    const plain = decryptSecret(tok.encrypted_token);
    if (!plain) {
      res.status(400).json({ error: 'Token could not be decrypted. Please reconnect bot.' });
      return;
    }
    const commands = Array.isArray(req.body?.commands) ? req.body.commands : ['/start', '/help', '/pricing'];
    const result = await syncTelegramCommands(plain, commands);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  // --- REAL WEBHOOK ENDPOINTS ---
  // WhatsApp Webhook Verification
  app.get('/api/webhooks/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === config.whatsappVerifyToken && challenge) {
      db.prepare("UPDATE social_accounts SET webhook_verified = 1 WHERE platform = 'whatsapp'").run();
      res.status(200).send(String(challenge));
      return;
    }
    res.status(403).send('Verification failed');
  });

  // WhatsApp Incoming Webhook
  app.post('/api/webhooks/whatsapp', async (req, res) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const phoneNumberId = change?.metadata?.phone_number_id;

      const acc = phoneNumberId
        ? (db
            .prepare("SELECT id, user_id FROM social_accounts WHERE platform = 'whatsapp' AND external_id = ?")
            .get(String(phoneNumberId)) as { id: string; user_id: string } | undefined)
        : undefined;

      // Verify HMAC signature against global META_APP_SECRET or per-account encrypted secret
      let appSecretToVerify = config.metaAppSecret;
      if (!appSecretToVerify && acc) {
        const tokRow = db
          .prepare('SELECT encrypted_secret FROM platform_tokens WHERE social_account_id = ?')
          .get(acc.id) as { encrypted_secret: string | null } | undefined;
        if (tokRow?.encrypted_secret) {
          appSecretToVerify = decryptSecret(tokRow.encrypted_secret) || '';
        }
      }

      if (appSecretToVerify && rawBody && !verifyMetaSignature(rawBody, signature, appSecretToVerify)) {
        res.status(401).json({ error: 'Invalid X-Hub-Signature-256' });
        return;
      }

      // Delivery / Read status updates
      if (change?.statuses?.[0]) {
        const st = change.statuses[0];
        db.prepare('UPDATE messages SET delivery_status = ? WHERE external_message_id = ?').run(
          String(st.status || 'DELIVERED').toUpperCase(),
          st.id
        );
      }

      if (change?.messages?.[0] && acc) {
        const msg = change.messages[0];
        const contactInfo = change.contacts?.[0];
        let imageBase64: string | undefined;
        let imageMimeType: string | undefined;

        if (msg.type === 'image' && msg.image?.id) {
          const tokRow = db
            .prepare('SELECT encrypted_token FROM platform_tokens WHERE social_account_id = ?')
            .get(acc.id) as { encrypted_token: string } | undefined;
          const accessToken = tokRow ? decryptSecret(tokRow.encrypted_token) : null;
          if (accessToken) {
            const media = await downloadWhatsAppMedia(msg.image.id, accessToken);
            if (media) {
              imageBase64 = media.base64;
              imageMimeType = media.mimeType;
            }
          }
        }

        const textBody =
          msg.text?.body ||
          msg.image?.caption ||
          (msg.document ? `[Document: ${msg.document.filename || 'file'}]` : `[${msg.type || 'media'} message]`);

        await processInboundMessage({
          userId: acc.user_id,
          socialAccountId: acc.id,
          platform: 'whatsapp',
          senderExternalId: msg.from,
          senderName: contactInfo?.profile?.name || msg.from,
          senderPhone: msg.from,
          content: textBody,
          externalMessageId: msg.id,
          imageBase64,
          imageMimeType,
        });
      }
      res.status(200).json({ received: true });
    } catch (err) {
      console.error('WhatsApp webhook error:', err);
      res.status(200).json({ received: true });
    }
  });

  // Telegram Incoming Webhook
  app.post('/api/webhooks/telegram/:accountId', async (req, res) => {
    const accountId = req.params.accountId;
    const expectedSecret = accountId.replace(/[^a-zA-Z0-9_-]/g, '');
    const receivedSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (receivedSecret && receivedSecret !== expectedSecret) {
      res.status(401).json({ error: 'Invalid Telegram secret token' });
      return;
    }

    const acc = db.prepare("SELECT id, user_id FROM social_accounts WHERE id = ? AND platform = 'telegram'").get(accountId) as
      | { id: string; user_id: string }
      | undefined;

    if (!acc) {
      res.status(404).json({ error: 'Unknown Telegram account' });
      return;
    }

    try {
      const msg = req.body?.message || req.body?.edited_message;
      if (msg && msg.chat) {
        let imageBase64: string | undefined;
        let imageMimeType: string | undefined;

        if (Array.isArray(msg.photo) && msg.photo.length > 0) {
          const tokRow = db.prepare('SELECT encrypted_token FROM platform_tokens WHERE social_account_id = ?').get(acc.id) as { encrypted_token: string } | undefined;
          const botToken = tokRow ? decryptSecret(tokRow.encrypted_token) : null;
          const bestPhoto = msg.photo[msg.photo.length - 1];
          if (botToken && bestPhoto?.file_id) {
            const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${bestPhoto.file_id}`);
            const fileJson = (await fileRes.json()) as { ok: boolean; result?: { file_path?: string } };
            if (fileJson.ok && fileJson.result?.file_path) {
              const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileJson.result.file_path}`);
              const buf = Buffer.from(await imgRes.arrayBuffer());
              imageBase64 = buf.toString('base64');
              imageMimeType = 'image/jpeg';
            }
          }
        }

        const chatType = msg.chat?.type || 'private';
        const docNotice = msg.document ? `[Document: ${msg.document.file_name || 'file'}]` : '';
        const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || 'Telegram User';
        const messageText = msg.text || msg.caption || docNotice || '[Image received]';
        const contentWithGroupContext =
          chatType === 'group' || chatType === 'supergroup'
            ? `[Group: ${msg.chat?.title || 'Telegram Group'}] ${messageText}`
            : messageText;

        await processInboundMessage({
          userId: acc.user_id,
          socialAccountId: acc.id,
          platform: 'telegram',
          senderExternalId: String(msg.chat.id),
          senderName,
          senderHandle: msg.from?.username ? `@${msg.from.username}` : undefined,
          content: contentWithGroupContext,
          externalMessageId: String(msg.message_id),
          imageBase64,
          imageMimeType,
        });
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Telegram webhook processing error:', err);
      res.status(200).json({ ok: true });
    }
  });

  // Instagram & Facebook Messenger Meta Graph Webhooks
  app.get('/api/webhooks/meta', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === config.whatsappVerifyToken && challenge) {
      res.status(200).send(String(challenge));
      return;
    }
    res.status(403).send('Verification failed');
  });

  app.post('/api/webhooks/meta', async (req, res) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (config.metaAppSecret && rawBody && !verifyMetaSignature(rawBody, signature, config.metaAppSecret)) {
      res.status(401).json({ error: 'Invalid X-Hub-Signature-256' });
      return;
    }

    try {
      const platform = req.body?.object === 'instagram' ? 'instagram' : 'messenger';
      const entry = req.body?.entry?.[0];
      const recipientPageId = String(entry?.id || '');
      const messagingEvent = entry?.messaging?.[0];

      if (recipientPageId && messagingEvent?.message?.text && !messagingEvent.message?.is_echo) {
        const acc = db
          .prepare('SELECT id, user_id FROM social_accounts WHERE platform = ? AND external_id = ?')
          .get(platform, recipientPageId) as { id: string; user_id: string } | undefined;

        if (acc) {
          await processInboundMessage({
            userId: acc.user_id,
            socialAccountId: acc.id,
            platform,
            senderExternalId: String(messagingEvent.sender?.id || ''),
            senderName: `${platform.toUpperCase()} User ${String(messagingEvent.sender?.id || '').slice(-4)}`,
            content: String(messagingEvent.message.text),
            externalMessageId: messagingEvent.message.mid,
          });
        }
      }
      res.status(200).json({ received: true });
    } catch (err) {
      console.error('Meta webhook error:', err);
      res.status(200).json({ received: true });
    }
  });

  // Slack Events API Webhook
  app.post('/api/webhooks/slack/:accountId', async (req, res) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (config.slackSigningSecret && rawBody) {
      const ok = verifySlackSignature(
        rawBody,
        req.headers['x-slack-request-timestamp'] as string | undefined,
        req.headers['x-slack-signature'] as string | undefined,
        config.slackSigningSecret
      );
      if (!ok) {
        res.status(401).json({ error: 'Invalid Slack signature' });
        return;
      }
    }

    if (req.body?.type === 'url_verification') {
      res.json({ challenge: req.body.challenge });
      return;
    }
    const acc = db.prepare("SELECT id, user_id FROM social_accounts WHERE id = ? AND platform = 'slack'").get(req.params.accountId) as
      | { id: string; user_id: string }
      | undefined;
    if (acc && req.body?.event?.type === 'message' && !req.body.event.bot_id) {
      const ev = req.body.event;
      await processInboundMessage({
        userId: acc.user_id,
        socialAccountId: acc.id,
        platform: 'slack',
        senderExternalId: ev.channel,
        senderName: ev.user || 'Slack Member',
        content: ev.text || '',
        externalMessageId: ev.ts,
      });
    }
    res.status(200).json({ ok: true });
  });

  // --- AI BOT STUDIO ---
  app.get('/api/bots', requireAuth, (req: AuthRequest, res) => {
    const bots = db.prepare('SELECT * FROM ai_bots WHERE user_id = ? ORDER BY created_at DESC').all(req.authUser!.id) as any[];
    const links = db
      .prepare(`
        SELECT ba.bot_id, sa.id as account_id, sa.platform, sa.account_name
        FROM bot_accounts ba
        INNER JOIN social_accounts sa ON sa.id = ba.social_account_id
        WHERE sa.user_id = ?
      `)
      .all(req.authUser!.id) as any[];

    res.json({
      bots: bots.map((b) => ({
        ...b,
        active: Boolean(b.active),
        memoryEnabled: Boolean(b.memory_enabled),
        restrictions: JSON.parse(b.restrictions_json || '{}'),
        commands: JSON.parse(b.commands_json || '[]'),
        connectedAccounts: links.filter((l) => l.bot_id === b.id),
      })),
    });
  });

  app.post('/api/bots', requireAuth, (req: AuthRequest, res) => {
    const sub = db.prepare('SELECT bot_limit FROM subscriptions WHERE user_id = ?').get(req.authUser!.id) as { bot_limit: number } | undefined;
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM ai_bots WHERE user_id = ?').get(req.authUser!.id) as { cnt: number }).cnt;
    if (count >= (sub?.bot_limit || 1)) {
      res.status(403).json({ error: 'Bot limit reached for your current subscription plan. Upgrade to create more bots.' });
      return;
    }

    const { name, avatarUrl, instructions, personality, language, memoryEnabled, memoryWindow, automationMode, restrictions, commands, accountIds } =
      req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Bot name is required.' });
      return;
    }

    const botId = `bot_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO ai_bots (id, user_id, name, avatar_url, instructions, personality, language, memory_enabled, memory_window, automation_mode, restrictions_json, commands_json, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      botId,
      req.authUser!.id,
      name.trim(),
      avatarUrl || '/src/assets/images/bot_avatar_business_1795477725400.jpg',
      instructions || 'Answer queries accurately and concisely.',
      personality || 'Professional, responsive, knowledgeable',
      language || 'Auto (English, Swahili, Sheng)',
      memoryEnabled === false ? 0 : 1,
      Number(memoryWindow) || 12,
      automationMode === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC',
      JSON.stringify(restrictions || {}),
      JSON.stringify(Array.isArray(commands) ? commands : ['/start', '/help'])
    );

    if (Array.isArray(accountIds)) {
      const insertLink = db.prepare('INSERT OR IGNORE INTO bot_accounts (bot_id, social_account_id) VALUES (?, ?)');
      for (const accId of accountIds) {
        const owned = db.prepare('SELECT id FROM social_accounts WHERE id = ? AND user_id = ?').get(accId, req.authUser!.id);
        if (owned) insertLink.run(botId, accId);
      }
    }

    writeAuditLog({ userId: req.authUser!.id, action: 'BOT_CREATED', targetType: 'ai_bot', targetId: botId });
    res.status(201).json({ ok: true, id: botId });
  });

  app.patch('/api/bots/:botId', requireAuth, (req: AuthRequest, res) => {
    const existing = db.prepare('SELECT id FROM ai_bots WHERE id = ? AND user_id = ?').get(req.params.botId, req.authUser!.id);
    if (!existing) {
      res.status(404).json({ error: 'Bot not found.' });
      return;
    }
    const { name, avatarUrl, instructions, personality, language, memoryEnabled, memoryWindow, automationMode, restrictions, commands, active, accountIds } =
      req.body || {};

    db.prepare(`
      UPDATE ai_bots SET
        name = COALESCE(?, name),
        avatar_url = COALESCE(?, avatar_url),
        instructions = COALESCE(?, instructions),
        personality = COALESCE(?, personality),
        language = COALESCE(?, language),
        memory_enabled = COALESCE(?, memory_enabled),
        memory_window = COALESCE(?, memory_window),
        automation_mode = COALESCE(?, automation_mode),
        restrictions_json = COALESCE(?, restrictions_json),
        commands_json = COALESCE(?, commands_json),
        active = COALESCE(?, active),
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(
      name ?? null,
      avatarUrl ?? null,
      instructions ?? null,
      personality ?? null,
      language ?? null,
      typeof memoryEnabled === 'boolean' ? (memoryEnabled ? 1 : 0) : null,
      memoryWindow ?? null,
      automationMode ?? null,
      restrictions ? JSON.stringify(restrictions) : null,
      commands ? JSON.stringify(commands) : null,
      typeof active === 'boolean' ? (active ? 1 : 0) : null,
      req.params.botId,
      req.authUser!.id
    );

    if (Array.isArray(accountIds)) {
      db.prepare('DELETE FROM bot_accounts WHERE bot_id = ?').run(req.params.botId);
      const insertLink = db.prepare('INSERT OR IGNORE INTO bot_accounts (bot_id, social_account_id) VALUES (?, ?)');
      for (const accId of accountIds) {
        const owned = db.prepare('SELECT id FROM social_accounts WHERE id = ? AND user_id = ?').get(accId, req.authUser!.id);
        if (owned) insertLink.run(req.params.botId, accId);
      }
    }

    res.json({ ok: true });
  });

  app.delete('/api/bots/:botId', requireAuth, (req: AuthRequest, res) => {
    db.prepare('DELETE FROM ai_bots WHERE id = ? AND user_id = ?').run(req.params.botId, req.authUser!.id);
    res.json({ ok: true });
  });

  // --- UNIVERSAL AI REPLY ENGINE & REPLYIMG ---
  app.post('/api/ai/reply-test', requireAuth, async (req: AuthRequest, res) => {
    const { botId, platform, senderName, message, pushToInbox, socialAccountId } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Message text is required.' });
      return;
    }

    try {
      if (pushToInbox) {
        const result = await processInboundMessage({
          userId: req.authUser!.id,
          socialAccountId: socialAccountId || null,
          platform: platform || 'whatsapp',
          senderExternalId: `test_${(senderName || 'customer').toLowerCase().replace(/\W+/g, '_')}`,
          senderName: senderName || 'Inbound Customer',
          content: message.trim(),
        });
        res.json(result);
        return;
      }

      const bot = botId
        ? (db.prepare('SELECT * FROM ai_bots WHERE id = ? AND user_id = ?').get(botId, req.authUser!.id) as any)
        : (db.prepare('SELECT * FROM ai_bots WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(req.authUser!.id) as any);

      const aiResult = await generateUniversalReply({
        incomingMessage: message.trim(),
        platform: platform || 'whatsapp',
        senderName: senderName || 'Customer',
        botName: bot?.name || 'SPOILER MAIN BOT',
        instructions: bot?.instructions || 'Be clear, concise, and helpful.',
        personality: bot?.personality || 'Professional assistant',
        language: bot?.language || 'Auto (English, Swahili, Sheng)',
        restrictions: bot?.restrictions_json ? JSON.parse(bot.restrictions_json) : {},
      });

      db.prepare("UPDATE subscriptions SET ai_usage_count = ai_usage_count + 1 WHERE user_id = ?").run(req.authUser!.id);
      res.json({ aiResult });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'AI Reply Engine error' });
    }
  });

  app.post('/api/ai/replyimg', requireAuth, async (req: AuthRequest, res) => {
    const { imageBase64, mimeType, filename, question, botId, pushToInbox, platform, senderName } = req.body || {};
    if (typeof imageBase64 !== 'string' || !imageBase64) {
      res.status(400).json({ error: 'Image payload is required.' });
      return;
    }
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const safeMime = typeof mimeType === 'string' && mimeType.startsWith('image/') ? mimeType : 'image/png';
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: 'Image exceeds 8MB limit.' });
      return;
    }

    try {
      const bot = botId
        ? (db.prepare('SELECT * FROM ai_bots WHERE id = ? AND user_id = ?').get(botId, req.authUser!.id) as any)
        : null;

      const analysis = await analyzeImageWithReplyImg({
        imageBase64: cleanBase64,
        mimeType: safeMime,
        question: question || undefined,
        botInstructions: bot?.instructions,
        language: bot?.language,
      });

      const mediaId = `med_${crypto.randomUUID()}`;
      const ext = safeMime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
      const diskName = `${mediaId}.${ext}`;
      const storagePath = path.join(UPLOADS_DIR, diskName);
      fs.writeFileSync(storagePath, buffer);

      db.prepare(`
        INSERT INTO media_files (id, user_id, filename, mime_type, size_bytes, storage_path, ai_analysis_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(mediaId, req.authUser!.id, filename || diskName, safeMime, buffer.length, `/api/media/${mediaId}`, JSON.stringify(analysis));

      db.prepare('UPDATE subscriptions SET ai_usage_count = ai_usage_count + 1 WHERE user_id = ?').run(req.authUser!.id);
      db.prepare(`
        INSERT INTO usage_records (id, user_id, action_type, model_name, tokens_used)
        VALUES (?, ?, 'REPLYIMG_VISION', 'gemini-4-hydrogen', 420)
      `).run(`use_${crypto.randomUUID()}`, req.authUser!.id);

      let inboxResult = null;
      if (pushToInbox) {
        inboxResult = await processInboundMessage({
          userId: req.authUser!.id,
          socialAccountId: null,
          platform: platform || 'whatsapp',
          senderExternalId: `img_${Date.now()}`,
          senderName: senderName || 'Media Sender',
          content: question || 'Sent an image for analysis',
          imageBase64: cleanBase64,
          imageMimeType: safeMime,
          mediaId,
        });
      }

      res.json({ mediaId, mediaUrl: `/api/media/${mediaId}`, analysis, inboxResult });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'ReplyImg analysis failed' });
    }
  });

  app.get('/api/media/:mediaId', requireAuth, (req: AuthRequest, res) => {
    const media = db.prepare('SELECT * FROM media_files WHERE id = ? AND user_id = ?').get(req.params.mediaId, req.authUser!.id) as any;
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    const ext = String(media.mime_type).split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
    const candidate = path.resolve(UPLOADS_DIR, `${media.id}.${ext}`);
    if (!candidate.startsWith(path.resolve(UPLOADS_DIR) + path.sep) || !fs.existsSync(candidate)) {
      res.status(404).json({ error: 'File missing' });
      return;
    }
    res.setHeader('Content-Type', media.mime_type);
    res.sendFile(candidate);
  });

  app.post('/api/ai/translate', requireAuth, async (req: AuthRequest, res) => {
    const { text, targetLanguage } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Text required.' });
      return;
    }
    try {
      const output = await translateOrSummarize({ mode: 'translate', text, targetLanguage });
      res.json({ result: output });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Translation failed' });
    }
  });

  app.post('/api/ai/summarize', requireAuth, async (req: AuthRequest, res) => {
    const { conversationId, text } = req.body || {};
    let sourceText = typeof text === 'string' ? text : '';
    if (conversationId) {
      const msgs = db
        .prepare('SELECT direction, sender_type, content FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC')
        .all(conversationId, req.authUser!.id) as any[];
      sourceText = msgs.map((m) => `[${m.direction}/${m.sender_type}]: ${m.content}`).join('\n');
    }
    if (!sourceText.trim()) {
      res.status(400).json({ error: 'No conversation content to summarize.' });
      return;
    }
    try {
      const summary = await translateOrSummarize({ mode: 'summarize', text: sourceText });
      res.json({ summary });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Summarization failed' });
    }
  });

  // --- UNIVERSAL INBOX & APPROVAL QUEUE ---
  app.get('/api/inbox/conversations', requireAuth, (req: AuthRequest, res) => {
    const { platform, status, search } = req.query;
    let query = `
      SELECT c.*, ct.display_name, ct.handle, ct.phone, ct.external_id as contact_external_id,
             b.name as bot_name,
             (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
             (SELECT COUNT(*) FROM approval_queue aq WHERE aq.conversation_id = c.id AND aq.status = 'PENDING') as pending_approvals
      FROM conversations c
      INNER JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN ai_bots b ON b.id = c.bot_id
      WHERE c.user_id = ?
    `;
    const params: unknown[] = [req.authUser!.id];

    if (platform && platform !== 'ALL') {
      query += ' AND c.platform = ?';
      params.push(platform);
    }
    if (status && status !== 'ALL') {
      query += ' AND c.status = ?';
      params.push(status);
    }
    if (typeof search === 'string' && search.trim()) {
      query += ' AND (ct.display_name LIKE ? OR ct.handle LIKE ? OR ct.phone LIKE ?)';
      const like = `%${search.trim()}%`;
      params.push(like, like, like);
    }
    query += ' ORDER BY c.last_message_at DESC';

    const rows = db.prepare(query).all(...params);
    res.json({ conversations: rows });
  });

  app.get('/api/inbox/conversations/:id/messages', requireAuth, (req: AuthRequest, res) => {
    const conv = db
      .prepare(`
        SELECT c.*, ct.display_name, ct.handle, ct.phone, ct.external_id as contact_external_id
        FROM conversations c
        INNER JOIN contacts ct ON ct.id = c.contact_id
        WHERE c.id = ? AND c.user_id = ?
      `)
      .get(req.params.id, req.authUser!.id) as any;

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(conv.id);

    const messages = db
      .prepare(`
        SELECT m.*, mf.mime_type as media_mime, mf.ai_analysis_json as media_analysis_json
        FROM messages m
        LEFT JOIN media_files mf ON mf.id = m.media_id
        WHERE m.conversation_id = ? AND m.user_id = ?
        ORDER BY m.created_at ASC
      `)
      .all(conv.id, req.authUser!.id) as any[];

    const approvals = db
      .prepare("SELECT * FROM approval_queue WHERE conversation_id = ? AND user_id = ? AND status = 'PENDING' ORDER BY created_at DESC")
      .all(conv.id, req.authUser!.id);

    res.json({
      conversation: conv,
      messages: messages.map((m) => ({
        ...m,
        mediaUrl: m.media_id ? `/api/media/${m.media_id}` : null,
        mediaAnalysis: m.media_analysis_json ? JSON.parse(m.media_analysis_json) : null,
      })),
      pendingApprovals: approvals,
    });
  });

  app.post('/api/inbox/conversations/:id/send', requireAuth, async (req: AuthRequest, res) => {
    const { content } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Message content is required.' });
      return;
    }

    const conv = db
      .prepare(`
        SELECT c.*, ct.external_id as contact_external_id
        FROM conversations c
        INNER JOIN contacts ct ON ct.id = c.contact_id
        WHERE c.id = ? AND c.user_id = ?
      `)
      .get(req.params.id, req.authUser!.id) as any;

    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    const dispatch = await sendPlatformMessage({
      socialAccountId: conv.social_account_id,
      platform: conv.platform,
      recipientExternalId: conv.contact_external_id,
      text: content.trim(),
    });

    const msgId = `msg_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO messages (id, conversation_id, user_id, direction, sender_type, content, external_message_id, delivery_status)
      VALUES (?, ?, ?, 'OUTBOUND', 'HUMAN', ?, ?, ?)
    `).run(msgId, conv.id, req.authUser!.id, content.trim(), dispatch.externalMessageId || null, dispatch.delivered ? 'SENT' : dispatch.status);

    db.prepare('UPDATE conversations SET last_message_at = datetime(\'now\') WHERE id = ?').run(conv.id);

    broadcastToUser(req.authUser!.id, {
      type: 'inbox:message',
      payload: { conversationId: conv.id, messageId: msgId, content: content.trim(), direction: 'OUTBOUND' },
    });

    res.status(201).json({ ok: true, messageId: msgId, dispatch });
  });

  app.patch('/api/inbox/conversations/:id', requireAuth, (req: AuthRequest, res) => {
    const { automationMode, status, assignedTo } = req.body || {};
    db.prepare(`
      UPDATE conversations SET
        automation_mode = COALESCE(?, automation_mode),
        status = COALESCE(?, status),
        assigned_to = COALESCE(?, assigned_to)
      WHERE id = ? AND user_id = ?
    `).run(automationMode ?? null, status ?? null, assignedTo ?? null, req.params.id, req.authUser!.id);
    res.json({ ok: true });
  });

  app.get('/api/approvals', requireAuth, (req: AuthRequest, res) => {
    const rows = db
      .prepare(`
        SELECT aq.*, ct.display_name, m.content as incoming_message, b.name as bot_name
        FROM approval_queue aq
        INNER JOIN conversations c ON c.id = aq.conversation_id
        INNER JOIN contacts ct ON ct.id = c.contact_id
        INNER JOIN messages m ON m.id = aq.message_id
        LEFT JOIN ai_bots b ON b.id = aq.bot_id
        WHERE aq.user_id = ? AND aq.status = 'PENDING'
        ORDER BY aq.created_at DESC
      `)
      .all(req.authUser!.id);
    res.json({ approvals: rows });
  });

  app.post('/api/approvals/:id/decision', requireAuth, async (req: AuthRequest, res) => {
    const { decision, editedReply } = req.body || {};
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      res.status(400).json({ error: 'Decision must be APPROVE or REJECT.' });
      return;
    }

    const apr = db
      .prepare(`
        SELECT aq.*, c.social_account_id, ct.external_id as contact_external_id
        FROM approval_queue aq
        INNER JOIN conversations c ON c.id = aq.conversation_id
        INNER JOIN contacts ct ON ct.id = c.contact_id
        WHERE aq.id = ? AND aq.user_id = ?
      `)
      .get(req.params.id, req.authUser!.id) as any;

    if (!apr) {
      res.status(404).json({ error: 'Approval item not found.' });
      return;
    }

    if (decision === 'REJECT') {
      db.prepare("UPDATE approval_queue SET status = 'REJECTED', reviewed_at = datetime('now') WHERE id = ?").run(apr.id);
      broadcastToUser(req.authUser!.id, { type: 'approval:update', payload: { approvalId: apr.id, status: 'REJECTED' } });
      res.json({ ok: true, status: 'REJECTED' });
      return;
    }

    const finalText = typeof editedReply === 'string' && editedReply.trim() ? editedReply.trim() : apr.suggested_reply;
    const dispatch = await sendPlatformMessage({
      socialAccountId: apr.social_account_id,
      platform: apr.platform,
      recipientExternalId: apr.contact_external_id,
      text: finalText,
    });

    db.prepare("UPDATE approval_queue SET status = 'APPROVED', edited_reply = ?, reviewed_at = datetime('now') WHERE id = ?").run(
      finalText,
      apr.id
    );

    const outId = `msg_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO messages (id, conversation_id, user_id, direction, sender_type, content, external_message_id, delivery_status)
      VALUES (?, ?, ?, 'OUTBOUND', 'HUMAN', ?, ?, ?)
    `).run(outId, apr.conversation_id, req.authUser!.id, finalText, dispatch.externalMessageId || null, dispatch.delivered ? 'SENT' : dispatch.status);

    broadcastToUser(req.authUser!.id, { type: 'approval:update', payload: { approvalId: apr.id, status: 'APPROVED' } });
    res.json({ ok: true, status: 'APPROVED', messageId: outId, dispatch });
  });

  // --- AUTOMATION WORKFLOW BUILDER & SCHEDULED POSTS ---
  app.get('/api/workflows', requireAuth, (req: AuthRequest, res) => {
    const workflows = db
      .prepare('SELECT * FROM automation_workflows WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.authUser!.id) as any[];
    const logs = db
      .prepare('SELECT * FROM workflow_execution_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(req.authUser!.id) as any[];
    res.json({
      workflows: workflows.map((w) => ({
        ...w,
        active: Boolean(w.active),
        conditions: JSON.parse(w.conditions_json || '[]'),
      })),
      logs: logs.map((l) => ({
        ...l,
        triggerPayload: JSON.parse(l.trigger_payload_json || '{}'),
        steps: JSON.parse(l.steps_json || '[]'),
      })),
    });
  });

  app.post('/api/workflows', requireAuth, (req: AuthRequest, res) => {
    const { name, description, triggerPlatform, triggerEvent, conditions, aiPromptTemplate, actionType } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Workflow name is required.' });
      return;
    }
    const id = `wf_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO automation_workflows (id, user_id, name, description, trigger_platform, trigger_event, conditions_json, ai_prompt_template, action_type, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      req.authUser!.id,
      name.trim(),
      description || '',
      triggerPlatform || 'whatsapp',
      triggerEvent || 'MESSAGE_RECEIVED',
      JSON.stringify(Array.isArray(conditions) ? conditions : []),
      aiPromptTemplate || 'Understand intent and reply concisely.',
      actionType || 'AUTO_OR_APPROVAL'
    );
    res.status(201).json({ ok: true, id });
  });

  app.patch('/api/workflows/:id', requireAuth, (req: AuthRequest, res) => {
    const { active, name, description, triggerPlatform, triggerEvent, conditions, aiPromptTemplate, actionType } = req.body || {};
    db.prepare(`
      UPDATE automation_workflows SET
        active = COALESCE(?, active),
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        trigger_platform = COALESCE(?, trigger_platform),
        trigger_event = COALESCE(?, trigger_event),
        conditions_json = COALESCE(?, conditions_json),
        ai_prompt_template = COALESCE(?, ai_prompt_template),
        action_type = COALESCE(?, action_type)
      WHERE id = ? AND user_id = ?
    `).run(
      typeof active === 'boolean' ? (active ? 1 : 0) : null,
      name ?? null,
      description ?? null,
      triggerPlatform ?? null,
      triggerEvent ?? null,
      conditions ? JSON.stringify(conditions) : null,
      aiPromptTemplate ?? null,
      actionType ?? null,
      req.params.id,
      req.authUser!.id
    );
    res.json({ ok: true });
  });

  app.post('/api/workflows/:id/test', requireAuth, async (req: AuthRequest, res) => {
    const wf = db.prepare('SELECT * FROM automation_workflows WHERE id = ? AND user_id = ?').get(req.params.id, req.authUser!.id) as any;
    if (!wf) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }
    const sampleText = req.body?.sampleMessage || 'Niaje, bei ya Pro plan ni ngapi na mnaaccept M-Pesa?';
    try {
      const result = await processInboundMessage({
        userId: req.authUser!.id,
        socialAccountId: null,
        platform: wf.trigger_platform === 'ALL' ? 'whatsapp' : wf.trigger_platform,
        senderExternalId: `wf_test_${Date.now()}`,
        senderName: 'Workflow Test Sender',
        content: sampleText,
      });
      res.json({ ok: true, result });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Workflow test failed' });
    }
  });

  app.delete('/api/workflows/:id', requireAuth, (req: AuthRequest, res) => {
    db.prepare('DELETE FROM automation_workflows WHERE id = ? AND user_id = ?').run(req.params.id, req.authUser!.id);
    res.json({ ok: true });
  });

  // Scheduled Posts
  app.get('/api/scheduled-posts', requireAuth, (req: AuthRequest, res) => {
    const posts = db.prepare('SELECT * FROM scheduled_posts WHERE user_id = ? ORDER BY scheduled_for ASC').all(req.authUser!.id);
    res.json({ posts });
  });

  app.post('/api/scheduled-posts', requireAuth, (req: AuthRequest, res) => {
    const { platform, content, scheduledFor, socialAccountId } = req.body || {};
    if (typeof platform !== 'string' || typeof content !== 'string' || !content.trim() || !scheduledFor) {
      res.status(400).json({ error: 'Platform, content, and scheduled timestamp are required.' });
      return;
    }
    const id = `post_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO scheduled_posts (id, user_id, social_account_id, platform, content, scheduled_for, status)
      VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED')
    `).run(id, req.authUser!.id, socialAccountId || null, platform, content.trim(), scheduledFor);
    res.status(201).json({ ok: true, id });
  });

  app.post('/api/scheduled-posts/:id/publish', requireAuth, async (req: AuthRequest, res) => {
    const post = db
      .prepare('SELECT * FROM scheduled_posts WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.authUser!.id) as any;
    if (!post) {
      res.status(404).json({ error: 'Scheduled post not found.' });
      return;
    }
    const result = await publishScheduledPostToPlatform(post);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, externalId: result.externalId });
  });

  app.delete('/api/scheduled-posts/:id', requireAuth, (req: AuthRequest, res) => {
    db.prepare('DELETE FROM scheduled_posts WHERE id = ? AND user_id = ?').run(req.params.id, req.authUser!.id);
    res.json({ ok: true });
  });

  // --- SUBSCRIPTIONS & PAYMENTS (M-PESA & CARD) ---
  app.get('/api/billing', requireAuth, (req: AuthRequest, res) => {
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.authUser!.id);
    const payments = db.prepare('SELECT id, amount, currency, provider, reference, phone_number, plan, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC').all(req.authUser!.id);
    const pricingRow = db.prepare("SELECT value_json FROM platform_settings WHERE key = 'pricing_plans'").get() as { value_json: string } | undefined;
    res.json({
      subscription: sub,
      payments,
      plans: pricingRow ? JSON.parse(pricingRow.value_json) : PLAN_CATALOG,
      mpesaConfigured: Boolean(config.mpesa.consumerKey && config.mpesa.consumerSecret && config.mpesa.shortcode && config.mpesa.passkey),
      stripeConfigured: Boolean(config.stripeSecretKey),
    });
  });

  app.post('/api/billing/downgrade', requireAuth, (req: AuthRequest, res) => {
    applySubscriptionUpgrade(req.authUser!.id, 'FREE');
    writeAuditLog({ userId: req.authUser!.id, action: 'PLAN_DOWNGRADED_FREE' });
    res.json({ ok: true, plan: 'FREE' });
  });

  app.post('/api/payments/mpesa/stk-push', requireAuth, async (req: AuthRequest, res) => {
    const { phoneNumber, plan } = req.body || {};
    if (plan !== 'PRO' && plan !== 'BUSINESS') {
      res.status(400).json({ error: 'Select PRO or BUSINESS plan.' });
      return;
    }
    const result = await initiateMpesaStkPush({
      userId: req.authUser!.id,
      phoneNumber: String(phoneNumber || ''),
      plan,
      callbackBaseUrl: resolveAppUrl(req),
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/payments/mpesa/callback', (req, res) => {
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback || !stkCallback.CheckoutRequestID) {
      res.status(400).json({ error: 'Invalid Daraja callback payload' });
      return;
    }

    const payment = db
      .prepare('SELECT * FROM payments WHERE checkout_request_id = ?')
      .get(stkCallback.CheckoutRequestID) as any;

    if (!payment) {
      res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }

    if (stkCallback.ResultCode === 0) {
      db.prepare("UPDATE payments SET status = 'COMPLETED', raw_callback = ? WHERE id = ?").run(
        JSON.stringify(stkCallback),
        payment.id
      );
      applySubscriptionUpgrade(payment.user_id, payment.plan as PlanTier);
      broadcastToUser(payment.user_id, {
        type: 'notification:new',
        payload: { title: 'M-Pesa Payment Confirmed', body: `Upgraded to ${payment.plan} plan.` },
      });
    } else {
      db.prepare("UPDATE payments SET status = 'FAILED', raw_callback = ? WHERE id = ?").run(
        JSON.stringify(stkCallback),
        payment.id
      );
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/payments/stripe/checkout', requireAuth, async (req: AuthRequest, res) => {
    const { plan } = req.body || {};
    if (plan !== 'PRO' && plan !== 'BUSINESS') {
      res.status(400).json({ error: 'Select PRO or BUSINESS plan.' });
      return;
    }
    const result = await initiateStripeCheckout({
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      plan,
      callbackBaseUrl: resolveAppUrl(req),
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/payments/stripe/webhook', (req, res) => {
    // Verify Stripe signature if STRIPE_WEBHOOK_SECRET is configured
    const sig = req.headers['stripe-signature'] as string | undefined;
    if (config.stripeWebhookSecret) {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!sig || !rawBody) {
        res.status(400).json({ error: 'Missing Stripe signature' });
        return;
      }
      const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=')));
      if (!parts.t || !parts.v1) {
        res.status(400).json({ error: 'Malformed Stripe signature' });
        return;
      }
      const expected = crypto
        .createHmac('sha256', config.stripeWebhookSecret)
        .update(`${parts.t}.${rawBody.toString('utf8')}`)
        .digest('hex');
      if (!safeEqualStrings(expected, parts.v1)) {
        res.status(400).json({ error: 'Invalid Stripe webhook signature' });
        return;
      }
    }

    const event = req.body;
    if (event?.type === 'checkout.session.completed') {
      const ref = event.data?.object?.metadata?.reference;
      if (ref) {
        const pay = db.prepare('SELECT * FROM payments WHERE reference = ?').get(ref) as any;
        if (pay && pay.status !== 'COMPLETED') {
          db.prepare("UPDATE payments SET status = 'COMPLETED', raw_callback = ? WHERE id = ?").run(JSON.stringify(event), pay.id);
          applySubscriptionUpgrade(pay.user_id, pay.plan as PlanTier);
        }
      }
    }
    res.json({ received: true });
  });

  // --- NOTIFICATIONS ---
  app.get('/api/notifications', requireAuth, (req: AuthRequest, res) => {
    const items = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.authUser!.id);
    res.json({ notifications: items });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  // --- SPOILER-TECH PROTECTED ADMIN DASHBOARD ---
  // Strictly enforces admin role and NEVER exposes private user conversation/message contents
  app.get('/api/admin/overview', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const users = db
      .prepare(`
        SELECT u.id, u.email, u.full_name, u.role, u.email_verified, u.two_factor_enabled, u.suspended, u.created_at,
               s.plan, s.status as sub_status, s.ai_usage_count, s.ai_quota_limit,
               (SELECT COUNT(*) FROM social_accounts sa WHERE sa.user_id = u.id) as connected_accounts,
               (SELECT COUNT(*) FROM ai_bots ab WHERE ab.user_id = u.id) as bot_count
        FROM users u
        LEFT JOIN subscriptions s ON s.user_id = u.id
        ORDER BY u.created_at DESC
      `)
      .all();

    const revenue = db
      .prepare(`
        SELECT currency, COALESCE(SUM(amount), 0) as total, COUNT(*) as tx_count
        FROM payments
        WHERE status = 'COMPLETED'
        GROUP BY currency
      `)
      .all();

    const apiUsage = db
      .prepare(`
        SELECT action_type, model_name, COUNT(*) as calls, COALESCE(SUM(tokens_used), 0) as tokens
        FROM usage_records
        GROUP BY action_type, model_name
      `)
      .all();

    const platformBreakdown = db
      .prepare(`
        SELECT platform, status, COUNT(*) as count
        FROM social_accounts
        GROUP BY platform, status
      `)
      .all();

    const auditLogs = db
      .prepare('SELECT id, user_id, action, target_type, ip_address, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 40')
      .all();

    const settingsRows = db.prepare('SELECT key, value_json FROM platform_settings WHERE key != \'operator_credentials_vault\'').all() as Array<{ key: string; value_json: string }>;
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, JSON.parse(r.value_json)]));

    let dbSizeBytes = 0;
    try {
      dbSizeBytes = fs.statSync(dbPath).size;
    } catch {
      dbSizeBytes = 0;
    }

    res.json({
      users,
      revenue,
      apiUsage,
      platformBreakdown,
      auditLogs,
      settings,
      systemHealth: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        dbSizeKb: Math.round(dbSizeBytes / 1024),
        appUrl: resolveAppUrl(req),
        dataDir,
        nodeEnv: process.env.NODE_ENV || 'development',
        persistentEncryptionConfigured: config.persistentEncryptionConfigured,
        persistentSessionSecretConfigured: config.persistentSessionSecretConfigured,
        geminiConfigured: Boolean(config.geminiApiKey),
        mpesaConfigured: Boolean(config.mpesa.consumerKey && config.mpesa.consumerSecret && config.mpesa.shortcode && config.mpesa.passkey),
        stripeConfigured: Boolean(config.stripeSecretKey),
        resendConfigured: Boolean(config.resendApiKey),
      },
    });
  });

  app.get('/api/admin/credentials', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const appBaseUrl = resolveAppUrl(req);
    res.json({
      credentials: getCredentialStatuses(),
      appBaseUrl,
      callbackUrls: {
        whatsappWebhook: `${appBaseUrl}/api/webhooks/whatsapp`,
        metaWebhook: `${appBaseUrl}/api/webhooks/meta`,
        mpesaCallback: `${appBaseUrl}/api/payments/mpesa/callback`,
        stripeWebhook: `${appBaseUrl}/api/payments/stripe/webhook`,
        oauthCallbackPattern: `${appBaseUrl}/api/oauth/{platform}/callback`,
      },
      persistentEncryptionConfigured: config.persistentEncryptionConfigured,
    });
  });

  app.put('/api/admin/credentials', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const entries = req.body?.credentials;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      res.status(400).json({ error: 'Invalid credentials payload.' });
      return;
    }
    const updatedKeys = setVaultCredentials(entries as Record<string, string>);
    writeAuditLog({
      userId: req.authUser!.id,
      action: 'ADMIN_CREDENTIALS_UPDATED',
      ipAddress: getClientIp(req),
      metadata: { updatedKeys },
    });
    res.json({ ok: true, updatedKeys, credentials: getCredentialStatuses() });
  });

  app.delete('/api/admin/credentials/:key', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const key = String(req.params.key || '');
    deleteVaultCredential(key);
    writeAuditLog({
      userId: req.authUser!.id,
      action: 'ADMIN_CREDENTIAL_REMOVED',
      ipAddress: getClientIp(req),
      metadata: { key },
    });
    res.json({ ok: true, credentials: getCredentialStatuses() });
  });

  app.patch('/api/admin/users/:userId', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const { suspended, plan, role } = req.body || {};
    if (typeof suspended === 'boolean') {
      db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(suspended ? 1 : 0, req.params.userId);
    }
    if (role === 'user' || role === 'admin') {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.userId);
    }
    if (plan === 'FREE' || plan === 'PRO' || plan === 'BUSINESS') {
      applySubscriptionUpgrade(String(req.params.userId), plan);
    }
    writeAuditLog({
      userId: req.authUser!.id,
      action: 'ADMIN_USER_UPDATED',
      targetType: 'user',
      targetId: String(req.params.userId),
      metadata: { suspended, plan, role },
    });
    res.json({ ok: true });
  });

  app.put('/api/admin/settings', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const { aiModelConfig, pricingPlans, announcement } = req.body || {};
    const upsert = db.prepare(`
      INSERT INTO platform_settings (key, value_json, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
    `);

    if (aiModelConfig) upsert.run('ai_model_config', JSON.stringify(aiModelConfig));
    if (pricingPlans) upsert.run('pricing_plans', JSON.stringify(pricingPlans));
    if (announcement && announcement.title && announcement.body) {
      const existingRow = db.prepare("SELECT value_json FROM platform_settings WHERE key = 'announcements'").get() as { value_json: string } | undefined;
      const list = existingRow ? JSON.parse(existingRow.value_json) : [];
      list.unshift({
        id: `ann_${Date.now()}`,
        title: String(announcement.title),
        body: String(announcement.body),
        createdAt: new Date().toISOString(),
      });
      upsert.run('announcements', JSON.stringify(list.slice(0, 10)));
    }

    writeAuditLog({ userId: req.authUser!.id, action: 'ADMIN_SETTINGS_UPDATED', ipAddress: getClientIp(req) });
    res.json({ ok: true });
  });
}
