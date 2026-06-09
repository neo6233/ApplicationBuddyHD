export type ChatRole = 'user' | 'assistant';
export interface ChatHistoryMessage {
    role: ChatRole;
    content: string;
}
export type IntentType = 'greeting' | 'thanks' | 'farewell' | 'help' | 'course_finder' | 'eligibility' | 'scholarship' | 'visa' | 'admission_help' | 'fallback';
export interface IntentDecision {
    type: 'reply' | 'gemini' | 'course_catalog';
    reply?: string;
    systemPrompt?: string;
    maxOutputTokens?: number;
    temperature?: number;
    courseQuery?: CourseSlots;
}
interface CourseSlots {
    level?: string;
    field?: string;
    country?: string;
    qualification?: string;
    score?: string;
}
export declare const IntentService: {
    detect(message: string, history: ChatHistoryMessage[]): IntentType;
    buildDecision(message: string, history: ChatHistoryMessage[]): IntentDecision;
};
export {};
//# sourceMappingURL=IntentService.d.ts.map