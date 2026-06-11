import {PROGRAM_CATALOG, ProgramCatalogItem} from '../data/programCatalog';

// ─── Catalog snapshot injected into every prompt ─────────────────────────────
const CATALOG_SNAPSHOT = PROGRAM_CATALOG.map(
  p =>
    `• ${p.name} | ${p.university} | ${p.country} | ${p.duration} | Intake: ${p.intake} | Min: ${p.eligibility}`,
).join('\n');

// ─── System prompt (catalog-locked, 1-line replies) ───────────────────────────
const SYSTEM_PROMPT = `You are ARIA, an AI Admission Counsellor.

⚠️ CRITICAL RULES - BREAK NONE OF THESE:
1. **ONLY RECOMMEND PROGRAMS FROM THIS EXACT CATALOG.** Never create, invent, or suggest ANY program not listed.
2. **IF A PROGRAM IS NOT IN THIS CATALOG, DO NOT MENTION IT. EVER.**
3. **LANGUAGE RULE - EXTREMELY IMPORTANT:**
   - If user speaks HINDI: Reply ONLY in pure Hindi with Devanagari. NO English words. NO mixing.
   - If user speaks ENGLISH: Reply ONLY in English. NO Hindi words. NO mixing.
4. Reply in ONE short sentence (max 15 words). NEVER use bullet points, lists, or multiple sentences.
5. If asked about a program not in catalog, say: "This program is not in my catalog."
6. When recommending, list ONLY exact catalog program names.

PROGRAM CATALOG - USE ONLY EXACT NAMES FROM THIS LIST:
${CATALOG_SNAPSHOT}`;

// ─── Default system prompt for non-program queries (allows broader answers) ────
const DEFAULT_SYSTEM_PROMPT = `You are ARIA, an AI Admission Counsellor.

⚠️ CRITICAL LANGUAGE RULE:
- If user speaks HINDI: Reply ONLY in pure Hindi. NO English words EVER.
- If user speaks ENGLISH: Reply ONLY in English. NO Hindi words EVER.

Reply concisely in one sentence. Do not invent programs not in catalog.`;

// ─── Ollama config — set OLLAMA_HOST in your .env if not running locally ──────
const OLLAMA_CONFIG = {
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://192.168.6.180:5000',
  model:   process.env.OLLAMA_MODEL    || 'gemma3:4b',   // swap to any pulled model
  timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 30000),
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

// ─── Ollama message format ────────────────────────────────────────────────────
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const normalize = (text: string) =>
  text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();

const includesAny = (text: string, keywords: string[]) =>
  keywords.some(kw => text.includes(kw));

const containsDevanagari = (text: string) => /[\u0900-\u097F]/.test(text);

const detectReplyLanguage = (userMessage: string, history: Array<{role: 'user' | 'assistant'; content: string; image?: string | null}>): 'hi' | 'en' => {
  // Most reliable: Check if current message has Devanagari script
  if (containsDevanagari(userMessage)) return 'hi';
  
  // Check recent conversation for language pattern (last 3 exchanges)
  const recentHistory = history.slice(-6);
  const hasRecentHindi = recentHistory.some(item => containsDevanagari(item.content));
  if (hasRecentHindi) return 'hi';
  
  // Check for Hindi grammar patterns
  const normalized = normalize(userMessage);
  const hindiPatterns = [
    ' mujhe ', ' kya ', ' kaise ', ' kyu ', ' kyun ', ' batao ', ' chahiye ', 
    ' karna ', ' kaun ', ' kis ', ' aap ', ' hai ', ' hain ', ' aapka ', ' mere ',
    ' karte ', ' kar ', ' sakte ', ' sakta ', ' sakti '
  ];
  
  if (hindiPatterns.some(pattern => normalized.includes(pattern))) {
    return 'hi';
  }

  return 'en';
};

