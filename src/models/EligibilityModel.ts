export interface EligibilityRequest {
  qualification: string;
  percentage: string;
  englishScore: string;
  workExperience: string;
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
}