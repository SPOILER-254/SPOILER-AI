import { decryptSecret, encryptSecret } from './crypto.ts';
import { db } from './db.ts';

export interface CredentialDefinition {
  key: string;
  label: string;
  group: 'Meta & WhatsApp' | 'M-Pesa Kenya (Daraja)' | 'Stripe Card Billing' | 'Transactional Email' | 'Social OAuth Credentials';
  secret: boolean;
  placeholder: string;
  helpText: string;
  options?: string[];
}

export const INTEGRATION_CREDENTIALS_SCHEMA: CredentialDefinition[] = [
  {
    key: 'META_APP_ID',
    label: 'Meta App ID',
    group: 'Meta & WhatsApp',
    secret: false,
    placeholder: 'e.g. 123456789012345',
    helpText: 'Used for Instagram, Facebook Pages, Messenger, and Threads OAuth flows.',
  },
  {
    key: 'META_APP_SECRET',
    label: 'Meta App Secret',
    group: 'Meta & WhatsApp',
    secret: true,
    placeholder: 'Meta App Secret for OAuth & HMAC verification',
    helpText: 'Verifies X-Hub-Signature-256 on WhatsApp, Instagram, and Messenger webhooks.',
  },
  {
    key: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    label: 'WhatsApp / Meta Webhook Verify Token',
    group: 'Meta & WhatsApp',
    secret: true,
    placeholder: 'spoiler_ai_verify_token',
    helpText: 'Must match the Verify Token configured inside your Meta App Webhooks panel.',
  },
  {
    key: 'MPESA_ENV',
    label: 'M-Pesa Environment',
    group: 'M-Pesa Kenya (Daraja)',
    secret: false,
    placeholder: 'sandbox or production',
    helpText: 'Use sandbox for Daraja testing and production for live Safaricom PayBill/Till STK Push.',
    options: ['sandbox', 'production'],
  },
  {
    key: 'MPESA_CONSUMER_KEY',
    label: 'Safaricom Daraja Consumer Key',
    group: 'M-Pesa Kenya (Daraja)',
    secret: true,
    placeholder: 'Daraja App Consumer Key',
    helpText: 'Generated in Safaricom Daraja Developer Portal under My Apps.',
  },
  {
    key: 'MPESA_CONSUMER_SECRET',
    label: 'Safaricom Daraja Consumer Secret',
    group: 'M-Pesa Kenya (Daraja)',
    secret: true,
    placeholder: 'Daraja App Consumer Secret',
    helpText: 'Paired with Consumer Key for Safaricom OAuth token generation.',
  },
  {
    key: 'MPESA_SHORTCODE',
    label: 'M-Pesa PayBill / Till Shortcode',
    group: 'M-Pesa Kenya (Daraja)',
    secret: false,
    placeholder: 'e.g. 174379 (sandbox) or live shortcode',
    helpText: 'Business Shortcode receiving Lipa na M-Pesa STK Push payments.',
  },
  {
    key: 'MPESA_PASSKEY',
    label: 'Lipa Na M-Pesa Online Passkey',
    group: 'M-Pesa Kenya (Daraja)',
    secret: true,
    placeholder: 'Safaricom STK Online Passkey',
    helpText: 'Used server-side to sign every M-Pesa STK Push password timestamp.',
  },
  {
    key: 'STRIPE_SECRET_KEY',
    label: 'Stripe Secret Key',
    group: 'Stripe Card Billing',
    secret: true,
    placeholder: 'sk_live_... or sk_test_...',
    helpText: 'Enables live USD card checkout sessions for Pro and Business subscriptions.',
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    label: 'Stripe Webhook Signing Secret',
    group: 'Stripe Card Billing',
    secret: true,
    placeholder: 'whsec_...',
    helpText: 'Verifies checkout.session.completed webhooks from Stripe.',
  },
  {
    key: 'RESEND_API_KEY',
    label: 'Resend Transactional Email API Key',
    group: 'Transactional Email',
    secret: true,
    placeholder: 're_...',
    helpText: 'Sends real verification and password-reset emails in production without open SMTP ports.',
  },
  {
    key: 'EMAIL_FROM',
    label: 'Sender Email Address',
    group: 'Transactional Email',
    secret: false,
    placeholder: 'SPOILER AI <no-reply@yourdomain.com>',
    helpText: 'Verified sender domain address used with Resend.',
  },
  {
    key: 'X_CLIENT_ID',
    label: 'X / Twitter OAuth 2.0 Client ID',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'X Developer OAuth 2.0 Client ID',
    helpText: 'PKCE-enabled OAuth 2.0 credential from developer.x.com.',
  },
  {
    key: 'X_CLIENT_SECRET',
    label: 'X / Twitter OAuth 2.0 Client Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'X Client Secret',
    helpText: 'Confidential client secret for X token exchange.',
  },
  {
    key: 'TIKTOK_CLIENT_KEY',
    label: 'TikTok Client Key',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'TikTok for Developers Client Key',
    helpText: 'Approved Login Kit & Video Kit client key.',
  },
  {
    key: 'TIKTOK_CLIENT_SECRET',
    label: 'TikTok Client Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'TikTok Client Secret',
    helpText: 'TikTok OAuth2 token exchange secret.',
  },
  {
    key: 'YOUTUBE_GOOGLE_CLIENT_ID',
    label: 'YouTube Google OAuth Client ID',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'xxx.apps.googleusercontent.com',
    helpText: 'Google Cloud OAuth client ID with YouTube Data API v3 enabled.',
  },
  {
    key: 'YOUTUBE_GOOGLE_CLIENT_SECRET',
    label: 'YouTube Google OAuth Client Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'GOCSPX-...',
    helpText: 'Google Cloud OAuth client secret for YouTube.',
  },
  {
    key: 'LINKEDIN_CLIENT_ID',
    label: 'LinkedIn Client ID',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'LinkedIn App Client ID',
    helpText: 'LinkedIn OAuth 2.0 app credential.',
  },
  {
    key: 'LINKEDIN_CLIENT_SECRET',
    label: 'LinkedIn Client Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'LinkedIn App Client Secret',
    helpText: 'LinkedIn OAuth 2.0 client secret.',
  },
  {
    key: 'REDDIT_CLIENT_ID',
    label: 'Reddit App Client ID',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'Reddit OAuth2 Client ID',
    helpText: 'Reddit web app client ID.',
  },
  {
    key: 'REDDIT_CLIENT_SECRET',
    label: 'Reddit App Client Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'Reddit OAuth2 Secret',
    helpText: 'Reddit web app client secret.',
  },
  {
    key: 'PINTEREST_APP_ID',
    label: 'Pinterest App ID',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'Pinterest Developer App ID',
    helpText: 'Pinterest API v5 app identifier.',
  },
  {
    key: 'PINTEREST_APP_SECRET',
    label: 'Pinterest App Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'Pinterest App Secret',
    helpText: 'Pinterest API v5 OAuth secret.',
  },
  {
    key: 'SNAPCHAT_CLIENT_ID',
    label: 'Snapchat Client ID',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'Snap Kit Client ID',
    helpText: 'Snap Kit OAuth 2.0 client ID.',
  },
  {
    key: 'SNAPCHAT_CLIENT_SECRET',
    label: 'Snapchat Client Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'Snap Kit Client Secret',
    helpText: 'Snap Kit OAuth 2.0 secret.',
  },
  {
    key: 'DISCORD_CLIENT_ID',
    label: 'Discord Application Client ID',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'Discord Application ID',
    helpText: 'Optional OAuth2 app ID alongside direct Bot Token support.',
  },
  {
    key: 'DISCORD_CLIENT_SECRET',
    label: 'Discord Client Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'Discord OAuth2 Secret',
    helpText: 'Discord OAuth2 secret.',
  },
  {
    key: 'SLACK_CLIENT_ID',
    label: 'Slack App Client ID',
    group: 'Social OAuth Credentials',
    secret: false,
    placeholder: 'Slack OAuth Client ID',
    helpText: 'Optional Slack OAuth v2 app ID alongside direct xoxb Bot Token support.',
  },
  {
    key: 'SLACK_CLIENT_SECRET',
    label: 'Slack App Client Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'Slack OAuth Client Secret',
    helpText: 'Slack OAuth v2 secret.',
  },
  {
    key: 'SLACK_SIGNING_SECRET',
    label: 'Slack Signing Secret',
    group: 'Social OAuth Credentials',
    secret: true,
    placeholder: 'Slack Events API Signing Secret',
    helpText: 'Verifies X-Slack-Signature on incoming Slack workspace webhook events.',
  },
];

