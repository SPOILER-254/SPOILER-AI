import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Pause, Play, Plus, Send, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { WorkflowItem, WorkflowLogItem } from '../types';

export function WorkflowsView({ onUpdated }: { onUpdated: () => void }) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [logs, setLogs] = useState<WorkflowLogItem[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Workflow modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wfName, setWfName] = useState('');
  const [wfDesc, setWfDesc] = useState('');
  const [triggerPlatform, setTriggerPlatform] = useState('whatsapp');
  const [triggerEvent, setTriggerEvent] = useState('MESSAGE_RECEIVED');
  const [condField, setCondField] = useState('message.length');
  const [condOp, setCondOp] = useState('>');
  const [condVal, setCondVal] = useState('0');
  const [aiPrompt, setAiPrompt] = useState('Detect language (English/Swahili/Sheng), analyze intent, and compose a clear reply.');
  const [actionType, setActionType] = useState('AUTO_OR_APPROVAL');
  const [testingId, setTestingId] = useState<string | null>(null);

  // Scheduled post form
  const [postPlatform, setPostPlatform] = useState('instagram');
  const [postContent, setPostContent] = useState('');
  const [postTime, setPostTime] = useState('');
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      const [wfRes, postRes] = await Promise.all([
        apiRequest<{ workflows: WorkflowItem[]; logs: WorkflowLogItem[] }>('/api/workflows'),
        apiRequest<{ posts: any[] }>('/api/scheduled-posts'),
      ]);
      setWorkflows(wfRes.workflows);
      setLogs(wfRes.logs);
      setPosts(postRes.posts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setWfName('WhatsApp Sales Qualifier');
    setWfDesc('Identifies sender, detects English/Swahili/Sheng, analyzes inquiry, and dispatches or requests approval.');
    setTriggerPlatform('whatsapp');
    setTriggerEvent('MESSAGE_RECEIVED');
    setCondField('message.length');
    setCondOp('>');
    setCondVal('0');
    setAiPrompt('Qualify customer intent and respond concisely.');
    setActionType('AUTO_OR_APPROVAL');
    setShowModal(true);
  };

  const openEdit = (w: WorkflowItem) => {
    setEditingId(w.id);
    setWfName(w.name);
    setWfDesc(w.description || '');
    setTriggerPlatform(w.trigger_platform);
    setTriggerEvent(w.trigger_event);
    const c = w.conditions?.[0];
    setCondField(c?.field || 'message.length');
    setCondOp(c?.operator || '>');
    setCondVal(c?.value || '0');
    setAiPrompt(w.ai_prompt_template);
    setActionType(w.action_type);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = {
      name: wfName,
      description: wfDesc,
      triggerPlatform,
      triggerEvent,
      conditions: [{ field: condField, operator: condOp, value: condVal }],
      aiPromptTemplate: aiPrompt,
      actionType,
    };
    if (editingId) {
      await apiRequest(`/api/workflows/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await apiRequest('/api/workflows', { method: 'POST', body: JSON.stringify(body) });
    }
    setShowModal(false);
    await loadAll();
    onUpdated();
  };

  const handleToggle = async (w: WorkflowItem) => {
    await apiRequest(`/api/workflows/${w.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !w.active }),
    });
    await loadAll();
    onUpdated();
  };

  const handleTest = async (w: WorkflowItem) => {
    setTestingId(w.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/workflows/${w.id}/test`, {
        method: 'POST',
        body: JSON.stringify({
          sampleMessage: 'Habari! Bei ya Pro plan ni ngapi na mnaaccept M-Pesa?',
        }),
      });
      setNotice(`Workflow "${w.name}" executed end-to-end and logged in execution trace.`);
      await loadAll();
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await apiRequest(`/api/workflows/${id}`, { method: 'DELETE' });
    await loadAll();
    onUpdated();
  };

  const handleSchedulePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim() || !postTime) return;
    await apiRequest('/api/scheduled-posts', {
      method: 'POST',
      body: JSON.stringify({
        platform: postPlatform,
        content: postContent,
        scheduledFor: postTime,
      }),
    });
    setPostContent('');
    await loadAll();
    onUpdated();
  };

  const handleDeletePost = async (id: string) => {
    await apiRequest(`/api/scheduled-posts/${id}`, { method: 'DELETE' });
    await loadAll();
    onUpdated();
  };

  const handlePublishPost = async (id: string) => {
    setPublishingPostId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ externalId?: string }>(`/api/scheduled-posts/${id}/publish`, {
        method: 'POST',
      });
      setNotice(`Scheduled post published${res.externalId ? ` (External ID: ${res.externalId})` : ''}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPublishingPostId(null);
      await loadAll();
      onUpdated();
    }
  };

  if (loading) {
    return <div className="h-64 rounded-xl bg-[#111114] border border-white/8 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Automation Workflow Builder</h2>
          <p className="text-sm text-zinc-400">
            Visual no-code pipelines: Trigger &rarr; Condition &rarr; AI Processing &rarr; Action &rarr; Result.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Workflow</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">{error}</div>
      )}
      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">{notice}</div>
      )}

      {/* Visual Workflow Pipeline Cards */}
      <div className="space-y-4">
        {workflows.map((w) => (
          <div key={w.id} className="p-5 rounded-xl bg-[#111114] border border-white/10 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-display text-base font-bold text-white">{w.name}</h3>
                  <span className={`text-xs font-semibold ${w.active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {w.active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">{w.description || 'Automated inbound message pipeline'}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={testingId === w.id}
                  onClick={() => handleTest(w)}
                  className="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/35 text-xs font-semibold text-red-200 hover:bg-red-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{testingId === w.id ? 'Running...' : 'Test Pipeline'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(w)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs font-medium text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {w.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{w.active ? 'Pause' : 'Resume'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(w)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs font-medium text-zinc-200 cursor-pointer"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(w.id)}
                  className="p-1.5 rounded-lg bg-red-950/35 border border-red-500/25 text-red-300 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 5-Stage Visual Flow Diagram */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-stretch">
              <div className="p-3 rounded-lg bg-black/70 border border-white/8">
                <p className="text-[11px] font-semibold text-red-400">1. Trigger</p>
                <p className="mt-1 text-xs font-medium text-white">{w.trigger_platform.toUpperCase()}</p>
                <p className="text-[11px] text-zinc-500">{w.trigger_event}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/70 border border-white/8">
                <p className="text-[11px] font-semibold text-red-400">2. Condition</p>
                <p className="mt-1 text-xs font-mono text-white truncate">
                  {w.conditions?.[0] ? `${w.conditions[0].field} ${w.conditions[0].operator} ${w.conditions[0].value}` : 'Always Match'}
                </p>
                <p className="text-[11px] text-zinc-500">Sender &amp; Language Check</p>
              </div>
              <div className="p-3 rounded-lg bg-black/70 border border-white/8">
                <p className="text-[11px] font-semibold text-red-400">3. AI Processing</p>
                <p className="mt-1 text-xs text-white line-clamp-2">{w.ai_prompt_template}</p>
              </div>
              <div className="p-3 rounded-lg bg-black/70 border border-white/8">
                <p className="text-[11px] font-semibold text-red-400">4. Action</p>
                <p className="mt-1 text-xs font-medium text-white">{w.action_type}</p>
                <p className="text-[11px] text-zinc-500">Send or Queue Approval</p>
              </div>
              <div className="p-3 rounded-lg bg-black/70 border border-white/8">
                <p className="text-[11px] font-semibold text-red-400">5. Result</p>
                <p className="mt-1 text-xs font-mono text-white tabular-nums">{w.execution_count} runs</p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {w.last_executed_at ? `Last: ${new Date(w.last_executed_at + 'Z').toLocaleTimeString()}` : 'Not run yet'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Scheduled Posts & Execution Logs */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 p-5 rounded-xl bg-[#111114] border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-red-400" />
            <h3 className="font-display text-base font-bold text-white">Scheduled Posts</h3>
          </div>

          <form onSubmit={handleSchedulePost} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select
                value={postPlatform}
                onChange={(e) => setPostPlatform(e.target.value)}
                className="px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook Page</option>
                <option value="x">X / Twitter</option>
                <option value="linkedin">LinkedIn</option>
                <option value="threads">Threads</option>
                <option value="tiktok">TikTok</option>
              </select>
              <input
                type="datetime-local"
                required
                value={postTime}
                onChange={(e) => setPostTime(e.target.value)}
                className="px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
              />
            </div>
            <textarea
              rows={2}
              required
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder="Write post copy to schedule..."
              className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
            >
              Schedule Post
            </button>
          </form>

          <div className="divide-y divide-white/8 pt-2">
            {posts.map((p) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{p.content}</p>
                  <p className="text-zinc-500">
                    {p.platform.toUpperCase()} · {p.scheduled_for} · {p.status}
                  </p>
                  {p.error_message && (
                    <p className="mt-0.5 text-[11px] text-red-300 truncate">{p.error_message}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.status !== 'PUBLISHED' && (
                    <button
                      type="button"
                      disabled={publishingPostId === p.id}
                      onClick={() => handlePublishPost(p.id)}
                      className="px-2.5 py-1 rounded bg-zinc-900 border border-white/10 hover:border-red-500/40 text-[11px] text-zinc-200 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      <span>{publishingPostId === p.id ? 'Publishing...' : 'Publish Now'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeletePost(p.id)}
                    className="text-red-400 hover:text-red-300 cursor-pointer"
                    aria-label="Delete scheduled post"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 p-5 rounded-xl bg-[#111114] border border-white/10 space-y-4">
          <h3 className="font-display text-base font-bold text-white">Workflow Execution Logs</h3>
          {logs.length === 0 ? (
            <p className="text-xs text-zinc-500">Run &ldquo;Test Pipeline&rdquo; or receive a webhook message to inspect step traces.</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="p-3 rounded-lg bg-black/60 border border-white/8 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-400">{log.status}</span>
                    <span className="font-mono text-zinc-500 tabular-nums">{log.duration_ms}ms</span>
                  </div>
                  <div className="space-y-1">
                    {log.steps.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px] text-zinc-300">
                        <ArrowRight className="w-3 h-3 text-red-400 shrink-0" />
                        <span className="font-semibold text-white">{s.step}:</span>
                        <span className="truncate">{s.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Workflow Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#111114] border border-white/12 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-white">
                {editingId ? 'Edit Workflow' : 'Create Automation Workflow'}
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Workflow Name</label>
                <input
                  type="text"
                  required
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Description</label>
                <input
                  type="text"
                  value={wfDesc}
                  onChange={(e) => setWfDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-300 mb-1">Trigger Platform</label>
                  <select
                    value={triggerPlatform}
                    onChange={(e) => setTriggerPlatform(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                  >
                    <option value="ALL">All Platforms</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="telegram">Telegram</option>
                    <option value="instagram">Instagram</option>
                    <option value="messenger">Facebook Messenger</option>
                    <option value="discord">Discord</option>
                    <option value="slack">Slack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-300 mb-1">Trigger Event</label>
                  <select
                    value={triggerEvent}
                    onChange={(e) => setTriggerEvent(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                  >
                    <option value="MESSAGE_RECEIVED">Message Received</option>
                    <option value="IMAGE_RECEIVED">Image Received (ReplyImg)</option>
                    <option value="COMMENT_RECEIVED">Comment Received</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={condField}
                  onChange={(e) => setCondField(e.target.value)}
                  placeholder="Condition field"
                  className="px-2.5 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={condOp}
                  onChange={(e) => setCondOp(e.target.value)}
                  placeholder="Operator"
                  className="px-2.5 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={condVal}
                  onChange={(e) => setCondVal(e.target.value)}
                  placeholder="Value"
                  className="px-2.5 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">AI Processing Prompt</label>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-300 mb-1">Action</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                >
                  <option value="AUTO_OR_APPROVAL">Send Reply (or Queue Manual Approval)</option>
                  <option value="ALWAYS_APPROVAL">Always Require Operator Approval</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer"
              >
                {editingId ? 'Save Workflow' : 'Create & Activate Workflow'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
