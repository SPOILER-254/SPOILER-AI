import React, { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, Megaphone, Server, ShieldAlert, Users } from 'lucide-react';
import { apiRequest } from '../lib/api';

export function AdminView({ onOpenCredentials }: { onOpenCredentials?: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [textModel, setTextModel] = useState('gemini-4-hydrogen');

  const loadAdmin = async () => {
    try {
      const res = await apiRequest('/api/admin/overview');
      setData(res);
      if (res.settings?.ai_model_config?.textModel) {
        setTextModel(res.settings.ai_model_config.textModel);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmin();
  }, []);

  const handleUpdateUser = async (userId: string, patch: Record<string, unknown>) => {
    await apiRequest(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setNotice('User account updated.');
    await loadAdmin();
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    await apiRequest('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        aiModelConfig: { textModel, visionModel: textModel, maxContextMessages: 12 },
        announcement: { title: annTitle, body: annBody },
      }),
    });
    setAnnTitle('');
    setAnnBody('');
    setNotice('Platform announcement published & model config saved.');
    await loadAdmin();
  };

  if (loading) {
    return <div className="h-64 rounded-xl bg-[#111114] border border-white/8 animate-pulse" />;
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl bg-red-950/35 border border-red-500/40 text-xs text-red-200">
        {error || 'Administrator privileges required.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">SPOILER-TECH Administrator Console</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Tenant governance, subscription oversight, system health, audit logs, and announcements. Private user conversation content is strictly isolated and never readable from this panel.
          </p>
        </div>
        {onOpenCredentials && (
          <button
            type="button"
            onClick={onOpenCredentials}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Open API Credentials Vault</span>
          </button>
        )}
      </div>

      {(!data.systemHealth.persistentEncryptionConfigured || !data.systemHealth.persistentSessionSecretConfigured) && (
        <div className="p-4 rounded-xl bg-amber-950/35 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Production security notice: configure persistent <code className="text-white font-mono">SESSION_SECRET</code> and{' '}
            <code className="text-white font-mono">TOKEN_ENCRYPTION_KEY</code> in your hosting environment so sessions and encrypted tokens persist across server restarts.
          </span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">{notice}</div>
      )}

      {/* System Health & Revenue */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#111114] border border-white/10">
          <p className="text-xs text-zinc-400">Registered Accounts</p>
          <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">{data.users.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-[#111114] border border-white/10">
          <p className="text-xs text-zinc-400">Confirmed Revenue</p>
          <p className="mt-2 font-display text-xl font-bold text-white tabular-nums">
            {data.revenue.length === 0
              ? 'KES 0 / $0'
              : data.revenue.map((r: any) => `${r.currency} ${r.total}`).join(' · ')}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#111114] border border-white/10">
          <p className="text-xs text-zinc-400">Runtime &amp; Storage ({data.systemHealth.nodeEnv})</p>
          <p className="mt-2 font-mono text-xs font-semibold text-white tabular-nums">
            RSS {data.systemHealth.memoryMb}MB · DB {data.systemHealth.dbSizeKb}KB
          </p>
          <p className="mt-1 text-[11px] font-mono text-zinc-500 truncate">{data.systemHealth.dataDir}</p>
        </div>
        <div className="p-4 rounded-xl bg-[#111114] border border-white/10">
          <p className="text-xs text-zinc-400">Gateway Readiness</p>
          <p className="mt-2 text-xs text-zinc-200">
            AI: {data.systemHealth.geminiConfigured ? 'Ready' : 'Unset'} · M-Pesa: {data.systemHealth.mpesaConfigured ? 'Ready' : 'Unset'}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Stripe: {data.systemHealth.stripeConfigured ? 'Ready' : 'Unset'} · Email: {data.systemHealth.resendConfigured ? 'Ready' : 'Unset'}
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="p-5 rounded-xl bg-[#111114] border border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-red-400" />
          <h3 className="font-display text-base font-bold text-white">Registered Users &amp; Subscriptions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500 border-b border-white/8">
              <tr>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4 text-right">AI Usage</th>
                <th className="py-2 pr-4 text-right">Channels / Bots</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {data.users.map((u: any) => (
                <tr key={u.id} className="text-zinc-200">
                  <td className="py-2.5 pr-4">
                    <p className="font-semibold text-white">{u.full_name}</p>
                    <p className="text-zinc-500">{u.email}</p>
                  </td>
                  <td className="py-2.5 pr-4 uppercase">{u.role}</td>
                  <td className="py-2.5 pr-4">
                    <select
                      value={u.plan || 'FREE'}
                      onChange={(e) => handleUpdateUser(u.id, { plan: e.target.value })}
                      className="px-2 py-1 rounded bg-black border border-white/12 text-xs text-white"
                    >
                      <option value="FREE">FREE</option>
                      <option value="PRO">PRO</option>
                      <option value="BUSINESS">BUSINESS</option>
                    </select>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {u.ai_usage_count || 0} / {u.ai_quota_limit || 250}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                    {u.connected_accounts} / {u.bot_count}
                  </td>
                  <td className="py-2.5">
                    <button
                      type="button"
                      onClick={() => handleUpdateUser(u.id, { suspended: !u.suspended })}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        u.suspended
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-red-950/40 text-red-300 border border-red-500/30'
                      }`}
                    >
                      {u.suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Announcements & Audit Logs */}
      <div className="grid lg:grid-cols-12 gap-6">
        <form onSubmit={handlePublishAnnouncement} className="lg:col-span-5 p-5 rounded-xl bg-[#111114] border border-white/10 space-y-3.5">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-red-400" />
            <h3 className="font-display text-base font-bold text-white">Model Config &amp; Announcements</h3>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Active AI Model</label>
            <select
              value={textModel}
              onChange={(e) => setTextModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
            >
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (Primary Fast Multimodal)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (High-Speed Lite)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Announcement Title</label>
            <input
              type="text"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Platform maintenance or release note"
              className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Announcement Body</label>
            <textarea
              rows={2}
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer">
            Publish Announcement
          </button>
        </form>

        <div className="lg:col-span-7 p-5 rounded-xl bg-[#111114] border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <h3 className="font-display text-base font-bold text-white">Security &amp; System Audit Logs</h3>
            </div>
            <Server className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.auditLogs.map((log: any) => (
              <div key={log.id} className="py-1.5 border-b border-white/6 flex items-center justify-between text-xs">
                <span className="text-zinc-200 font-medium">{log.action}</span>
                <span className="font-mono text-zinc-500">
                  {log.ip_address || '-'} · {log.created_at}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
