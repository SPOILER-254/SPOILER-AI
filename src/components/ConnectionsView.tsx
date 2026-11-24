import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plug,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { PlatformCatalogItem, SocialAccount } from '../types';
import { PlatformGlyph } from './PlatformGlyph';

interface CatalogResponse {
  catalog: PlatformCatalogItem[];
  accounts: SocialAccount[];
  webhookEndpoints: {
    whatsapp: string;
    whatsappVerifyToken: string;
    meta?: string;
    telegramPattern: string;
    slackPattern: string;
  };
}

export function ConnectionsView({ onUpdated }: { onUpdated: () => void }) {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal state
  const [activePlatform, setActivePlatform] = useState<PlatformCatalogItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states for real API connections
  const [telegramToken, setTelegramToken] = useState('');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waWabaId, setWaWabaId] = useState('');
  const [waAppSecret, setWaAppSecret] = useState('');
  const [genericToken, setGenericToken] = useState('');
  const [modeChoice, setModeChoice] = useState<'AUTOMATIC' | 'MANUAL'>('AUTOMATIC');

  // WhatsApp Template modal
  const [templateAccount, setTemplateAccount] = useState<SocialAccount | null>(null);
  const [tplPhone, setTplPhone] = useState('');
  const [tplName, setTplName] = useState('hello_world');
  const [tplLang, setTplLang] = useState('en_US');

  const loadCatalog = async () => {
    try {
      const res = await apiRequest<CatalogResponse>('/api/platforms/catalog');
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    const handleOAuthMsg = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setNotice(`Connected ${String(event.data.platform || '').toUpperCase()} via official OAuth2.`);
        loadCatalog();
        onUpdated();
      }
    };
    window.addEventListener('message', handleOAuthMsg);
    return () => window.removeEventListener('message', handleOAuthMsg);
  }, []);

  const handleOpenConnect = (item: PlatformCatalogItem) => {
    setError(null);
    setNotice(null);
    setTelegramToken('');
    setWaPhoneId('');
    setWaAccessToken('');
    setWaWabaId('');
    setWaAppSecret('');
    setGenericToken('');
    setModeChoice('AUTOMATIC');
    setActivePlatform(item);
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlatform) return;
    setSubmitting(true);
    setError(null);

    try {
      if (activePlatform.id === 'telegram') {
        const res = await apiRequest<{ accountName: string; webhookRegistered: boolean }>(
          '/api/platforms/connect/telegram',
          {
            method: 'POST',
            body: JSON.stringify({ botToken: telegramToken, automationMode: modeChoice }),
          }
        );
        setNotice(
          `Telegram bot ${res.accountName} verified via getMe! ${
            res.webhookRegistered ? 'Live webhook registered.' : 'Save HTTPS APP_URL for automatic Telegram webhook push.'
          }`
        );
      } else if (activePlatform.id === 'whatsapp') {
        const res = await apiRequest<{ accountName: string }>(
          '/api/platforms/connect/whatsapp',
          {
            method: 'POST',
            body: JSON.stringify({
              phoneNumberId: waPhoneId,
              accessToken: waAccessToken,
              wabaId: waWabaId,
              appSecret: waAppSecret,
              automationMode: modeChoice,
            }),
          }
        );
        setNotice(`WhatsApp Business Cloud API verified and connected: ${res.accountName}`);
      } else if (['discord', 'slack', 'gmail'].includes(activePlatform.id)) {
        const res = await apiRequest<{ accountName: string }>('/api/platforms/connect/token', {
          method: 'POST',
          body: JSON.stringify({
            platform: activePlatform.id,
            token: genericToken,
            automationMode: modeChoice,
          }),
        });
        setNotice(`${activePlatform.name} verified and connected: ${res.accountName}`);
      }

      setActivePlatform(null);
      await loadCatalog();
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartOAuth = async (platformId: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ url: string }>(`/api/oauth/${platformId}/url`);
      window.open(res.url, 'spoiler_oauth_popup', 'width=600,height=720');
      setActivePlatform(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleMode = async (acc: SocialAccount) => {
    const next = acc.automation_mode === 'AUTOMATIC' ? 'MANUAL' : 'AUTOMATIC';
    await apiRequest(`/api/platforms/${acc.id}/mode`, {
      method: 'PATCH',
      body: JSON.stringify({ automationMode: next }),
    });
    await loadCatalog();
  };

  const handleReconnect = async (acc: SocialAccount) => {
    setError(null);
    try {
      await apiRequest(`/api/platforms/${acc.id}/reconnect`, { method: 'POST' });
      setNotice(`Re-verified ${acc.account_name} successfully.`);
      await loadCatalog();
      onUpdated();
    } catch (err: any) {
      setError(err.message);
      await loadCatalog();
    }
  };

  const handleDisconnect = async (acc: SocialAccount) => {
    await apiRequest(`/api/platforms/${acc.id}`, { method: 'DELETE' });
    setNotice(`Disconnected ${acc.account_name}.`);
    await loadCatalog();
    onUpdated();
  };

  const copyText = (val: string) => {
    navigator.clipboard?.writeText(val);
    setNotice('Copied to clipboard.');
  };

  if (loading || !data) {
    return <div className="h-64 rounded-xl bg-[#111114] border border-white/8 animate-pulse" />;
  }

  const categories = ['ALL', 'Messaging', 'Social', 'Video & Community', 'Email & Workspace'];
  const filteredCatalog =
    categoryFilter === 'ALL'
      ? data.catalog
      : data.catalog.filter((p) => p.category === categoryFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Social Media Connection Center</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Connect all 16 supported channels via official Cloud APIs, Bot Tokens, and scoped OAuth2 flows. Encrypted at rest with AES-256-GCM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111114] border border-white/8 rounded-lg">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                categoryFilter === cat ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {cat === 'ALL' ? 'All 16 Platforms' : cat}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Webhook Endpoints Reference Strip */}
      <div className="p-4 rounded-xl bg-[#111114] border border-white/8 grid md:grid-cols-3 gap-4 text-xs">
        <div>
          <p className="font-semibold text-zinc-200 mb-1">WhatsApp Cloud Webhook Callback URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2.5 py-1.5 rounded bg-black/60 border border-white/8 font-mono text-zinc-300 truncate">
              {data.webhookEndpoints.whatsapp}
            </code>
            <button
              type="button"
              onClick={() => copyText(data.webhookEndpoints.whatsapp)}
              className="p-1.5 rounded bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
              title="Copy WhatsApp Webhook URL"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div>
          <p className="font-semibold text-zinc-200 mb-1">Instagram &amp; Messenger Webhook URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2.5 py-1.5 rounded bg-black/60 border border-white/8 font-mono text-zinc-300 truncate">
              {data.webhookEndpoints.meta || `${window.location.origin}/api/webhooks/meta`}
            </code>
            <button
              type="button"
              onClick={() => copyText(data.webhookEndpoints.meta || `${window.location.origin}/api/webhooks/meta`)}
              className="p-1.5 rounded bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
              title="Copy Meta Webhook URL"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div>
          <p className="font-semibold text-zinc-200 mb-1">Meta Hub Verify Token</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2.5 py-1.5 rounded bg-black/60 border border-white/8 font-mono text-zinc-300 truncate">
              {data.webhookEndpoints.whatsappVerifyToken}
            </code>
            <button
              type="button"
              onClick={() => copyText(data.webhookEndpoints.whatsappVerifyToken)}
              className="p-1.5 rounded bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
              title="Copy Verify Token"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 16 Platforms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCatalog.map((item) => {
          const connectedList = data.accounts.filter((a) => a.platform === item.id);
          const isConnected = connectedList.some((a) => a.status === 'CONNECTED');

          return (
            <div
              key={item.id}
              className="p-5 rounded-xl bg-[#111114] border border-white/10 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PlatformGlyph platform={item.id} size="md" />
                    <div>
                      <h3 className="font-display text-base font-bold text-white">{item.name}</h3>
                      <p className="text-xs text-zinc-500">
                        {item.category} · {item.authMethod.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                      isConnected ? 'text-emerald-400' : 'text-zinc-500'
                    }`}
                  >
                    {isConnected ? `Connected (${connectedList.length})` : 'Not Connected'}
                  </span>
                </div>

                <p className="mt-3 text-xs text-zinc-400 leading-relaxed">{item.approvalNote}</p>

                {/* Available vs Unavailable Features */}
                <div className="mt-4 pt-3 border-t border-white/6 space-y-2 text-xs">
                  <div>
                    <span className="text-zinc-300 font-medium">Supported: </span>
                    <span className="text-zinc-400">{item.availableFeatures.join(' · ')}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-medium">Unavailable: </span>
                    <span className="text-zinc-500">{item.unavailableFeatures.join(' · ')}</span>
                  </div>
                </div>

                {/* Connected Instances for this Platform */}
                {connectedList.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/8 space-y-2.5">
                    {connectedList.map((acc) => (
                      <div key={acc.id} className="p-3 rounded-lg bg-[#09090B] border border-white/8 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate">{acc.account_name}</span>
                          <span
                            className={`text-[11px] font-medium ${
                              acc.status === 'CONNECTED' ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {acc.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">
                          Permissions: {acc.permissions.join(', ') || 'Default'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleToggleMode(acc)}
                            className="px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-[11px] font-medium text-zinc-200 hover:border-red-500/40 cursor-pointer"
                          >
                            Mode: {acc.automation_mode}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReconnect(acc)}
                            className="px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-[11px] text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Reconnect</span>
                          </button>
                          {acc.platform === 'whatsapp' && (
                            <button
                              type="button"
                              onClick={() => setTemplateAccount(acc)}
                              className="px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-[11px] text-zinc-200 hover:text-white cursor-pointer"
                            >
                              Send Template
                            </button>
                          )}
                          {acc.platform === 'telegram' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setError(null);
                                try {
                                  await apiRequest(`/api/platforms/telegram/${acc.id}/sync-commands`, {
                                    method: 'POST',
                                    body: JSON.stringify({ commands: ['/start', '/help', '/pricing', '/status'] }),
                                  });
                                  setNotice(`Synced slash commands to ${acc.account_name} via Telegram setMyCommands.`);
                                } catch (err: any) {
                                  setError(err.message);
                                }
                              }}
                              className="px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-[11px] text-zinc-200 hover:text-white cursor-pointer"
                            >
                              Sync Commands
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDisconnect(acc)}
                            className="px-2.5 py-1 rounded bg-red-950/40 border border-red-500/30 text-[11px] text-red-300 hover:bg-red-950/70 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Disconnect</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleOpenConnect(item)}
                className="w-full py-2 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plug className="w-3.5 h-3.5" />
                <span>{connectedList.length > 0 ? `Add Another ${item.name}` : `Connect ${item.name}`}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Platform Connection Wizard Modal */}
      {activePlatform && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#111114] border border-white/12 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <PlatformGlyph platform={activePlatform.id} size="md" />
                <div>
                  <h3 className="font-display text-lg font-bold text-white">Connect {activePlatform.name}</h3>
                  <p className="text-xs text-zinc-400">Official {activePlatform.authMethod.replace('_', ' ')} Integration</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePlatform(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activePlatform.approvalRequired && (
              <div className="mb-4 p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/35 text-xs text-amber-200 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-100">Developer Approval &amp; Policy Requirement</p>
                  <p className="mt-1 text-amber-200/80">{activePlatform.approvalNote}</p>
                </div>
              </div>
            )}

            {activePlatform.id === 'telegram' && (
              <form onSubmit={handleConnectSubmit} className="space-y-4">
                <div className="p-3.5 rounded-lg bg-black/50 border border-white/8 text-xs text-zinc-300 space-y-1">
                  <p className="font-semibold text-white">Telegram BotFather Setup:</p>
                  <p>1. Open @BotFather on Telegram and run /newbot.</p>
                  <p>2. Paste your Bot Token below. SPOILER AI verifies via getMe and registers your webhook.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Telegram Bot Token</label>
                  <input
                    type="password"
                    required
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="123456789:AAH..."
                    className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-white/12 text-sm font-mono text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Initial Automation Mode</label>
                  <select
                    value={modeChoice}
                    onChange={(e) => setModeChoice(e.target.value as 'AUTOMATIC' | 'MANUAL')}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-white/12 text-sm text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="AUTOMATIC">Automatic Mode (AI sends replies immediately)</option>
                    <option value="MANUAL">Manual Mode (AI drafts replies for your approval)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
                >
                  {submitting ? 'Verifying with Telegram API...' : 'Verify & Connect Telegram Bot'}
                </button>
              </form>
            )}

            {activePlatform.id === 'whatsapp' && (
              <form onSubmit={handleConnectSubmit} className="space-y-4">
                <div className="p-3.5 rounded-lg bg-black/50 border border-white/8 text-xs text-zinc-300 space-y-1">
                  <p className="font-semibold text-white">WhatsApp Business Cloud API Wizard:</p>
                  <p>1. Create a Meta Business App with WhatsApp product enabled.</p>
                  <p>2. Copy your Phone Number ID &amp; System User Access Token.</p>
                  <p>3. Configure Meta Webhook to: <span className="font-mono text-red-300 break-all">{data.webhookEndpoints.whatsapp}</span></p>
                  <p>4. Use Verify Token: <span className="font-mono text-red-300">{data.webhookEndpoints.whatsappVerifyToken}</span></p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Phone Number ID</label>
                  <input
                    type="text"
                    required
                    value={waPhoneId}
                    onChange={(e) => setWaPhoneId(e.target.value)}
                    placeholder="e.g. 428910384712345"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-white/12 text-sm font-mono text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Meta Permanent Access Token</label>
                  <input
                    type="password"
                    required
                    value={waAccessToken}
                    onChange={(e) => setWaAccessToken(e.target.value)}
                    placeholder="EAAG..."
                    className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-white/12 text-sm font-mono text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">WABA ID (Optional)</label>
                    <input
                      type="text"
                      value={waWabaId}
                      onChange={(e) => setWaWabaId(e.target.value)}
                      placeholder="Business Account ID"
                      className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">App Secret (Optional)</label>
                    <input
                      type="password"
                      value={waAppSecret}
                      onChange={(e) => setWaAppSecret(e.target.value)}
                      placeholder="For HMAC verification"
                      className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Automation Mode</label>
                  <select
                    value={modeChoice}
                    onChange={(e) => setModeChoice(e.target.value as 'AUTOMATIC' | 'MANUAL')}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-white/12 text-sm text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="AUTOMATIC">Automatic Mode</option>
                    <option value="MANUAL">Manual Approval Mode</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
                >
                  {submitting ? 'Verifying with Meta Graph API...' : 'Verify & Connect WhatsApp Cloud API'}
                </button>
              </form>
            )}

            {['discord', 'slack', 'gmail'].includes(activePlatform.id) && (
              <form onSubmit={handleConnectSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    {activePlatform.id === 'discord'
                      ? 'Discord Bot Token'
                      : activePlatform.id === 'slack'
                        ? 'Slack Bot User OAuth Token (xoxb-...)'
                        : 'Google Gmail OAuth Access Token'}
                  </label>
                  <input
                    type="password"
                    required
                    value={genericToken}
                    onChange={(e) => setGenericToken(e.target.value)}
                    placeholder={activePlatform.id === 'slack' ? 'xoxb-...' : 'Paste official API token'}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-white/12 text-sm font-mono text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
                >
                  {submitting ? 'Verifying Credentials...' : `Verify & Connect ${activePlatform.name}`}
                </button>
                {activePlatform.oauthConfigured && activePlatform.id !== 'gmail' && (
                  <button
                    type="button"
                    onClick={() => handleStartOAuth(activePlatform.id)}
                    className="w-full py-2 px-4 rounded-lg bg-zinc-900 border border-white/12 text-xs font-semibold text-zinc-200 hover:text-white flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Or Connect via Official OAuth2 Popup</span>
                  </button>
                )}
              </form>
            )}

            {activePlatform.authMethod === 'OAUTH2' && !['discord', 'slack'].includes(activePlatform.id) && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {activePlatform.name} uses official OAuth 2.0 authorization. Click below to launch the {activePlatform.name} permission window.
                  {!activePlatform.oauthConfigured &&
                    ' Note: Server OAuth Client ID/Secret must be configured in your environment variables for this platform before authorization.'}
                </p>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleStartOAuth(activePlatform.id)}
                  className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Authorize {activePlatform.name} via OAuth2</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* WhatsApp Template Dispatch Modal */}
      {templateAccount && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#111114] border border-white/12 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Send WhatsApp Template</h3>
              <button type="button" onClick={() => setTemplateAccount(null)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSubmitting(true);
                setError(null);
                try {
                  const res = await apiRequest<{ externalMessageId: string }>('/api/platforms/whatsapp/send-template', {
                    method: 'POST',
                    body: JSON.stringify({
                      accountId: templateAccount.id,
                      recipientPhone: tplPhone,
                      templateName: tplName,
                      templateLanguage: tplLang,
                    }),
                  });
                  setNotice(`WhatsApp template dispatched (Message ID: ${res.externalMessageId}).`);
                  setTemplateAccount(null);
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Recipient Phone (E.164 digits)</label>
                <input
                  type="text"
                  required
                  value={tplPhone}
                  onChange={(e) => setTplPhone(e.target.value)}
                  placeholder="254712345678"
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-300 mb-1">Approved Template Name</label>
                  <input
                    type="text"
                    required
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-300 mb-1">Language Code</label>
                  <input
                    type="text"
                    required
                    value={tplLang}
                    onChange={(e) => setTplLang(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {submitting ? 'Dispatching...' : 'Send Approved Template'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
