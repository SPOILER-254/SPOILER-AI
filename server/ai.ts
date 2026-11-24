import { GoogleGenAI, Type } from '@google/genai';
import { config } from './config.ts';

function getAiClient(): GoogleGenAI {
  if (!config.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey: config.geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface ReplyEngineInput {
  incomingMessage: string;
  platform: string;
  senderName: string;
  botName: string;
  instructions: string;
  personality: string;
  language: string;
  restrictions?: {
    forbiddenTopics?: string[];
    handoverKeywords?: string[];
    maxLengthChars?: number;
  };
  history?: Array<{ direction: string; senderType: string; content: string }>;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ReplyEngineOutput {
  detectedLanguage: string;
  intent: string;
  suggestedReply: string;
  needsHumanHandover: boolean;
  handoverReason: string;
  imageSummary?: string;
}

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed')
  );
}

function formatAiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // not raw json
  }
  return raw;
}

async function generateWithResilience(
  ai: GoogleGenAI,
  buildParams: (model: string) => Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  const attempts: Array<{ model: string; delayMs: number }> = [
    { model: PRIMARY_MODEL, delayMs: 700 },
    { model: PRIMARY_MODEL, delayMs: 1500 },
    { model: FALLBACK_MODEL, delayMs: 1200 },
    { model: FALLBACK_MODEL, delayMs: 0 },
  ];

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      const response = await ai.models.generateContent(buildParams(attempt.model));
      return { response, modelUsed: attempt.model };
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt.delayMs === 0) {
        if (!isTransientError(err)) break;
      } else {
        await new Promise((r) => setTimeout(r, attempt.delayMs));
      }
    }
  }
  throw new Error(formatAiError(lastErr));
}

export async function generateUniversalReply(input: ReplyEngineInput): Promise<ReplyEngineOutput> {
  const ai = getAiClient();

  const historyText = (input.history || [])
    .map((m) => `${m.direction === 'INBOUND' ? input.senderName : input.botName}: ${m.content}`)
    .join('\n');

  const restrictionRules: string[] = [];
  if (input.restrictions?.forbiddenTopics?.length) {
    restrictionRules.push(`Avoid discussing these restricted topics: ${input.restrictions.forbiddenTopics.join(', ')}`);
  }
  if (input.restrictions?.handoverKeywords?.length) {
    restrictionRules.push(`Flag needsHumanHandover=true if message involves: ${input.restrictions.handoverKeywords.join(', ')}`);
  }
  if (input.restrictions?.maxLengthChars) {
    restrictionRules.push(`Keep the reply under ${input.restrictions.maxLengthChars} characters.`);
  }

  const systemInstruction = [
    `You are ${input.botName}, an intelligent social media AI agent inside SPOILER AI (powered by SPOILER-TECH).`,
    `Platform: ${input.platform}. Sender: ${input.senderName}.`,
    `Personality: ${input.personality}.`,
    `Custom Instructions: ${input.instructions}`,
    `Language Policy: ${input.language}. You natively understand English, Swahili (Kiswahili), and Kenyan Sheng (e.g., "niaje", "poa", "form ni gani", "mambo vipi", "sawa", "bei ngapi"). Match the sender's language naturally unless the bot language policy specifies a fixed output language.`,
    restrictionRules.length ? `Restrictions:\n- ${restrictionRules.join('\n- ')}` : '',
    `Never invent fake order numbers, tracking IDs, or pretend to execute actions you did not perform.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const promptText = [
    historyText ? `Recent conversation history:\n${historyText}\n` : '',
    `Latest incoming message from ${input.senderName}: "${input.incomingMessage}"`,
    input.imageBase64 ? 'An image was attached with this message. Analyze it thoroughly and address it in your reply.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (input.imageBase64 && input.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType,
        data: input.imageBase64,
      },
    });
  }
  parts.push({ text: promptText });

  const { response } = await generateWithResilience(ai, (model) => ({
    model,
    contents: { parts },
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedLanguage: {
            type: Type.STRING,
            description: 'Detected language such as English, Swahili, Sheng, or Bilingual.',
          },
          intent: {
            type: Type.STRING,
            description: 'Short label of user intent e.g. Pricing Inquiry, Support Request, Greeting.',
          },
          suggestedReply: {
            type: Type.STRING,
            description: 'The natural, helpful reply to send back to the user.',
          },
          needsHumanHandover: {
            type: Type.BOOLEAN,
            description: 'True if escalation to a human operator is recommended.',
          },
          handoverReason: {
            type: Type.STRING,
            description: 'Brief explanation if needsHumanHandover is true, otherwise empty string.',
          },
          imageSummary: {
            type: Type.STRING,
            description: 'If an image was attached, a concise description of its contents and visible text.',
          },
        },
        required: ['detectedLanguage', 'intent', 'suggestedReply', 'needsHumanHandover', 'handoverReason'],
      },
    },
  }));

  const raw = (response.text || '{}').trim();
  const parsed = JSON.parse(raw) as ReplyEngineOutput;
  return parsed;
}

export interface ReplyImgInput {
  imageBase64: string;
  mimeType: string;
  question?: string;
  botInstructions?: string;
  language?: string;
}

export interface ReplyImgOutput {
  description: string;
  objects: string[];
  extractedText: string;
  caption: string;
  diagramOrScreenshotExplanation: string;
  answerToQuestion: string;
  suggestedSocialReply: string;
}

export async function analyzeImageWithReplyImg(input: ReplyImgInput): Promise<ReplyImgOutput> {
  const ai = getAiClient();

  const prompt = [
    'Perform a complete ReplyImg visual intelligence inspection of this image.',
    input.question ? `User question about the image: "${input.question}"` : 'No specific question provided; provide a comprehensive analysis.',
    input.botInstructions ? `Bot persona/instructions: ${input.botInstructions}` : '',
    input.language ? `Preferred reply language: ${input.language}` : 'Respond in English (or match question language if Swahili/Sheng).',
  ]
    .filter(Boolean)
    .join('\n');

  const { response } = await generateWithResilience(ai, (model) => ({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: input.mimeType,
            data: input.imageBase64,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      systemInstruction:
        'You are ReplyImg, the multimodal visual intelligence engine inside SPOILER AI. Accurately describe scenes, detect objects, transcribe all visible text (OCR), explain diagrams or app screenshots, and draft a crisp social-media-ready reply.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          objects: { type: Type.ARRAY, items: { type: Type.STRING } },
          extractedText: { type: Type.STRING },
          caption: { type: Type.STRING },
          diagramOrScreenshotExplanation: { type: Type.STRING },
          answerToQuestion: { type: Type.STRING },
          suggestedSocialReply: { type: Type.STRING },
        },
        required: [
          'description',
          'objects',
          'extractedText',
          'caption',
          'diagramOrScreenshotExplanation',
          'answerToQuestion',
          'suggestedSocialReply',
        ],
      },
    },
  }));

  const raw = (response.text || '{}').trim();
  return JSON.parse(raw) as ReplyImgOutput;
}

export async function translateOrSummarize(params: {
  mode: 'translate' | 'summarize';
  text: string;
  targetLanguage?: string;
}): Promise<string> {
  const ai = getAiClient();
  const prompt =
    params.mode === 'translate'
      ? `Translate the following message accurately into ${params.targetLanguage || 'English'}. Preserve tone and slang (including Swahili/Sheng nuances):\n\n${params.text}`
      : `Provide a crisp, structured bulleted executive summary of this conversation:\n\n${params.text}`;

  const { response } = await generateWithResilience(ai, (model) => ({
    model,
    contents: prompt,
  }));

  return (response.text || '').trim();
}
