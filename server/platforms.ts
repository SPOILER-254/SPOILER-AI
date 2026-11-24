import { config } from './config.ts';
import { decryptSecret, encryptSecret } from './crypto.ts';
import { db } from './db.ts';

export type AuthMethod = 'CLOUD_API' | 'BOT_TOKEN' | 'OAUTH2' | 'GOOGLE_OAUTH';

export interface PlatformDefinition {
  id: string;
  name: string;
  category: 'Messaging' | 'Social' | 'Video & Community' | 'Email & Workspace';
  authMethod: AuthMethod;
  approvalRequired: boolean;
  approvalNote: string;
  availableFeatures: string[];
  unavailableFeatures: string[];
  oauthConfigured: boolean;
  webhookSupported: boolean;
}

export function getPlatformCatalog(): PlatformDefinition[] {
  return [
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      category: 'Messaging',
      authMethod: 'CLOUD_API',
      approvalRequired: true,
      approvalNote: 'Requires a Meta Developer App with WhatsApp Business Cloud API enabled, verified Phone Number ID, and System User Permanent Token.',
      availableFeatures: ['Inbound Cloud Webhook', 'AI Auto & Manual Replies', 'Image & Media Analysis (ReplyImg)', 'Delivery & Read Receipts', 'Approved Message Templates'],
      unavailableFeatures: ['Unofficial QR Web Scraping', 'Bulk Unsolicited Cold Messaging'],
      oauthConfigured: Boolean(config.metaAppId && config.metaAppSecret),
      webhookSupported: true,
    },
    {
      id: 'telegram',
      name: 'Telegram',
      category: 'Messaging',
      authMethod: 'BOT_TOKEN',
      approvalRequired: false,
      approvalNote: 'Create a bot via @BotFather and paste your Bot Token. SPOILER AI verifies via getMe and registers your live webhook.',
      availableFeatures: ['Instant Webhook Registration', '1-on-1 & Group Bot Replies', 'Custom Slash Commands', 'Photo & Document Processing (ReplyImg)', 'Multi-Bot Support'],
      unavailableFeatures: ['Personal User-Account MTProto Automation'],
      oauthConfigured: true,
      webhookSupported: true,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      category: 'Social',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires Meta App Review for instagram_manage_messages & instagram_manage_comments on Professional (Business/Creator) accounts.',
      availableFeatures: ['Professional DM Automation', 'Comment Reply Moderation', 'Account Insights Sync'],
      unavailableFeatures: ['Personal Account DM Automation', 'Stories Auto-DM without Trigger'],
      oauthConfigured: Boolean(config.oauthProviders.instagram.clientId && config.oauthProviders.instagram.clientSecret),
      webhookSupported: true,
    },
    {
      id: 'facebook',
      name: 'Facebook',
      category: 'Social',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires Meta App Review for pages_manage_posts, pages_read_engagement, and Page Admin authorization.',
      availableFeatures: ['Page Post Publishing', 'Page Comment Management', 'Engagement Metrics'],
      unavailableFeatures: ['Personal Profile Posting', 'Private Group Scraping'],
      oauthConfigured: Boolean(config.oauthProviders.facebook.clientId && config.oauthProviders.facebook.clientSecret),
      webhookSupported: true,
    },
    {
      id: 'messenger',
      name: 'Facebook Messenger',
      category: 'Messaging',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires Meta App Review for pages_messaging permission and webhook subscription on your Facebook Page.',
      availableFeatures: ['AI Page Messaging', '24-Hour Standard Messaging Window', 'Human Handover Protocol'],
      unavailableFeatures: ['Outside-24h Promotional Broadcasts without Tag'],
      oauthConfigured: Boolean(config.oauthProviders.messenger.clientId && config.oauthProviders.messenger.clientSecret),
      webhookSupported: true,
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      category: 'Video & Community',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires TikTok for Developers App approval for Login Kit and Content Posting API scopes.',
      availableFeatures: ['Account Profile & Video List', 'Approved Video Upload/Drafts'],
      unavailableFeatures: ['Automated Direct Messaging (Not Exposed by Public API)', 'Comment Auto-Replies without Enterprise Access'],
      oauthConfigured: Boolean(config.oauthProviders.tiktok.clientId && config.oauthProviders.tiktok.clientSecret),
      webhookSupported: false,
    },
    {
      id: 'x',
      name: 'X / Twitter',
      category: 'Social',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires X Developer Portal OAuth 2.0 PKCE credentials. DM & high-volume read endpoints require Basic/Pro X API tier.',
      availableFeatures: ['Post Creation & Scheduling', 'Authorized User Profile', 'DM Endpoints (Basic/Pro API Tier)'],
      unavailableFeatures: ['Free-Tier Full Search Stream', 'Automated Mass Follow/Like'],
      oauthConfigured: Boolean(config.oauthProviders.x.clientId && config.oauthProviders.x.clientSecret),
      webhookSupported: false,
    },
    {
      id: 'discord',
      name: 'Discord',
      category: 'Video & Community',
      authMethod: 'BOT_TOKEN',
      approvalRequired: false,
      approvalNote: 'Connect via Discord Bot Token (verified via Discord REST v10) or configure DISCORD_CLIENT_ID/SECRET for Server OAuth2.',
      availableFeatures: ['Channel Bot Messaging', 'Server Moderation Actions', 'Slash Command Dispatch'],
      unavailableFeatures: ['Self-Bot User Account Automation (Prohibited by Discord ToS)'],
      oauthConfigured: Boolean(config.oauthProviders.discord.clientId && config.oauthProviders.discord.clientSecret),
      webhookSupported: true,
    },
    {
      id: 'snapchat',
      name: 'Snapchat',
      category: 'Social',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires Snapchat Business / Snap Kit partner approval. Public automated personal chat APIs are not offered by Snap.',
      availableFeatures: ['Snap Kit Login Profile', 'Public Profile & Business Insights (Partner Approved)'],
      unavailableFeatures: ['Automated Personal Snap Chat Replies', 'Private Story Extraction'],
      oauthConfigured: Boolean(config.oauthProviders.snapchat.clientId && config.oauthProviders.snapchat.clientSecret),
      webhookSupported: false,
    },
    {
      id: 'youtube',
      name: 'YouTube',
      category: 'Video & Community',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires Google Cloud YouTube Data API v3 OAuth consent verification for youtube.force-ssl comment moderation.',
      availableFeatures: ['Channel Analytics & Video Metadata', 'Comment Thread Monitoring & Replies'],
      unavailableFeatures: ['Private Live Chat Moderation without Broadcast Scope'],
      oauthConfigured: Boolean(config.oauthProviders.youtube.clientId && config.oauthProviders.youtube.clientSecret),
      webhookSupported: false,
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      category: 'Social',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires LinkedIn Developer App with Share on LinkedIn & Community Management API approval for organization pages.',
      availableFeatures: ['Authorized Member & Org Posting', 'Profile Identity'],
      unavailableFeatures: ['Personal Inbox DM Automation (Restricted Partner API)'],
      oauthConfigured: Boolean(config.oauthProviders.linkedin.clientId && config.oauthProviders.linkedin.clientSecret),
      webhookSupported: false,
    },
    {
      id: 'reddit',
      name: 'Reddit',
      category: 'Video & Community',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires Reddit OAuth2 script/web app credentials and compliance with Reddit Data API rate limits.',
      availableFeatures: ['Subreddit Post & Comment Replies', 'Private Modmail & Inbox Reading'],
      unavailableFeatures: ['Unsolicited Bulk DM Campaigns'],
      oauthConfigured: Boolean(config.oauthProviders.reddit.clientId && config.oauthProviders.reddit.clientSecret),
      webhookSupported: false,
    },
    {
      id: 'pinterest',
      name: 'Pinterest',
      category: 'Social',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires Pinterest API v5 Developer App approval for boards:read and pins:write.',
      availableFeatures: ['Pin Publishing & Board Sync', 'Pin Analytics'],
      unavailableFeatures: ['Automated Direct Messaging'],
      oauthConfigured: Boolean(config.oauthProviders.pinterest.clientId && config.oauthProviders.pinterest.clientSecret),
      webhookSupported: false,
    },
    {
      id: 'threads',
      name: 'Threads',
      category: 'Social',
      authMethod: 'OAUTH2',
      approvalRequired: true,
      approvalNote: 'Requires Meta Threads API permissions (threads_basic, threads_content_publish, threads_manage_replies).',
      availableFeatures: ['Threads Post Publishing', 'Reply Management'],
      unavailableFeatures: ['Direct Messaging (Not Supported by Threads API)'],
      oauthConfigured: Boolean(config.oauthProviders.threads.clientId && config.oauthProviders.threads.clientSecret),
      webhookSupported: false,
    },
    {
      id: 'gmail',
      name: 'Gmail',
      category: 'Email & Workspace',
      authMethod: 'GOOGLE_OAUTH',
      approvalRequired: true,
      approvalNote: 'Connect with a Google OAuth Access Token (gmail.readonly / gmail.send) or Workspace OAuth client.',
      availableFeatures: ['Authorized Inbox Thread Reading', 'AI Draft & Reply Sending'],
      unavailableFeatures: ['Unauthenticated SMTP Password Scraping'],
      oauthConfigured: true,
      webhookSupported: false,
    },
    {
      id: 'slack',
      name: 'Slack',
      category: 'Email & Workspace',
      authMethod: 'BOT_TOKEN',
      approvalRequired: false,
      approvalNote: 'Connect via Slack Bot User OAuth Token (xoxb-..., verified via auth.test) or Slack OAuth v2.',
      availableFeatures: ['Channel & DM Bot Replies', 'Events API Webhook', 'Workspace Thread Summaries'],
      unavailableFeatures: ['Enterprise Grid Audit Export without Org Token'],
      oauthConfigured: Boolean(config.oauthProviders.slack.clientId && config.oauthProviders.slack.clientSecret),
      webhookSupported: true,
    },
  ];
}

