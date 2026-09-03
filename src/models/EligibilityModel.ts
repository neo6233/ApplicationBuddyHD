export interface EligibilityRequest {
  qualification?: string;
  percentage?: string;
  englishScore?: string;
  workExperience?: string;
  document?: {
    base64: string;
    mimeType?: string;
    fileName?: string;
  };
}

export interface EligibleCourse {
  name: string;
  university: string;
  country: string;
  minimumRequirement: string;
  status: 'eligible' | 'conditional' | 'not_eligible';
  reason: string;
}

export interface EligibilityResponse {
  eligibleCourses: EligibleCourse[];
  notEligibleCourses: EligibleCourse[];
  summary: string;
  recommendations: string[];
  extractedProfile?: {
    qualification?: string;
    percentage?: string;
    englishScore?: string;
    workExperience?: string;
    documentSummary?: string;
    nextStep?: string;
    sourceType?: string;
    extractionStatus?: 'read' | 'failed';
    extractionMessage?: string;
  };
}
