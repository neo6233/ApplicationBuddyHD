import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {PROGRAM_CATALOG, ProgramCatalogItem} from '../data/programCatalog';

// ─── Catalog snapshot injected into every prompt ─────────────────────────────
const CATALOG_SNAPSHOT = PROGRAM_CATALOG.map(
  p =>
    `• ${p.name} | ${p.university} | ${p.country} | ${p.duration} | Intake: ${p.intake} | Min: ${p.eligibility}`,
).join('\n');

// ─── System prompt for catalog-grounded program questions ────────────────────
const SYSTEM_PROMPT = `You are ARIA, an AI Admission Counsellor.

IMPORTANT RULES:
1. Recommend a program as available in this app only when it appears in the exact catalog below.
2. You may provide broader educational or career guidance from general knowledge, but clearly say those options are outside the current catalog.
3. LANGUAGE RULE:
   - If user speaks HINDI or HINGLISH: Reply in a natural mix of Hindi and English (Hinglish/Devanagari). Keep program names in English as listed in the catalog, but write the surrounding explanation/sentences in Hindi/Hinglish.
   - If user speaks ENGLISH: Reply ONLY in English. NO Hindi words. NO mixing.
4. Answer the latest question directly, use conversation context, and respect corrections such as "biology, not math."
5. Do not repeat a generic list. Use short paragraphs or a compact list only when useful.
6. Never invent catalog facts, eligibility requirements, universities, or availability.

PROGRAM CATALOG - USE ONLY EXACT NAMES FROM THIS LIST:
${CATALOG_SNAPSHOT}`;

// ─── Default system prompt for non-program queries (allows broader answers) ────
const DEFAULT_SYSTEM_PROMPT = `You are ARIA, an AI Admission Counsellor.

⚠️ CRITICAL LANGUAGE RULE:
- If user speaks HINDI or HINGLISH: Reply in Hindi/Hinglish (a natural mix of Hindi and English).
- If user speaks ENGLISH: Reply ONLY in English. NO Hindi words EVER.

Answer the user's actual question with concise, practical guidance. Use conversation context and respect the latest correction. You may answer general education and career questions from broad knowledge. Never claim that a program, university, or requirement exists in the app catalog unless it was provided in the conversation or catalog context.`;

// ─── Ollama config ──────────────────────────────────────────────────────────
const OLLAMA_ENV_FILE = path.resolve(__dirname, '../../.env');
let lastOllamaEnvMtimeMs = 0;

const refreshOllamaEnv = (): void => {
  try {
    const stats = fs.statSync(OLLAMA_ENV_FILE);
    if (stats.mtimeMs <= lastOllamaEnvMtimeMs) {
      return;
    }

    const fileContents = fs.readFileSync(OLLAMA_ENV_FILE, 'utf8');
    const parsed = dotenv.parse(fileContents);

    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] = value;
    }

    lastOllamaEnvMtimeMs = stats.mtimeMs;
  } catch {
    // Ignore missing or unreadable env files; runtime env stays in effect.
  }
};

const getOllamaConfig = () => {
  refreshOllamaEnv();

  return {
    baseUrl: process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL || 'gemma3:4b',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 30000),
  };
};

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface ProgramFinderInput {
  qualification: string;
  gpa: string;
  interests: string;
  preferredCountry: string;
}

interface ProgramFinderProgram {
  name: string;
  university: string;
  country: string;
  duration: string;
  intake: string;
  eligibility: string;
  careerOpportunities: string[];
  matchScore: number;
}

interface ProgramFinderResponse {
  programs: ProgramFinderProgram[];
  summary: string;
  totalFound: number;
}

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

// ─── Ollama message format ───────────────────────────────────────────────────
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toSafeText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const candidate = value as {content?: unknown; text?: unknown; message?: unknown};
    const nested = candidate.content ?? candidate.text ?? candidate.message;
    if (typeof nested === 'string') return nested;
  }
  return String(value);
};

const normalize = (text: unknown) =>
  toSafeText(text).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();

const includesAny = (text: string, keywords: string[]) =>
  keywords.some(kw => text.includes(kw));