const ALLOWED_KEYS = new Set(INTEGRATION_CREDENTIALS_SCHEMA.map((d) => d.key));
const VAULT_SETTING_KEY = 'operator_credentials_vault';

interface VaultEntry {
  encrypted: string;
  updatedAt: string;
}

function readVaultMap(): Record<string, VaultEntry> {
  try {
    const row = db
      .prepare('SELECT value_json FROM platform_settings WHERE key = ?')
      .get(VAULT_SETTING_KEY) as { value_json: string } | undefined;
    if (!row) return {};
    const parsed = JSON.parse(row.value_json);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeVaultMap(map: Record<string, VaultEntry>) {
  db.prepare(`
    INSERT INTO platform_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(VAULT_SETTING_KEY, JSON.stringify(map));
}

export function getCredential(key: string): string {
  if (!ALLOWED_KEYS.has(key)) return '';
  const vault = readVaultMap();
  const entry = vault[key];
  if (entry?.encrypted) {
    const decrypted = decryptSecret(entry.encrypted);
    if (decrypted) return decrypted.trim();
  }
  return (process.env[key] || '').trim();
}

export function setVaultCredentials(entries: Record<string, string>): string[] {
  const vault = readVaultMap();
  const updatedKeys: string[] = [];
  const now = new Date().toISOString();

  for (const [rawKey, rawVal] of Object.entries(entries)) {
    if (!ALLOWED_KEYS.has(rawKey)) continue;
    if (typeof rawVal !== 'string') continue;
    const trimmed = rawVal.trim();
    if (!trimmed) continue;

    vault[rawKey] = {
      encrypted: encryptSecret(trimmed),
      updatedAt: now,
    };
    updatedKeys.push(rawKey);
  }

  if (updatedKeys.length > 0) {
    writeVaultMap(vault);
  }
  return updatedKeys;
}

export function deleteVaultCredential(key: string): boolean {
  if (!ALLOWED_KEYS.has(key)) return false;
  const vault = readVaultMap();
  if (!vault[key]) return false;
  delete vault[key];
  writeVaultMap(vault);
  return true;
}

export function getCredentialStatuses() {
  const vault = readVaultMap();
  return INTEGRATION_CREDENTIALS_SCHEMA.map((def) => {
    const vaultEntry = vault[def.key];
    const vaultPlain = vaultEntry?.encrypted ? decryptSecret(vaultEntry.encrypted) : null;
    const envVal = (process.env[def.key] || '').trim();
    const source: 'vault' | 'env' | 'unset' = vaultPlain
      ? 'vault'
      : envVal
        ? 'env'
        : 'unset';

    return {
      key: def.key,
      label: def.label,
      group: def.group,
      secret: def.secret,
      placeholder: def.placeholder,
      helpText: def.helpText,
      options: def.options || null,
      configured: source !== 'unset',
      source,
      updatedAt: vaultEntry?.updatedAt || null,
    };
  });
}
