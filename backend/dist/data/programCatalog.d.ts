export interface ProgramCatalogItem {
    name: string;
    university: string;
    country: string;
    duration: string;
    intake: string;
    eligibility: string;
    careerOpportunities: string[];
    level: 'UG' | 'PG' | 'Diploma';
    fields: string[];
    countries: string[];
    minQualificationKeywords: string[];
    minGpa?: number;
    matchScore?: number;
}
export declare const PROGRAM_CATALOG: ProgramCatalogItem[];
//# sourceMappingURL=programCatalog.d.ts.map