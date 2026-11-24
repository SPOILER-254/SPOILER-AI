import React, { useEffect, useState } from 'react';
import {
  Check,
  FileText,
  Languages,
  MessageSquarePlus,
  Search,
  Send,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { apiRequest, getAuthToken } from '../lib/api';
import { ApprovalItem, ConversationItem, MessageItem } from '../types';
import { PlatformGlyph } from './PlatformGlyph';

function AuthImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const token = getAuthToken();
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (active && blob) {
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!src) {
    return <div className="w-48 h-32 rounded-lg bg-zinc-900 border border-white/10 animate-pulse" />;
  }
  return <img src={src} alt={alt} referrerPolicy="no-referrer" className="max-w-xs rounded-lg border border-white/10 mt-2" />;
}

export function InboxView({ refreshSignal }: { refreshSignal: number }) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [allPendingApprovals, setAllPendingApprovals] = useState<ApprovalItem[]>([]);
  const [editedApprovals, setEditedApprovals] = useState<Record<string, string>>({});

  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [translatedMap, setTranslatedMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Inbound message test modal
  const [showTestModal, setShowTestModal] = useState(false);
  const [testPlatform, setTestPlatform] = useState('whatsapp');
  const [testSender, setTestSender] = useState('Amina Hassan');
  const [testBody, setTestBody] = useState('Habari! Bei ya Pro plan ni ngapi na mnakubali M-Pesa?');
  const [testingInbound, setTestingInbound] = useState(false);

  const loadConversations = async () => {
    try {
      const qs = new URLSearchParams();
      if (platformFilter !== 'ALL') qs.set('platform', platformFilter);
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      if (search.trim()) qs.set('search', search.trim());

      const [convRes, aprRes] = await Promise.all([
        apiRequest<{ conversations: ConversationItem[] }>(`/api/inbox/conversations?${qs.toString()}`),
        apiRequest<{ approvals: ApprovalItem[] }>('/api/approvals'),
      ]);
      setConversations(convRes.conversations);
      setAllPendingApprovals(aprRes.approvals);
      if (!selectedId && convRes.conversations.length > 0) {
        setSelectedId(convRes.conversations[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadThread = async (convId: string) => {
    try {
      const res = await apiRequest<{
        conversation: ConversationItem;
        messages: MessageItem[];
        pendingApprovals: ApprovalItem[];
      }>(`/api/inbox/conversations/${convId}/messages`);
      setMessages(res.messages);
      setApprovals(res.pendingApprovals);
      setSummaryText(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [platformFilter, statusFilter, refreshSignal]);

  useEffect(() => {
    if (selectedId) {
      loadThread(selectedId);
    }
  }, [selectedId, refreshSignal]);

  const activeConv = conversations.find((c) => c.id === selectedId) || null;

  const handleSendManualReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      await apiRequest(`/api/inbox/conversations/${selectedId}/send`, {
        method: 'POST',
        body: JSON.stringify({ content: replyText }),
      });
      setReplyText('');
      await Promise.all([loadThread(selectedId), loadConversations()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleApprovalDecision = async (apr: ApprovalItem, decision: 'APPROVE' | 'REJECT') => {
    setError(null);
    try {
      await apiRequest(`/api/approvals/${apr.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          editedReply: editedApprovals[apr.id] ?? apr.suggested_reply,
        }),
      });
      await loadConversations();
      if (selectedId) await loadThread(selectedId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSummarize = async () => {
    if (!selectedId) return;
    try {
      const res = await apiRequest<{ summary: string }>('/api/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ conversationId: selectedId }),
      });
      setSummaryText(res.summary);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTranslate = async (msg: MessageItem) => {
    try {
      const res = await apiRequest<{ result: string }>('/api/ai/translate', {
        method: 'POST',
        body: JSON.stringify({ text: msg.content, targetLanguage: 'English' }),
      });
      setTranslatedMap((prev) => ({ ...prev, [msg.id]: res.result }));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleConvPatch = async (patch: Record<string, unknown>) => {
    if (!selectedId) return;
    await apiRequest(`/api/inbox/conversations/${selectedId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await loadConversations();
  };

  const handleTestInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingInbound(true);
    setError(null);
    try {
      const res = await apiRequest<{ conversationId: string }>('/api/ai/reply-test', {
        method: 'POST',
        body: JSON.stringify({
          platform: testPlatform,
          senderName: testSender,
          message: testBody,
          pushToInbox: true,
        }),
      });
      setShowTestModal(false);
      await loadConversations();
      setSelectedId(res.conversationId);
      await loadThread(res.conversationId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestingInbound(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Action & Approval Queue Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Universal Inbox</h2>
          <p className="text-xs text-zinc-400">
            Real-time omnichannel messages, AI reply approvals, language translation, and human handover.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTestModal(true)}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>Run Live Inbound Message</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">{error}</div>
      )}

      {/* Pending Manual Approvals Strip */}
      {allPendingApprovals.length > 0 && (
        <div className="p-4 rounded-xl bg-[#111114] border border-amber-500/35 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300">
              Pending Manual Approvals ({allPendingApprovals.length})
            </span>
            <span className="text-[11px] text-zinc-400">Edit AI draft, approve to dispatch, or reject</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {allPendingApprovals.slice(0, 4).map((apr) => (
              <div key={apr.id} className="p-3 rounded-lg bg-black/60 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">
                    {apr.display_name} · {apr.platform.toUpperCase()}
                  </span>
                  <span className="text-zinc-500">{apr.bot_name || 'AI Bot'}</span>
                </div>
                <p className="text-xs text-zinc-400 truncate">Inbound: &ldquo;{apr.incoming_message}&rdquo;</p>
                <textarea
                  rows={2}
                  value={editedApprovals[apr.id] ?? apr.suggested_reply}
                  onChange={(e) => setEditedApprovals((p) => ({ ...p, [apr.id]: e.target.value }))}
                  className="w-full p-2 rounded bg-[#111114] border border-white/10 text-xs text-white focus:outline-none focus:border-red-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprovalDecision(apr, 'APPROVE')}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve &amp; Send</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprovalDecision(apr, 'REJECT')}
                    className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Split-Pane Inbox */}
      <div className="grid lg:grid-cols-12 rounded-xl bg-[#111114] border border-white/10 overflow-hidden min-h-[580px]">
        {/* Left Conversation List */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col">
          <div className="p-3.5 border-b border-white/8 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadConversations()}
                placeholder="Search contacts or handles..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-black border border-white/10 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Platforms</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="instagram">Instagram</option>
                <option value="messenger">Messenger</option>
                <option value="discord">Discord</option>
                <option value="slack">Slack</option>
                <option value="gmail">Gmail</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Status</option>
                <option value="OPEN">Open</option>
                <option value="HANDOVER">Human Handover</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/6">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No conversations yet. Connect WhatsApp or Telegram, or run an inbound test message to populate your inbox.
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                    selectedId === conv.id ? 'bg-red-600/12' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <PlatformGlyph platform={conv.platform} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">{conv.display_name}</span>
                      {conv.unread_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-red-600 text-[10px] font-bold text-white tabular-nums">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400 truncate">{conv.last_message || 'No messages'}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {conv.platform.toUpperCase()} · {conv.status} · {conv.automation_mode}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Conversation Thread */}
        <div className="lg:col-span-8 flex flex-col">
          {!activeConv ? (
            <div className="flex-1 flex items-center justify-center p-10 text-center">
              <div>
                <p className="font-display text-lg font-semibold text-white">Select a Conversation</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Choose a thread from the left or run a live inbound message to test AI reply automation.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-[#0D0D10]">
                <div className="flex items-center gap-3">
                  <PlatformGlyph platform={activeConv.platform} size="sm" />
                  <div>
                    <p className="text-sm font-bold text-white">{activeConv.display_name}</p>
                    <p className="text-xs text-zinc-400">
                      {activeConv.platform.toUpperCase()} · {activeConv.handle || activeConv.phone || activeConv.contact_external_id}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSummarize}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs font-medium text-zinc-200 hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-red-400" />
                    <span>AI Summary</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleConvPatch({
                        automationMode: activeConv.automation_mode === 'AUTOMATIC' ? 'MANUAL' : 'AUTOMATIC',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs font-medium text-zinc-200 hover:border-red-500/40 cursor-pointer"
                  >
                    Mode: {activeConv.automation_mode}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleConvPatch({
                        status: activeConv.status === 'HANDOVER' ? 'RESOLVED' : 'HANDOVER',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/35 text-xs font-medium text-amber-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{activeConv.status === 'HANDOVER' ? 'Mark Resolved' : 'Human Handover'}</span>
                  </button>
                </div>
              </div>

              {summaryText && (
                <div className="p-3.5 bg-red-950/20 border-b border-red-500/25 text-xs text-zinc-200 whitespace-pre-line">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-red-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Conversation Summary
                    </span>
                    <button type="button" onClick={() => setSummaryText(null)} className="text-zinc-400 hover:text-white cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {summaryText}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[400px]">
                {messages.map((m) => {
                  const isOutbound = m.direction === 'OUTBOUND';
                  return (
                    <div key={m.id} className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[82%] p-3.5 rounded-xl text-xs leading-relaxed ${
                          isOutbound
                            ? 'bg-red-600/20 border border-red-500/35 text-white'
                            : 'bg-[#18181D] border border-white/10 text-zinc-100'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        {m.mediaUrl && <AuthImage url={m.mediaUrl} alt="Inbound media attachment" />}
                        {translatedMap[m.id] && (
                          <div className="mt-2 pt-2 border-t border-white/10 text-[11px] text-zinc-300">
                            Translation: {translatedMap[m.id]}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                        <span>{m.sender_type}</span>
                        {m.detected_language && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{m.detected_language}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{m.delivery_status}</span>
                        {!isOutbound && (
                          <button
                            type="button"
                            onClick={() => handleTranslate(m)}
                            className="text-red-400 hover:text-red-300 inline-flex items-center gap-1 ml-1 cursor-pointer"
                          >
                            <Languages className="w-3 h-3" />
                            <span>Translate</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {approvals.map((apr) => (
                  <div key={apr.id} className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/35 space-y-2">
                    <p className="text-xs font-semibold text-amber-300">AI Suggested Reply (Awaiting Approval)</p>
                    <textarea
                      rows={2}
                      value={editedApprovals[apr.id] ?? apr.suggested_reply}
                      onChange={(e) => setEditedApprovals((p) => ({ ...p, [apr.id]: e.target.value }))}
                      className="w-full p-2.5 rounded-lg bg-black border border-white/10 text-xs text-white"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprovalDecision(apr, 'APPROVE')}
                        className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                      >
                        Approve &amp; Send
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprovalDecision(apr, 'REJECT')}
                        className="px-3 py-1.5 rounded bg-zinc-800 text-xs text-zinc-300 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Manual Reply Composer */}
              <form onSubmit={handleSendManualReply} className="p-3.5 border-t border-white/10 bg-[#0D0D10] flex items-center gap-2.5">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a manual human reply..."
                  className="flex-1 px-3.5 py-2.5 rounded-lg bg-black border border-white/10 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500"
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sending ? 'Sending...' : 'Send Reply'}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Live Inbound Message Runner Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#111114] border border-white/12 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-white">Test Inbound Pipeline</h3>
              <button type="button" onClick={() => setShowTestModal(false)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleTestInbound} className="space-y-3.5">
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Channel</label>
                <select
                  value={testPlatform}
                  onChange={(e) => setTestPlatform(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="instagram">Instagram</option>
                  <option value="messenger">Facebook Messenger</option>
                  <option value="discord">Discord</option>
                  <option value="slack">Slack</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Sender Name</label>
                <input
                  type="text"
                  required
                  value={testSender}
                  onChange={(e) => setTestSender(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Message (English, Swahili, or Sheng)</label>
                <textarea
                  rows={3}
                  required
                  value={testBody}
                  onChange={(e) => setTestBody(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                disabled={testingInbound}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {testingInbound ? 'Processing AI & Workflows...' : 'Send Through SPOILER AI Engine'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
