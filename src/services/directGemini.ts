import { PROGRAM_CATALOG } from '../data/programCatalog';
import { APP_RULES } from '../data/appRules';
import {resolveLocalServiceUrl} from '../config/serviceUrl';

// ─── Config ──────────────────────────────────────────────────────────────────
const OLLAMA_BASE_URL = resolveLocalServiceUrl({
  envKeys: ['OLLAMA_BASE_URL', 'OLLAMA_HOST'],
  port: 11434,
  path: '',
});

const OLLAMA_MODEL =
  (typeof process !== 'undefined' && (process as any)?.env?.OLLAMA_MODEL) || 'gemma3:4b';

const OLLAMA_TIMEOUT_MS = Number(
  (typeof process !== 'undefined' && (process as any)?.env?.OLLAMA_TIMEOUT_MS) || 30000,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const containsDevanagari = (text: string) => /[\u0900-\u097F]/.test(text);

// ─── Comprehensive Hinglish (Romanized Hindi) Detection ──────────────────────
const HINDI_WORDS = new Set([
  // Pronouns & common subjects
  'maine', 'mujhe', 'mujhko', 'mera', 'meri', 'mere', 'hum', 'humko', 'humne', 'hamara', 'hamari',
  'tum', 'tumne', 'tumko', 'tumhara', 'tumhari', 'aap', 'aapka', 'aapki', 'aapne', 'aapko',
  'uska', 'uski', 'unka', 'unki', 'unko', 'isko', 'iski', 'usse',
  // Verbs & verb forms
  'hai', 'hain', 'tha', 'thi', 'the', 'hoga', 'hogi', 'hota', 'hoti',
  'kar', 'karo', 'karna', 'karunga', 'karungi', 'karenge', 'karte', 'karti', 'kiya', 'kiye', 'karke',
  'liya', 'liye', 'lena', 'lete', 'leti', 'lelo', 'lijiye',
  'diya', 'diye', 'dena', 'dete', 'deti', 'dedo', 'dijiye', 'do',
  'raha', 'rahi', 'rahe', 'rahega', 'rahegi', 'rahenge',
  'sakta', 'sakti', 'sakte', 'sakenge',
  'chahiye', 'chahte', 'chahti', 'chahunga', 'chahungi',
  'bata', 'batao', 'bataye', 'bataiye', 'batana', 'batado',
  'padh', 'padha', 'padhi', 'padhna', 'padhke', 'padhta', 'padhti', 'padhai',
  'chalu', 'shuru',
  'milega', 'milegi', 'milenge', 'milta', 'milti',
  'lagta', 'lagti', 'lagte', 'lagega',
  'bolna', 'bolo', 'bola', 'boli',
  'jaana', 'jao', 'jata', 'jati', 'jayega', 'jayegi',
  'aana', 'aao', 'aata', 'aati', 'aayega', 'aayegi',
  'dekho', 'dekhna', 'dekhte', 'dekha', 'dekhi',
  'samjha', 'samjho', 'samjhao', 'samajh',
  'pasand', 'pasandida',
  // Question words
  'kya', 'kaise', 'kaisa', 'kaisi', 'kyu', 'kyun', 'kyunki', 'kaha', 'kahan',
  'kaun', 'kaun-sa', 'kaunsa', 'kitna', 'kitni', 'kitne', 'kidhar', 'kab',
  'konsa', 'konsi', 'kon',
  // Connectors & prepositions
  'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'me', 'par', 'pe', 'tak', 'wala', 'wali', 'wale',
  'aur', 'ya', 'lekin', 'magar', 'phir', 'toh', 'to', 'bhi',
  'ke bare', 'ke baare', 'ke liye', 'ke saath',
  'abhi', 'ab', 'jab', 'tab',
  // Common nouns & adjectives
  'accha', 'achha', 'acha', 'achhi', 'achi',
  'theek', 'thik', 'sahi',
  'bahut', 'bohot', 'bohut', 'zyada', 'jyada',
  'kuch', 'kuchh', 'koi', 'sab', 'sabhi',
  'nahi', 'nahin', 'nhi', 'mat', 'na',
  'haan', 'han', 'ji', 'bilkul',
  'padhai', 'course', 'kaam',
  'dost', 'bhai', 'behen',
  'paisa', 'paise', 'rupaye',
  'saal', 'mahina', 'din',
  'baad', 'pehle', 'pahle',
  'saath', 'sath',
  'jaruri', 'zaroori', 'zaruri',
  'dusra', 'dusri', 'doosra', 'doosri',
  // Education-related Hinglish
  'padhna', 'padhke', 'padhta',
  'pass', 'paas',
  'barahvi', 'dasvi',
  'wahan', 'yahan', 'idhar', 'udhar',
  // Common phrases used as single words
  'suno', 'suniye', 'sunte',
  'chalo', 'chaliye', 'chalega',
  'pata', 'maloom',
  'shukriya', 'dhanyawad', 'dhanyavaad',
]);

const HINDI_BIGRAMS = [
  'kar liya', 'kar diya', 'kar do', 'kar raha', 'kar rahi',
  'pass kiya', 'pass kar', 'pass ki',
  'ke bare', 'ke baare', 'ke liye', 'ke saath', 'ke baad',
  'mein pass', 'mein padha', 'mein kiya',
  'kya hai', 'kaisa hai', 'kaisi hai', 'kaisa rahega', 'kaisa hoga',
  'batao na', 'bata do', 'bata dijiye',
  'mujhe batao', 'mujhe bata', 'mujhe chahiye',
  'kuch aur', 'kuchh aur', 'aur batao', 'aur kuch',
  'mere liye', 'mere pass', 'mere paas',
  'mai ne', 'mein ne',
  'save karo', 'save kar',
];

const AMBIGUOUS_HINGLISH_WORDS = new Set([
  'hi',
  'me',
  'the',
  'to',
  'do',
  'course',
  'pass',
  'ya',
]);

const detectHinglish = (text: string): boolean => {
  const normalized = normalize(text);
  const words = normalized
    .split(/\s+/)
    .map(word => word.replace(/[^a-z0-9.-]/g, ''))
    .filter(Boolean);
  
  const bigramCount = HINDI_BIGRAMS.filter(bg => normalized.includes(bg)).length;
  if (bigramCount >= 1) return true;
  
  let hindiWordCount = 0;
  let strongHindiWordCount = 0;
  for (const word of words) {
    if (HINDI_WORDS.has(word)) {
      hindiWordCount++;
      if (!AMBIGUOUS_HINGLISH_WORDS.has(word)) {
        strongHindiWordCount++;
      }
    }
  }
  
  if (strongHindiWordCount === 0) return false;
  if (words.length <= 5 && strongHindiWordCount >= 2) return true;
  if (words.length > 5 && strongHindiWordCount >= 2 && hindiWordCount >= 3) return true;
  if (words.length > 0 && strongHindiWordCount >= 2 && hindiWordCount / words.length >= 0.3) return true;
  
  return false;
};

const detectResponseLanguage = (
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string; image?: string | null }>
): 'en' | 'hi' => {
  if (containsDevanagari(message)) return 'hi';
  if (detectHinglish(message)) return 'hi';
  
  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-2);
  const recentHindi = recentAssistant.filter(m => {
    return containsDevanagari(m.content);
  });
  if (recentHindi.length >= 1) {
    const normalized = normalize(message);
    const words = normalized
      .split(/\s+/)
      .map(word => word.replace(/[^a-z0-9.-]/g, ''))
      .filter(Boolean);
    const hasStrongHindiWord = words.some(w => HINDI_WORDS.has(w) && !AMBIGUOUS_HINGLISH_WORDS.has(w));
    if (hasStrongHindiWord) return 'hi';
  }
  
  return 'en';
};

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
export const buildSystemPrompt = () => {
  const catalogSnapshot = PROGRAM_CATALOG.map(
    p =>
      `• ${p.name} | ${p.university} | ${p.country} | ${p.duration} | Intake: ${p.intake} | Min: ${p.eligibility}`,
  ).join('\n');

  const rulesSnapshot = APP_RULES.slice(0, 6)
    .map(r => `- ${r.text}`)
    .join('\n');

  return `You are ARIA, an AI Admission Counsellor with broad general knowledge about education and careers.

CRITICAL BEHAVIOR RULES:
1. ALWAYS read what the student EXACTLY asked and answer THAT SPECIFIC question.
2. NEVER respond with a generic catalog dump like "Here are all the courses I have in my catalog".
3. If the student has shared their education level/field, use that to FILTER and REASON over programs — do not list everything.
4. If the student asks a follow-up, continue the conversation intelligently based on prior context.
5. Keep responses concise: 2–4 sentences or a focused list of 2–3 items maximum.
6. If the student speaks Hindi or Hinglish, reply in Hindi/Hinglish (a natural mix of Hindi and English). If English, reply ONLY in English.
7. NEVER repeat the same response twice in a conversation.
8. For program recommendations — use ONLY programs from this catalog. NEVER invent programs.
9. If a user asks about ONE specific program, give details about THAT program only.
10. If a user asks after 12th → recommend only UG/Diploma programs.
11. For GENERAL education/career questions (e.g., "what can I do after 10th?", "which stream should I choose?") — use your general knowledge to give helpful, encouraging advice. You do NOT have to stick to the catalog for such questions.
12. If the student is below 12th grade, guide them on what steps to take to eventually qualify for international programs. Be warm and encouraging.

KEY RULES:
${rulesSnapshot}

PROGRAM CATALOG (for students who are 12th pass or higher):
${catalogSnapshot}`;
};