const containsDevanagari = (text: unknown) => /[\u0900-\u097F]/.test(toSafeText(text));

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

const detectHinglish = (text: unknown): boolean => {
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

const detectReplyLanguage = (userMessage: string, history: Array<{role: 'user' | 'assistant'; content: string; image?: string | null}>): 'hi' | 'en' => {
  // Most reliable: decide from the current message only.
  if (containsDevanagari(userMessage)) return 'hi';
  if (detectHinglish(userMessage)) return 'hi';

  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-2);
  const recentHindi = recentAssistant.filter(m => {
    return containsDevanagari(m.content);
  });
  if (recentHindi.length >= 1) {
    const normalized = normalize(userMessage);
    const words = normalized
      .split(/\s+/)
      .map(word => word.replace(/[^a-z0-9.-]/g, ''))
      .filter(Boolean);
    const hasStrongHindiWord = words.some(w => HINDI_WORDS.has(w) && !AMBIGUOUS_HINGLISH_WORDS.has(w));
    if (hasStrongHindiWord) return 'hi';
  }

  return 'en';
};

const normalizeImageData = (image?: string | null): string | undefined => {
  if (!image) return undefined;
  return image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
};

const safeJsonParse = <T>(text: string): T | null => {
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
};

const parseNumericScore = (input: string): number | undefined => {
  const n = normalize(input);
  const pct = n.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (pct?.[1]) return Number(pct[1]);
  const gpa = n.match(/(\d{1,2}(?:\.\d{1,2})?)\s*(?:\/\s*10|gpa)/);
  if (gpa?.[1]) {
    const v = Number(gpa[1]);
    if (Number.isFinite(v)) return Math.min(100, Math.max(0, v * 10));
  }
  const raw = n.match(/\b(\d{1,3}(?:\.\d{1,2})?)\b/);
  if (raw?.[1]) return Number(raw[1]);
  return undefined;
};

const hasSchoolQualification = (text: string) =>
  includesAny(text, ['high school', 'secondary', '12th', '12 pass', 'class 12', '10th', '10 pass', 'intermediate']) ||
  /\b(?:after\s+(?:my\s+)?|class\s*)12\b|\b12\s*(?:pass|standard|std|grade)\b/i.test(text);

const hasBachelorQualification = (text: string) =>
  includesAny(text, ['bachelor', "bachelor's", 'bachelors', 'btech', 'b.tech', 'b.sc', 'bsc', 'bba', 'b.e', 'graduation', 'graduate', 'b.a', 'b.com']);

const COUNTRY_ALIASES: Record<string, string[]> = {
  uk: ['uk', 'united kingdom', 'england', 'britain', 'great britain'],
  usa: ['usa', 'us', 'united states', 'america'],
  canada: ['canada'],
  australia: ['australia'],
  'new zealand': ['new zealand', 'nz'],
  germany: ['germany'],
};

const inferLevel = (q: string): 'UG' | 'PG' | 'Diploma' | 'Any' => {
  const t = normalize(q);
  if (includesAny(t, ['phd', 'doctorate', 'dr.'])) return 'PG';
  if (includesAny(t, ['master', 'msc', 'mtech', 'mba', 'post graduate', 'postgraduate']) || /\b(?:ma|pg)\b/i.test(t)) return 'PG';
  if (includesAny(t, ['diploma', 'certificate', 'polytechnic'])) return 'Diploma';
  if (hasBachelorQualification(t) || includesAny(t, ['undergraduate', 'ug'])) return 'UG';
  if (hasSchoolQualification(t)) return 'UG';
  // Hindi education levels
  if (includesAny(t, ['12वीं', '12वीं पास', 'बारहवीं', 'दसवीं', '10वीं'])) return 'UG';
  if (includesAny(t, ['स्नातक', 'स्नातकोत्तर', 'मास्टर्स', 'पीजी'])) return 'PG';
  if (includesAny(t, ['डिप्लोमा'])) return 'Diploma';
  return 'Any';
};

