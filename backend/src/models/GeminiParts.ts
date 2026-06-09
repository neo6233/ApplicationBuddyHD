export interface TextPart {
  text: string;
}

export interface InlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export type GeminiPart = TextPart | InlineDataPart;

export interface GeminiRequestPayload {
  systemPrompt?: string;
  contents: Array<{
    role: 'user' | 'model';
    parts: GeminiPart[];
  }>;
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: string;
}