const buildLanguageInstruction = (language: 'hi' | 'en'): string =>
  language === 'hi'
    ? 'The latest user message is Hindi/Hinglish. Reply in Hinglish (a natural mix of Hindi and English, using Devanagari script or clean Roman script) so it is easy for them to read. You can keep program names in English, but write surrounding explanation/sentences in Hindi/Hinglish.'
    : 'The latest user message is English. Answer ONLY in English. NO Hindi words. Do not continue Hindi from older chat history.';

// ─── Build Ollama-compatible message contents ────────────────────────────────
const toContents = (
  history: Array<{ role: 'user' | 'assistant'; content: string; image?: string | null }>,
  userMessage: string,
  image?: string | null,
) => {
  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
    }>;
  }> = history.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const userParts: Array<{
    text?: string;
    inlineData?: { mimeType: string; data: string };
  }> = [{ text: userMessage }];

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

  contents.push({ role: 'user', parts: userParts });
  return contents;
};

const contentsToOllamaMessages = (contents: ReturnType<typeof toContents>) =>
  contents.map(item => {
    const text = item.parts.map(part => part.text || '').join('\n').trim();
    const images = item.parts
      .map(part => part.inlineData?.data)
      .filter((data): data is string => Boolean(data));

    return {
      role: item.role === 'model' ? 'assistant' : 'user',
      content: text,
      ...(images.length > 0 ? {images} : {}),
    };
  });

