export type PlanTier = 'FREE' | 'PRO' | 'BUSINESS';
export type AutomationMode = 'AUTOMATIC' | 'MANUAL';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'user' | 'admin';
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  globalAutomationEnabled: boolean;
  createdAt?: string;
}

export interface SubscriptionInfo {
  id: string;
  user_id: string;
  plan: PlanTier;
  status: string;
  ai_quota_limit: number;
  ai_usage_count: number;
  bot_limit: number;
  account_limit: number;
  renews_at: string | null;
}

export interface SocialAccount {
  id: string;
  platform: string;
  account_name: string;
  external_id: string | null;
  status: 'CONNECTED' | 'NEEDS_REAUTH' | 'ERROR';
  automation_mode: AutomationMode;
  permissions: string[];
  features: Record<string, unknown>;
  webhook_url: string | null;
  webhook_verified: number;
  last_error: string | null;
  created_at: string;
}

export interface PlatformCatalogItem {
  id: string;
  name: string;
  category: 'Messaging' | 'Social' | 'Video & Community' | 'Email & Workspace';
  authMethod: 'CLOUD_API' | 'BOT_TOKEN' | 'OAUTH2' | 'GOOGLE_OAUTH';
  approvalRequired: boolean;
  approvalNote: string;
  availableFeatures: string[];
  unavailableFeatures: string[];
  oauthConfigured: boolean;
  webhookSupported: boolean;
}

export interface AiBot {
  id: string;
  name: string;
  avatar_url: string;
  instructions: string;
  personality: string;
  language: string;
  memoryEnabled: boolean;
  memory_window: number;
  automation_mode: AutomationMode;
  restrictions: {
    forbiddenTopics?: string[];
    handoverKeywords?: string[];
    maxLengthChars?: number;
  };
  commands: string[];
  active: boolean;
  connectedAccounts: Array<{ account_id: string; platform: string; account_name: string }>;
}

export interface ConversationItem {
  id: string;
  social_account_id: string | null;
  contact_id: string;
  bot_id: string | null;
  bot_name: string | null;
  platform: string;
  status: 'OPEN' | 'HANDOVER' | 'RESOLVED';
  automation_mode: AutomationMode;
  unread_count: number;
  assigned_to: string | null;
  last_message_at: string;
  display_name: string;
  handle: string | null;
  phone: string | null;
  contact_external_id: string;
  last_message: string | null;
  pending_approvals: number;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender_type: 'CONTACT' | 'AI' | 'HUMAN';
  content: string;
  detected_language: string | null;
  mediaUrl: string | null;
  mediaAnalysis: Record<string, unknown> | null;
  delivery_status: string;
  created_at: string;
}

export interface ApprovalItem {
  id: string;
  conversation_id: string;
  message_id: string;
  platform: string;
  display_name: string;
  incoming_message: string;
  bot_name: string | null;
  suggested_reply: string;
  status: string;
  created_at: string;
}

export interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  trigger_platform: string;
  trigger_event: string;
  conditions: Array<{ field: string; operator: string; value: string }>;
  ai_prompt_template: string;
  action_type: string;
  active: boolean;
  execution_count: number;
  last_executed_at: string | null;
}

export interface WorkflowLogItem {
  id: string;
  workflow_id: string;
  triggerPayload: Record<string, unknown>;
  steps: Array<{ step: string; status: string; detail: string }>;
  status: string;
  duration_ms: number;
  created_at: string;
}
