import {PROGRAM_CATALOG} from '../data/programCatalog';

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
  (typeof process !== 'undefined' && (process as any)?.env?.GEMINI_TIMEOUT_MS) || 12000,
);

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const containsDevanagari = (text: string) => /[\u0900-\u097F]/.test(text);

const buildSystemPrompt = () => {
  const catalogSnapshot = PROGRAM_CATALOG.map(
    p =>
      `• ${p.name} | ${p.university} | ${p.country} | ${p.duration} | Intake: ${p.intake} | Min: ${p.eligibility}`,
  ).join('\n');

  return `You are ARIA, an AI Admission Counsellor.

STRICT RULES:
1. Reply in one short sentence.
2. Use only programs from this catalog.
3. If the user speaks Hindi, reply only in Hindi.
4. If the user speaks English, reply only in English.
5. If the user asks "after 12th", "12th pass", or similar, do not assume a postgraduate program from earlier messages.
6. Answer the current message, not just the last suggested program.

PROGRAM CATALOG:
${catalogSnapshot}`;
};

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
  }> = [
    {text: userMessage},
  ];

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

export const isDirectGeminiAvailable = (): boolean => Boolean(GEMINI_API_KEY);

export const directGeminiChat = async (
  userMessage: string,
  history: Array<{role: 'user' | 'assistant'; content: string; image?: string | null}>,
  options?: {temperature?: number; maxOutputTokens?: number; userImage?: string | null},
): Promise<string> => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured for direct chat mode.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL.replace(/\/+$/, '')}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          systemInstruction: {parts: [{text: buildSystemPrompt()}]},
          contents: toContents(history, userMessage, options?.userImage ?? null),
          generationConfig: {
            temperature: options?.temperature ?? 0.2,
            topP: 0.9,
            maxOutputTokens: options?.maxOutputTokens ?? 256,
          },
        }),
        signal: controller.signal,
      },
    );

    const rawText = await response.text();
    const data = rawText ? JSON.parse(rawText) : {};

    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.error || `Gemini error ${response.status}`;
      throw new Error(errorMessage);
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

export const shouldUseHindiResponse = (message: string, history: Array<{role: 'user' | 'assistant'; content: string}>) =>
  containsDevanagari(message) || history.slice(-6).some(item => containsDevanagari(item.content));

export const summarizeDirectGeminiError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('GEMINI_API_KEY')) {
    return 'Set GEMINI_API_KEY to use direct Gemini mode, or start the backend.';
  }
  return 'Direct Gemini request failed.';
};

export const isLikelyNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /network error|timeout|ECONNREFUSED|ENOTFOUND|Network request failed/i.test(message);
};

export const normalizeChatText = normalize;