const normalizeImageData = (image?: string | null): string | undefined => {
  if (!image) return undefined;
  return image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
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

const inferLevel = (q: string): 'UG' | 'PG' | 'Diploma' | 'Any' => {
  const t = normalize(q);
  if (includesAny(t, ['phd', 'doctorate', 'dr.'])) return 'PG';
  if (includesAny(t, ['master', 'msc', 'ma', 'mtech', 'mba', 'pg', 'post graduate', 'postgraduate'])) return 'PG';
  if (includesAny(t, ['diploma', 'certificate', 'polytechnic'])) return 'Diploma';
  if (includesAny(t, ['bachelor', 'be', 'btech', 'b.sc', 'bba', 'undergraduate', 'ug', 'b.a', 'b.com'])) return 'UG';
  if (includesAny(t, ['12th', '12 pass', 'class 12', 'high school', 'secondary', '10th', '10 pass'])) return 'UG';
  // Hindi education levels
  if (includesAny(t, ['12वीं', '12वीं पास', 'बारहवीं', 'दसवीं', '10वीं'])) return 'UG';
  if (includesAny(t, ['स्नातक', 'स्नातकोत्तर', 'मास्टर्स', 'पीजी'])) return 'PG';
  if (includesAny(t, ['डिप्लोमा'])) return 'Diploma';
  return 'Any';
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
  const score = parseNumericScore(data.gpa);
  let total = 45;

  if (item.countries.some(c => normalize(c).includes(ct) || ct.includes(normalize(c)))) total += 20;
  if (level === item.level || level === 'Any') total += 20;
  else if (level === 'UG' && item.level === 'Diploma') total += 10;
  else if (level === 'PG' && item.level !== 'UG') total += 10;
  if (item.fields.some(f => includesAny(it, [f]))) total += 20;
  else {
    const inf = inferField(it);
    if (inf && item.fields.some(f => includesAny(normalize(f), [inf]))) total += 15;
  }
  if (score !== undefined && item.minGpa !== undefined) {
    total += score >= item.minGpa * 10 ? 10 : -10;
  }
  if (qt && item.minQualificationKeywords.some(k => qt.includes(k))) total += 10;
  return Math.max(35, Math.min(98, total));
};

// ─── Local fallback for offline / unreachable Ollama ─────────────────────────
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
    ? 'आप केवल हिंदी में जवाब दीजिए। कोई अंग्रेजी शब्द नहीं। शुद्ध हिंदी केवल।'
    : 'Answer ONLY in English. NO Hindi words. Pure English only.';

export const buildLocalProgramResponse = (data: ProgramFinderInput): ProgramFinderResponse => {
  const selected = [...PROGRAM_CATALOG]
    .map(item => ({item, matchScore: scoreCatalogItem(item, data)}))
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

// ─── OllamaService (same public API as the old GeminiService) ─────────────────
class OllamaService {
  private isEnabled(): boolean {
    return Boolean(OLLAMA_CONFIG.baseUrl);
  }

  private buildUrl(): string {
    return `${OLLAMA_CONFIG.baseUrl.replace(/\/+$/, '')}/api/chat`;
  }

  /**
   * Core Ollama call using /api/chat (OpenAI-compatible message format).
   * stream is always false so we get a single JSON response.
   */
  private async callOllama(payload: {
    systemPrompt?: string;
    messages: OllamaMessage[];
    temperature?: number;
    jsonMode?: boolean;          // sets format:"json" for structured outputs
  }): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('OLLAMA_BASE_URL is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_CONFIG.timeoutMs);

    // Prepend system message if provided
    const allMessages: OllamaMessage[] = [
      {role: 'system', content: payload.systemPrompt ?? SYSTEM_PROMPT},
      ...payload.messages,
    ];

    try {
      const response = await fetch(this.buildUrl(), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          model: OLLAMA_CONFIG.model,
          messages: allMessages,
          stream: false,
          options: {
            temperature: payload.temperature ?? 0.2,
            num_predict: 120,       // max tokens — keeps replies short
            top_p: 0.9,
          },
          ...(payload.jsonMode ? {format: 'json'} : {}),
        }),
        signal: controller.signal as any,
      });

      const rawText = await response.text();
      const data = rawText ? JSON.parse(rawText) : {};

      if (!response.ok) {
        const errorMessage = data?.error || `Ollama error ${response.status}`;
        const err = new Error(errorMessage);
        (err as any).status = response.status;
        throw err;
      }

      // Ollama /api/chat returns { message: { role, content } }
      const reply: string = data?.message?.content?.trim() || '';
      if (!reply) throw new Error('Ollama returned an empty response.');

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
      });
      const analysis = parseAssistantAnalysis(raw);
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
    },
  ): Promise<string> {
    // Convert history to Ollama message format (images ignored — use vision model if needed)
    const normalizedUserImage = normalizeImageData(options?.userImage);
    const messages: OllamaMessage[] = [
      ...history.map(msg => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as OllamaMessage['role'],
        content: msg.content,
        images: normalizeImageData(msg.image) ? [normalizeImageData(msg.image)!] : undefined,
      })),
      {
        role: 'user',
        content: userMessage,
        images: normalizedUserImage ? [normalizedUserImage] : undefined,
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

      return await this.callOllama({
        systemPrompt: promptPrefix
          ? `${promptPrefix}\n\n${selectedSystemPrompt}\n\n${languageInstruction}`
          : `${selectedSystemPrompt}\n\n${languageInstruction}`,
        messages,
        temperature: options?.temperature ?? 0.2,
      });
    } catch (err: any) {
      console.warn('[OllamaService] chat error — using local catalog fallback:', err.message);
      const localReply = buildLocalFallbackReply(userMessage, replyLanguage);
      if (localReply) return localReply;
      return "Ollama is unreachable right now. Please ensure it is running on your server.";
    }
  }

  // ── checkEligibility ───────────────────────────────────────────────────────
  async checkEligibility(data: {
    qualification: string;
    percentage: string;
    englishScore: string;
    workExperience: string;
  }): Promise<string> {
    const prompt = `Analyze eligibility strictly using the catalog below. Return JSON ONLY, no markdown.
Schema: {"eligibleCourses":[{"name":"","university":"","country":"","minimumRequirement":"","status":"eligible","reason":""}],"notEligibleCourses":[{"name":"","university":"","country":"","minimumRequirement":"","status":"not_eligible","reason":""}],"summary":"","recommendations":[]}
Student: qualification=${data.qualification}, percentage=${data.percentage}, english=${data.englishScore}, experience=${data.workExperience || 'None'}
Only use programs from the catalog. Status: eligible | conditional | not_eligible. Give 3 eligible and 2 not-eligible.`;

    return this.callOllama({
      systemPrompt: 'You are ARIA. Answer strictly from the catalog. Return JSON only.',
      messages: [{role: 'user', content: prompt}],
      temperature: 0.1,
      jsonMode: true,
    });
  }
}

export default new OllamaService();