import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), 'data');
}

export const dataDir = resolveDataDir();
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const UPLOADS_DIR = uploadsDir;
export const dbPath = process.env.SQLITE_DB_PATH?.trim()
  ? path.resolve(process.env.SQLITE_DB_PATH.trim())
  : path.join(dataDir, 'spoiler.db');

const dbParent = path.dirname(dbPath);
if (!fs.existsSync(dbParent)) {
  fs.mkdirSync(dbParent, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_code TEXT,
      reset_code TEXT,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      two_factor_secret_enc TEXT,
      global_automation_enabled INTEGER NOT NULL DEFAULT 1,
      suspended INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      device_name TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'FREE',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      ai_quota_limit INTEGER NOT NULL DEFAULT 250,
      ai_usage_count INTEGER NOT NULL DEFAULT 0,
      bot_limit INTEGER NOT NULL DEFAULT 1,
      account_limit INTEGER NOT NULL DEFAULT 2,
      renews_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'KES',
      provider TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      checkout_request_id TEXT,
      phone_number TEXT,
      plan TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      raw_callback TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

    CREATE TABLE IF NOT EXISTS social_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      external_id TEXT,
      status TEXT NOT NULL DEFAULT 'CONNECTED',
      automation_mode TEXT NOT NULL DEFAULT 'AUTOMATIC',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      features_json TEXT NOT NULL DEFAULT '{}',
      webhook_url TEXT,
      webhook_verified INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON social_accounts(user_id);

    CREATE TABLE IF NOT EXISTS platform_tokens (
      id TEXT PRIMARY KEY,
      social_account_id TEXT NOT NULL UNIQUE REFERENCES social_accounts(id) ON DELETE CASCADE,
      encrypted_token TEXT NOT NULL,
      encrypted_refresh_token TEXT,
      encrypted_secret TEXT,
      token_type TEXT NOT NULL DEFAULT 'bearer',
      expires_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      instructions TEXT NOT NULL,
      personality TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'Auto (English, Swahili, Sheng)',
      memory_enabled INTEGER NOT NULL DEFAULT 1,
      memory_window INTEGER NOT NULL DEFAULT 12,
      automation_mode TEXT NOT NULL DEFAULT 'AUTOMATIC',
      restrictions_json TEXT NOT NULL DEFAULT '{}',
      commands_json TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_bots_user ON ai_bots(user_id);

    CREATE TABLE IF NOT EXISTS bot_accounts (
      bot_id TEXT NOT NULL REFERENCES ai_bots(id) ON DELETE CASCADE,
      social_account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      PRIMARY KEY (bot_id, social_account_id)
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      handle TEXT,
      phone TEXT,
      avatar_url TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, platform, external_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      bot_id TEXT REFERENCES ai_bots(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      subject TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      automation_mode TEXT NOT NULL DEFAULT 'AUTOMATIC',
      unread_count INTEGER NOT NULL DEFAULT 0,
      assigned_to TEXT,
      last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, last_message_at DESC);

    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      ai_analysis_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      content TEXT NOT NULL,
      detected_language TEXT,
      media_id TEXT REFERENCES media_files(id) ON DELETE SET NULL,
      external_message_id TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'DELIVERED',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS automation_workflows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      trigger_platform TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      conditions_json TEXT NOT NULL DEFAULT '[]',
      ai_prompt_template TEXT NOT NULL,
      action_type TEXT NOT NULL DEFAULT 'AUTO_REPLY',
      active INTEGER NOT NULL DEFAULT 1,
      execution_count INTEGER NOT NULL DEFAULT 0,
      last_executed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_user ON automation_workflows(user_id);

    CREATE TABLE IF NOT EXISTS workflow_execution_logs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trigger_payload_json TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS approval_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      bot_id TEXT REFERENCES ai_bots(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      suggested_reply TEXT NOT NULL,
      edited_reply TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_user ON approval_queue(user_id, status);

    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      content TEXT NOT NULL,
      media_id TEXT REFERENCES media_files(id) ON DELETE SET NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      model_name TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ip_address TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default platform settings if absent
  const upsertSetting = db.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value_json) VALUES (?, ?)
  `);
  upsertSetting.run('ai_model_config', JSON.stringify({
    textModel: 'gemini-4-hydrogen',
    visionModel: 'gemini-4-hydrogen',
    maxContextMessages: 12,
  }));
  upsertSetting.run('pricing_plans', JSON.stringify({
    FREE: { name: 'Free', monthlyUsd: 0, monthlyKes: 0, aiQuota: 250, bots: 1, accounts: 2 },
    PRO: { name: 'Pro', monthlyUsd: 29, monthlyKes: 3800, aiQuota: 5000, bots: 5, accounts: 10 },
    BUSINESS: { name: 'Business', monthlyUsd: 99, monthlyKes: 12900, aiQuota: 30000, bots: 25, accounts: 50 },
  }));
  upsertSetting.run('announcements', JSON.stringify([
    {
      id: 'ann_welcome',
      title: 'SPOILER AI Multi-Platform Engine Online',
      body: 'WhatsApp Business Cloud API, Telegram Bot API, ReplyImg Vision, and Swahili/Sheng multilingual reply intelligence are active.',
      createdAt: new Date().toISOString(),
    },
  ]));
}

runMigrations();
