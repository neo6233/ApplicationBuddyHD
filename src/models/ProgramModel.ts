export interface ProgramFinderRequest {
  qualification: string;
  gpa: string;
  interests: string;
  preferredCountry: string;
}

export interface Program {
  name: string;
  university: string;
  country: string;
  duration: string;
  intake: string;
  eligibility: string;
  careerOpportunities: string[];
  matchScore: number; // 0-100
}

export interface ProgramFinderResponse {
  programs: Program[];
  summary: string;
  totalFound: number;
  suggestedLevel?: 'UG' | 'PG' | 'Diploma' | 'Any';
}