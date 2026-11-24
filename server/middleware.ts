import crypto from 'crypto';
import { type NextFunction, type Request, type Response } from 'express';
import { verifySessionToken } from './crypto.ts';
import { db } from './db.ts';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'user' | 'admin';
  sessionId: string;
}

export interface AuthRequest extends Request {
  authUser?: AuthUser;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  const session = db
    .prepare('SELECT id, expires_at FROM sessions WHERE id = ? AND user_id = ?')
    .get(payload.sid, payload.uid) as { id: string; expires_at: string } | undefined;

  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    res.status(401).json({ error: 'Session has been revoked or expired' });
    return;
  }

  const user = db
    .prepare('SELECT id, email, full_name, role, suspended FROM users WHERE id = ?')
    .get(payload.uid) as { id: string; email: string; full_name: string; role: 'user' | 'admin'; suspended: number } | undefined;

  if (!user) {
    res.status(401).json({ error: 'User account no longer exists' });
    return;
  }
  if (user.suspended) {
    res.status(403).json({ error: 'Account is suspended. Contact SPOILER-TECH support.' });
    return;
  }

  db.prepare('UPDATE sessions SET last_active_at = datetime(\'now\') WHERE id = ?').run(session.id);

  req.authUser = {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    sessionId: session.id,
  };
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.authUser || req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'SPOILER-TECH administrator privileges required' });
    return;
  }
  next();
}

export function writeAuditLog(params: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}) {
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `aud_${crypto.randomUUID()}`,
    params.userId || null,
    params.action,
    params.targetType || null,
    params.targetId || null,
    params.ipAddress || null,
    JSON.stringify(params.metadata || {})
  );
}

export function provisionNewUserWorkspace(userId: string, fullName: string) {
  const orgId = `org_${crypto.randomUUID()}`;
  db.prepare('INSERT INTO organizations (id, name, owner_id) VALUES (?, ?, ?)').run(
    orgId,
    `${fullName}'s Workspace`,
    userId
  );
  db.prepare('INSERT INTO user_memberships (id, organization_id, user_id, role) VALUES (?, ?, ?, \'owner\')').run(
    `mem_${crypto.randomUUID()}`,
    orgId,
    userId
  );
  db.prepare(`
    INSERT INTO subscriptions (id, user_id, plan, status, ai_quota_limit, ai_usage_count, bot_limit, account_limit)
    VALUES (?, ?, 'FREE', 'ACTIVE', 250, 0, 1, 2)
  `).run(`sub_${crypto.randomUUID()}`, userId);

  // Create starter SPOILER MAIN BOT so the user immediately has an editable bot in AI Bot Studio
  db.prepare(`
    INSERT INTO ai_bots (id, user_id, name, avatar_url, instructions, personality, language, memory_enabled, memory_window, automation_mode, restrictions_json, commands_json, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 12, 'AUTOMATIC', ?, ?, 1)
  `).run(
    `bot_${crypto.randomUUID()}`,
    userId,
    'SPOILER MAIN BOT',
    '/src/assets/images/bot_avatar_main_1795477725208.jpg',
    'Assist customers warmly and accurately across connected social channels. Answer product and support inquiries clearly, and escalate billing disputes to a human operator.',
    'Sharp, reliable, futuristic brand specialist',
    'Auto (English, Swahili, Sheng)',
    JSON.stringify({ forbiddenTopics: ['politics', 'competitor bashing'], handoverKeywords: ['refund', 'fraud', 'speak to human'], maxLengthChars: 600 }),
    JSON.stringify(['/start', '/help', '/status', '/pricing'])
  );

  // Create starter workflow
  db.prepare(`
    INSERT INTO automation_workflows (id, user_id, name, description, trigger_platform, trigger_event, conditions_json, ai_prompt_template, action_type, active)
    VALUES (?, ?, ?, ?, 'ALL', 'MESSAGE_RECEIVED', ?, ?, 'AUTO_OR_APPROVAL', 1)
  `).run(
    `wf_${crypto.randomUUID()}`,
    userId,
    'Universal Multilingual Responder',
    'Detects English, Swahili, or Sheng on incoming messages, runs AI processing, and dispatches or queues for manual review.',
    JSON.stringify([{ field: 'message.length', operator: '>', value: '0' }]),
    'Analyze sender intent and reply naturally matching the detected language.'
  );
}