const inferNextLevel = (qualification: string): 'UG' | 'PG' | 'Diploma' | 'Any' => {
  const t = normalize(qualification);
  if (hasBachelorQualification(t) || includesAny(t, ['undergraduate'])) return 'PG';
  if (includesAny(t, ['master', 'msc', 'mtech', 'mba', 'post graduate', 'postgraduate']) || /\b(?:ma|pg)\b/i.test(t)) return 'PG';
  if (includesAny(t, ['diploma', 'certificate', 'polytechnic'])) return 'UG';
  if (hasSchoolQualification(t)) return 'UG';
  return 'Any';
};

const countryMatches = (programCountry: string, preferredCountry: string): boolean => {
  const preferred = normalize(preferredCountry);
  const catalogCountry = normalize(programCountry);
  if (!preferred) return false;
  if (catalogCountry.includes(preferred) || preferred.includes(catalogCountry)) return true;
  return Object.values(COUNTRY_ALIASES).some(
    aliases =>
      aliases.includes(catalogCountry) &&
      aliases.some(alias => preferred.includes(alias)),
  );
};

const hasMinimalProfileInfo = (profile: any): boolean => {
  // We need at least level AND field to have minimal info
  const hasLevel = profile?.level && profile.level !== 'Any' && profile.level.trim().length > 0;
  const hasField = profile?.field && profile.field.trim().length > 0;
  return hasLevel && hasField;
};

const inferField = (text: string): string | undefined => {
  const n = normalize(text);
  const patterns: Array<{keywords: string[]; value: string}> = [
    {keywords: ['computer science', 'software', 'programmer', 'developer', 'engineer', 'it', 'technology', 'coding'], value: 'technology'},
    {keywords: ['data science', 'machine learning', 'ai', 'artificial intelligence', 'analytics'], value: 'data'},
    {keywords: ['business', 'management', 'commerce', 'finance', 'marketing', 'mba', 'bba'], value: 'business'},
    {keywords: ['engineering', 'civil', 'mechanical', 'electrical', 'electronics', 'chemical'], value: 'engineering'},
    {keywords: ['healthcare', 'nursing', 'pharmacy', 'medical', 'biology', 'doctor', 'nurse'], value: 'health'},
    {keywords: ['education', 'teaching', 'teacher', 'academic'], value: 'education'},
    {keywords: ['law', 'legal', 'lawyer', 'llb'], value: 'law'},
    {keywords: ['design', 'arts', 'media', 'animation', 'graphic'], value: 'arts'},
    {keywords: ['cyber security', 'cybersecurity', 'security', 'hacking'], value: 'security'},
  ];
  return patterns.find(p => includesAny(n, p.keywords))?.value;
};

const scoreCatalogItem = (item: ProgramCatalogItem, data: ProgramFinderInput): number => {
  const qt = normalize(data.qualification);
  const it = normalize(data.interests);
  const ct = normalize(data.preferredCountry);
  const level = inferLevel(data.qualification);
  const nextLevel = inferNextLevel(data.qualification);
  const score = parseNumericScore(data.gpa);
  const schoolLevelOnly = hasSchoolQualification(qt) && !hasBachelorQualification(qt);

  if (schoolLevelOnly && item.level === 'PG') return -999;
  if (hasBachelorQualification(qt) && item.level !== 'PG') return -999;
  if (level === 'PG' && (item.level === 'UG' || item.level === 'Diploma')) return -999;

  let total = 15;

  if (ct) {
    if (countryMatches(item.country, ct)) total += 20;
    else if (item.countries.some(c => countryMatches(c, ct))) total += 5;
    else total -= 8;
  }
  if (nextLevel === item.level) total += 20;
  else if (level === item.level || level === 'Any') total += 10;
  else if (level === 'UG' && item.level === 'Diploma') total -= 15;
  else if (level === 'PG' && item.level !== 'UG') total += 5;
  if (item.fields.some(f => includesAny(it, [f]))) total += 30;
  else {
    const inf = inferField(it);
    if (inf && item.fields.some(f => includesAny(normalize(f), [inf]))) total += 18;
    else if (it) total -= 20;
  }
  if (score !== undefined && item.minGpa !== undefined) {
    total += score >= item.minGpa * 10 ? 15 : -15;
  }
  if (qt && item.minQualificationKeywords.some(k => qt.includes(k))) total += 5;
  return Math.max(35, Math.min(98, total));
};

