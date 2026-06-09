export type ChatRole = 'user' | 'assistant';

export interface ChatHistoryMessage {
  role: ChatRole;
  content: string;
}

export type IntentType =
  | 'greeting'
  | 'thanks'
  | 'farewell'
  | 'help'
  | 'course_finder'
  | 'eligibility'
  | 'scholarship'
  | 'visa'
  | 'admission_help'
  | 'fallback';

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

interface EligibilitySlots {
  qualification?: string;
  score?: string;
  englishScore?: string;
  workExperience?: string;
}

const COURSE_KEYWORDS = [
  'course',
  'courses',
  'program',
  'programs',
  'study',
  'studies',
  'subject',
  'subjects',
  'major',
  'admission help',
];

const ELIGIBILITY_KEYWORDS = [
  'eligible',
  'eligibility',
  'qualification',
  'qualify',
  'gpa',
  'percentage',
  'marks',
  'ielts',
  'pte',
  'toefl',
  'work experience',
];

const SCHOLARSHIP_KEYWORDS = ['scholarship', 'scholarships', 'funding', 'financial aid'];
const VISA_KEYWORDS = ['visa', 'immigration', 'migration', 'permit'];
const GREETING_KEYWORDS = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
const THANKS_KEYWORDS = ['thank you', 'thanks', 'thx', 'appreciate'];
const FAREWELL_KEYWORDS = ['bye', 'goodbye', 'see you', 'later'];
const HELP_KEYWORDS = ['help', 'what can you do', 'how can you help', 'talk with aria'];

