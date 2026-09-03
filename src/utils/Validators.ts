const Validators = {
  isNotEmpty: (value: string): boolean => {
    return value.trim().length > 0;
  },

  isValidEmail: (email: string): boolean => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
  },

  isValidGPA: (gpa: string): boolean => {
    const trimmed = gpa.trim();
    // Accept formats like: 3.5, 3.5 GPA, 75%, 75
    const numericValue = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
    if (isNaN(numericValue)) return false;
    // Could be GPA (0-4 scale) or percentage (0-100)
    return numericValue >= 0 && numericValue <= 100;
  },

  isValidPercentage: (percentage: string): boolean => {
    const trimmed = percentage.trim();
    const numericValue = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
    if (isNaN(numericValue)) return false;
    return numericValue >= 0 && numericValue <= 100;
  },

  minLength: (value: string, min: number): boolean => {
    return value.trim().length >= min;
  },

  maxLength: (value: string, max: number): boolean => {
    return value.trim().length <= max;
  },

  hasRecognizableQualification: (qualification: string): boolean => {
    const text = qualification.toLowerCase().replace(/\s+/g, ' ').trim();
    return [
      '10th',
      '12th',
      'class 10',
      'class 12',
      'high school',
      'secondary',
      'intermediate',
      'diploma',
      'bachelor',
      "bachelor's",
      'btech',
      'b.tech',
      'bsc',
      'b.sc',
      'be',
      'b.e',
      'bba',
      'graduate',
      'graduation',
      'master',
      'msc',
      'm.tech',
      'mtech',
      'mba',
      'postgraduate',
    ].some(keyword => text.includes(keyword));
  },

  hasRecognizableInterest: (interests: string): boolean => {
    const text = interests.toLowerCase().replace(/\s+/g, ' ').trim();
    return [
      'computer',
      'software',
      'coding',
      'programming',
      'it',
      'technology',
      'data',
      'ai',
      'artificial intelligence',
      'machine learning',
      'business',
      'management',
      'finance',
      'marketing',
      'engineering',
      'math',
      'science',
      'biology',
      'medical',
      'health',
      'nursing',
      'pharmacy',
      'education',
      'teaching',
      'law',
      'design',
      'arts',
      'cyber',
      'security',
    ].some(keyword => text.includes(keyword));
  },

  hasRecognizableCountry: (country: string): boolean => {
    const text = country.toLowerCase().replace(/\s+/g, ' ').trim();
    return [
      'any',
      'no preference',
      'uk',
      'united kingdom',
      'england',
      'usa',
      'us',
      'united states',
      'america',
      'canada',
      'australia',
      'new zealand',
      'germany',
    ].some(keyword => text === keyword || text.includes(keyword));
  },

  validateProgramForm: (
    qualification: string,
    gpa: string,
    interests: string,
    preferredCountry: string,
  ): {valid: boolean; errors: Record<string, string>} => {
    const errors: Record<string, string> = {};

    if (!Validators.isNotEmpty(qualification)) {
      errors.qualification = 'Qualification is required';
    } else if (!Validators.hasRecognizableQualification(qualification)) {
      errors.qualification = 'Enter a real qualification, e.g. 12th Science or B.Tech Computer Science';
    }
    if (!Validators.isNotEmpty(gpa)) {
      errors.gpa = 'GPA or percentage is required';
    } else if (!Validators.isValidGPA(gpa)) {
      errors.gpa = 'Enter a valid score, e.g. 75%, 8.1 CGPA, or 3.2 GPA';
    }
    if (!Validators.isNotEmpty(interests)) {
      errors.interests = 'Please enter your interests';
    } else if (!Validators.hasRecognizableInterest(interests)) {
      errors.interests = 'Enter a study interest like computer science, business, data, engineering, health, or design';
    }
    if (!Validators.isNotEmpty(preferredCountry)) {
      errors.preferredCountry = 'Preferred country is required';
    } else if (!Validators.hasRecognizableCountry(preferredCountry)) {
      errors.preferredCountry = 'Choose a supported country like Canada, UK, USA, Australia, Germany, or type Any';
    }

    return {valid: Object.keys(errors).length === 0, errors};
  },

  validateEligibilityForm: (
    qualification: string,
    percentage: string,
    englishScore: string,
  ): {valid: boolean; errors: Record<string, string>} => {
    const errors: Record<string, string> = {};

    if (!Validators.isNotEmpty(qualification)) {
      errors.qualification = 'Qualification is required';
    }
    if (!Validators.isNotEmpty(percentage)) {
      errors.percentage = 'Percentage or GPA is required';
    }
    if (englishScore.trim().length > 0 && !/^[\d.\s/a-zA-Z-]+$/.test(englishScore.trim())) {
      errors.englishScore = 'Please enter a valid English score format';
    }

    return {valid: Object.keys(errors).length === 0, errors};
  },

  formatTimestamp: (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  truncateText: (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },
};

export default Validators;