// --- Real Outbound API Dispatchers ---
export async function verifyAndConnectTelegram(
  botToken: string,
  accountId: string,
  publicBaseUrl?: string
): Promise<{
  ok: boolean;
  username?: string;
  botId?: string;
  webhookRegistered?: boolean;
  webhookUrl?: string;
  error?: string;
}> {
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meData = (await meRes.json()) as { ok: boolean; result?: { id: number; username: string; first_name: string }; description?: string };
    if (!meData.ok || !meData.result) {
      return { ok: false, error: meData.description || 'Telegram rejected the bot token.' };
    }

    const baseUrl = (publicBaseUrl || config.appUrl).replace(/\/+$/, '');
    const webhookUrl = `${baseUrl}/api/webhooks/telegram/${accountId}`;
    let webhookRegistered = false;
    // Register webhook only if base URL is public HTTPS (Telegram requires HTTPS)
    if (webhookUrl.startsWith('https://')) {
      const secretToken = accountId.replace(/[^a-zA-Z0-9_-]/g, '');
      const whRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secretToken,
          allowed_updates: ['message', 'edited_message'],
        }),
      });
      const whData = (await whRes.json()) as { ok: boolean };
      webhookRegistered = Boolean(whData.ok);
    }

    return {
      ok: true,
      username: `@${meData.result.username}`,
      botId: String(meData.result.id),
      webhookRegistered,
      webhookUrl,
    };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error reaching Telegram API' };
  }
}