// ─── Local fallback for offline / unreachable Ollama ────────────────────────
const buildLocalFallbackReply = (userMessage: string, language: 'hi' | 'en' = 'en'): string | null => {
  const msg = normalize(userMessage);
  if (includesAny(msg, ['duration', 'how long', 'years', 'months'])) {
    const match = PROGRAM_CATALOG.find(p =>
      normalize(p.name).split(' ').some(w => msg.includes(w) && w.length > 4),
    );
    if (match) {
      return language === 'hi'
        ? `${match.name} की अवधि ${match.duration} है.`
        : `${match.name} is ${match.duration} long.`;
    }
    return language === 'hi'
      ? 'पाठ्यक्रम की अवधि स्तर और देश के अनुसार 1 से 4 वर्ष तक होती है.'
      : 'Programs range from 1 to 4 years depending on level and country.';
  }
  if (includesAny(msg, ['eligib', 'minimum', 'qualification', 'require', 'criteria'])) {
    const match = PROGRAM_CATALOG.find(p =>
      normalize(p.name).split(' ').some(w => msg.includes(w) && w.length > 4),
    );
    if (match) {
      return language === 'hi'
        ? `${match.name} के लिए पात्रता: ${match.eligibility}.`
        : `Minimum for ${match.name}: ${match.eligibility}.`;
    }
  }
  if (includesAny(msg, ['intake', 'when', 'start', 'semester'])) {
    const match = PROGRAM_CATALOG.find(p =>
      normalize(p.name).split(' ').some(w => msg.includes(w) && w.length > 4),
    );
    if (match) {
      return language === 'hi'
        ? `${match.name} का intake ${match.intake} है.`
        : `${match.name} intake is ${match.intake}.`;
    }
  }
  return null;
};

const buildLanguageInstruction = (language: 'hi' | 'en'): string =>
  language === 'hi'
    ? 'The latest user message is Hindi/Hinglish. Reply in Hinglish (a natural mix of Hindi and English, using Devanagari script or clean Roman script) so it is easy for them to read. You can keep program names in English, but write surrounding explanation/sentences in Hindi/Hinglish.'
    : 'The latest user message is English. Answer ONLY in English. NO Hindi words. Do not continue Hindi from older chat history.';

export const buildLocalProgramResponse = (data: ProgramFinderInput): ProgramFinderResponse => {
  const nextLevel = inferNextLevel(data.qualification);
  const selected = [...PROGRAM_CATALOG]
    .filter(item => nextLevel === 'Any' || item.level === nextLevel)
    .map(item => ({item, matchScore: scoreCatalogItem(item, data)}))
    .filter(item => item.matchScore === 35 || item.matchScore >= 60)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  return {
    programs: selected.map(({item, matchScore}) => ({
      name: item.name,
      university: item.university,
      country: item.country,
      duration: item.duration,
      intake: item.intake,
      eligibility: item.eligibility,
      careerOpportunities: item.careerOpportunities,
      matchScore,
    })),
    summary:
      selected.length > 0
        ? `Found ${selected.length} matching programs from the catalog.`
        : 'No strong match found — please refine your inputs.',
    totalFound: selected.length,
  };
};

