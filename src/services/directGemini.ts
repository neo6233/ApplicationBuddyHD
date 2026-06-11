import {PROGRAM_CATALOG} from '../data/programCatalog';
import {APP_RULES} from '../data/appRules';

// ─── Config ──────────────────────────────────────────────────────────────────
const GEMINI_API_KEY =
  (typeof process !== 'undefined' &&
    ((process as any)?.env?.GEMINI_API_KEY || (process as any)?.env?.GOOGLE_API_KEY)) ||
  '';

const GEMINI_MODEL =
  (typeof process !== 'undefined' && (process as any)?.env?.GEMINI_MODEL) || 'gemini-2.5-flash';

const GEMINI_BASE_URL =
  (typeof process !== 'undefined' && (process as any)?.env?.GEMINI_BASE_URL) ||
  'https://generativelanguage.googleapis.com/v1beta';

const GEMINI_TIMEOUT_MS = Number(
  (typeof process !== 'undefined' && (process as any)?.env?.GEMINI_TIMEOUT_MS) || 15000,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const containsDevanagari = (text: string) => /[\u0900-\u097F]/.test(text);

export interface AssistantAnalysis {
  topic: 'course' | 'eligibility' | 'scholarship' | 'visa' | 'general';
  confidence: number;
  needsMoreInfo: boolean;
  followUpQuestion?: string;
  summary?: string;
  profile?: {
    level?: string;
    field?: string;
    country?: string;
    qualification?: string;
    score?: string;
    englishScore?: string;
    workExperience?: string;
  };
}

// ─── Build system prompt with catalog and rules ──────────────────────────────
const buildSystemPrompt = () => {
  const catalogSnapshot = PROGRAM_CATALOG.map(
    p =>
      `\u2022 ${p.name} | ${p.university} | ${p.country} | ${p.duration} | Intake: ${p.intake} | Min: ${p.eligibility}`,
  ).join('\n');

  const rulesSnapshot = APP_RULES.slice(0, 6)
    .map(r => `- ${r.text}`)
    .join('\n');

  return `You are ARIA, an AI Admission Counsellor.

STRICT RULES:
1. Reply in one short paragraph (max 3 sentences).
2. Use only programs from this catalog. NEVER invent programs.
3. If the user speaks Hindi, reply ONLY in Hindi. If English, reply ONLY in English.
4. Use only the current user message to choose the reply language.
5. If the user asks "after 12th" or similar, recommend only UG/Diploma programs.
6. Answer the current message directly. Do NOT repeat previous recommendations.
7. If a user asks about ONE specific program, give details about THAT program only.
8. Never give the same list of programs twice in a row.

KEY RULES:
${rulesSnapshot}

PROGRAM CATALOG:
${catalogSnapshot}`;
};

const buildLanguageInstruction = (language: 'hi' | 'en'): string =>
  language === 'hi'
    ? '\u0906\u092A \u0915\u0947\u0935\u0932 \u0939\u093F\u0902\u0926\u0940 \u092E\u0947\u0902 \u091C\u0935\u093E\u092C \u0926\u0940\u091C\u093F\u090F\u0964 \u0915\u094B\u0908 \u0905\u0902\u0917\u094D\u0930\u0947\u091C\u0940 \u0936\u092C\u094D\u0926 \u0928\u0939\u0940\u0902\u0964 \u0936\u0941\u0926\u094D\u0927 \u0939\u093F\u0902\u0926\u0940 \u0915\u0947\u0935\u0932\u0964'
    : 'Answer ONLY in English. NO Hindi words. Pure English only.';

// ─── Build Gemini API message contents ───────────────────────────────────────
const toContents = (
  history: Array<{role: 'user' | 'assistant'; content: string; image?: string | null}>,
  userMessage: string,
  image?: string | null,
) => {
  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<{
      text?: string;
      inlineData?: {mimeType: string; data: string};
    }>;
  }> = history.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{text: message.content}],
  }));

  const userParts: Array<{
    text?: string;
    inlineData?: {mimeType: string; data: string};
  }> = [{text: userMessage}];

  if (image) {
    const base64 = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
    if (base64) {
      userParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64,
        },
      });
    }
  }

  contents.push({role: 'user', parts: userParts});
  return contents;
};

