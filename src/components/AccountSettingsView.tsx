import React, { useEffect, useState } from 'react';
import { Laptop, Lock, MailCheck, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { UserProfile } from '../types';

export function AccountSettingsView({
  user,
  canClaimAdmin,
  devVerificationCode,
  onUserUpdated,
  onDeleted,
}: {
  user: UserProfile;
  canClaimAdmin: boolean;
  devVerificationCode?: string | null;
  onUserUpdated: () => void;
  onDeleted: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [verifyCode, setVerifyCode] = useState(devVerificationCode || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // 2FA
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [disable2faPassword, setDisable2faPassword] = useState('');

  // Devices
  const [sessions, setSessions] = useState<any[]>([]);

  // Admin Claim
  const [adminPasscode, setAdminPasscode] = useState('');

  // Delete Account
  const [deletePassword, setDeletePassword] = useState('');

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    const res = await apiRequest<{ sessions: any[] }>('/api/account/sessions');
    setSessions(res.sessions);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    await apiRequest('/api/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName }),
    });
    setNotice('Profile updated.');
    onUserUpdated();
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode }),
      });
      setNotice('Email address verified.');
      onUserUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResendCode = async () => {
    const res = await apiRequest<{ devVerificationCode?: string }>('/api/auth/resend-verification', { method: 'POST' });
    if (res.devVerificationCode) setVerifyCode(res.devVerificationCode);
    setNotice(`Verification code re-issued${res.devVerificationCode ? `: ${res.devVerificationCode}` : ''}`);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/account/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Password changed successfully.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStart2FA = async () => {
    const res = await apiRequest<{ secret: string; otpauthUrl: string }>('/api/account/2fa/setup', { method: 'POST' });
    setTotpSetup(res);
  };

  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/account/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: totpCode }),
      });
      setTotpSetup(null);
      setTotpCode('');
      setNotice('Two-Factor Authentication enabled.');
      onUserUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/account/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disable2faPassword }),
      });
      setDisable2faPassword('');
      setNotice('Two-Factor Authentication disabled.');
      onUserUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRevokeSession = async (id: string) => {
    await apiRequest(`/api/account/sessions/${id}`, { method: 'DELETE' });
    await loadSessions();
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/account/admin-claim', {
        method: 'POST',
        body: JSON.stringify({ passcode: adminPasscode }),
      });
      setNotice('SPOILER-TECH Administrator role granted.');
      onUserUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      onDeleted();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">Account, 2FA &amp; Connected Devices</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your profile, email verification, password, TOTP two-factor security, and active device sessions.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">{error}</div>
      )}
      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">{notice}</div>
      )}

      {/* Email Verification */}
      {!user.emailVerified && (
        <form onSubmit={handleVerifyEmail} className="p-5 rounded-xl bg-amber-950/20 border border-amber-500/35 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <MailCheck className="w-4 h-4" />
            <span>Verify Your Email Address ({user.email})</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              required
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="6-digit code"
              className="px-3 py-2 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-red-600 text-xs font-semibold text-white cursor-pointer">
              Verify Email
            </button>
            <button type="button" onClick={handleResendCode} className="px-3 py-2 rounded-lg bg-zinc-900 text-xs text-zinc-300 cursor-pointer">
              Resend Code
            </button>
          </div>
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Profile */}
        <form onSubmit={handleSaveProfile} className="p-5 rounded-xl bg-[#111114] border border-white/10 space-y-4">
          <h3 className="font-display text-base font-bold text-white">Profile Details</h3>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full px-3.5 py-2 rounded-lg bg-black/50 border border-white/8 text-xs text-zinc-500"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer">
            Update Profile
          </button>
        </form>

        {/* Change Password */}
        <form onSubmit={handleChangePassword} className="p-5 rounded-xl bg-[#111114] border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-red-400" />
            <h3 className="font-display text-base font-bold text-white">Change Password</h3>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/15 hover:border-red-500/40 text-xs font-semibold text-white cursor-pointer">
            Update Password
          </button>
        </form>
      </div>

      {/* Two-Factor Authentication */}
      <div className="p-5 rounded-xl bg-[#111114] border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-red-400" />
            <h3 className="font-display text-base font-bold text-white">Two-Factor Authentication (TOTP)</h3>
          </div>
          <span className={`text-xs font-semibold ${user.twoFactorEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {!user.twoFactorEnabled ? (
          totpSetup ? (
            <form onSubmit={handleConfirm2FA} className="space-y-3 text-xs">
              <p className="text-zinc-300">
                Add this Base32 secret to Google Authenticator, Authy, or 1Password:
              </p>
              <code className="block p-3 rounded-lg bg-black border border-white/12 font-mono text-red-300 select-all">
                {totpSetup.secret}
              </code>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="px-3 py-2 rounded-lg bg-black border border-white/12 font-mono text-white"
                />
                <button type="submit" className="px-4 py-2 rounded-lg bg-red-600 text-xs font-semibold text-white cursor-pointer">
                  Confirm &amp; Enable 2FA
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={handleStart2FA}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
            >
              Configure TOTP 2FA
            </button>
          )
        ) : (
          <form onSubmit={handleDisable2FA} className="flex flex-wrap items-center gap-3">
            <input
              type="password"
              required
              value={disable2faPassword}
              onChange={(e) => setDisable2faPassword(e.target.value)}
              placeholder="Confirm password to disable 2FA"
              className="px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/15 text-xs text-zinc-200 cursor-pointer">
              Disable 2FA
            </button>
          </form>
        )}
      </div>

      {/* Connected Devices */}
      <div className="p-5 rounded-xl bg-[#111114] border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Laptop className="w-4 h-4 text-red-400" />
          <h3 className="font-display text-base font-bold text-white">Connected Devices &amp; Active Sessions</h3>
        </div>
        <div className="divide-y divide-white/8">
          {sessions.map((s) => (
            <div key={s.id} className="py-3 flex items-center justify-between gap-4 text-xs">
              <div>
                <p className="font-semibold text-white">
                  {s.device_name} {s.current && <span className="text-emerald-400 ml-1">(Current Session)</span>}
                </p>
                <p className="text-zinc-500 font-mono">
                  IP: {s.ip_address} · Last active: {s.last_active_at}
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => handleRevokeSession(s.id)}
                  className="px-3 py-1.5 rounded bg-red-950/40 border border-red-500/30 text-red-300 cursor-pointer"
                >
                  Revoke Device
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* First-Run Admin Claim (when no admin exists or passcode set) */}
      {canClaimAdmin && (
        <form onSubmit={handleClaimAdmin} className="p-5 rounded-xl bg-[#111114] border border-red-500/30 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
            <Shield className="w-4 h-4" />
            <span>SPOILER-TECH Operator Admin Bootstrap</span>
          </div>
          <p className="text-xs text-zinc-400">
            Claim administrator governance for this SPOILER AI deployment (or enter your configured ADMIN_PASSCODE).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="password"
              value={adminPasscode}
              onChange={(e) => setAdminPasscode(e.target.value)}
              placeholder="Admin passcode (leave blank for first-run claim)"
              className="px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white min-w-[260px]"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-red-600 text-xs font-semibold text-white cursor-pointer">
              Activate Admin Panel
            </button>
          </div>
        </form>
      )}

      {/* Delete Account */}
      <form onSubmit={handleDeleteAccount} className="p-5 rounded-xl bg-red-950/15 border border-red-500/30 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
          <Trash2 className="w-4 h-4" />
          <span>Delete Account Permanently</span>
        </div>
        <p className="text-xs text-zinc-400">
          Deletes your account, connected social tokens, AI bots, workflows, and conversation history immediately.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="password"
            required
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Confirm password to delete account"
            className="px-3 py-2 rounded-lg bg-black border border-red-500/30 text-xs text-white min-w-[240px]"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-xs font-semibold text-white cursor-pointer">
            Delete Account
          </button>
        </div>
      </form>
    </div>
  );
}
