import {PROGRAM_CATALOG, ProgramCatalogItem} from '../data/programCatalog';

// ─── Catalog snapshot injected into every prompt ─────────────────────────────
const CATALOG_SNAPSHOT = PROGRAM_CATALOG.map(
  p =>
    `• ${p.name} | ${p.university} | ${p.country} | ${p.duration} | Intake: ${p.intake} | Min: ${p.eligibility}`,
).join('\n');

// ─── System prompt (catalog-locked, 1-line replies) ───────────────────────────
const SYSTEM_PROMPT = `You are ARIA, an AI Admission Counsellor.

STRICT RULES — follow every one of them, no exceptions:
1. You ONLY answer using the program catalog listed below. Never invent courses, universities, or requirements not in the catalog.
2. If the answer is not in the catalog, say: "I don't have that info in my catalog right now."
3. Reply in ONE short sentence (max 20 words). Never use bullet lists or long paragraphs.
4. If the user greets you, reply naturally in one sentence.
5. Ask only ONE follow-up question at a time when you need more info.

PROGRAM CATALOG:
${CATALOG_SNAPSHOT}`;

// ─── Ollama config — set OLLAMA_HOST in your .env if not running locally ──────
const OLLAMA_CONFIG = {
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  model:   process.env.OLLAMA_MODEL    || 'llama3.2',   // swap to any pulled model
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const normalize = (text: string) =>
  text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();

const includesAny = (text: string, keywords: string[]) =>
  keywords.some(kw => text.includes(kw));

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
  if (includesAny(t, ['phd', 'doctorate'])) return 'PG';
  if (includesAny(t, ['master', 'msc', 'ma', 'mtech', 'mba', 'pg'])) return 'PG';
  if (includesAny(t, ['diploma', 'certificate'])) return 'Diploma';
  if (includesAny(t, ['bachelor', 'be', 'btech', 'b.sc', 'bba', 'undergraduate'])) return 'UG';
  if (includesAny(t, ['high school', 'secondary', '12th', '10th'])) return 'UG';
  return 'Any';
};

const inferField = (text: string): string | undefined => {
  const n = normalize(text);
  const patterns: Array<{keywords: string[]; value: string}> = [
    {keywords: ['computer science', 'software', 'it', 'technology'], value: 'technology'},
    {keywords: ['data science', 'machine learning', 'ai', 'artificial intelligence'], value: 'data'},
    {keywords: ['business', 'management', 'commerce', 'finance', 'marketing'], value: 'business'},
    {keywords: ['engineering', 'civil', 'mechanical', 'electrical', 'electronics'], value: 'engineering'},
    {keywords: ['healthcare', 'nursing', 'pharmacy', 'medical', 'biology'], value: 'health'},
    {keywords: ['education', 'teaching'], value: 'education'},
    {keywords: ['law', 'legal'], value: 'law'},
    {keywords: ['design', 'arts', 'media', 'animation'], value: 'arts'},
    {keywords: ['cyber security', 'cybersecurity', 'security'], value: 'security'},
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
const buildLocalFallbackReply = (userMessage: string): string | null => {
  const msg = normalize(userMessage);
  if (includesAny(msg, ['duration', 'how long', 'years', 'months'])) {
    const match = PROGRAM_CATALOG.find(p =>
      normalize(p.name).split(' ').some(w => msg.includes(w) && w.length > 4),
    );
    if (match) return `${match.name} is ${match.duration} long.`;
    return `Programs range from 1 to 4 years depending on level and country.`;
  }
  if (includesAny(msg, ['eligib', 'minimum', 'qualification', 'require', 'criteria'])) {
    const match = PROGRAM_CATALOG.find(p =>
      normalize(p.name).split(' ').some(w => msg.includes(w) && w.length > 4),
    );
    if (match) return `Minimum for ${match.name}: ${match.eligibility}.`;
  }
  if (includesAny(msg, ['intake', 'when', 'start', 'semester'])) {
    const match = PROGRAM_CATALOG.find(p =>
      normalize(p.name).split(' ').some(w => msg.includes(w) && w.length > 4),
    );
    if (match) return `${match.name} intake is ${match.intake}.`;
  }
  return null;
};

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

    const prompt = `Analyze this student conversation. Return JSON only, no markdown, no explanation.
Greetings = topic:"general". Casual talk = topic:"general".
topic:"course" ONLY when user asks about programs/degrees/universities/study abroad.
JSON schema: {"topic":"course|eligibility|scholarship|visa|general","confidence":0.0,"needsMoreInfo":true,"followUpQuestion":"","summary":"","profile":{"level":"","field":"","country":"","qualification":"","score":"","englishScore":"","workExperience":""}}

Conversation:
${conversationText}
USER: ${userMessage}`;

    try {
      const raw = await this.callOllama({
        systemPrompt: 'You are a strict JSON analyzer. Return valid JSON only, no extra text.',
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
    },
  ): Promise<string> {
    // Convert history to Ollama message format (images ignored — use vision model if needed)
    const messages: OllamaMessage[] = [
      ...history.map(msg => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as OllamaMessage['role'],
        content: msg.content,
      })),
      {role: 'user', content: userMessage},
    ];

    try {
      return await this.callOllama({
        systemPrompt: options?.systemPrompt ?? SYSTEM_PROMPT,
        messages,
        temperature: options?.temperature ?? 0.2,
      });
    } catch (err: any) {
      console.warn('[OllamaService] chat error — using local catalog fallback:', err.message);
      const localReply = buildLocalFallbackReply(userMessage);
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