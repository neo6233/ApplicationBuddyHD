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

  validateProgramForm: (
    qualification: string,
    gpa: string,
    interests: string,
    preferredCountry: string,
  ): {valid: boolean; errors: Record<string, string>} => {
    const errors: Record<string, string> = {};

    if (!Validators.isNotEmpty(qualification)) {
      errors.qualification = 'Qualification is required';
    }
    if (!Validators.isNotEmpty(gpa)) {
      errors.gpa = 'GPA or percentage is required';
    }
    if (!Validators.isNotEmpty(interests)) {
      errors.interests = 'Please enter your interests';
    }
    if (!Validators.isNotEmpty(preferredCountry)) {
      errors.preferredCountry = 'Preferred country is required';
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
    if (!Validators.isNotEmpty(englishScore)) {
      errors.englishScore = 'English test score is required';
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