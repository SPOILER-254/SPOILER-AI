import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Inbox,
  Link2,
  OctagonAlert,
  Power,
  Send,
  Workflow,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { PlatformGlyph } from './PlatformGlyph';

interface DashboardData {
  globalAutomationEnabled: boolean;
  metrics: {
    connectedAccounts: number;
    totalConfiguredAccounts: number;
    activeBots: number;
    totalIncomingMessages: number;
    totalAutomaticReplies: number;
    pendingManualApprovals: number;
    activeWorkflows: number;
    scheduledPosts: number;
  };
  aiUsage: {
    used: number;
    limit: number;
    plan: string;
    status: string;
  };
  connectedAccounts: Array<{
    id: string;
    platform: string;
    account_name: string;
    status: string;
    automation_mode: string;
    last_error: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    target_type: string | null;
    created_at: string;
  }>;
  warnings: Array<{ accountId: string; platform: string; accountName: string; message: string }>;
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
}

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
  refreshSignal: number;
}

export function DashboardView({ onNavigate, refreshSignal }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      const res = await apiRequest<DashboardData>('/api/dashboard');
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [refreshSignal]);

  const handleGlobalToggle = async () => {
    if (!data) return;
    setToggling(true);
    try {
      const res = await apiRequest<{ globalAutomationEnabled: boolean }>('/api/automation/global-switch', {
        method: 'POST',
        body: JSON.stringify({ enabled: !data.globalAutomationEnabled }),
      });
      setData({ ...data, globalAutomationEnabled: res.globalAutomationEnabled });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(false);
    }
  };

  const handleEmergencyStop = async () => {
    setToggling(true);
    try {
      await apiRequest('/api/automation/emergency-stop', { method: 'POST' });
      await loadDashboard();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-[#111114] border border-white/8 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 rounded-xl bg-red-950/30 border border-red-500/30 text-sm text-red-200">
        {error || 'Unable to load dashboard metrics.'}
      </div>
    );
  }

  const usagePct = Math.min(100, Math.round((data.aiUsage.used / Math.max(1, data.aiUsage.limit)) * 100));

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Global Automation & Emergency Shutdown Control Bar */}
      <div className="p-5 rounded-xl bg-[#111114] border border-white/10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-bold text-white">Automation Master Control</h2>
            <span
              className={`text-xs font-medium ${
                data.globalAutomationEnabled ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {data.globalAutomationEnabled ? 'Active · Processing Inbound' : 'Paused · Manual Hold'}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Toggle automated AI replies across all channels or trigger an immediate emergency halt across every bot and workflow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={toggling}
            onClick={handleGlobalToggle}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              data.globalAutomationEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-zinc-900 border-white/15 text-zinc-300 hover:text-white'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{data.globalAutomationEnabled ? 'Global Automation: ON' : 'Global Automation: OFF'}</span>
          </button>

          <button
            type="button"
            disabled={toggling}
            onClick={handleEmergencyStop}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_-4px_rgba(239,68,68,0.5)] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <OctagonAlert className="w-3.5 h-3.5" />
            <span>STOP ALL AUTOMATION</span>
          </button>
        </div>
      </div>

      {/* Warnings & Announcements */}
      {data.warnings.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/25 border border-amber-500/35 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <span>Connection Warnings ({data.warnings.length})</span>
          </div>
          {data.warnings.map((w) => (
            <div key={w.accountId} className="text-xs text-amber-200/90 flex items-center justify-between gap-4">
              <span>
                {w.platform.toUpperCase()} · {w.accountName}: {w.message}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('connections')}
                className="text-xs font-semibold text-white underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Review Connection
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 8-Card Operational KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('connections')}
          className="text-left p-5 rounded-xl bg-[#111114] border border-white/8 hover:border-red-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Connected Accounts</span>
            <Link2 className="w-4 h-4 text-red-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
            {data.metrics.connectedAccounts}
          </p>
          <p className="mt-1 text-xs text-zinc-500 tabular-nums">
            {data.metrics.totalConfiguredAccounts} configured total
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('bots')}
          className="text-left p-5 rounded-xl bg-[#111114] border border-white/8 hover:border-red-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Active AI Bots</span>
            <Bot className="w-4 h-4 text-red-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
            {data.metrics.activeBots}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Multilingual English · Swahili · Sheng</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('inbox')}
          className="text-left p-5 rounded-xl bg-[#111114] border border-white/8 hover:border-red-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Incoming Messages</span>
            <Inbox className="w-4 h-4 text-red-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
            {data.metrics.totalIncomingMessages}
          </p>
          <p className="mt-1 text-xs text-zinc-500 tabular-nums">
            {data.metrics.totalAutomaticReplies} automatic AI replies sent
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('inbox')}
          className="text-left p-5 rounded-xl bg-[#111114] border border-white/8 hover:border-red-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Pending Manual Approvals</span>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
            {data.metrics.pendingManualApprovals}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Queued for operator edit or approval</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('workflows')}
          className="text-left p-5 rounded-xl bg-[#111114] border border-white/8 hover:border-red-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Active Workflows</span>
            <Workflow className="w-4 h-4 text-red-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
            {data.metrics.activeWorkflows}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Trigger to AI Action pipelines</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('workflows')}
          className="text-left p-5 rounded-xl bg-[#111114] border border-white/8 hover:border-red-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Scheduled Posts</span>
            <CalendarClock className="w-4 h-4 text-red-400" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
            {data.metrics.scheduledPosts}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Queued cross-channel publishing</p>
        </button>

        <div className="sm:col-span-2 p-5 rounded-xl bg-[#111114] border border-white/8 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-zinc-400">AI Usage &amp; Subscription</span>
              <p className="mt-1 font-display text-xl font-bold text-white">
                {data.aiUsage.plan} Plan · {data.aiUsage.status}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('billing')}
              className="px-3 py-1.5 rounded-lg bg-red-600/15 border border-red-500/35 text-xs font-semibold text-red-300 hover:bg-red-600/25 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Manage Plan
            </button>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5 tabular-nums">
              <span>{data.aiUsage.used} / {data.aiUsage.limit} AI operations</span>
              <span>{usagePct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-red-600 transition-all"
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Connected Channels + Recent Activity + Announcements */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 rounded-xl bg-[#111114] border border-white/8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-semibold text-white">Connected Channels</h3>
            <button
              type="button"
              onClick={() => onNavigate('connections')}
              className="text-xs font-semibold text-red-400 hover:text-red-300 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Connection Center
            </button>
          </div>

          {data.connectedAccounts.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-white/10 rounded-lg">
              <p className="text-sm text-zinc-300 font-medium">No social accounts connected yet</p>
              <p className="mt-1 text-xs text-zinc-500">
                Connect WhatsApp Business Cloud API, Telegram Bot API, Discord, Slack, or OAuth channels.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('connections')}
                className="mt-4 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
              >
                Connect First Channel
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/6">
              {data.connectedAccounts.map((acc) => (
                <div key={acc.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <PlatformGlyph platform={acc.platform} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{acc.account_name}</p>
                      <p className="text-xs text-zinc-500">
                        {acc.platform.toUpperCase()} · {acc.automation_mode}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                      acc.status === 'CONNECTED' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {acc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="p-5 rounded-xl bg-[#111114] border border-white/8">
            <h3 className="font-display text-base font-semibold text-white mb-4">Recent Activity</h3>
            {data.recentActivity.length === 0 ? (
              <p className="text-xs text-zinc-500">No workspace events logged yet.</p>
            ) : (
              <div className="space-y-3">
                {data.recentActivity.map((act) => (
                  <div key={act.id} className="flex items-center justify-between gap-3 text-xs border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                    <span className="text-zinc-300 font-medium truncate">{act.action.replace(/_/g, ' ')}</span>
                    <span className="text-zinc-500 font-mono whitespace-nowrap shrink-0">
                      {new Date(act.created_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.announcements.length > 0 && (
            <div className="p-5 rounded-xl bg-[#111114] border border-white/8">
              <div className="flex items-center gap-2 mb-3">
                <Send className="w-4 h-4 text-red-400" />
                <h3 className="font-display text-base font-semibold text-white">SPOILER-TECH Briefings</h3>
              </div>
              <div className="space-y-3">
                {data.announcements.slice(0, 2).map((ann) => (
                  <div key={ann.id}>
                    <p className="text-xs font-semibold text-white">{ann.title}</p>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{ann.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
