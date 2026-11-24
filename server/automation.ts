import crypto from 'crypto';
import { db } from './db.ts';
import { generateUniversalReply } from './ai.ts';
import { sendPlatformMessage } from './platforms.ts';
import { broadcastToUser } from './realtime.ts';

export interface InboundMessageParams {
  userId: string;
  socialAccountId: string | null;
  platform: string;
  senderExternalId: string;
  senderName: string;
  senderHandle?: string;
  senderPhone?: string;
  content: string;
  externalMessageId?: string;
  imageBase64?: string;
  imageMimeType?: string;
  mediaId?: string;
}

export async function processInboundMessage(params: InboundMessageParams) {
  const user = db
    .prepare('SELECT id, global_automation_enabled FROM users WHERE id = ?')
    .get(params.userId) as { id: string; global_automation_enabled: number } | undefined;

  if (!user) throw new Error('User not found');

  // 1. Upsert contact
  let contact = db
    .prepare('SELECT * FROM contacts WHERE user_id = ? AND platform = ? AND external_id = ?')
    .get(params.userId, params.platform, params.senderExternalId) as { id: string; display_name: string } | undefined;

  if (!contact) {
    const contactId = `cnt_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO contacts (id, user_id, platform, external_id, display_name, handle, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      contactId,
      params.userId,
      params.platform,
      params.senderExternalId,
      params.senderName,
      params.senderHandle || null,
      params.senderPhone || null
    );
    contact = { id: contactId, display_name: params.senderName };
  }

  // 2. Find assigned bot for this social account (or user's first active bot)
  let bot: any = null;
  if (params.socialAccountId) {
    bot = db
      .prepare(`
        SELECT b.* FROM ai_bots b
        INNER JOIN bot_accounts ba ON ba.bot_id = b.id
        WHERE ba.social_account_id = ? AND b.user_id = ? AND b.active = 1
        LIMIT 1
      `)
      .get(params.socialAccountId, params.userId);
  }
  if (!bot) {
    bot = db
      .prepare('SELECT * FROM ai_bots WHERE user_id = ? AND active = 1 ORDER BY created_at ASC LIMIT 1')
      .get(params.userId);
  }

  // 3. Upsert conversation
  let conversation = db
    .prepare(`
      SELECT * FROM conversations
      WHERE user_id = ? AND contact_id = ? AND platform = ?
      ORDER BY last_message_at DESC LIMIT 1
    `)
    .get(params.userId, contact.id, params.platform) as any;

  const accountRow = params.socialAccountId
    ? (db.prepare('SELECT automation_mode FROM social_accounts WHERE id = ?').get(params.socialAccountId) as { automation_mode: string } | undefined)
    : undefined;

  const defaultMode = accountRow?.automation_mode || bot?.automation_mode || 'AUTOMATIC';

  if (!conversation) {
    const convId = `conv_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO conversations (id, user_id, social_account_id, contact_id, bot_id, platform, status, automation_mode, unread_count)
      VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, 1)
    `).run(
      convId,
      params.userId,
      params.socialAccountId,
      contact.id,
      bot?.id || null,
      params.platform,
      defaultMode
    );
    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  } else {
    db.prepare(`
      UPDATE conversations
      SET unread_count = unread_count + 1, last_message_at = datetime('now')
      WHERE id = ?
    `).run(conversation.id);
  }

  // 4. Insert inbound message
  const inboundMsgId = `msg_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO messages (id, conversation_id, user_id, direction, sender_type, content, media_id, external_message_id, delivery_status)
    VALUES (?, ?, ?, 'INBOUND', 'CONTACT', ?, ?, ?, 'DELIVERED')
  `).run(
    inboundMsgId,
    conversation.id,
    params.userId,
    params.content,
    params.mediaId || null,
    params.externalMessageId || null
  );

  broadcastToUser(params.userId, {
    type: 'inbox:message',
    payload: {
      conversationId: conversation.id,
      messageId: inboundMsgId,
      platform: params.platform,
      senderName: params.senderName,
      content: params.content,
      direction: 'INBOUND',
    },
  });

  // 5. Evaluate matching automation workflows & conditions
  const candidateWorkflows = db
    .prepare(`
      SELECT * FROM automation_workflows
      WHERE user_id = ? AND active = 1 AND (trigger_platform = ? OR trigger_platform = 'ALL')
    `)
    .all(params.userId, params.platform) as any[];

  const matchesCondition = (wf: any): boolean => {
    let conditions: Array<{ field?: string; operator?: string; value?: string }> = [];
    try {
      conditions = JSON.parse(wf.conditions_json || '[]');
    } catch {
      conditions = [];
    }
    if (!Array.isArray(conditions) || conditions.length === 0) return true;
    return conditions.every((c) => {
      const val = String(c.value ?? '').trim();
      const op = String(c.operator ?? '>').trim().toLowerCase();
      if (c.field === 'message.length') {
        const num = Number(val) || 0;
        if (op === '>' || op === 'gt') return params.content.length > num;
        if (op === '>=' || op === 'gte') return params.content.length >= num;
        if (op === '<' || op === 'lt') return params.content.length < num;
        return params.content.length === num;
      }
      const lower = params.content.toLowerCase();
      if (op === 'contains') return lower.includes(val.toLowerCase());
      if (op === 'not_contains') return !lower.includes(val.toLowerCase());
      if (op === 'equals' || op === '==') return lower === val.toLowerCase();
      return true;
    });
  };

  const workflows = candidateWorkflows.filter(matchesCondition);

  // Check if global automation is halted
  if (!user.global_automation_enabled) {
    return {
      conversationId: conversation.id,
      inboundMessageId: inboundMsgId,
      automationStatus: 'HALTED_BY_GLOBAL_SWITCH',
    };
  }

  // Check AI quota
  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(params.userId) as any;
  if (sub && sub.ai_usage_count >= sub.ai_quota_limit) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body)
      VALUES (?, ?, 'WARNING', 'AI Usage Quota Reached', 'Your plan AI message limit was reached. Upgrade your plan to resume automatic replies.')
    `).run(`notif_${crypto.randomUUID()}`, params.userId);
    return {
      conversationId: conversation.id,
      inboundMessageId: inboundMsgId,
      automationStatus: 'QUOTA_EXCEEDED',
    };
  }

  // 6. Gather conversation history if memory is enabled
  const historyRows = bot?.memory_enabled
    ? (db
        .prepare(`
          SELECT direction, sender_type as senderType, content
          FROM messages
          WHERE conversation_id = ? AND id != ?
          ORDER BY created_at DESC LIMIT ?
        `)
        .all(conversation.id, inboundMsgId, bot.memory_window || 10) as Array<{ direction: string; senderType: string; content: string }>).reverse()
    : [];

  let restrictions = {};
  try {
    restrictions = bot?.restrictions_json ? JSON.parse(bot.restrictions_json) : {};
  } catch {
    restrictions = {};
  }

  const workflowPromptSuffix = workflows
    .map((w) => String(w.ai_prompt_template || '').trim())
    .filter(Boolean)
    .join('\n');

  const combinedInstructions = [
    bot?.instructions || 'Be helpful, concise, and professional.',
    workflowPromptSuffix ? `Active workflow rules:\n${workflowPromptSuffix}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const startTime = Date.now();
  const aiResult = await generateUniversalReply({
    incomingMessage: params.content,
    platform: params.platform,
    senderName: params.senderName,
    botName: bot?.name || 'SPOILER MAIN BOT',
    instructions: combinedInstructions,
    personality: bot?.personality || 'Sharp, responsive, futuristic support specialist',
    language: bot?.language || 'Auto (English, Swahili, Sheng)',
    restrictions,
    history: historyRows,
    imageBase64: params.imageBase64,
    imageMimeType: params.imageMimeType,
  });

  // Update detected language on inbound message & record usage
  db.prepare('UPDATE messages SET detected_language = ? WHERE id = ?').run(aiResult.detectedLanguage, inboundMsgId);
  db.prepare('UPDATE subscriptions SET ai_usage_count = ai_usage_count + 1, updated_at = datetime(\'now\') WHERE user_id = ?').run(params.userId);
  db.prepare(`
    INSERT INTO usage_records (id, user_id, action_type, model_name, tokens_used)
    VALUES (?, ?, 'AI_REPLY', 'gemini-4-hydrogen', ?)
  `).run(`use_${crypto.randomUUID()}`, params.userId, Math.max(120, Math.round((params.content.length + aiResult.suggestedReply.length) * 0.6)));

  const workflowRequiresApproval = workflows.some((w) => w.action_type === 'ALWAYS_APPROVAL');
  const effectiveMode =
    conversation.status === 'HANDOVER' || workflowRequiresApproval
      ? 'MANUAL'
      : conversation.automation_mode || accountRow?.automation_mode || bot?.automation_mode || 'AUTOMATIC';

  let outboundResult: any = null;
  let approvalId: string | null = null;

  if (effectiveMode === 'AUTOMATIC' && !aiResult.needsHumanHandover) {
    const dispatch = await sendPlatformMessage({
      socialAccountId: params.socialAccountId,
      platform: params.platform,
      recipientExternalId: params.senderExternalId,
      text: aiResult.suggestedReply,
    });

    const outId = `msg_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO messages (id, conversation_id, user_id, direction, sender_type, content, detected_language, external_message_id, delivery_status)
      VALUES (?, ?, ?, 'OUTBOUND', 'AI', ?, ?, ?, ?)
    `).run(
      outId,
      conversation.id,
      params.userId,
      aiResult.suggestedReply,
      aiResult.detectedLanguage,
      dispatch.externalMessageId || null,
      dispatch.delivered ? 'SENT' : dispatch.status
    );

    outboundResult = { messageId: outId, ...dispatch };
    broadcastToUser(params.userId, {
      type: 'inbox:message',
      payload: {
        conversationId: conversation.id,
        messageId: outId,
        platform: params.platform,
        senderName: bot?.name || 'SPOILER AI',
        content: aiResult.suggestedReply,
        direction: 'OUTBOUND',
      },
    });
  } else {
    // MANUAL MODE or handover requested
    if (aiResult.needsHumanHandover) {
      db.prepare('UPDATE conversations SET status = \'HANDOVER\' WHERE id = ?').run(conversation.id);
    }
    approvalId = `apr_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO approval_queue (id, user_id, conversation_id, message_id, bot_id, platform, suggested_reply, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      approvalId,
      params.userId,
      conversation.id,
      inboundMsgId,
      bot?.id || null,
      params.platform,
      aiResult.suggestedReply
    );

    broadcastToUser(params.userId, {
      type: 'approval:created',
      payload: {
        approvalId,
        conversationId: conversation.id,
        platform: params.platform,
        suggestedReply: aiResult.suggestedReply,
        needsHumanHandover: aiResult.needsHumanHandover,
      },
    });
  }

  // Log workflow executions
  const durationMs = Date.now() - startTime;
  for (const wf of workflows) {
    const steps = [
      { step: 'TRIGGER', status: 'OK', detail: `Received ${params.platform} message from ${params.senderName}` },
      { step: 'CONDITION', status: 'OK', detail: `Matched workflow "${wf.name}" · Mode: ${effectiveMode}` },
      { step: 'AI_PROCESSING', status: 'OK', detail: `Detected ${aiResult.detectedLanguage} · Intent: ${aiResult.intent}` },
      {
        step: 'ACTION',
        status: 'OK',
        detail: effectiveMode === 'AUTOMATIC' && !aiResult.needsHumanHandover ? 'Dispatched automated reply' : 'Queued for manual operator approval',
      },
      { step: 'RESULT', status: 'COMPLETED', detail: `Finished in ${durationMs}ms` },
    ];
    db.prepare(`
      INSERT INTO workflow_execution_logs (id, workflow_id, user_id, trigger_payload_json, steps_json, status, duration_ms)
      VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)
    `).run(
      `wfl_${crypto.randomUUID()}`,
      wf.id,
      params.userId,
      JSON.stringify({ platform: params.platform, sender: params.senderName, excerpt: params.content.slice(0, 140) }),
      JSON.stringify(steps),
      durationMs
    );
    db.prepare(`
      UPDATE automation_workflows
      SET execution_count = execution_count + 1, last_executed_at = datetime('now')
      WHERE id = ?
    `).run(wf.id);
  }

  return {
    conversationId: conversation.id,
    inboundMessageId: inboundMsgId,
    aiResult,
    effectiveMode,
    outboundResult,
    approvalId,
  };
}
