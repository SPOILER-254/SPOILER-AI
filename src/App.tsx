import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  BookOpen,
  Bot,
  CreditCard,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  ScanEye,
  Settings,
  Shield,
  Workflow,
  X,
} from 'lucide-react';
import { apiRequest, getAuthToken, setAuthToken } from './lib/api';
import { UserProfile } from './types';
import { AuthScreen } from './components/AuthScreen';
import { DashboardView } from './components/DashboardView';
import { ConnectionsView } from './components/ConnectionsView';
import { InboxView } from './components/InboxView';
import { BotStudioView } from './components/BotStudioView';
import { ReplyImgView } from './components/ReplyImgView';
import { WorkflowsView } from './components/WorkflowsView';
import { BillingView } from './components/BillingView';
import { AccountSettingsView } from './components/AccountSettingsView';
import { AdminView } from './components/AdminView';
import { CredentialsView } from './components/CredentialsView';
import { DocsModal } from './components/DocsModal';

type NavTab =
  | 'dashboard'
  | 'connections'
  | 'inbox'
  | 'bots'
  | 'replyimg'
  | 'workflows'
  | 'billing'
  | 'account'
  | 'admin'
  | 'credentials';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [canClaimAdmin, setCanClaimAdmin] = useState(false);
  const [devVerificationCode, setDevVerificationCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  const [wsConnected, setWsConnected] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [notifications, setNotifications] = useState<Array<{ id: string; type: string; title: string; body: string; read: number; created_at: string }>>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const triggerRefresh = () => setRefreshSignal((n) => n + 1);

  const fetchNotifications = async () => {
    try {
      const res = await apiRequest<{ notifications: Array<{ id: string; type: string; title: string; body: string; read: number; created_at: string }> }>('/api/notifications');
      setNotifications(res.notifications || []);
    } catch {
      // ignore if signed out
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch {
      // ignore
    }
  };

  const fetchMe = async () => {
    try {
      const res = await apiRequest<{ user: UserProfile; canClaimAdmin: boolean }>('/api/auth/me');
      setUser(res.user);
      setCanClaimAdmin(res.canClaimAdmin);
      await fetchNotifications();
    } catch {
      setUser(null);
      setAuthToken(null);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [refreshSignal, user?.id]);

  // Real-time WebSocket connection authenticated by session token
  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connectWs = () => {
      const token = getAuthToken();
      if (!token || cancelled) return;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };
      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type) {
            triggerRefresh();
          }
        } catch {
          // ignore malformed payload
        }
      };
      socket.onclose = () => {
        if (!cancelled) {
          setWsConnected(false);
          reconnectTimer = window.setTimeout(connectWs, 3500);
        }
      };
    };

    connectWs();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [user?.id]);

  const handleAuthenticated = async (loggedInUser: UserProfile, devCode?: string) => {
    setUser(loggedInUser);
    if (devCode) setDevVerificationCode(devCode);
    await fetchMe();
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network errors during logout
    }
    setAuthToken(null);
    setUser(null);
    setActiveTab('dashboard');
  };

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'connections', label: 'Connect Accounts', icon: Link2 },
    { id: 'inbox', label: 'Universal Inbox', icon: Inbox },
    { id: 'bots', label: 'AI Bot Studio', icon: Bot },
    { id: 'replyimg', label: 'ReplyImg Vision', icon: ScanEye },
    { id: 'workflows', label: 'Workflows & Posts', icon: Workflow },
    { id: 'billing', label: 'Subscriptions', icon: CreditCard },
    { id: 'account', label: 'Account & 2FA', icon: Settings },
  ];

  if (user.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin Console', icon: Shield });
    navItems.push({ id: 'credentials', label: 'API Credentials', icon: KeyRound });
  }

  const selectTab = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#060608] text-[#F4F4F6] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0A0A0E] border-r border-white/8 z-30">
        <div className="p-5 flex items-center gap-3 border-b border-white/8">
          <img
            src="/src/assets/images/spoiler_ai_logo_1795477724448.jpg"
            alt="SPOILER AI"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-lg object-cover border border-red-500/40"
          />
          <div className="min-w-0">
            <span className="font-display text-base font-bold tracking-tight text-white block whitespace-nowrap">
              SPOILER AI
            </span>
            <span className="text-[11px] text-zinc-500 block truncate">POWERED BY SPOILER-TECH</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-3 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-red-600 text-white shadow-[0_0_20px_-4px_rgba(239,68,68,0.45)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/8 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="truncate">{user.email}</span>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${wsConnected ? 'bg-emerald-500' : 'bg-zinc-600'}`}
              title={wsConnected ? 'Real-time WebSocket connected' : 'WebSocket reconnecting'}
            />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-3 rounded-lg bg-zinc-900 border border-white/10 hover:border-red-500/40 text-xs font-medium text-zinc-300 hover:text-white flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-black/80 backdrop-blur-sm flex">
          <div className="w-72 bg-[#0A0A0E] border-r border-white/10 h-full flex flex-col p-4">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <img
                  src="/src/assets/images/spoiler_ai_logo_1795477724448.jpg"
                  alt="SPOILER AI"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover border border-red-500/40"
                />
                <span className="font-display text-base font-bold text-white">SPOILER AI</span>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1.5 text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`w-full px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 ${
                      active ? 'bg-red-600 text-white' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={handleLogout}
              className="py-2.5 px-4 rounded-lg bg-zinc-900 border border-white/10 text-xs font-semibold text-white flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Bar (3-zone contract) */}
        <header className="sticky top-0 z-20 bg-[#060608]/90 backdrop-blur-md border-b border-white/8 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-[#111114] border border-white/10 text-zinc-200"
              aria-label="Open Navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="font-display text-sm sm:text-base font-semibold text-white truncate">
              {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400">
            <span>{wsConnected ? 'Live Inbox Sync Active' : 'Sync Reconnecting'}</span>
            <span aria-hidden="true">·</span>
            <span>{user.fullName}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              type="button"
              onClick={() => setShowNotifs((v) => !v)}
              className="relative p-2 rounded-lg bg-[#111114] border border-white/10 hover:border-red-500/40 text-zinc-200 hover:text-white cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notifications.some((n) => !n.read) && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowDocs(true)}
              className="px-3.5 py-2 rounded-lg bg-[#111114] border border-white/10 hover:border-red-500/40 text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-red-400" />
              <span>API &amp; Setup Docs</span>
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 rounded-xl bg-[#111114] border border-white/12 shadow-2xl p-4 z-40 space-y-3">
                <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
                  <span className="font-display text-xs font-bold text-white uppercase tracking-wider">Alerts &amp; Notifications</span>
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-[11px] text-red-400 hover:text-red-300 font-medium cursor-pointer"
                  >
                    Mark all read
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">No alerts right now.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-lg border text-xs ${
                          n.read ? 'bg-black/40 border-white/6 text-zinc-400' : 'bg-red-950/25 border-red-500/30 text-zinc-100'
                        }`}
                      >
                        <p className="font-semibold text-white">{n.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed">{n.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Active View Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'dashboard' && (
                <DashboardView onNavigate={(t) => selectTab(t as NavTab)} refreshSignal={refreshSignal} />
              )}
              {activeTab === 'connections' && <ConnectionsView onUpdated={triggerRefresh} />}
              {activeTab === 'inbox' && <InboxView refreshSignal={refreshSignal} />}
              {activeTab === 'bots' && <BotStudioView onUpdated={triggerRefresh} />}
              {activeTab === 'replyimg' && <ReplyImgView onUpdated={triggerRefresh} />}
              {activeTab === 'workflows' && <WorkflowsView onUpdated={triggerRefresh} />}
              {activeTab === 'billing' && <BillingView onUpdated={triggerRefresh} />}
              {activeTab === 'account' && (
                <AccountSettingsView
                  user={user}
                  canClaimAdmin={canClaimAdmin}
                  devVerificationCode={devVerificationCode}
                  onUserUpdated={fetchMe}
                  onDeleted={handleLogout}
                />
              )}
              {activeTab === 'admin' && <AdminView onOpenCredentials={() => selectTab('credentials')} />}
              {activeTab === 'credentials' && <CredentialsView />}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="px-8 py-4 border-t border-white/6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <span>SPOILER AI · ONE AI. ALL YOUR SOCIALS. TOTAL CONTROL.</span>
          <span>POWERED BY SPOILER-TECH</span>
        </footer>
      </div>

      {showDocs && <DocsModal onClose={() => setShowDocs(false)} />}
    </div>
  );
}