const LEVEL_PATTERNS: Array<{pattern: RegExp; value: string}> = [
  {pattern: /\b(ug|undergraduate|bachelor(?:'s)?|bsc|ba|be|b\.tech|btech)\b/i, value: 'UG'},
  {pattern: /\b(pg|postgraduate|master(?:'s)?|msc|ma|m\.tech|mtech|phd|doctorate)\b/i, value: 'PG'},
  {pattern: /\b(diploma|certificate|certification)\b/i, value: 'Diploma / Certificate'},
];

const FIELD_PATTERNS: Array<{pattern: RegExp; value: string}> = [
  {pattern: /\b(computer science|cs|software|it|information technology)\b/i, value: 'Computer Science / IT'},
  {pattern: /\b(data science|machine learning|ai|artificial intelligence)\b/i, value: 'Data Science / AI'},
  {pattern: /\b(engineering|civil|mechanical|electrical|electronics)\b/i, value: 'Engineering'},
  {pattern: /\b(business|management|commerce|finance|accounting|marketing|economics)\b/i, value: 'Business / Commerce'},
  {pattern: /\b(healthcare|nursing|pharmacy|medicine|medical|biology|biomedical)\b/i, value: 'Healthcare / Life Sciences'},
  {pattern: /\b(arts|design|fine arts|visual arts|media|animation)\b/i, value: 'Arts / Design'},
  {pattern: /\b(psychology|social science|sociology|political science)\b/i, value: 'Social Sciences'},
  {pattern: /\b(law|legal)\b/i, value: 'Law'},
];

const COUNTRY_PATTERNS: Array<{pattern: RegExp; value: string}> = [
  {pattern: /\b(usa|u\.s\.a\.|united states|america)\b/i, value: 'USA'},
  {pattern: /\b(canada)\b/i, value: 'Canada'},
  {pattern: /\b(uk|u\.k\.|united kingdom|britain|england)\b/i, value: 'UK'},
  {pattern: /\b(australia)\b/i, value: 'Australia'},
  {pattern: /\b(germany)\b/i, value: 'Germany'},
  {pattern: /\b(ireland)\b/i, value: 'Ireland'},
  {pattern: /\b(new zealand)\b/i, value: 'New Zealand'},
  {pattern: /\b(singapore)\b/i, value: 'Singapore'},
  {pattern: /\b(malaysia)\b/i, value: 'Malaysia'},
  {pattern: /\b(uae|dubai|united arab emirates)\b/i, value: 'UAE'},
];

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const includesAny = (text: string, keywords: string[]) =>
  keywords.some(keyword => text.includes(keyword));

const getRecentText = (history: ChatHistoryMessage[], limit = 8) =>
  history
    .slice(-limit)
    .map(m => m.content)
    .join(' ');

const getLastAssistantMessage = (history: ChatHistoryMessage[]) =>
  [...history].reverse().find(message => message.role === 'assistant')?.content || '';

const extractFirstMatch = (text: string, patterns: Array<{pattern: RegExp; value: string}>) => {
  for (const item of patterns) {
    if (item.pattern.test(text)) {
      return item.value;
    }
  }
  return undefined;
};

const extractLevel = (text: string) => extractFirstMatch(text, LEVEL_PATTERNS);
const extractField = (text: string) => extractFirstMatch(text, FIELD_PATTERNS);
const extractCountry = (text: string) => extractFirstMatch(text, COUNTRY_PATTERNS);

const extractQualification = (text: string) => {
  const match = text.match(
    /\b(high school|secondary school|12th|10th|diploma|certificate|bachelor(?:'s)?|master(?:'s)?|phd|doctorate)\b/i,
  );
  return match?.[1]
    ? match[1]
        .replace(/\b\w/g, char => char.toUpperCase())
        .replace(/Th$/, 'th')
    : undefined;
};

const extractScore = (text: string) => {
  const gpaMatch = text.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:\/\s*10|gpa)\b/i);
  if (gpaMatch?.[1]) {
    return `${gpaMatch[1]} GPA`;
  }

  const percentageMatch = text.match(/\b(\d{1,3}(?:\.\d{1,2})?)\s*%/i);
  if (percentageMatch?.[1]) {
    return `${percentageMatch[1]}%`;
  }

  return undefined;
};

const extractEnglishScore = (text: string) => {
  const match = text.match(
    /\b(ielts|pte|toefl|duolingo)\b[^0-9]*?(\d{1,3}(?:\.\d{1,2})?)?/i,
  );
  if (match?.[1]) {
    const label = match[1].toUpperCase();
    return match[2] ? `${label} ${match[2]}` : label;
  }
  return undefined;
};

const extractWorkExperience = (text: string) => {
  const match = text.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:\+?\s*)?(?:years?|yrs?)\b/i);
  return match?.[1] ? `${match[1]} years` : undefined;
};

const getMergedCourseSlots = (
  message: string,
  history: ChatHistoryMessage[],
): CourseSlots => {
  const text = `${getRecentText(history)} ${message}`.toLowerCase();
  return {
    level: extractLevel(text),
    field: extractField(text),
    country: extractCountry(text),
    qualification: extractQualification(text),
    score: extractScore(text),
  };
};

const getEligibilitySlots = (history: ChatHistoryMessage[]): EligibilitySlots => {
  const text = getRecentText(history).toLowerCase();
  return {
    qualification: extractQualification(text),
    score: extractScore(text),
    englishScore: extractEnglishScore(text),
    workExperience: extractWorkExperience(text),
  };
};

const geminiDecision = (
  systemPrompt: string,
  maxOutputTokens = 180,
  temperature = 0.5,
): IntentDecision => ({
  type: 'gemini',
  systemPrompt,
  maxOutputTokens,
  temperature,
});

const courseReply = (slots: CourseSlots): IntentDecision => {
  if (!slots.level) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping a student pick a course.
Ask only one short question.
We still need to know whether they want UG, PG, diploma, or PhD programs.
Be warm, natural, and concise.`,
      90,
      0.6,
    );
  }

  if (!slots.field) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping a student pick a course.
Ask only one short question.
We already know the study level is ${slots.level}.
Now ask about their subject area or interest in a natural, friendly way.
Keep it brief.`,
      90,
      0.6,
    );
  }

  if (!slots.country) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping a student pick a course.
Ask only one short question.
We know the student's subject area is ${slots.field} and the study level is ${slots.level}.
Now ask which country they prefer.
Keep the reply brief and natural.`,
      90,
      0.6,
    );
  }

  if (!slots.qualification) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping a student pick a course.
Ask only one short question.
We know the user wants ${slots.level} ${slots.field} programs in ${slots.country}.
Now ask their highest qualification.
Keep it brief and helpful.`,
      90,
      0.6,
    );
  }

  if (!slots.score) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping a student pick a course.
Ask only one short question.
We know the user wants ${slots.level} ${slots.field} programs in ${slots.country} and their qualification is ${slots.qualification}.
Now ask for their GPA or percentage.
Keep the reply short and conversational.`,
      90,
      0.6,
    );
  }

  return {
    type: 'course_catalog',
    courseQuery: slots,
  };
};

const eligibilityReply = (slots: EligibilitySlots): IntentDecision => {
  if (!slots.qualification) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping check eligibility.
Ask only one short question.
We still need the student's highest qualification.
Keep it natural and concise.`,
      90,
      0.6,
    );
  }

  if (!slots.score) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping check eligibility.
