import React, { useEffect, useState } from 'react';
import { Bot, Play, Plus, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { AiBot, SocialAccount } from '../types';

const BOT_AVATARS = [
  { label: 'Core Sphere', url: '/src/assets/images/bot_avatar_main_1795477725208.jpg' },
  { label: 'Titanium Monolith', url: '/src/assets/images/bot_avatar_business_1795477725400.jpg' },
  { label: 'Acoustic Wave', url: '/src/assets/images/bot_avatar_care_1795477725511.jpg' },
];

const BOT_PRESETS = [
  'SPOILER BUSINESS BOT',
  'SPOILER CUSTOMER CARE',
  'SPOILER PERSONAL ASSISTANT',
  'SPOILER GROUP ASSISTANT',
];

export function BotStudioView({ onUpdated }: { onUpdated: () => void }) {
  const [bots, setBots] = useState<AiBot[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(BOT_AVATARS[0].url);
  const [instructions, setInstructions] = useState('');
  const [personality, setPersonality] = useState('Confident, concise, futuristic specialist');
  const [language, setLanguage] = useState('Auto (English, Swahili, Sheng)');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryWindow, setMemoryWindow] = useState(12);
  const [automationMode, setAutomationMode] = useState<'AUTOMATIC' | 'MANUAL'>('AUTOMATIC');
  const [commandsRaw, setCommandsRaw] = useState('/start, /help, /pricing');
  const [handoverKeywordsRaw, setHandoverKeywordsRaw] = useState('refund, complaint, speak to human');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Live Reply Engine Playground
  const [testBotId, setTestBotId] = useState('');
  const [testMessage, setTestMessage] = useState('Niaje mkuu, naweza lipa subscription na M-Pesa?');
  const [testOutput, setTestOutput] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const loadData = async () => {
    try {
      const [bRes, pRes] = await Promise.all([
        apiRequest<{ bots: AiBot[] }>('/api/bots'),
        apiRequest<{ accounts: SocialAccount[] }>('/api/platforms/catalog'),
      ]);
      setBots(bRes.bots);
      setAccounts(pRes.accounts);
      if (bRes.bots.length > 0 && !testBotId) {
        setTestBotId(bRes.bots[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditingBotId(null);
    setName('SPOILER BUSINESS BOT');
    setAvatarUrl(BOT_AVATARS[1].url);
    setInstructions('Handle customer sales, pricing inquiries, and lead qualification concisely across WhatsApp and Telegram.');
    setPersonality('Executive, helpful, accurate');
    setLanguage('Auto (English, Swahili, Sheng)');
    setMemoryEnabled(true);
    setMemoryWindow(12);
    setAutomationMode('AUTOMATIC');
    setCommandsRaw('/start, /help, /pricing');
    setHandoverKeywordsRaw('refund, fraud, speak to human');
    setSelectedAccounts([]);
    setShowModal(true);
  };

  const openEdit = (b: AiBot) => {
    setEditingBotId(b.id);
    setName(b.name);
    setAvatarUrl(b.avatar_url);
    setInstructions(b.instructions);
    setPersonality(b.personality);
    setLanguage(b.language);
    setMemoryEnabled(b.memoryEnabled);
    setMemoryWindow(b.memory_window);
    setAutomationMode(b.automation_mode);
    setCommandsRaw((b.commands || []).join(', '));
    setHandoverKeywordsRaw((b.restrictions?.handoverKeywords || []).join(', '));
    setSelectedAccounts((b.connectedAccounts || []).map((a) => a.account_id));
    setShowModal(true);
  };

  const handleSaveBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        avatarUrl,
        instructions,
        personality,
        language,
        memoryEnabled,
        memoryWindow,
        automationMode,
        commands: commandsRaw.split(',').map((s) => s.trim()).filter(Boolean),
        restrictions: {
          handoverKeywords: handoverKeywordsRaw.split(',').map((s) => s.trim()).filter(Boolean),
          maxLengthChars: 650,
        },
        accountIds: selectedAccounts,
      };
      if (editingBotId) {
        await apiRequest(`/api/bots/${editingBotId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiRequest('/api/bots', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowModal(false);
      await loadData();
      onUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBot = async (id: string) => {
    await apiRequest(`/api/bots/${id}`, { method: 'DELETE' });
    await loadData();
    onUpdated();
  };

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setError(null);
    try {
      const res = await apiRequest<{ aiResult: any }>('/api/ai/reply-test', {
        method: 'POST',
        body: JSON.stringify({
          botId: testBotId || undefined,
          platform: 'whatsapp',
          senderName: 'Test Contact',
          message: testMessage,
        }),
      });
      setTestOutput(res.aiResult);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="h-64 rounded-xl bg-[#111114] border border-white/8 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">AI Bot Studio</h2>
          <p className="text-sm text-zinc-400">
            Configure specialized AI agents with custom instructions, Swahili/Sheng/English fluency, memory, and channel bindings.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create AI Bot</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">{error}</div>
      )}

      {/* Bots Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {bots.map((b) => (
          <div key={b.id} className="p-5 rounded-xl bg-[#111114] border border-white/10 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={b.avatar_url}
                    alt={b.name}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-xl object-cover border border-white/12"
                  />
                  <div>
                    <h3 className="font-display text-base font-bold text-white">{b.name}</h3>
                    <p className="text-xs text-zinc-400">
                      {b.automation_mode} · {b.active ? 'Active' : 'Paused'}
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-zinc-300 leading-relaxed line-clamp-3">{b.instructions}</p>

              <div className="mt-4 pt-3 border-t border-white/6 space-y-1.5 text-xs text-zinc-400">
                <p>Language: {b.language}</p>
                <p>Memory: {b.memoryEnabled ? `Last ${b.memory_window} messages` : 'Stateless'}</p>
                <p>
                  Bound Channels:{' '}
                  {b.connectedAccounts.length > 0
                    ? b.connectedAccounts.map((a) => a.account_name).join(', ')
                    : 'All unassigned channels'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => openEdit(b)}
                className="flex-1 py-2 px-3 rounded-lg bg-zinc-900 border border-white/10 text-xs font-semibold text-white hover:border-red-500/40 cursor-pointer"
              >
                Configure Bot
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBot(b.id)}
                className="p-2 rounded-lg bg-red-950/35 border border-red-500/25 text-red-300 hover:bg-red-950/60 cursor-pointer"
                title="Delete Bot"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Universal AI Reply Engine Live Tester */}
      <div className="p-6 rounded-xl bg-[#111114] border border-white/10">
        <div className="flex items-center gap-2.5 mb-2">
          <Bot className="w-5 h-5 text-red-400" />
          <h3 className="font-display text-lg font-bold text-white">Universal AI Reply Engine Tester</h3>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          Test natural language understanding across English, Swahili, and Kenyan Sheng against any configured bot.
        </p>

        <form onSubmit={handleRunTest} className="grid lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-3">
            <label className="block text-xs text-zinc-300 mb-1.5">Active Bot</label>
            <select
              value={testBotId}
              onChange={(e) => setTestBotId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-black border border-white/12 text-xs text-white"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-7">
            <label className="block text-xs text-zinc-300 mb-1.5">Incoming Message (Try English, Swahili, or Sheng)</label>
            <input
              type="text"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-white/12 text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={testing}
              className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{testing ? 'Generating...' : 'Run Reply'}</span>
            </button>
          </div>
        </form>

        {testOutput && (
          <div className="mt-4 p-4 rounded-xl bg-black/70 border border-white/10 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-zinc-400">
              <span>Detected Language: <strong className="text-white">{testOutput.detectedLanguage}</strong></span>
              <span aria-hidden="true">·</span>
              <span>Intent: <strong className="text-white">{testOutput.intent}</strong></span>
              <span aria-hidden="true">·</span>
              <span>Handover Recommended: <strong className={testOutput.needsHumanHandover ? 'text-amber-400' : 'text-emerald-400'}>{testOutput.needsHumanHandover ? 'YES' : 'NO'}</strong></span>
            </div>
            <p className="text-sm text-white pt-1 leading-relaxed">{testOutput.suggestedReply}</p>
          </div>
        )}
      </div>

      {/* Create/Edit Bot Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#111114] border border-white/12 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-white">
                {editingBotId ? 'Configure AI Bot' : 'Create AI Bot'}
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBot} className="space-y-4">
              {!editingBotId && (
                <div>
                  <span className="block text-xs text-zinc-400 mb-1.5">Quick Role Presets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {BOT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setName(preset)}
                        className="px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Bot Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Bot Emblem</label>
                <div className="grid grid-cols-3 gap-3">
                  {BOT_AVATARS.map((av) => (
                    <button
                      key={av.url}
                      type="button"
                      onClick={() => setAvatarUrl(av.url)}
                      className={`p-2 rounded-lg border text-center cursor-pointer ${
                        avatarUrl === av.url ? 'border-red-500 bg-red-600/15' : 'border-white/10 bg-black'
                      }`}
                    >
                      <img src={av.url} alt={av.label} referrerPolicy="no-referrer" className="w-12 h-12 rounded-lg mx-auto object-cover" />
                      <span className="block mt-1.5 text-[11px] text-zinc-300">{av.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">System Instructions</label>
                <textarea
                  rows={3}
                  required
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Personality</label>
                  <input
                    type="text"
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Language Mode</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                  >
                    <option>Auto (English, Swahili, Sheng)</option>
                    <option>English Only</option>
                    <option>Swahili &amp; Sheng</option>
                    <option>Multilingual Global</option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Automation Mode</label>
                  <select
                    value={automationMode}
                    onChange={(e) => setAutomationMode(e.target.value as 'AUTOMATIC' | 'MANUAL')}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                  >
                    <option value="AUTOMATIC">Automatic</option>
                    <option value="MANUAL">Manual Approval</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Memory Window</label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={memoryWindow}
                    onChange={(e) => setMemoryWindow(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memoryEnabled}
                      onChange={(e) => setMemoryEnabled(e.target.checked)}
                    />
                    <span>Context Memory</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Custom Commands (comma-separated)</label>
                <input
                  type="text"
                  value={commandsRaw}
                  onChange={(e) => setCommandsRaw(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs font-mono text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Handover Escalation Keywords</label>
                <input
                  type="text"
                  value={handoverKeywordsRaw}
                  onChange={(e) => setHandoverKeywordsRaw(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/12 text-xs text-white"
                />
              </div>

              {accounts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Bind Connected Social Accounts</label>
                  <div className="grid grid-cols-2 gap-2">
                    {accounts.map((acc) => {
                      const checked = selectedAccounts.includes(acc.id);
                      return (
                        <label
                          key={acc.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-black border border-white/10 text-xs text-zinc-200 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedAccounts((prev) =>
                                checked ? prev.filter((id) => id !== acc.id) : [...prev, acc.id]
                              )
                            }
                          />
                          <span className="truncate">
                            {acc.platform}: {acc.account_name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {saving ? 'Saving Bot...' : editingBotId ? 'Save Changes' : 'Launch AI Bot'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
