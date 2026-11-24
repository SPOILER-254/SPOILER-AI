import dotenv from 'dotenv';
import type { Request } from 'express';
import { getCredential } from './credentials.ts';
import { keys } from './keys.ts';

dotenv.config();

export function resolveAppUrl(req?: Request): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit && !explicit.includes('localhost') && !explicit.includes('127.0.0.1')) {
    return explicit.replace(/\/+$/, '');
  }
  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  if (renderUrl) {
    return renderUrl.replace(/\/+$/, '');
  }
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) {
    return `https://${railwayDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }
  if (req) {
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) {
      const protoHeader = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
      const proto = host.includes('localhost') || host.startsWith('127.0.0.1') ? protoHeader : 'https';
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }
  return (explicit || 'http://localhost:3000').replace(/\/+$/, '');
}

export const config = {
  port: Number(process.env.PORT || 3000),
  get appUrl(): string {
    return resolveAppUrl();
  },
  get geminiApiKey(): string {
    return process.env.GEMINI_API_KEY || '';
  },
  sessionSecret: keys.sessionSecret,
  encryptionKey: keys.encryptionKey,
  persistentEncryptionConfigured: keys.persistentEncryptionConfigured,
  persistentSessionSecretConfigured: keys.persistentSessionSecretConfigured,
  adminPasscode: process.env.ADMIN_PASSCODE?.trim() || '',
  get whatsappVerifyToken(): string {
    return getCredential('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || 'spoiler_ai_verify_token';
  },
  get metaAppId(): string {
    return getCredential('META_APP_ID');
  },
  get metaAppSecret(): string {
    return getCredential('META_APP_SECRET');
  },
  get resendApiKey(): string {
    return getCredential('RESEND_API_KEY');
  },
  get emailFrom(): string {
    return getCredential('EMAIL_FROM');
  },
  get slackSigningSecret(): string {
    return getCredential('SLACK_SIGNING_SECRET');
  },
  get mpesa() {
    return {
      env: getCredential('MPESA_ENV') === 'production' ? 'production' : 'sandbox',
      consumerKey: getCredential('MPESA_CONSUMER_KEY'),
      consumerSecret: getCredential('MPESA_CONSUMER_SECRET'),
      shortcode: getCredential('MPESA_SHORTCODE'),
      passkey: getCredential('MPESA_PASSKEY'),
    };
  },
  get stripeSecretKey(): string {
    return getCredential('STRIPE_SECRET_KEY');
  },
  get stripeWebhookSecret(): string {
    return getCredential('STRIPE_WEBHOOK_SECRET');
  },
  get oauthProviders() {
    const metaAppId = getCredential('META_APP_ID');
    const metaAppSecret = getCredential('META_APP_SECRET');
    return {
      discord: {
        clientId: getCredential('DISCORD_CLIENT_ID'),
        clientSecret: getCredential('DISCORD_CLIENT_SECRET'),
        authUrl: 'https://discord.com/api/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        scopes: 'identify guilds bot messages.read',
        pkce: false,
      },
      slack: {
        clientId: getCredential('SLACK_CLIENT_ID'),
        clientSecret: getCredential('SLACK_CLIENT_SECRET'),
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        scopes: 'channels:read,chat:write,im:read,im:write,users:read',
        pkce: false,
      },
      x: {
        clientId: getCredential('X_CLIENT_ID'),
        clientSecret: getCredential('X_CLIENT_SECRET'),
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        scopes: 'tweet.read tweet.write users.read dm.read dm.write offline.access',
        pkce: true,
      },
      linkedin: {
        clientId: getCredential('LINKEDIN_CLIENT_ID'),
        clientSecret: getCredential('LINKEDIN_CLIENT_SECRET'),
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scopes: 'openid profile email w_member_social',
        pkce: false,
      },
      reddit: {
        clientId: getCredential('REDDIT_CLIENT_ID'),
        clientSecret: getCredential('REDDIT_CLIENT_SECRET'),
        authUrl: 'https://www.reddit.com/api/v1/authorize',
        tokenUrl: 'https://www.reddit.com/api/v1/access_token',
        scopes: 'identity read privatemessages submit',
        pkce: false,
      },
      tiktok: {
        clientId: getCredential('TIKTOK_CLIENT_KEY'),
        clientSecret: getCredential('TIKTOK_CLIENT_SECRET'),
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        scopes: 'user.info.basic,video.list',
        pkce: false,
      },
      youtube: {
        clientId: getCredential('YOUTUBE_GOOGLE_CLIENT_ID'),
        clientSecret: getCredential('YOUTUBE_GOOGLE_CLIENT_SECRET'),
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',
        pkce: false,
      },
      pinterest: {
        clientId: getCredential('PINTEREST_APP_ID'),
        clientSecret: getCredential('PINTEREST_APP_SECRET'),
        authUrl: 'https://www.pinterest.com/oauth/',
        tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
        scopes: 'user_accounts:read,boards:read,pins:read,pins:write',
        pkce: false,
      },
      snapchat: {
        clientId: getCredential('SNAPCHAT_CLIENT_ID'),
        clientSecret: getCredential('SNAPCHAT_CLIENT_SECRET'),
        authUrl: 'https://accounts.snapchat.com/accounts/oauth2/auth',
        tokenUrl: 'https://accounts.snapchat.com/accounts/oauth2/token',
        scopes: 'https://auth.snapchat.com/oauth2/api/user.display_name',
        pkce: false,
      },
      instagram: {
        clientId: metaAppId,
        clientSecret: metaAppSecret,
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
        scopes: 'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list',
        pkce: false,
      },
      facebook: {
        clientId: metaAppId,
        clientSecret: metaAppSecret,
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
        scopes: 'pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_metadata',
        pkce: false,
      },
      messenger: {
        clientId: metaAppId,
        clientSecret: metaAppSecret,
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
        scopes: 'pages_messaging,pages_show_list,pages_manage_metadata',
        pkce: false,
      },
      threads: {
        clientId: metaAppId,
        clientSecret: metaAppSecret,
        authUrl: 'https://threads.net/oauth/authorize',
        tokenUrl: 'https://graph.threads.net/oauth/access_token',
        scopes: 'threads_basic,threads_content_publish,threads_manage_replies',
        pkce: false,
      },
    };
  },
};