export async function verifyAndConnectWhatsApp(params: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<{
  ok: boolean;
  displayPhone?: string;
  verifiedName?: string;
  error?: string;
}> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(params.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
        },
      }
    );
    const data = (await res.json()) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string };
    };
    if (!res.ok || data.error) {
      return {
        ok: false,
        error: data.error?.message || `Meta Graph API returned HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      displayPhone: data.display_phone_number,
      verifiedName: data.verified_name,
    };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reach Meta Graph API' };
  }
}

export async function verifyDiscordBotToken(botToken: string): Promise<{
  ok: boolean;
  username?: string;
  botId?: string;
  error?: string;
}> {
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${botToken}` },
    });
    const data = (await res.json()) as { id?: string; username?: string; message?: string };
    if (!res.ok || !data.id) {
      return { ok: false, error: data.message || `Discord API HTTP ${res.status}` };
    }
    return { ok: true, username: data.username, botId: data.id };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reach Discord API' };
  }
}

export async function verifySlackBotToken(botToken: string): Promise<{
  ok: boolean;
  team?: string;
  botUserId?: string;
  error?: string;
}> {
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = (await res.json()) as { ok: boolean; team?: string; user_id?: string; error?: string };
    if (!data.ok) {
      return { ok: false, error: data.error || 'Slack auth.test failed' };
    }
    return { ok: true, team: data.team, botUserId: data.user_id };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reach Slack API' };
  }
}