// ─── Core Gemini API call ────────────────────────────────────────────────────
const callGeminiRaw = async (payload: {
  systemPrompt?: string;
  contents: any[];
  temperature?: number;
  maxOutputTokens?: number;
  jsonMode?: boolean;
}): Promise<string> => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const body: any = {
      contents: payload.contents,
      generationConfig: {
        temperature: payload.temperature ?? 0.2,
        topP: 0.9,
        maxOutputTokens: payload.maxOutputTokens ?? 512,
      },
    };

    if (payload.systemPrompt) {
      body.systemInstruction = {parts: [{text: payload.systemPrompt}]};
    }

    if (payload.jsonMode) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const response = await fetch(
      `${GEMINI_BASE_URL.replace(/\/+$/, '')}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    const rawText = await response.text();
    const data = rawText ? JSON.parse(rawText) : {};

    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.error || `Gemini error ${response.status}`;
      throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: {text?: string}) => part.text || '')
        .join('')
        .trim() || '';

    if (!reply) {
      throw new Error('Gemini returned an empty response.');
    }

    return reply;
  } finally {
    clearTimeout(timeout);
  }
};

// ─── Public API ──────────────────────────────────────────────────────────────
export const isDirectGeminiAvailable = (): boolean => Boolean(GEMINI_API_KEY);

export const directGeminiChat = async (
  userMessage: string,
  history: Array<{role: 'user' | 'assistant'; content: string; image?: string | null}>,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    userImage?: string | null;
    language?: 'hi' | 'en';
    systemPrompt?: string;
  },
): Promise<string> => {
  const language = options?.language || (containsDevanagari(userMessage) ? 'hi' : 'en');
  const languageInstruction = buildLanguageInstruction(language);
  const systemPrompt = options?.systemPrompt
    ? `${options.systemPrompt}\n\n${languageInstruction}`
    : `${buildSystemPrompt()}\n\n${languageInstruction}`;

  const contents = toContents(history, userMessage, options?.userImage ?? null);

  return callGeminiRaw({
    systemPrompt,
    contents,
    temperature: options?.temperature ?? 0.2,
    maxOutputTokens: options?.maxOutputTokens ?? 512,
  });
};

// ─── Analyze conversation intent via Gemini (port from backend) ──────────────
export const analyzeConversation = async (
  userMessage: string,
  history: Array<{role: 'user' | 'assistant'; content: string; image?: string | null}>,
): Promise<AssistantAnalysis | null> => {
  const greetingWords = ['hi', 'hii', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
  if (greetingWords.includes(userMessage.trim().toLowerCase())) {
    return {topic: 'general', confidence: 1, needsMoreInfo: false, summary: 'Greeting detected'};
  }

  const conversationText = history
    .map(i => `${i.role.toUpperCase()}: ${i.content}`)
    .join('\n');

  const prompt = `ANALYZE conversation. Extract ALL profile info NOW. Return JSON only.

CRITICAL - EXTRACT THESE IMMEDIATELY:

LEVEL KEYWORDS (if found \u2192 set level):
English: "12th", "12th pass", "secondary", "intermediate", "diploma", "bachelor", "B.Tech", "Masters", "MBA", "PG"
Hindi: "12\u0935\u0940\u0902", "\u092C\u093E\u0930\u0939\u0935\u0940\u0902", "\u0907\u0902\u091F\u0930\u092E\u0940\u0921\u093F\u090F\u091F", "\u0921\u093F\u092A\u094D\u0932\u094B\u092E\u093E", "\u0938\u094D\u0928\u093E\u0924\u0915", "\u092E\u093E\u0938\u094D\u091F\u0930\u094D\u0938", "\u090F\u092E\u092C\u0940\u090F"
RULE: If ANY of these found \u2192 set level. "12th/12\u0935\u0940\u0902/Intermediate/\u0907\u0902\u091F\u0930\u092E\u0940\u0921\u093F\u090F\u091F" = "UG"

FIELD KEYWORDS (if found \u2192 set field):
English: "computer", "CS", "IT", "technology", "data science", "engineering", "business", "management", "healthcare", "law", "arts"
Hindi: "\u0915\u0902\u092A\u094D\u092F\u0942\u091F\u0930", "\u0938\u0940\u090F\u0938", "\u0906\u0908\u091F\u0940", "\u091F\u0947\u0915\u094D\u0928\u094B\u0932\u0949\u091C\u0940", "\u0921\u0947\u091F\u093E \u0938\u093E\u0907\u0902\u0938", "\u0907\u0902\u091C\u0940\u0928\u093F\u092F\u0930\u093F\u0902\u0917", "\u092C\u093F\u091C\u0928\u0947\u0938", "\u092E\u0948\u0928\u0947\u091C\u092E\u0947\u0902\u091F"
RULE: If ANY of these found \u2192 extract exact field name

SCORE KEYWORDS: "%", "GPA", "percentage", "points"

JSON schema: {"topic":"course|eligibility|scholarship|visa|general","confidence":0.0,"needsMoreInfo":false,"followUpQuestion":"","summary":"","profile":{"level":"UG|PG|Diploma|","field":"","country":"","qualification":"","score":"","englishScore":"","workExperience":""}}

needsMoreInfo logic: TRUE ONLY if topic="course" AND level="" AND field="" (both empty)
OTHERWISE needsMoreInfo=false

Conversation:
${conversationText}
USER: ${userMessage}`;

  try {
    const raw = await callGeminiRaw({
      systemPrompt: 'You are a strict JSON analyzer. Extract ALL available student profile information from the conversation. Return valid JSON only, no extra text.',
      contents: [{role: 'user', parts: [{text: prompt}]}],
      temperature: 0,
      jsonMode: true,
      maxOutputTokens: 256,
    });

    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(cleaned) as AssistantAnalysis;
    } catch {
      return {topic: 'general', confidence: 0.5, needsMoreInfo: false, summary: 'Parse error fallback'};
    }
  } catch (err: any) {
    console.warn('[directGemini] analyzeConversation error:', err?.message);
    return {topic: 'general', confidence: 0.5, needsMoreInfo: false, summary: 'Fallback: error'};
  }
};

export const shouldUseHindiResponse = (message: string) => containsDevanagari(message);

export const summarizeDirectGeminiError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('GEMINI_API_KEY')) {
    return 'Set GEMINI_API_KEY to use direct Gemini mode.';
  }
  return 'AI request failed. Please check your network connection.';
};

export const isLikelyNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /network error|timeout|ECONNREFUSED|ENOTFOUND|Network request failed/i.test(message);
};

export const normalizeChatText = normalize;