const parseAssistantAnalysis = (text: string): AssistantAnalysis | null => {
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as AssistantAnalysis;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

// ─── GeminiService (same public API, Ollama-backed implementation) ──────────
class GeminiService {
  private isEnabled(): boolean {
    return Boolean(getOllamaConfig().baseUrl);
  }

  private buildUrl(): string {
    return `${getOllamaConfig().baseUrl.replace(/\/+$/, '')}/api/chat`;
  }

  private async callOllama(payload: {
    systemPrompt?: string;
    messages: OllamaMessage[];
    temperature?: number;
    jsonMode?: boolean;
    maxOutputTokens?: number;
  }): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('OLLAMA_BASE_URL is not configured');
    }

    const {model, timeoutMs} = getOllamaConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const messages: OllamaMessage[] = [
      {role: 'system', content: payload.systemPrompt || DEFAULT_SYSTEM_PROMPT},
      ...payload.messages,
    ];

    try {
      const response = await fetch(this.buildUrl(), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: payload.temperature ?? 0.2,
            top_p: 0.9,
            num_predict: payload.maxOutputTokens ?? 120,
          },
          ...(payload.jsonMode ? {format: 'json'} : {}),
        }),
        signal: controller.signal as any,
      });

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

      console.log('[OllamaService] Reply:', reply.slice(0, 120));
      return reply;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── analyzeConversation ────────────────────────────────────────────────────
  async analyzeConversation(
    userMessage: string,
    history: Array<{role: 'user' | 'assistant'; content: string; image?: string | null}>,
  ): Promise<AssistantAnalysis | null> {
    const greetingWords = ['hi', 'hii', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
    if (greetingWords.includes(userMessage.trim().toLowerCase())) {
      return {topic: 'general', confidence: 1, needsMoreInfo: false, summary: 'Greeting detected'};
    }

    const conversationText = history
      .map(i => `${i.role.toUpperCase()}: ${i.content}`)
      .join('\n');

    const prompt = `ANALYZE conversation. Extract ALL profile info NOW. Return JSON only.

CRITICAL - EXTRACT THESE IMMEDIATELY:

LEVEL KEYWORDS (if found → set level):
English: "12th", "12th pass", "secondary", "intermediate", "diploma", "bachelor", "B.Tech", "Masters", "MBA", "PG"
Hindi: "12वीं", "बारहवीं", "इंटरमीडिएट", "डिप्लोमा", "स्नातक", "मास्टर्स", "एमबीए"
RULE: If ANY of these found → set level. "12th/12वीं/Intermediate/इंटरमीडिएट" = "UG"

FIELD KEYWORDS (if found → set field):
English: "computer", "CS", "IT", "technology", "data science", "engineering", "business", "management", "healthcare", "law", "arts"
Hindi: "कंप्यूटर", "सीएस", "आईटी", "टेक्नोलॉजी", "डेटा साइंस", "इंजीनियरिंग", "बिजनेस", "मैनेजमेंट"
RULE: If ANY of these found → extract exact field name

SCORE KEYWORDS: "%", "GPA", "percentage", "points"

JSON schema: {"topic":"course|eligibility|scholarship|visa|general","confidence":0.0,"needsMoreInfo":false,"followUpQuestion":"","summary":"","profile":{"level":"UG|PG|Diploma|","field":"","country":"","qualification":"","score":"","englishScore":"","workExperience":""}}

needsMoreInfo logic: TRUE ONLY if topic="course" AND level="" AND field="" (both empty)
OTHERWISE needsMoreInfo=false

Conversation:
${conversationText}
USER: ${userMessage}`;

    try {
      const raw = await this.callOllama({
        systemPrompt: 'You are a strict JSON analyzer. Extract ALL available student profile information from the conversation. Return valid JSON only, no extra text.',
        messages: [{role: 'user', content: prompt}],
        temperature: 0,
        jsonMode: true,
        maxOutputTokens: 256,
      });
      const analysis = safeJsonParse<AssistantAnalysis>(raw) || parseAssistantAnalysis(raw);
      console.log('[PARSED ANALYSIS]', JSON.stringify(analysis, null, 2));
      return analysis;
    } catch (err: any) {
      console.warn('[OllamaService] analyzeConversation error — defaulting to general:', err.message);
      return {topic: 'general', confidence: 0.5, needsMoreInfo: false, summary: 'Fallback: error'};
    }
  }

  // ── chat ───────────────────────────────────────────────────────────────────
  async chat(
    userMessage: string,
    history: Array<{role: 'user' | 'assistant'; content: string; image?: string | null}>,
    options?: {
      systemPrompt?: string;
      maxOutputTokens?: number;
      temperature?: number;
      userImage?: string | null;
      language?: 'hi' | 'en';
      extraSystemPrompt?: string;
    },
  ): Promise<string> {
    const normalizedUserImage = normalizeImageData(options?.userImage);
    const messages: OllamaMessage[] = [
      ...history.map(msg => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as OllamaMessage['role'],
        content: toSafeText(msg.content),
        ...(normalizeImageData(msg.image) ? {images: [normalizeImageData(msg.image)!]} : {}),
      })),
      {
        role: 'user',
        content: userMessage,
        ...(normalizedUserImage ? {images: [normalizedUserImage]} : {}),
      },
    ];

    const hasImageAttachment = Boolean(normalizedUserImage);
    const replyLanguage = options?.language || detectReplyLanguage(userMessage, history);

    const promptPrefix = hasImageAttachment
      ? 'The user attached an image. Inspect the image carefully and answer based on what is visible in it.'
      : '';

    // Choose system prompt: use catalog-locked prompt only for program/course queries.
    try {
      let selectedSystemPrompt: string | undefined = options?.systemPrompt;

      if (!selectedSystemPrompt) {
        let analysis: AssistantAnalysis | null = null;
        try {
          analysis = await this.analyzeConversation(userMessage, history);
        } catch (e) {
          analysis = null;
        }

        const isCourseTopic = analysis?.topic === 'course' || includesAny(normalize(userMessage), [
          'program', 'course', 'degree', 'university', 'study abroad', 'intake', 'eligib', 'eligibility', 'intake', 'duration', 'admission', 'major', 'msc', 'mtech', 'mba', 'bachelor', 'master', 'phd'
        ]);

        selectedSystemPrompt = isCourseTopic ? SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;
      }

      const languageInstruction = buildLanguageInstruction(replyLanguage);
      const knowledgePrompt = options?.extraSystemPrompt
        ? `${options.extraSystemPrompt}\n\n`
        : '';

      return await this.callOllama({
        systemPrompt: promptPrefix
          ? `${promptPrefix}\n\n${knowledgePrompt}${selectedSystemPrompt}\n\n${languageInstruction}`
          : `${knowledgePrompt}${selectedSystemPrompt}\n\n${languageInstruction}`,
        messages,
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxOutputTokens ?? 256,
      });
    } catch (err: any) {
      console.warn('[OllamaService] chat error — using local catalog fallback:', err.message);
      const localReply = buildLocalFallbackReply(userMessage, replyLanguage);
      if (localReply) return localReply;
      return 'Ollama is unreachable right now. Please ensure the Ollama service is running.';
    }
  }

  // ── checkEligibility ───────────────────────────────────────────────────────
  async checkEligibility(data: {
    qualification: string;
    percentage: string;
    englishScore: string;
    workExperience: string;
    targetLevel?: 'UG' | 'PG' | 'Diploma' | 'Any';
  }): Promise<string> {
    const prompt = `Analyze eligibility strictly using the catalog below. Return JSON ONLY, no markdown.
Schema: {"eligibleCourses":[{"name":"","university":"","country":"","minimumRequirement":"","status":"eligible","reason":""}],"notEligibleCourses":[{"name":"","university":"","country":"","minimumRequirement":"","status":"not_eligible","reason":""}],"summary":"","recommendations":[]}
Student: qualification=${data.qualification}, percentage=${data.percentage}, english=${data.englishScore || 'Not provided (optional)'}, experience=${data.workExperience || 'None'}, targetLevel=${data.targetLevel || 'Any'}
Rules:
1. English score is optional. Do not treat a missing English score as a hard rejection.
2. Use targetLevel to decide which catalog level to focus on. If targetLevel is PG, recommend postgraduate options only. If targetLevel is UG, recommend undergraduate options only.
3. If qualification indicates 12th/high school/secondary only, do not mark master's/postgraduate programs eligible.
4. If qualification indicates bachelor/graduation, do not return bachelor programs as eligible next-step options.
5. Status: eligible | conditional | not_eligible. Give the 3 best eligible/conditional matches and 2 not-eligible examples.`;

    return this.callOllama({
      systemPrompt: 'You are ARIA, a thoughtful admissions advisor. Use the catalog, think through the student profile, and return JSON only.',
      messages: [{role: 'user', content: prompt}],
      temperature: 0.1,
      jsonMode: true,
      maxOutputTokens: 1024,
    });
  }

  async extractEligibilityProfileFromDocument(data: {
    imageBase64: string;
    mimeType?: string;
    fileName?: string;
    typedQualification?: string;
    typedPercentage?: string;
    typedEnglishScore?: string;
    typedWorkExperience?: string;
  }): Promise<string> {
    const prompt = `Read the uploaded student document carefully. It may be a 12th marksheet, bachelor marksheet/transcript, degree certificate, or resume.

Return JSON ONLY, no markdown.
Schema:
{"qualification":"","percentage":"","englishScore":"","workExperience":"","documentSummary":"","nextStep":"","confidence":0.0}

Extraction rules:
1. Use only details visible in the document plus the typed corrections below.
2. Prefer typed corrections if they conflict with the document.
3. qualification should be the highest completed or clearly current qualification, e.g. "12th Science", "Bachelor of Engineering", "B.Tech Computer Science".
4. percentage should be an overall percentage/GPA/CGPA if visible. If only CGPA is visible, keep it as written, e.g. "8.1 CGPA".
5. englishScore should include IELTS/PTE/TOEFL only if visible or typed.
6. workExperience should summarize resume experience only if visible or typed.
7. documentSummary should briefly say what document was read and the key academic facts.
8. nextStep should say what the student can do next: UG/Diploma after 12th, PG/Master after bachelor, or improve marks/clear qualification if not eligible.
9. If a value is not visible, return an empty string for that field.

Typed corrections:
qualification=${data.typedQualification || ''}
percentage=${data.typedPercentage || ''}
englishScore=${data.typedEnglishScore || ''}
workExperience=${data.typedWorkExperience || ''}
fileName=${data.fileName || ''}`;

    return this.callOllama({
      systemPrompt: 'You are ARIA document reader. Extract student academic profile accurately from uploaded education documents. Return JSON only.',
      messages: [
        {
          role: 'user',
          content: prompt,
          images: [normalizeImageData(data.imageBase64) || data.imageBase64],
        },
      ],
      temperature: 0.05,
      jsonMode: true,
      maxOutputTokens: 360,
    });
  }

  async extractEligibilityProfileFromTextDocument(data: {
    documentText: string;
    fileName?: string;
    typedQualification?: string;
    typedPercentage?: string;
    typedEnglishScore?: string;
    typedWorkExperience?: string;
  }): Promise<string> {
    const prompt = `Read the extracted text from the uploaded student document carefully. It may be a 12th marksheet, bachelor marksheet/transcript, degree certificate, or resume.

Return JSON ONLY, no markdown.
Schema:
{"qualification":"","percentage":"","englishScore":"","workExperience":"","documentSummary":"","nextStep":"","confidence":0.0}

Extraction rules:
1. Use only details visible in the document text plus the typed corrections below.
2. Prefer typed corrections if they conflict with the document text.
3. qualification should be the highest completed or clearly current qualification, e.g. "12th Science", "Bachelor of Engineering", "B.Tech Computer Science".
4. percentage should be an overall percentage/GPA/CGPA if visible. If only CGPA is visible, keep it as written, e.g. "8.1 CGPA".
5. englishScore should include IELTS/PTE/TOEFL only if visible or typed.
6. workExperience should summarize resume experience only if visible or typed.
7. documentSummary should briefly say what document was read and the key academic facts.
8. nextStep should say what the student can do next: UG/Diploma after 12th, PG/Master after bachelor, or improve marks/clear qualification if not eligible.
9. If a value is not visible, return an empty string for that field.

Typed corrections:
qualification=${data.typedQualification || ''}
percentage=${data.typedPercentage || ''}
englishScore=${data.typedEnglishScore || ''}
workExperience=${data.typedWorkExperience || ''}
fileName=${data.fileName || ''}

Document text:
${data.documentText.slice(0, 12000)}`;

    return this.callOllama({
      systemPrompt: 'You are ARIA document reader. Extract student academic profile accurately from uploaded education documents. Return JSON only.',
      messages: [{role: 'user', content: prompt}],
      temperature: 0.05,
      jsonMode: true,
      maxOutputTokens: 360,
    });
  }
}

export default new GeminiService();
