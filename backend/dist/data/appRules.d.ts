export interface AppRule {
    id: string;
    priority: number;
    keywords: string[];
    text: string;
}
export declare const APP_RULES: AppRule[];
export declare const findRelevantAppRules: (text: string, limit?: number) => AppRule[];
//# sourceMappingURL=appRules.d.ts.map