export async function verifyGmailToken(accessToken: string): Promise<{
  ok: boolean;
  emailAddress?: string;
  error?: string;
}> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as { emailAddress?: string; error?: { message?: string } };
    if (!res.ok || !data.emailAddress) {
      return { ok: false, error: data.error?.message || `Gmail API HTTP ${res.status}` };
    }
    return { ok: true, emailAddress: data.emailAddress };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to reach Gmail API' };
  }
}

export async function downloadWhatsAppMedia(mediaId: string, accessToken: string): Promise<{
  base64: string;
  mimeType: string;
} | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!metaRes.ok || !meta.url) return null;

    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!binRes.ok) return null;
    const buf = Buffer.from(await binRes.arrayBuffer());
    return {
      base64: buf.toString('base64'),
      mimeType: meta.mime_type || 'image/jpeg',
    };
  } catch {
    return null;
  }
}

export async function syncTelegramCommands(botToken: string, commands: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const formatted = commands
      .map((c) => c.replace(/^\//, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, ''))
      .filter(Boolean)
      .slice(0, 20)
      .map((cmd) => ({ command: cmd, description: `Run ${cmd} command via SPOILER AI` }));

    const res = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: formatted }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return { ok: false, error: data.description || 'Failed to sync Telegram commands' };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error syncing Telegram commands' };
  }
}

