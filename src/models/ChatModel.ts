export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  image?: string | null;
  inputMode?: 'voice' | 'text';
  responseLanguage?: 'hi' | 'en';
  responseType?: 'recommendation' | 'detail' | 'general' | 'save_confirmation';
  programs?: Array<{
    name: string;
    university: string;
    country: string;
    duration: string;
    intake: string;
    eligibility: string;
    careerOpportunities: string[];
    matchScore: number;
  }>;
  timestamp: number;
}

export interface ChatRequest {
  message: string;
  history: Array<{
    role: MessageRole;
    content: string;
    image?: string | null;
    inputMode?: Message['inputMode'];
    programs?: Message['programs'];
  }>;
  image?: string | null;
}

export interface ChatResponse {
  reply: string;
  timestamp: number;
  responseLanguage?: 'hi' | 'en';
  responseType?: 'recommendation' | 'detail' | 'general' | 'save_confirmation';
  programs?: Array<{
    name: string;
    university: string;
    country: string;
    duration: string;
    intake: string;
    eligibility: string;
    careerOpportunities: string[];
    matchScore: number;
  }>;
}