// ─── Core Ollama API call ────────────────────────────────────────────────────
const callGeminiRaw = async (payload: {
  systemPrompt?: string;
  contents: any[];
  temperature?: number;
  maxOutputTokens?: number;
  jsonMode?: boolean;
}): Promise<string> => {
  if (!OLLAMA_BASE_URL) {
    throw new Error('OLLAMA_BASE_URL is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const body: any = {
      model: OLLAMA_MODEL,
      messages: [
        ...(payload.systemPrompt ? [{role: 'system', content: payload.systemPrompt}] : []),
        ...contentsToOllamaMessages(payload.contents),
      ],
      stream: false,
      options: {
        temperature: payload.temperature ?? 0.2,
        top_p: 0.9,
        num_predict: payload.maxOutputTokens ?? 512,
      },
    };

    if (payload.jsonMode) {
      body.format = 'json';
    }

    const response = await fetch(
      `${OLLAMA_BASE_URL.replace(/\/+$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    const rawText = await response.text();
    const data = rawText ? JSON.parse(rawText) : {};

    if (!response.ok) {
      const errorMessage = data?.error || `Ollama error ${response.status}`;
      throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }

    const reply = data?.message?.content?.trim() || '';

    if (!reply) {
      throw new Error('Ollama returned an empty response.');
    }

    return reply;
  } finally {
    clearTimeout(timeout);
  }
};

// ─── Public API ──────────────────────────────────────────────────────────────
export const isDirectGeminiAvailable = (): boolean => Boolean(OLLAMA_BASE_URL);

export const directGeminiChat = async (
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string; image?: string | null }>,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    userImage?: string | null;
    language?: 'hi' | 'en';
    systemPrompt?: string;
  },
): Promise<string> => {
  const language = options?.language || detectResponseLanguage(userMessage, history);
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
  history: Array<{ role: 'user' | 'assistant'; content: string; image?: string | null }>,
): Promise<AssistantAnalysis | null> => {
  const greetingWords = ['hi', 'hii', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
  if (greetingWords.includes(userMessage.trim().toLowerCase())) {
    return { topic: 'general', confidence: 1, needsMoreInfo: false, summary: 'Greeting detected' };
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
English: "data science", "computer science", "cyber security", "computer", "CS", "IT", "technology", "engineering", "business", "management", "healthcare", "law", "arts"
Hindi: "\u0921\u0947\u091F\u093E \u0938\u093E\u0907\u0902\u0938", "\u0915\u0902\u092A\u094D\u092F\u0942\u091F\u0930 \u0938\u093E\u0907\u0902\u0938", "\u0915\u0902\u092A\u094D\u092F\u0942\u091F\u0930", "\u0938\u0940\u090F\u0938", "\u0906\u0908\u091F\u0940", "\u091F\u0947\u0915\u094D\u0928\u094B\u0932\u0949\u091C\u0940", "\u0907\u0902\u091C\u0940\u0928\u093F\u092F\u0930\u093F\u0902\u0917", "\u092C\u093F\u091C\u0928\u0947\u0938", "\u092E\u0948\u0928\u0947\u091C\u092E\u0947\u0902\u091F"
RULE: Extract the EXACT field the student mentioned. "data science" is NOT "computer science" \u2014 they are DIFFERENT fields. Always use the student's LATEST/MOST RECENT message to determine field if their interest changed during conversation.

CRITICAL FIELD RULES:
- "data science" \u2192 field = "data science" (NOT "computer science")
- "computer science" \u2192 field = "computer science"
- "cyber security" \u2192 field = "cyber security"
- If the student said "computer" early but later said "data science" \u2192 field = "data science" (latest intent wins)

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
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      temperature: 0,
      jsonMode: true,
      maxOutputTokens: 256,
    });

    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(cleaned) as AssistantAnalysis;
    } catch {
      return { topic: 'general', confidence: 0.5, needsMoreInfo: false, summary: 'Parse error fallback' };
    }
  } catch (err: any) {
    console.warn('[directOllama] analyzeConversation error:', err?.message);
    return { topic: 'general', confidence: 0.5, needsMoreInfo: false, summary: 'Fallback: error' };
  }
};

export const shouldUseHindiResponse = (message: string) => containsDevanagari(message);

export const summarizeDirectGeminiError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('OLLAMA_BASE_URL')) {
    return 'Set OLLAMA_BASE_URL to use direct Ollama mode.';
  }
  return 'Ollama request failed. Please check your network connection.';
};

export const isLikelyNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /network error|timeout|ECONNREFUSED|ENOTFOUND|Network request failed/i.test(message);
};

export const normalizeChatText = normalize;
