import React, { useState } from 'react';
import { ArrowRight, KeyRound, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';
import { UserProfile } from '../types';

interface AuthScreenProps {
  onAuthenticated: (user: UserProfile, devVerificationCode?: string) => void;
}

type AuthMode = 'login' | 'register' | 'reset';

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);

  // Reset password flow
  const [resetRequested, setResetRequested] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devResetHint, setDevResetHint] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await apiRequest<{ token: string; user: UserProfile; devVerificationCode?: string }>(
          '/api/auth/register',
          {
            method: 'POST',
            body: JSON.stringify({ email, password, fullName }),
          }
        );
        setAuthToken(res.token);
        onAuthenticated(res.user, res.devVerificationCode);
      } else if (mode === 'login') {
        const res = await apiRequest<{ token?: string; user?: UserProfile; requires2FA?: boolean }>(
          '/api/auth/login',
          {
            method: 'POST',
            body: JSON.stringify({ email, password, totpCode: needs2FA ? totpCode : undefined }),
          }
        );
        if (res.requires2FA) {
          setNeeds2FA(true);
          setLoading(false);
          return;
        }
        if (res.token && res.user) {
          setAuthToken(res.token);
          onAuthenticated(res.user);
        }
      } else if (mode === 'reset') {
        if (!resetRequested) {
          const res = await apiRequest<{ ok: boolean; devResetCode?: string; message: string }>(
            '/api/auth/request-reset',
            {
              method: 'POST',
              body: JSON.stringify({ email }),
            }
          );
          setResetRequested(true);
          setDevResetHint(res.devResetCode || null);
          setNotice(res.message);
        } else {
          await apiRequest('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email, code: resetCode, newPassword }),
          });
          setNotice('Password updated. Sign in with your new password.');
          setMode('login');
          setResetRequested(false);
          setDevResetHint(null);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060608] text-[#F4F4F6] flex flex-col justify-between">
      <div className="flex-1 grid lg:grid-cols-12 items-stretch">
        {/* Left Brand & Value Architecture */}
        <div className="lg:col-span-7 p-8 sm:p-12 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/8 bg-[#09090D]">
          <div className="flex items-center gap-4">
            <img
              src="/src/assets/images/spoiler_ai_logo_1795477724448.jpg"
              alt="SPOILER AI Emblem"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover border border-red-500/40 shadow-[0_0_24px_-4px_rgba(239,68,68,0.45)]"
            />
            <div>
              <span className="font-display text-xl font-bold tracking-tight text-white">SPOILER AI</span>
              <p className="text-xs text-zinc-400">Powered by SPOILER-TECH</p>
            </div>
          </div>

          <div className="my-12 max-w-2xl">
            <p className="text-xs font-medium tracking-wider text-red-400 mb-4">
              Multi-Platform Social Automation Command
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1] [text-wrap:balance]">
              One AI. All Your Socials. Total Control.
            </h1>
            <p className="mt-5 text-base text-zinc-400 leading-relaxed max-w-xl">
              Connect WhatsApp Business Cloud API, Telegram Bot API, Discord, Slack, and social channels into one unified inbox with multimodal ReplyImg vision, Swahili &amp; Sheng intelligence, and strict human-in-the-loop controls.
            </p>

            <div className="mt-10 grid sm:grid-cols-3 gap-6 pt-8 border-t border-white/8">
              <div>
                <p className="font-display text-lg font-semibold text-white tabular-nums">16 Channels</p>
                <p className="mt-1 text-xs text-zinc-400">Official webhooks, bot tokens &amp; OAuth2 scopes</p>
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-white tabular-nums">ReplyImg Vision</p>
                <p className="mt-1 text-xs text-zinc-400">OCR, object &amp; screenshot analysis on inbound media</p>
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-white tabular-nums">Manual &amp; Auto</p>
                <p className="mt-1 text-xs text-zinc-400">Instant human approval queue &amp; emergency kill switch</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>AES-256-GCM Token Encryption</span>
            <span aria-hidden="true">·</span>
            <span>TOTP 2FA Security</span>
            <span aria-hidden="true">·</span>
            <span>M-Pesa &amp; Card Billing Ready</span>
          </div>
        </div>

        {/* Right Interactive Auth Panel */}
        <div className="lg:col-span-5 p-8 sm:p-12 flex items-center justify-center bg-[#060608]">
          <div className="w-full max-w-md">
            <div className="flex items-center gap-1 p-1 bg-[#111114] border border-white/8 rounded-lg mb-8">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setNeeds2FA(false);
                }}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'login' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setNeeds2FA(false);
                }}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'register' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setError(null);
                  setResetRequested(false);
                }}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'reset' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Reset Password
              </button>
            </div>

            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold text-white">
                {mode === 'login' && (needs2FA ? 'Two-Factor Verification' : 'Access Your Workspace')}
                {mode === 'register' && 'Register SPOILER AI Account'}
                {mode === 'reset' && 'Recover Account Access'}
              </h2>
              <p className="mt-1.5 text-sm text-zinc-400">
                {mode === 'login' && 'Every account maintains isolated bots, encrypted tokens, and private inbox threads.'}
                {mode === 'register' && 'Start on the Free plan with 1 AI bot and 2 connected channels.'}
                {mode === 'reset' && 'Request a one-time recovery code to reset your password.'}
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-200">
                {error}
              </div>
            )}
            {notice && (
              <div className="mb-5 p-3.5 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200">
                {notice}
                {devResetHint && (
                  <p className="mt-1.5 font-mono text-white">Verification code: {devResetHint}</p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alex Kariuki"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#111114] border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@company.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#111114] border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {(mode === 'login' || mode === 'register') && !needs2FA && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#111114] border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              )}

              {mode === 'login' && needs2FA && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">6-Digit Authenticator Code</label>
                  <div className="relative">
                    <ShieldCheck className="w-4 h-4 text-red-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="000000"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#111114] border border-red-500/40 rounded-lg font-mono text-sm tracking-widest text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              )}

              {mode === 'reset' && resetRequested && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Reset Code</label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder="6-digit reset code"
                        className="w-full pl-10 pr-4 py-2.5 bg-[#111114] border border-white/10 rounded-lg font-mono text-sm text-white focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">New Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="w-full pl-10 pr-4 py-2.5 bg-[#111114] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-[0_0_24px_-4px_rgba(239,68,68,0.45)] flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>
                  {loading
                    ? 'Processing...'
                    : mode === 'register'
                      ? 'Create SPOILER AI Account'
                      : mode === 'reset'
                        ? resetRequested
                          ? 'Set New Password'
                          : 'Request Reset Code'
                        : needs2FA
                          ? 'Verify & Sign In'
                          : 'Sign In to Dashboard'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