export async function fetchOAuthUserProfile(
  platform: string,
  accessToken: string
): Promise<{ accountName: string; externalId: string | null }> {
  const fallback = { accountName: `${platform.toUpperCase()} OAuth Account`, externalId: null };
  try {
    if (platform === 'facebook' || platform === 'messenger' || platform === 'instagram') {
      const r = await fetch('https://graph.facebook.com/v21.0/me?fields=id,name', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { id?: string; name?: string };
      if (r.ok && d.id) return { accountName: d.name || `${platform.toUpperCase()} Account`, externalId: d.id };
    } else if (platform === 'threads') {
      const r = await fetch('https://graph.threads.net/v1.0/me?fields=id,username', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { id?: string; username?: string };
      if (r.ok && d.id) return { accountName: d.username ? `@${d.username}` : 'Threads Account', externalId: d.id };
    } else if (platform === 'x') {
      const r = await fetch('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { data?: { id?: string; username?: string } };
      if (r.ok && d.data?.id) {
        return { accountName: d.data.username ? `@${d.data.username}` : 'X Account', externalId: d.data.id };
      }
    } else if (platform === 'discord') {
      const r = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { id?: string; username?: string };
      if (r.ok && d.id) return { accountName: d.username || 'Discord Account', externalId: d.id };
    } else if (platform === 'slack') {
      const r = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { ok?: boolean; team?: string; user_id?: string };
      if (d.ok) return { accountName: d.team ? `${d.team} Workspace` : 'Slack Workspace', externalId: d.user_id || null };
    } else if (platform === 'reddit') {
      const r = await fetch('https://oauth.reddit.com/api/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'SPOILER-AI/1.0' },
      });
      const d = (await r.json()) as { id?: string; name?: string };
      if (r.ok && d.name) return { accountName: `u/${d.name}`, externalId: d.id || d.name };
    } else if (platform === 'linkedin') {
      const r = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { sub?: string; name?: string };
      if (r.ok && d.sub) return { accountName: d.name || 'LinkedIn Profile', externalId: d.sub };
    } else if (platform === 'youtube') {
      const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
      const ch = d.items?.[0];
      if (r.ok && ch?.id) return { accountName: ch.snippet?.title || 'YouTube Channel', externalId: ch.id };
    } else if (platform === 'pinterest') {
      const r = await fetch('https://api.pinterest.com/v5/user_account', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { username?: string };
      if (r.ok && d.username) return { accountName: `@${d.username}`, externalId: d.username };
    } else if (platform === 'tiktok') {
      const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = (await r.json()) as { data?: { user?: { open_id?: string; display_name?: string } } };
      const u = d.data?.user;
      if (r.ok && u?.open_id) return { accountName: u.display_name || 'TikTok Account', externalId: u.open_id };
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export async function sendPlatformMessage(params: {
  socialAccountId: string | null;
  platform: string;
  recipientExternalId: string;
  text: string;
  templateName?: string;
  templateLanguage?: string;
}): Promise<{ delivered: boolean; externalMessageId?: string; status: string; error?: string }> {
  if (!params.socialAccountId) {
    return {
      delivered: false,
      status: 'LOCAL_LOGGED',
      error: 'No live platform account linked to this conversation.',
    };
  }

  const account = db
    .prepare('SELECT * FROM social_accounts WHERE id = ?')
    .get(params.socialAccountId) as { id: string; platform: string; external_id: string | null; status: string } | undefined;

  const tokenRow = db
    .prepare('SELECT * FROM platform_tokens WHERE social_account_id = ?')
    .get(params.socialAccountId) as { encrypted_token: string } | undefined;

  if (!account || !tokenRow) {
    return {
      delivered: false,
      status: 'FAILED',
      error: 'Account or encrypted credentials not found.',
    };
  }

  const token = decryptSecret(tokenRow.encrypted_token);
  if (!token) {
    db.prepare('UPDATE social_accounts SET status = ?, last_error = ? WHERE id = ?').run(
      'NEEDS_REAUTH',
      'Stored token could not be decrypted. Please reconnect.',
      account.id
    );
    return { delivered: false, status: 'FAILED', error: 'Token decryption failed; reconnect account.' };
  }

  try {
    if (params.platform === 'telegram') {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: params.recipientExternalId,
          text: params.text,
        }),
      });
      const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
      if (!data.ok) {
        return { delivered: false, status: 'FAILED', error: data.description || 'Telegram sendMessage failed' };
      }
      return { delivered: true, externalMessageId: String(data.result?.message_id), status: 'SENT' };
    }

    if (params.platform === 'whatsapp' && account.external_id) {
      const bodyPayload = params.templateName
        ? {
            messaging_product: 'whatsapp',
            to: params.recipientExternalId,
            type: 'template',
            template: {
              name: params.templateName,
              language: { code: params.templateLanguage || 'en_US' },
            },
          }
        : {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: params.recipientExternalId,
            type: 'text',
            text: { body: params.text },
          };

      const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(account.external_id)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });
      const data = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
      if (!res.ok || data.error) {
        return { delivered: false, status: 'FAILED', error: data.error?.message || `WhatsApp API HTTP ${res.status}` };
      }
      return { delivered: true, externalMessageId: data.messages?.[0]?.id, status: 'SENT' };
    }

    if (params.platform === 'messenger' || params.platform === 'instagram') {
      const res = await fetch('https://graph.facebook.com/v21.0/me/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: params.recipientExternalId },
          message: { text: params.text },
        }),
      });
      const data = (await res.json()) as { message_id?: string; error?: { message: string } };
      if (!res.ok || data.error) {
        return { delivered: false, status: 'FAILED', error: data.error?.message || `Meta Graph HTTP ${res.status}` };
      }
      return { delivered: true, externalMessageId: data.message_id, status: 'SENT' };
    }

    if (params.platform === 'discord') {
      const res = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(params.recipientExternalId)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: params.text }),
      });
      const data = (await res.json()) as { id?: string; message?: string };
      if (!res.ok) {
        return { delivered: false, status: 'FAILED', error: data.message || `Discord HTTP ${res.status}` };
      }
      return { delivered: true, externalMessageId: data.id, status: 'SENT' };
    }

    if (params.platform === 'slack') {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: params.recipientExternalId, text: params.text }),
      });
      const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
      if (!data.ok) {
        return { delivered: false, status: 'FAILED', error: data.error || 'Slack chat.postMessage failed' };
      }
      return { delivered: true, externalMessageId: data.ts, status: 'SENT' };
    }

    if (params.platform === 'x') {
      const res = await fetch(
        `https://api.twitter.com/2/dm_conversations/with/${encodeURIComponent(params.recipientExternalId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: params.text }),
        }
      );
      const data = (await res.json()) as { data?: { dm_event_id?: string }; detail?: string; title?: string };
      if (!res.ok) {
        return { delivered: false, status: 'FAILED', error: data.detail || data.title || `X API HTTP ${res.status}` };
      }
      return { delivered: true, externalMessageId: data.data?.dm_event_id, status: 'SENT' };
    }

    if (params.platform === 'gmail') {
      const cleanRecipient = params.recipientExternalId.replace(/[\r\n]/g, '').trim();
      const rawMime = [
        `To: ${cleanRecipient}`,
        'Subject: Re: Support Inquiry (SPOILER AI)',
        'Content-Type: text/plain; charset=utf-8',
        '',
        params.text,
      ].join('\r\n');
      const encoded = Buffer.from(rawMime, 'utf8').toString('base64url');
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      });
      const data = (await res.json()) as { id?: string; error?: { message?: string } };
      if (!res.ok) {
        return { delivered: false, status: 'FAILED', error: data.error?.message || `Gmail send HTTP ${res.status}` };
      }
      return { delivered: true, externalMessageId: data.id, status: 'SENT' };
    }

    return {
      delivered: false,
      status: 'QUEUED',
      error: `Outbound dispatch for ${params.platform} requires platform-specific OAuth scope approval.`,
    };
  } catch (err: unknown) {
    return {
      delivered: false,
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'Outbound network failure',
    };
  }
}

export async function publishScheduledPostToPlatform(post: {
  id: string;
  user_id: string;
  social_account_id: string | null;
  platform: string;
  content: string;
}): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  const account = post.social_account_id
    ? (db
        .prepare('SELECT id, platform, external_id, account_name FROM social_accounts WHERE id = ? AND user_id = ?')
        .get(post.social_account_id, post.user_id) as { id: string; platform: string; external_id: string | null; account_name: string } | undefined)
    : (db
        .prepare("SELECT id, platform, external_id, account_name FROM social_accounts WHERE user_id = ? AND platform = ? AND status = 'CONNECTED' ORDER BY created_at DESC LIMIT 1")
        .get(post.user_id, post.platform) as { id: string; platform: string; external_id: string | null; account_name: string } | undefined);

  if (!account) {
    const err = `No connected ${post.platform.toUpperCase()} account found. Connect your ${post.platform} account first.`;
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, post.id);
    return { ok: false, error: err };
  }

  const tokRow = db
    .prepare('SELECT encrypted_token FROM platform_tokens WHERE social_account_id = ?')
    .get(account.id) as { encrypted_token: string } | undefined;
  const token = tokRow ? decryptSecret(tokRow.encrypted_token) : null;
  if (!token) {
    const err = 'Account credentials could not be decrypted. Reconnect account.';
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, post.id);
    return { ok: false, error: err };
  }

  try {
    if (post.platform === 'x') {
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: post.content }),
      });
      const data = (await res.json()) as { data?: { id?: string }; detail?: string; title?: string };
      if (!res.ok || !data.data?.id) {
        const err = data.detail || data.title || `X post publish failed (HTTP ${res.status})`;
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, post.id);
        return { ok: false, error: err };
      }
      db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED', error_message = NULL WHERE id = ?").run(post.id);
      return { ok: true, externalId: data.data.id };
    }

    if (post.platform === 'facebook') {
      const targetId = account.external_id || 'me';
      const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(targetId)}/feed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: post.content }),
      });
      const data = (await res.json()) as { id?: string; error?: { message?: string } };
      if (!res.ok || data.error) {
        const err = data.error?.message || `Facebook publish failed (HTTP ${res.status})`;
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, post.id);
        return { ok: false, error: err };
      }
      db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED', error_message = NULL WHERE id = ?").run(post.id);
      return { ok: true, externalId: data.id };
    }

    if (post.platform === 'threads') {
      const createRes = await fetch('https://graph.threads.net/v1.0/me/threads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'TEXT', text: post.content }),
      });
      const createData = (await createRes.json()) as { id?: string; error?: { message?: string } };
      if (!createRes.ok || !createData.id) {
        const err = createData.error?.message || `Threads container creation failed (HTTP ${createRes.status})`;
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, post.id);
        return { ok: false, error: err };
      }
      const pubRes = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: createData.id }),
      });
      const pubData = (await pubRes.json()) as { id?: string; error?: { message?: string } };
      if (!pubRes.ok || !pubData.id) {
        const err = pubData.error?.message || `Threads publish failed (HTTP ${pubRes.status})`;
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, post.id);
        return { ok: false, error: err };
      }
      db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED', error_message = NULL WHERE id = ?").run(post.id);
      return { ok: true, externalId: pubData.id };
    }

    if (post.platform === 'linkedin' && account.external_id) {
      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: `urn:li:person:${account.external_id}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: post.content },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      });
      const data = (await res.json()) as { id?: string; message?: string };
      if (!res.ok) {
        const err = data.message || `LinkedIn publish failed (HTTP ${res.status})`;
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, post.id);
        return { ok: false, error: err };
      }
      db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED', error_message = NULL WHERE id = ?").run(post.id);
      return { ok: true, externalId: data.id };
    }

    const err = `Direct scheduled publishing for ${post.platform} requires vendor media container or API tier approval.`;
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(err, post.id);
    return { ok: false, error: err };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Scheduled publish network error';
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error_message = ? WHERE id = ?").run(msg, post.id);
    return { ok: false, error: msg };
  }
}

export function saveEncryptedToken(params: {
  socialAccountId: string;
  token: string;
  refreshToken?: string;
  secret?: string;
  tokenType?: string;
}) {
  const id = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO platform_tokens (id, social_account_id, encrypted_token, encrypted_refresh_token, encrypted_secret, token_type)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(social_account_id) DO UPDATE SET
      encrypted_token = excluded.encrypted_token,
      encrypted_refresh_token = COALESCE(excluded.encrypted_refresh_token, platform_tokens.encrypted_refresh_token),
      encrypted_secret = COALESCE(excluded.encrypted_secret, platform_tokens.encrypted_secret),
      token_type = excluded.token_type,
      updated_at = datetime('now')
  `).run(
    id,
    params.socialAccountId,
    encryptSecret(params.token),
    params.refreshToken ? encryptSecret(params.refreshToken) : null,
    params.secret ? encryptSecret(params.secret) : null,
    params.tokenType || 'bearer'
  );
}
