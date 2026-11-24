import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

interface CredentialStatusItem {
  key: string;
  label: string;
  group:
    | 'Meta & WhatsApp'
    | 'M-Pesa Kenya (Daraja)'
    | 'Stripe Card Billing'
    | 'Transactional Email'
    | 'Social OAuth Credentials';
  secret: boolean;
  placeholder: string;
  helpText: string;
  options: string[] | null;
  configured: boolean;
  source: 'vault' | 'env' | 'unset';
  updatedAt: string | null;
}

interface CredentialsResponse {
  credentials: CredentialStatusItem[];
  appBaseUrl: string;
  callbackUrls: {
    whatsappWebhook: string;
    metaWebhook: string;
    mpesaCallback: string;
    stripeWebhook: string;
    oauthCallbackPattern: string;
  };
  persistentEncryptionConfigured: boolean;
}

const GROUPS = [
  'ALL',
  'Meta & WhatsApp',
  'M-Pesa Kenya (Daraja)',
  'Stripe Card Billing',
  'Transactional Email',
  'Social OAuth Credentials',
] as const;

export function CredentialsView() {
  const [data, setData] = useState<CredentialsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [groupFilter, setGroupFilter] = useState<(typeof GROUPS)[number]>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCredentials = async () => {
    try {
      const res = await apiRequest<CredentialsResponse>('/api/admin/credentials');
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const payload: Record<string, string> = {};
    for (const [key, val] of Object.entries(drafts)) {
      if (val.trim()) {
        payload[key] = val.trim();
      }
    }
    if (Object.keys(payload).length === 0) {
      setError('Enter at least one credential value before saving.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest<{ updatedKeys: string[]; credentials: CredentialStatusItem[] }>(
        '/api/admin/credentials',
        {
          method: 'PUT',
          body: JSON.stringify({ credentials: payload }),
        }
      );
      setData((prev) => (prev ? { ...prev, credentials: res.credentials } : prev));
      setDrafts({});
      setNotice(`Encrypted and stored ${res.updatedKeys.length} credential(s): ${res.updatedKeys.join(', ')}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async (key: string) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ credentials: CredentialStatusItem[] }>(`/api/admin/credentials/${key}`, {
        method: 'DELETE',
      });
      setData((prev) => (prev ? { ...prev, credentials: res.credentials } : prev));
      setNotice(`Cleared encrypted vault override for ${key}. Fallback to server environment variable restored.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyValue = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setNotice(`Copied ${label} to clipboard.`);
  };

  if (loading) {
    return <div className="h-64 rounded-xl bg-[#111114] border border-white/8 animate-pulse" />;
  }

  if (!data) {
    return (
      <div className="p-6 rounded-xl bg-red-950/35 border border-red-500/40 text-xs text-red-200">
        {error || 'Administrator privileges required to manage API credentials.'}
      </div>
    );
  }

  const visibleItems =
    groupFilter === 'ALL' ? data.credentials : data.credentials.filter((item) => item.group === groupFilter);

  const configuredCount = data.credentials.filter((c) => c.configured).length;
  const pendingDraftCount = Object.values(drafts).filter((v) => v.trim().length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Operator API Credentials Vault</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Configure private Meta, Safaricom Daraja M-Pesa, Stripe, Resend Email, and OAuth client secrets safely. Values are encrypted server-side with AES-256-GCM and never returned in plaintext to any browser.
          </p>
        </div>
        <div className="text-xs text-zinc-300 font-mono tabular-nums whitespace-nowrap shrink-0">
          Configured: <span className="text-white font-semibold">{configuredCount}</span> / {data.credentials.length} keys
        </div>
      </div>

      {!data.persistentEncryptionConfigured && (
        <div className="p-4 rounded-xl bg-amber-950/35 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-100">Persistent Encryption Key Recommended for Production</p>
            <p className="mt-1 text-amber-200/85">
              Set <code className="font-mono text-white">TOKEN_ENCRYPTION_KEY</code> (32+ characters) in your Render or Railway environment variables before storing live credentials so encrypted vault secrets remain readable across container restarts.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">{error}</div>
      )}
      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">{notice}</div>
      )}

      {/* Production Callback & Webhook URLs */}
      <div className="p-5 rounded-xl bg-[#111114] border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-red-400" />
            <h3 className="font-display text-sm font-bold text-white">Live Public HTTPS Callback &amp; Webhook URLs</h3>
          </div>
          <span className="text-xs font-mono text-zinc-400 truncate">Base URL: {data.appBaseUrl}</span>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
          {[
            { label: 'WhatsApp Cloud Webhook', value: data.callbackUrls.whatsappWebhook },
            { label: 'Instagram & Messenger Webhook', value: data.callbackUrls.metaWebhook },
            { label: 'M-Pesa Daraja Callback', value: data.callbackUrls.mpesaCallback },
            { label: 'Stripe Webhook Endpoint', value: data.callbackUrls.stripeWebhook },
            { label: 'OAuth 2.0 Redirect Pattern', value: data.callbackUrls.oauthCallbackPattern },
          ].map((entry) => (
            <div key={entry.label} className="p-3 rounded-lg bg-black/60 border border-white/8 space-y-1.5">
              <p className="font-semibold text-zinc-200">{entry.label}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono text-zinc-400 truncate">{entry.value}</code>
                <button
                  type="button"
                  onClick={() => copyValue(entry.value, entry.label)}
                  className="p-1.5 rounded bg-zinc-900 border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
                  aria-label={`Copy ${entry.label}`}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">
          Note: Core AI model authorization (<code className="text-zinc-300">GEMINI_API_KEY</code>) is managed strictly via server runtime environment secrets and is intentionally excluded from browser forms.
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111114] border border-white/8 rounded-lg w-fit">
        {GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            onClick={() => setGroupFilter(group)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              groupFilter === group ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {group === 'ALL' ? 'All Integrations' : group}
          </button>
        ))}
      </div>

      {/* Encrypted Vault Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          {visibleItems.map((item) => {
            const val = drafts[item.key] ?? '';
            const isShown = Boolean(revealed[item.key]);

            return (
              <div key={item.key} className="p-4 rounded-xl bg-[#111114] border border-white/10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <h4 className="font-display text-sm font-bold text-white truncate">{item.label}</h4>
                    </div>
                    <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
                      {item.key} · {item.group}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap shrink-0">
                    {item.configured ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">
                          {item.source === 'vault' ? 'Encrypted Vault' : 'Server Env'}
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-500">Not Set</span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{item.helpText}</p>

                {item.options ? (
                  <select
                    value={val}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [item.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="">
                      {item.configured ? 'Keep active environment setting' : 'Select M-Pesa environment...'}
                    </option>
                    {item.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={item.secret && !isShown ? 'password' : 'text'}
                        value={val}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [item.key]: e.target.value }))}
                        placeholder={
                          item.configured
                            ? 'Stored securely (enter new value to rotate)'
                            : item.placeholder
                        }
                        className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white focus:outline-none focus:border-red-500 pr-9"
                      />
                      {item.secret && (
                        <button
                          type="button"
                          onClick={() => setRevealed((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
                          aria-label={isShown ? `Hide ${item.key}` : `Show ${item.key}`}
                        >
                          {isShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    {item.source === 'vault' && (
                      <button
                        type="button"
                        onClick={() => handleClearOverride(item.key)}
                        className="p-2 rounded-lg bg-zinc-900 border border-white/10 hover:border-red-500/40 text-zinc-400 hover:text-white cursor-pointer"
                        title="Remove vault value and revert to environment variable"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {item.updatedAt && (
                  <p className="text-[11px] text-zinc-500 font-mono">
                    Last rotated: {new Date(item.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-4 z-10 p-4 rounded-xl bg-[#0A0A0E]/95 backdrop-blur-md border border-white/12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Lock className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              {pendingDraftCount > 0
                ? `${pendingDraftCount} pending credential update(s) ready to encrypt into SQLite.`
                : 'Enter new values above to update or rotate external credentials without redeploying.'}
            </span>
          </div>
          <button
            type="submit"
            disabled={saving || pendingDraftCount === 0}
            className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-45 text-xs font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Encrypting & Saving...' : 'Save Encrypted Credentials'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
