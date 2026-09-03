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
export declare const buildLocalProgramResponse: (data: ProgramFinderInput) => ProgramFinderResponse;
declare class GeminiService {
    private isEnabled;
    private buildUrl;
    private callOllama;
    analyzeConversation(userMessage: string, history: Array<{
        role: 'user' | 'assistant';
        content: string;
        image?: string | null;
    }>): Promise<AssistantAnalysis | null>;
    chat(userMessage: string, history: Array<{
        role: 'user' | 'assistant';
        content: string;
        image?: string | null;
    }>, options?: {
        systemPrompt?: string;
        maxOutputTokens?: number;
        temperature?: number;
        userImage?: string | null;
        language?: 'hi' | 'en';
        extraSystemPrompt?: string;
    }): Promise<string>;
    checkEligibility(data: {
        qualification: string;
        percentage: string;
        englishScore: string;
        workExperience: string;
        targetLevel?: 'UG' | 'PG' | 'Diploma' | 'Any';
    }): Promise<string>;
    extractEligibilityProfileFromDocument(data: {
        imageBase64: string;
        mimeType?: string;
        fileName?: string;
        typedQualification?: string;
        typedPercentage?: string;
        typedEnglishScore?: string;
        typedWorkExperience?: string;
    }): Promise<string>;
    extractEligibilityProfileFromTextDocument(data: {
        documentText: string;
        fileName?: string;
        typedQualification?: string;
        typedPercentage?: string;
        typedEnglishScore?: string;
        typedWorkExperience?: string;
    }): Promise<string>;
}
declare const _default: GeminiService;
export default _default;
//# sourceMappingURL=GeminiService.d.ts.map