Ask only one short question.
We know the student qualification is ${slots.qualification}.
Now ask for GPA or percentage.
Keep the reply short and natural.`,
      90,
      0.6,
    );
  }

  if (!slots.englishScore) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping check eligibility.
Ask only one short question.
We know the student qualification is ${slots.qualification} and their score is ${slots.score}.
Now ask for an English test score such as IELTS, PTE, TOEFL, or Duolingo.
Keep it brief.`,
      90,
      0.6,
    );
  }

  if (!slots.workExperience) {
    return geminiDecision(
      `You are ARIA, an applicant buddy helping check eligibility.
Ask only one short question.
We know the student's qualification is ${slots.qualification}, score is ${slots.score}, and English score is ${slots.englishScore}.
Now ask whether they have work experience and how many years.
Keep the reply warm and concise.`,
      90,
      0.6,
    );
  }

  return {
    type: 'gemini',
    systemPrompt: `You are ARIA, an applicant buddy helping with eligibility.
Keep the response short and structured.
If enough info is present, provide a concise eligibility summary.
If one crucial detail is missing, ask only one question.
Do not give a long explanation or multiple questions.`,
    maxOutputTokens: 350,
    temperature: 0.4,
  };
};

export const IntentService = {
  detect(message: string, history: ChatHistoryMessage[]): IntentType {
    const normalizedMessage = normalize(message);
    const recentText = normalize(getRecentText(history));
    const assistantText = normalize(getLastAssistantMessage(history));
    const combined = `${normalizedMessage} ${recentText} ${assistantText}`.trim();

    if (includesAny(combined, THANKS_KEYWORDS)) {
      return 'thanks';
    }

    if (includesAny(combined, FAREWELL_KEYWORDS)) {
      return 'farewell';
    }

    if (includesAny(combined, GREETING_KEYWORDS)) {
      return 'greeting';
    }

    if (includesAny(combined, HELP_KEYWORDS)) {
      return 'help';
    }

    if (includesAny(combined, SCHOLARSHIP_KEYWORDS)) {
      return 'scholarship';
    }

    if (includesAny(combined, VISA_KEYWORDS)) {
      return 'visa';
    }

    if (includesAny(combined, ELIGIBILITY_KEYWORDS)) {
      return 'eligibility';
    }

    if (includesAny(combined, COURSE_KEYWORDS)) {
      return 'course_finder';
    }

    if (includesAny(normalizedMessage, ['admission', 'admissions', 'college help', 'university help'])) {
      return 'admission_help';
    }

    return 'fallback';
  },

  buildDecision(message: string, history: ChatHistoryMessage[]): IntentDecision {
    const intent = this.detect(message, history);

    if (intent === 'course_finder') {
      return courseReply(getMergedCourseSlots(message, history));
    }

    if (intent === 'eligibility') {
      return eligibilityReply(getEligibilitySlots(history));
    }

    if (intent === 'greeting') {
      return geminiDecision(
        `You are ARIA, an applicant buddy.
Reply with a warm greeting in 1-2 short sentences.
Mention that you can help with courses, eligibility, scholarships, visa, and admissions.
End with one simple question.`,
        110,
        0.7,
      );
    }

    if (intent === 'thanks') {
      return geminiDecision(
        `You are ARIA, an applicant buddy.
Reply to the user's thanks in one short, warm sentence.
Then ask one helpful follow-up question about what they want next.`,
        90,
        0.6,
      );
    }

    if (intent === 'farewell') {
      return geminiDecision(
        `You are ARIA, an applicant buddy.
Reply with a short, friendly goodbye message.
Do not ask more than one question, and it is okay to ask none.`,
        80,
        0.5,
      );
    }

    if (intent === 'help' || intent === 'admission_help') {
      return geminiDecision(
        `You are ARIA, an applicant buddy.
The user wants help but has not specified the topic yet.
Ask one short question offering the main options: courses, eligibility, scholarships, visa, or admission guidance.
Keep it natural and not robotic.`,
        100,
        0.65,
      );
    }

    if (intent === 'scholarship') {
      return geminiDecision(
        `You are ARIA, an applicant buddy.
The user is asking about scholarships.
Ask one short question to narrow it down by country or study level.
Keep the reply friendly and brief.`,
        95,
        0.65,
      );
    }

    if (intent === 'visa') {
      return geminiDecision(
        `You are ARIA, an applicant buddy.
The user is asking about visa guidance.
Ask one short question about which country they plan to study in.
Keep the reply brief and natural.`,
        90,
        0.65,
      );
    }

    return {
      type: 'gemini',
      systemPrompt: `You are ARIA, an applicant buddy.
Keep replies short, warm, and conversational.
Ask only one question at a time when you need more information.
Do not produce long lists unless the user explicitly asks for them.
If the user gives enough context, answer briefly and clearly.`,
      maxOutputTokens: 350,
      temperature: 0.4,
    };
  },
};
