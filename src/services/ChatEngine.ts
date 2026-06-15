import { PROGRAM_CATALOG, ProgramCatalogItem } from '../data/programCatalog';
import { findRelevantAppRules } from '../data/appRules';
import VectorKnowledge from './VectorKnowledge';
import ProgramService from './ProgramService';
import { directGeminiChat, analyzeConversation, AssistantAnalysis, buildSystemPrompt } from './directGemini';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  image?: string | null;
  programs?: Array<{
    name: string;
    university: string;
    country: string;
    duration: string;
    intake: string;
    eligibility: string;
    careerOpportunities: string[];
    [key: string]: any;
  }>;
}

export interface ChatEngineResponse {
  reply: string;
  responseLanguage: 'hi' | 'en';
  responseType?: 'save_confirmation' | 'detail' | 'recommendation' | 'final_recommendation' | 'general';
  programs?: ProgramCatalogItem[];
  rules?: string[];
  knowledge?: string[];
  timestamp: number;
}

type ProgramLevel = ProgramCatalogItem['level'];
type QuestionIntent = 'career' | 'opinion' | 'best_fit' | 'alternative' | 'compare' | 'detail';

const normalize = (text: string) =>
  text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();

const includesAny = (text: string, keywords: string[]) =>
  keywords.some(keyword => text.includes(keyword));

const isFinalChoiceRequest = (text: string): boolean => {
  const normalized = normalize(text);
  return /\b(?:choose|select|finali[sz]e)\b[\s\S]*\b(?:one|course|program)\b/i.test(normalized) || includesAny(normalized, [
    'best one',
    'one best',
    'final course',
    'final program',
    'choose one',
    'select one',
    'which should i choose',
    'which one should i choose',
    'which should i go with',
    'which one is best for me',
    'mere liye best one',
    'ek best course',
  ]);
};

const inferQuestionIntent = (text: string): QuestionIntent => {
  const normalized = normalize(text);
  if (includesAny(normalized, ['career', 'job', 'scope', 'opportunit', 'future', 'salary'])) {
    return 'career';
  }
  if (includesAny(normalized, ['what you think', 'should i', 'go with', 'is it good', 'better for me'])) {
    return 'opinion';
  }
  if (includesAny(normalized, ['best', 'suggest', 'recommend', 'strong with math', 'strong with maths', 'pcm'])) {
    return 'best_fit';
  }
  if (includesAny(normalized, ['other course', 'another course', 'else', 'other option', 'more option'])) {
    return 'alternative';
  }
  if (includesAny(normalized, ['compare', 'difference', 'which one'])) {
    return 'compare';
  }
  return 'detail';
};

const inferRequestedProgramLevel = (text: string): ProgramLevel | undefined => {
  const normalized = normalize(text);
  if (includesAny(normalized, ['master', 'masters', 'msc', 'mtech', 'mba', 'postgraduate', 'pg course'])) {
    return 'PG';
  }
  if (includesAny(normalized, ['diploma', 'certificate'])) {
    return 'Diploma';
  }
  if (includesAny(normalized, ['bachelor', 'undergraduate', 'ug course', 'after 12th', '12th pass', 'class 12'])) {
    return 'UG';
  }
  return undefined;
};

const hasSchoolQualification = (text: string) =>
  includesAny(normalize(text), ['12th', '12 pass', 'class 12', 'high school', 'secondary', 'intermediate']);

const hasBachelorQualification = (text: string) =>
  /\b(passed|completed|done|finished|have|holding)\s+(a\s+)?(bachelor|bachelor's|btech|b\.tech|b\.sc|bsc|b\.e|be|graduation|graduate)\b/i.test(text) ||
  /\b(bachelor's degree|bachelor degree|graduation completed|graduate with)\b/i.test(text);

// Detect students who are below 12th grade (9th, 10th, 8th, etc.) — these are NOT eligible for catalog programs yet
const hasBelowSecondaryQualification = (text: string): boolean => {
  const t = normalize(text);
  return (
    includesAny(t, [
      'after 10th', 'after 9th', 'after 8th', 'after 7th',
      '10th pass', '9th pass', '8th pass',
      '10 pass', '9 pass',
      'class 10', 'class 9', 'class 8',
      '10th grade', '9th grade', '8th grade',
      'just completed 10', 'completed 10th', 'done 10th',
      '10वीं', '9वीं', '8वीं', 'दसवीं', 'नौवीं',
      'after ssc', 'after matric', 'matric pass',
    ]) &&
    // Make sure it's not someone saying "after 10th I did 12th"
    !includesAny(t, ['12th', '12 pass', 'class 12', 'secondary', 'intermediate', 'bachelor', 'btech'])
  );
};

const inferLevel = (text: string): 'UG' | 'PG' | 'Diploma' | 'Any' => {
  const t = normalize(text);
  if (includesAny(t, ['phd', 'doctorate', 'dr.'])) return 'PG';
  if (includesAny(t, ['master', 'msc', 'ma', 'mtech', 'mba', 'pg', 'post graduate', 'postgraduate'])) return 'PG';
  if (includesAny(t, ['diploma', 'certificate', 'polytechnic'])) return 'Diploma';
  if (includesAny(t, ['bachelor', 'be', 'btech', 'b.sc', 'bba', 'undergraduate', 'ug', 'b.a', 'b.com'])) return 'UG';
  // Only map 12th/Secondary to UG — NOT 10th (10th is below the catalog threshold)
  if (includesAny(t, ['12th', '12 pass', 'class 12', 'high school', 'secondary', 'intermediate'])) return 'UG';
  // Hindi education levels
  if (includesAny(t, ['12वीं', '12वीं पास', 'बारहवीं'])) return 'UG';
  if (includesAny(t, ['दसवीं', '10वीं', '9वीं'])) return 'Any'; // below threshold
  if (includesAny(t, ['स्नातक', 'स्नातकोत्तर', 'मास्टर्स', 'पीजी'])) return 'PG';
  if (includesAny(t, ['डिप्लोमा'])) return 'Diploma';
  return 'Any';
};

const extractFieldFromText = (text: string): string => {
  const normalized = normalize(text);
  // IMPORTANT: Check multi-word phrases FIRST before single-word matches
  // "data science" must be checked BEFORE "computer"/"science" individually
  if (includesAny(normalized, ['data science', 'डेटा साइंस', 'डाटा साइंस'])) {
    return 'data science';
  }
  if (includesAny(normalized, ['cyber security', 'cybersecurity', 'साइबर सिक्योरिटी'])) {
    return 'cyber security';
  }
  if (includesAny(normalized, ['computer science', 'कंप्यूटर साइंस', 'कम्प्यूटर साइंस'])) {
    return 'computer science';
  }
  // Now check single-word matches (these are less specific)
  if (includesAny(normalized, ['computer', 'cs', 'software', 'कंप्यूटर', 'सीएस', 'सॉफ्टवेयर'])) {
    return 'computer science';
  }
  if (includesAny(normalized, ['data', 'analytics', 'डेटा', 'एनालिटिक्स'])) {
    return 'data science';
  }
  if (includesAny(normalized, ['engineering', 'engineer', 'इंजीनियर'])) {
    return 'engineering';
  }
  if (includesAny(normalized, ['business', 'commerce', 'management', 'mba', 'बिजनेस', 'कॉमर्स'])) {
    return 'business';
  }
  if (includesAny(normalized, ['healthcare', 'health', 'medical', 'nurse', 'हेल्थ', 'मेडिकल'])) {
    return 'healthcare';
  }
  // Don't match 'it' alone — too ambiguous (matches common English word "it")
  if (includesAny(normalized, ['information technology', 'आईटी'])) {
    return 'computer science';
  }
  return '';
};

const extractProfileLocally = (message: string, history: ConversationMessage[]) => {
  const fullText = `${history.filter(h => h.role === 'user').map(h => h.content).join(' ')} ${message}`;
  const normalized = normalize(fullText);

  // If user is below 12th — do NOT map to any catalog level
  if (hasBelowSecondaryQualification(fullText)) {
    return { level: '' as '', field: '', score: '' };
  }

  // Extract level
  let level: 'UG' | 'PG' | 'Diploma' | '' = '';
  if (includesAny(normalized, ['12th', '12वीं', 'बारहवीं', 'secondary', 'intermediate', 'इंटरमीडिएट'])) {
    level = 'UG';
  } else if (includesAny(normalized, ['bachelor', 'be', 'btech', 'b.tech', 'b.sc', 'बीटेक', 'बीएससी'])) {
    level = 'UG';
  } else if (includesAny(normalized, ['master', 'mtech', 'msc', 'mba', 'pg', 'postgraduate', 'मास्टर', 'एमबीए'])) {
    level = 'PG';
  } else if (includesAny(normalized, ['diploma', 'डिप्लोमा'])) {
    level = 'Diploma';
  }
  
  // Extract field — prioritize the LATEST user message over full history.
  // This ensures that if user changed their mind from "computer" to "data science",
  // the latest intent wins.
  let field = extractFieldFromText(message);
  if (!field) {
    // Fall back to checking full conversation history
    field = extractFieldFromText(fullText);
  }
  
  // Extract score
  const scoreMatch = fullText.match(/(\d{1,3})%/);
  const score = scoreMatch ? scoreMatch[1] : '';
  
  return { level, field, score };
};

const containsDevanagari = (message: string) => /[\u0900-\u097F]/.test(message);

// ─── Comprehensive Hinglish (Romanized Hindi) Detection ──────────────────────
const HINDI_WORDS = new Set([
  // Pronouns & common subjects
  'maine', 'mujhe', 'mujhko', 'mera', 'meri', 'mere', 'hum', 'humko', 'humne', 'hamara', 'hamari',
  'tum', 'tumne', 'tumko', 'tumhara', 'tumhari', 'aap', 'aapka', 'aapki', 'aapne', 'aapko',
  'uska', 'uski', 'unka', 'unki', 'unko', 'isko', 'iski', 'usse',
  // Verbs & verb forms
  'hai', 'hain', 'tha', 'thi', 'the', 'hoga', 'hogi', 'hota', 'hoti',
  'kar', 'karo', 'karna', 'karunga', 'karungi', 'karenge', 'karte', 'karti', 'kiya', 'kiye', 'karke',
  'liya', 'liye', 'lena', 'lete', 'leti', 'lelo', 'lijiye',
  'diya', 'diye', 'dena', 'dete', 'deti', 'dedo', 'dijiye', 'do',
  'raha', 'rahi', 'rahe', 'rahega', 'rahegi', 'rahenge',
  'sakta', 'sakti', 'sakte', 'sakenge',
  'chahiye', 'chahte', 'chahti', 'chahunga', 'chahungi',
  'bata', 'batao', 'bataye', 'bataiye', 'batana', 'batado',
  'padh', 'padha', 'padhi', 'padhna', 'padhke', 'padhta', 'padhti', 'padhai',
  'chalu', 'shuru',
  'milega', 'milegi', 'milenge', 'milta', 'milti',
  'lagta', 'lagti', 'lagte', 'lagega',
  'bolna', 'bolo', 'bola', 'boli',
  'jaana', 'jao', 'jata', 'jati', 'jayega', 'jayegi',
  'aana', 'aao', 'aata', 'aati', 'aayega', 'aayegi',
  'dekho', 'dekhna', 'dekhte', 'dekha', 'dekhi',
  'samjha', 'samjho', 'samjhao', 'samajh',
  'pasand', 'pasandida',
  // Question words
  'kya', 'kaise', 'kaisa', 'kaisi', 'kyu', 'kyun', 'kyunki', 'kaha', 'kahan',
  'kaun', 'kaun-sa', 'kaunsa', 'kitna', 'kitni', 'kitne', 'kidhar', 'kab',
  'konsa', 'konsi', 'kon',
  // Connectors & prepositions
  'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'me', 'par', 'pe', 'tak', 'wala', 'wali', 'wale',
  'aur', 'ya', 'lekin', 'magar', 'phir', 'toh', 'to', 'bhi',
  'ke bare', 'ke baare', 'ke liye', 'ke saath',
  'abhi', 'ab', 'jab', 'tab',
  // Common nouns & adjectives
  'accha', 'achha', 'acha', 'achhi', 'achi',
  'theek', 'thik', 'sahi',
  'bahut', 'bohot', 'bohut', 'zyada', 'jyada',
  'kuch', 'kuchh', 'koi', 'sab', 'sabhi',
  'nahi', 'nahin', 'nhi', 'mat', 'na',
  'haan', 'han', 'ji', 'bilkul',
  'padhai', 'padhai', 'course', 'kaam',
  'dost', 'bhai', 'behen',
  'paisa', 'paise', 'rupaye',
  'saal', 'mahina', 'din',
  'baad', 'pehle', 'pahle',
  'saath', 'sath',
  'jaruri', 'zaroori', 'zaruri',
  'dusra', 'dusri', 'doosra', 'doosri',
  // Education-related Hinglish
  'padhai', 'padhna', 'padhke', 'padhta',
  'pass', 'paas',
  'barahvi', 'dasvi',
  'wahan', 'yahan', 'idhar', 'udhar',
  // Common phrases used as single words
  'suno', 'suniye', 'sunte',
  'chalo', 'chaliye', 'chalega',
  'pata', 'maloom',
  'theek', 'shukriya', 'dhanyawad', 'dhanyavaad',
]);

// Common Hinglish bigrams — if user text has 2+ of these, it's Hindi
const HINDI_BIGRAMS = [
  'kar liya', 'kar diya', 'kar do', 'kar raha', 'kar rahi',
  'pass kiya', 'pass kar', 'pass ki',
  'ke bare', 'ke baare', 'ke liye', 'ke saath', 'ke baad',
  'mein pass', 'mein padha', 'mein kiya',
  'kya hai', 'kaisa hai', 'kaisi hai', 'kaisa rahega', 'kaisa hoga',
  'batao na', 'bata do', 'bata dijiye',
  'mujhe batao', 'mujhe bata', 'mujhe chahiye',
  'kuch aur', 'kuchh aur', 'aur batao', 'aur kuch',
  'mere liye', 'mere pass', 'mere paas',
  'mai ne', 'mein ne',
  'save karo', 'save kar',
];

const detectHinglish = (text: string): boolean => {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/);
  
  // Check for Hindi bigrams
  const bigramCount = HINDI_BIGRAMS.filter(bg => normalized.includes(bg)).length;
  if (bigramCount >= 1) return true;
  
  // Count how many words are Hindi
  let hindiWordCount = 0;
  for (const word of words) {
    if (HINDI_WORDS.has(word)) {
      hindiWordCount++;
    }
  }
  
  // If 2+ Hindi words found in a short message, or 30%+ Hindi words in a longer message
  if (words.length <= 5 && hindiWordCount >= 2) return true;
  if (words.length > 5 && hindiWordCount >= 3) return true;
  if (words.length > 0 && hindiWordCount / words.length >= 0.3) return true;
  
  return false;
};

const detectResponseLanguage = (message: string, history: ConversationMessage[]): 'en' | 'hi' => {
  // 1. Devanagari script → definitely Hindi
  if (containsDevanagari(message)) return 'hi';

  // 2. Romanized Hindi / Hinglish detection
  if (detectHinglish(message)) return 'hi';
  
  // 3. Check conversation continuity — if the last 2 messages were in Hindi,
  //    continue in Hindi even if current message is ambiguous
  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-2);
  const recentHindi = recentAssistant.filter(m => {
    // Check if assistant previously responded in Hindi  
    return containsDevanagari(m.content);
  });
  if (recentHindi.length >= 1) {
    // If recent conversation was Hindi and current message has any Hindi words
    const normalized = normalize(message);
    const words = normalized.split(/\s+/);
    const anyHindiWord = words.some(w => HINDI_WORDS.has(w));
    if (anyHindiWord) return 'hi';
  }
  
  return 'en';
};

const isGreetingMessage = (text: string) => {
  const normalized = normalize(text);
  return includesAny(normalized, [
    'hi',
    'hii',
    'hello',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'how are you',
    'what is this',
    'who are you',
    'tell me about yourself',
  ]);
};

const TRANSLITERATION_MAP: Record<string, string> = {
  'बैचलर': 'bachelor',
  'बेचलर': 'bachelor',
  'बेटर': 'bachelor',
  'ऑफ़': 'of',
  'ऑफ': 'of',
  'कंप्यूटर': 'computer',
  'कम्प्यूटर': 'computer',
  'साइंस': 'science',
  'सीएस': 'computer science',
  'डेटा': 'data',
  'डाटा': 'data',
  'इंजीनियरिंग': 'engineering',
  'इन्जीनियरिंग': 'engineering',
  'इनफार्मेशन': 'information',
  'इन्फॉरमेशन': 'information',
  'टेक्नोलॉजी': 'technology',
  'तकनीकी': 'technology',
  'आईटी': 'information technology',
  'बिजनेस': 'business',
  'बिज़नेस': 'business',
  'एडमिनिस्ट्रेशन': 'administration',
  'मास्टर': 'master',
  'मास्टर्स': 'master',
  'एमबीए': 'mba',
  'डिप्लोमा': 'diploma',
  'पोस्टग्रेजुएट': 'postgraduate',
  'साइबर': 'cyber',
  'सिक्योरिटी': 'security',
  'सुरक्षा': 'security',
  'पब्लिक': 'public',
  'हेल्थ': 'health',
  'स्वास्थ्य': 'health',
  'एजुकेशन': 'education',
  'शिक्षा': 'education',
  'सेव': 'save',
  'सावे': 'save',
};

export const transliterateText = (text: string): string => {
  let normalized = text.toLowerCase();
  const phrases = [
    { key: 'better of', val: 'bachelor of' },
    { key: 'बेटर ऑफ़', val: 'bachelor of' },
    { key: 'बेटर ऑफ', val: 'bachelor of' },
    { key: 'बैचलर ऑफ़', val: 'bachelor of' },
    { key: 'बैचलर ऑफ', val: 'bachelor of' },
    { key: 'मास्टर ऑफ़', val: 'master of' },
    { key: 'मास्टर ऑफ', val: 'master of' },
    { key: 'डेटा साइंस', val: 'data science' },
    { key: 'डाटा साइंस', val: 'data science' },
    { key: 'कंप्यूटर साइंस', val: 'computer science' },
    { key: 'कम्प्यूटर साइंस', val: 'computer science' },
    { key: 'साइबर सिक्योरिटी', val: 'cyber security' },
    { key: 'पब्लिक हेल्थ', val: 'public health' },
    { key: 'बिजनेस एडमिनिस्ट्रेशन', val: 'business administration' }
  ];

  for (const phrase of phrases) {
    normalized = normalized.replace(new RegExp(phrase.key, 'g'), phrase.val);
  }

  const words = normalized.split(/\s+/);
  const mappedWords = words.map(w => TRANSLITERATION_MAP[w] || w);
  return mappedWords.join(' ');
};

export const isSaveIntent = (text: string): boolean => {
  const transliterated = transliterateText(text);
  const normalized = normalize(transliterated);
  const hasPhraseIntent = [
    'save this program',
    'save program',
    'save it',
    'add to saved',
    'add this to saved',
    'bookmark',
    'favorite',
    'favourite',
    'store this program',
    'सेव',
    'save करो',
    'save kar do',
    'save kar',
  ].some(keyword => {
    const kw = normalize(keyword);
    return normalized.includes(kw) || normalize(text).includes(kw);
  });

  if (hasPhraseIntent) return true;

  const words = normalized.split(/\s+/);
  const origWords = normalize(text).split(/\s+/);
  return ['save', 'सेव', 'बचाओ', 'रखो'].some(kw => words.includes(kw) || origWords.includes(kw));
};

export const findProgramMentions = (text: string): ProgramCatalogItem[] => {
  const transliterated = transliterateText(text);
  const normalized = normalize(transliterated);
  const matches: ProgramCatalogItem[] = [];
  
  // Exact matches first
  PROGRAM_CATALOG.forEach(program => {
    if (normalized.includes(normalize(program.name))) {
      matches.push(program);
    }
  });
  
  // If no exact matches, try partial matching — but require at least one
  // FIELD-SPECIFIC word to match (not just generic words like "bachelor", "master",
  // "science", "of", etc.) to avoid cross-pollination between programs.
  if (matches.length === 0) {
    const genericWords = new Set(['bachelor', 'master', 'diploma', 'science', 'of', 'in', 'the', 'and', 'for', 'engineering', 'postgraduate']);
    PROGRAM_CATALOG.forEach(program => {
      const programWords = normalize(program.name).split(' ');
      const matchingWords = programWords.filter(word => 
        word.length > 2 && normalized.includes(word)
      );
      const hasFieldSpecificMatch = matchingWords.some(word => !genericWords.has(word));
      // Require at least 2 matching words AND at least one must be field-specific
      if (matchingWords.length >= 2 && hasFieldSpecificMatch) {
        matches.push(program);
      }
    });
  }
  
  return matches;
};

export const findProgramFromText = (text: string): ProgramCatalogItem | null => {
  return findProgramMentions(text)[0] || null;
};

const getCatalogProgramByName = (programName?: string) => {
  if (!programName) {
    return null;
  }

  const normalizedName = normalize(programName);
  return PROGRAM_CATALOG.find(program => normalize(program.name) === normalizedName) || null;
};

const isFollowUpProgramQuestion = (text: string) => {
  const normalized = normalize(text);
  return / it /i.test(normalized) || includesAny(normalized, [
    'this course',
    'that course',
    'this program',
    'that program',
    'more info',
    'more information',
    'details',
    'duration',
    'how long',
    'eligibility',
    'requirements',
    'intake',
    'when',
    'start',
    'about',
    'tell me about this',
    'what is this course',
    'what is this program',
    'what about this',
  ]);
};

const hasFreshQualificationSignal = (text: string) => {
  const normalized = normalize(text);
  return includesAny(normalized, [
    'after 12th',
    'after class 12',
    'after 10th',
    '12th',
    '12वीं',
    'barahvi',
    'secondary',
    'intermediate',
    'high school',
    '10th',
    'diploma',
    'bachelor',
    'master',
    'postgraduate',
  ]);
};

const getLastRecommendedProgram = (history: ConversationMessage[]): ProgramCatalogItem | null => {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];

    if (message.programs?.length) {
      return getCatalogProgramByName(message.programs[0].name) || (message.programs[0] as unknown as ProgramCatalogItem);
    }

    const mentions = findProgramMentions(message.content);
    if (mentions.length === 1) {
      return mentions[0];
    }
  }

  return null;
};

const getBestRecommendedProgram = (history: ConversationMessage[]): ProgramCatalogItem | null => {
  for (let i = history.length - 1; i >= 0; i--) {
    const programs = history[i].programs;
    if (!programs?.length) continue;

    const best = [...programs].sort(
      (a, b) => ((b as any).matchScore || 0) - ((a as any).matchScore || 0),
    )[0];
    return getCatalogProgramByName(best.name) || (best as unknown as ProgramCatalogItem);
  }
  return null;
};

const getRecentlyRecommendedProgramNames = (history: ConversationMessage[]) => {
  const names = new Set<string>();

  history.forEach(message => {
    message.programs?.forEach(program => names.add(normalize(program.name)));
  });

  return names;
};

const filterProgramsByLevel = (programs: ProgramCatalogItem[], message: string): ProgramCatalogItem[] => {
  const levelHint = inferLevel(message);
  if (levelHint === 'Any') {
    return programs;
  }

  return programs.filter(program => program.level === levelHint);
};

const resolveProgramFromKeywords = (message: string): ProgramCatalogItem | null => {
  const keywordMatches = ProgramService.searchByKeyword(message);
  if (keywordMatches.length === 0) {
    return null;
  }

  if (keywordMatches.length === 1) {
    return keywordMatches[0];
  }

  const levelFiltered = filterProgramsByLevel(keywordMatches, message);
  if (levelFiltered.length === 1) {
    return levelFiltered[0];
  }

  const normalized = normalize(message);
  const nameMatch = levelFiltered.find(program => normalized.includes(normalize(program.name)));
  if (nameMatch) {
    return nameMatch;
  }

  return levelFiltered[0] ?? keywordMatches[0] ?? null;
};

const findLastMentionedProgram = (
  history: ConversationMessage[],
): ProgramCatalogItem | null => {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];

    if (message.programs?.length) {
      return getCatalogProgramByName(message.programs[0].name) || (message.programs[0] as unknown as ProgramCatalogItem);
    }

    const mentions = findProgramMentions(message.content);
    if (mentions.length === 1) {
      return mentions[0];
    }
  }
  return null;
};

const resolveProgramFromConversation = (
  message: string,
  history: ConversationMessage[],
): { program: ProgramCatalogItem | null; ambiguous: boolean } => {
  const directMentions = findProgramMentions(message);
  if (directMentions.length === 1) {
    return { program: directMentions[0], ambiguous: false };
  }

  if (directMentions.length > 1) {
    const recentProgramNames = getRecentlyRecommendedProgramNames(history);
    const recentMatch = directMentions.find(program => recentProgramNames.has(normalize(program.name)));

    if (recentMatch) {
      return { program: recentMatch, ambiguous: false };
    }

    return { program: null, ambiguous: true };
  }

  const keywordMatch = resolveProgramFromKeywords(message);
  if (keywordMatch) {
    return { program: keywordMatch, ambiguous: false };
  }

  if (isFinalChoiceRequest(message)) {
    const bestRecommended = getBestRecommendedProgram(history);
    if (bestRecommended) {
      return { program: bestRecommended, ambiguous: false };
    }
  }

  if (isFollowUpProgramQuestion(message) && !hasFreshQualificationSignal(message)) {
    const lastRecommended = getLastRecommendedProgram(history) || findLastMentionedProgram(history);
    if (lastRecommended) {
      return { program: lastRecommended, ambiguous: false };
    }
  }

  return { program: null, ambiguous: false };
};

const buildProgramRecommendationReply = (programs: ProgramCatalogItem[], language: 'en' | 'hi') => {
  const topPrograms = programs.slice(0, 3);
  const heading =
    language === 'hi'
      ? 'मैंने आपके लिए ये सबसे अच्छे मिलते-जुलते कोर्स पाए हैं:'
      : 'I found these matching courses for you:';

  return {
    reply: `${heading}\n${topPrograms.map(program => `• ${program.name}`).join('\n')}`,
    programs: topPrograms,
  };
};

const buildProgramRecommendationText = (
  programs: ProgramCatalogItem[],
  language: 'en' | 'hi',
  intro?: string,
) => {
  const visiblePrograms = programs.slice(0, 3);
  const heading = intro || (
    language === 'hi'
      ? 'आपके लिए ये कोर्स सही रहेंगे:'
      : 'These are the best matching courses from my catalog:'
  );

  return `${heading}\n${visiblePrograms.map(program => `• ${program.name} - ${program.eligibility}`).join('\n')}`;
};

const buildCareerReply = (program: ProgramCatalogItem, language: 'en' | 'hi') => {
  if (language === 'hi') {
    return `${program.name} के बाद करियर विकल्प: ${program.careerOpportunities.join(', ')}। अगर आपको ${program.fields.slice(0, 2).join(' और ')} पसंद है, तो यह अच्छा विकल्प है।`;
  }

  return `${program.name} can lead to roles like ${program.careerOpportunities.join(', ')}. It is a good fit if you enjoy ${program.fields.slice(0, 2).join(' and ')}.`;
};

const buildOpinionReply = (
  program: ProgramCatalogItem,
  userText: string,
  language: 'en' | 'hi',
) => {
  const normalized = normalize(userText);
  const isMathProfile = includesAny(normalized, ['math', 'maths', 'pcm', 'science']);
  const isBusinessProgram = program.fields.some(field => includesAny(normalize(field), ['business', 'management', 'commerce']));

  if (language === 'hi') {
    if (isMathProfile && isBusinessProgram) {
      return `${program.name} अच्छा है अगर आपको business पसंद है, लेकिन आपके PCM/math profile के लिए IT, Computer Science, या Data Science ज्यादा natural fit रहेंगे।`;
    }
    return `${program.name} अच्छा विकल्प है क्योंकि यह ${program.fields.slice(0, 2).join(' और ')} से जुड़ा है। एक बात ध्यान रखें: ${program.eligibility}।`;
  }

  if (isMathProfile && isBusinessProgram) {
    return `${program.name} is good if you genuinely like business, but with your PCM/math strength, IT, Computer Science, or Data Science is a stronger fit.`;
  }

  return `${program.name} is a good option for you if you like ${program.fields.slice(0, 2).join(' and ')}. The main requirement is: ${program.eligibility}.`;
};

const buildBestFitReply = (
  programs: ProgramCatalogItem[],
  userText: string,
  language: 'en' | 'hi',
) => {
  const mathFriendly = programs.filter(program =>
    includesAny(normalize(`${program.name} ${program.eligibility} ${program.fields.join(' ')}`), ['math', 'mathematics', 'data science', 'engineering', 'computer science', 'it']),
  );
  const best = mathFriendly[0] || programs[0];
  const backup = mathFriendly.find(program => program.name !== best?.name);

  if (!best) {
    return language === 'hi'
      ? 'मुझे अभी आपके profile के लिए कोई clear best match नहीं मिला।'
      : 'I do not have a clear best match from the current catalog yet.';
  }

  if (language === 'hi') {
    return `${best.name} आपके लिए सबसे अच्छा match लगता है क्योंकि आप math/PCM में strong हैं। ${backup ? `दूसरा अच्छा option ${backup.name} है।` : ''}`;
  }

  return `${best.name} looks like the best fit because you are strong in math/PCM. ${backup ? `${backup.name} is the next good option.` : ''}`.trim();
};

const buildThoughtfulProgramReply = (
  program: ProgramCatalogItem,
  message: string,
  history: ConversationMessage[],
  language: 'en' | 'hi',
  knowledgeHits: any[],
) => {
  const intent = inferQuestionIntent(message);
  const userContext = `${history.filter(item => item.role === 'user').map(item => item.content).join(' ')} ${message}`;

  if (intent === 'career') {
    return buildCareerReply(program, language);
  }

  if (intent === 'opinion' || intent === 'best_fit') {
    return buildOpinionReply(program, userContext, language);
  }

  const normalized = normalize(message);

  if (includesAny(normalized, ['duration', 'how long', 'years', 'months', 'कितना समय'])) {
    return language === 'hi'
      ? `${program.name} की अवधि ${program.duration} है।`
      : `${program.name} is ${program.duration} long.`;
  }

  if (includesAny(normalized, ['eligib', 'require', 'criteria', 'qualif', 'योग्यता', 'आवश्यकता'])) {
    return language === 'hi'
      ? `${program.name} के लिए पात्रता: ${program.eligibility}।`
      : `Eligibility for ${program.name} is ${program.eligibility}.`;
  }

  if (includesAny(normalized, ['intake', 'when', 'start', 'semester', 'कब', 'शुरुआत'])) {
    return language === 'hi'
      ? `${program.name} का intake ${program.intake} है।`
      : `${program.name} intake is ${program.intake}.`;
  }

  if (includesAny(normalized, ['university', 'where', 'कहाँ', 'विश्वविद्यालय'])) {
    return language === 'hi'
      ? `${program.name} ${program.university}, ${program.country} में है।`
      : `${program.name} is at ${program.university}, ${program.country}.`;
  }

  const retrievedHint = knowledgeHits.find(hit => hit.type === 'rule')?.text;

  if (retrievedHint && intent !== 'detail') {
    return language === 'hi'
      ? `${program.name} अच्छा option है। ${program.eligibility}।`
      : `${program.name} is a good option. Main eligibility: ${program.eligibility}.`;
  }

  return language === 'hi'
    ? `${program.name} - ${program.university}, ${program.country}। अवधि: ${program.duration}। Intake: ${program.intake}। पात्रता: ${program.eligibility}।`
    : `${program.name} at ${program.university}, ${program.country}. Duration: ${program.duration}. Intake: ${program.intake}. Eligibility: ${program.eligibility}.`;
};

const buildMasterPathReply = (language: 'en' | 'hi') => {
  const bachelorOptions = ProgramService.search({
    qualification: '12th PCM 80%',
    gpa: '80%',
    interests: 'computer science information technology',
    preferredCountry: '',
    targetLevel: 'UG',
  }).slice(0, 2);

  const masterOption = PROGRAM_CATALOG.find(program => program.level === 'PG' && normalize(program.name).includes('computer science'));

  const englishReply = [
    "You cannot start a Master's directly after 12th; first complete a relevant bachelor's degree.",
    bachelorOptions.length
      ? `Start with: ${bachelorOptions.map(program => program.name).join(' or ')}.`
      : 'Start with a relevant bachelor program first.',
    masterOption
      ? `After that, you can apply for ${masterOption.name}.`
      : 'After that, you can apply for a related master program.',
  ].join(' ');

  if (language === 'hi') {
    return '12वीं के बाद आप सीधे मास्टर कोर्स नहीं कर सकते। पहले संबंधित बैचलर डिग्री पूरी करें, फिर मास्टर कोर्स के लिए आवेदन करें।';
  }

  return englishReply;
};

const buildMasterOptionsAfter12thReply = (language: 'en' | 'hi') => {
  const masterOptions = PROGRAM_CATALOG
    .filter(program => program.level === 'PG')
    .slice(0, 6);

  if (language === 'hi') {
    return [
      '12th ke baad direct master nahi hota; pehle relevant bachelor degree complete karni hogi.',
      `Uske baad master options hain: ${masterOptions.map(program => program.name).join(', ')}.`,
    ].join(' ');
  }

  return [
    "You cannot start a master's directly after 12th; first complete a relevant bachelor's degree.",
    `After that, master options include: ${masterOptions.map(program => program.name).join(', ')}.`,
  ].join(' ');
};

const isDuplicateReply = (reply: string, history: ConversationMessage[]): boolean => {
  const assistantMessages = history.filter(m => m.role === 'assistant');
  if (assistantMessages.length === 0) return false;
  
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanReply = clean(reply);
  
  const last2 = assistantMessages.slice(-2);
  return last2.some(m => clean(m.content) === cleanReply);
};

// ─── Main Client-Side processChat entrypoint ─────────────────────────────────
export const processChat = async (
  message: string,
  history: ConversationMessage[],
  image?: string | null,
): Promise<ChatEngineResponse> => {
  const cleanMessage = message.trim();
  const safeHistory = Array.isArray(history) ? history : [];
  const responseLanguage = detectResponseLanguage(cleanMessage, safeHistory);
  const knowledgeHits = VectorKnowledge.search(cleanMessage);
  const userImage = typeof image === 'string' ? image : undefined;

  // 1. Save program intent check
  if (isSaveIntent(cleanMessage)) {
    // 1a. Check if the save message itself mentions a specific program
    let programToSave = findProgramMentions(cleanMessage)[0] || null;
    
    // 1b. Check the most recent assistant message with attached programs
    if (!programToSave) {
      for (let i = safeHistory.length - 1; i >= 0; i--) {
        const msg = safeHistory[i];
        if (msg.role === 'assistant' && msg.programs?.length) {
          const catalogMatch = findProgramMentions(msg.programs[0].name)[0];
          programToSave = catalogMatch || (msg.programs[0] as unknown as ProgramCatalogItem);
          break;
        }
      }
    }
    
    // 1c. Search recent messages in reverse order (newest first)
    if (!programToSave) {
      for (let i = safeHistory.length - 1; i >= 0; i--) {
        const found = findProgramMentions(safeHistory[i].content)[0];
        if (found) {
          programToSave = found;
          break;
        }
      }
    }
    
    if (programToSave) {
      const reply = responseLanguage === 'hi'
        ? `${programToSave.name} आपके saved programs में जोड़ दिया गया है.`
        : `${programToSave.name} has been added to your saved programs.`;

      return {
        reply,
        responseLanguage,
        responseType: 'save_confirmation',
        programs: [programToSave],
        timestamp: Date.now(),
      };
    }
  }

  // 2. Greeting flow — let Gemini handle it naturally
  if (isGreetingMessage(cleanMessage)) {
    const reply = await directGeminiChat(cleanMessage, safeHistory, { userImage, language: responseLanguage });
    return {
      reply,
      responseLanguage,
      responseType: 'general',
      timestamp: Date.now(),
    };
  }

  // 2b. Below-secondary qualification (9th, 10th, 8th) — route to general counsellor Gemini
  //     These students are NOT eligible for any catalog program yet, but deserve real guidance.
  const fullConversationText = `${safeHistory.map(m => m.content).join(' ')} ${cleanMessage}`;
  if (hasBelowSecondaryQualification(fullConversationText)) {
    const generalCounsellorPrompt = `You are a helpful academic and career counsellor.

The student asked: "${cleanMessage}"

Context from conversation:
${safeHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

IMPORTANT CONTEXT:
- The student appears to be at 9th or 10th grade level.
- Our admission programs ALL require at least 12th grade (Higher Secondary) as the minimum qualification.
- So they are not yet eligible for our catalog programs.

YOUR TASK:
1. Acknowledge their current stage warmly.
2. Explain that they need to complete 12th grade first to access our programs.
3. Give practical, actionable pathway advice for what they can do right now:
   - Continue studying to complete 10th and then 12th
   - Mention vocational/ITI courses if applicable for 10th pass students
   - Suggest subjects/streams they should focus on in 11th–12th based on their interest
   - Mention that once they finish 12th, you can help them with international programs
4. Keep it encouraging, warm, and concise (3–5 sentences max).
5. Reply in ${responseLanguage === 'hi' ? 'Hindi ONLY' : 'English ONLY'}.`;

    const reply = await directGeminiChat(generalCounsellorPrompt, safeHistory, {
      temperature: 0.5,
      language: responseLanguage,
    });
    return {
      reply,
      responseLanguage,
      responseType: 'general',
      timestamp: Date.now(),
    };
  }

  // 3. Analyse the conversation to understand student profile
  let analysis: AssistantAnalysis | null = null;
  try {
    analysis = await analyzeConversation(cleanMessage, safeHistory);
  } catch (err) {
    console.warn('[ChatEngine] analyzeConversation error:', err);
  }

  // Fill gaps using local keyword extraction
  const localData = extractProfileLocally(cleanMessage, safeHistory);
  const combinedText = normalize(cleanMessage);
  const combinedUserText = normalize(cleanMessage);
  const currentRequestedLevel = inferRequestedProgramLevel(cleanMessage);
  const previousRequestedLevel = inferRequestedProgramLevel(safeHistory.map(item => item.content).join(' '));
  const requestedLevel = currentRequestedLevel || previousRequestedLevel || (localData.level || undefined);
  const relevantRules = findRelevantAppRules(`${combinedUserText} ${cleanMessage}`);
  const hasCourseContext = includesAny(combinedText, [
    'course', 'courses', 'program', 'programs', 'degree', 'study', 'studies',
    'admission', 'admissions', 'university', 'college', 'after 12th', '12th pass',
    'class 12', 'secondary', 'intermediate', 'high school', 'master', 'diploma', 'bachelor',
  ]);

  if (!analysis) {
    analysis = { topic: 'general', confidence: 0, needsMoreInfo: false, profile: {} };
  }
  if (!analysis.profile) {
    analysis.profile = {};
  }

  // Merge locally extracted profile into Gemini analysis
  if (localData.level && !analysis.profile.level) { analysis.profile.level = localData.level; }
  if (localData.field && !analysis.profile.field) { analysis.profile.field = localData.field; }
  if (localData.score && !analysis.profile.score) { analysis.profile.score = localData.score; }
  if (requestedLevel) { analysis.profile.level = requestedLevel; }

  if (hasCourseContext || analysis.profile.level || analysis.profile.field) {
    analysis.topic = 'course';
    analysis.confidence = Math.max(analysis.confidence || 0, 0.8);
  }

  // Infer level from full conversation if still missing
  if (analysis.topic === 'course' && analysis.profile) {
    if (!analysis.profile.level || analysis.profile.level === 'Any') {
      const inferredLevel = inferLevel(`${cleanMessage} ${safeHistory.map(m => m.content).join(' ')}`);
      if (inferredLevel !== 'Any') { analysis.profile.level = inferredLevel; }
    }
    const hasLevel = analysis.profile.level && analysis.profile.level !== 'Any';
    const hasField = analysis.profile.field && analysis.profile.field.trim().length > 0;
    analysis.needsMoreInfo = !(hasLevel && hasField);
  }

  // ── Course Intent ──────────────────────────────────────────────────────────
  if (analysis.topic === 'course' && analysis.profile) {

    // Edge-case: 12th student asking for PG
    const fullUserContext = `${safeHistory
      .filter(item => item.role === 'user')
      .map(item => item.content)
      .join(' ')} ${cleanMessage}`;

    if (requestedLevel === 'PG' && hasSchoolQualification(fullUserContext) && !hasBachelorQualification(fullUserContext)) {
      return {
        reply: includesAny(combinedUserText, ['option', 'options', 'course', 'courses', 'kya kya', 'कौन', 'कौनसे'])
          ? buildMasterOptionsAfter12thReply(responseLanguage)
          : buildMasterPathReply(responseLanguage),
        responseLanguage,
        responseType: 'general',
        rules: relevantRules.map(rule => rule.id),
        knowledge: knowledgeHits.map(hit => hit.id),
        timestamp: Date.now(),
      };
    }

    // Still missing info — ask a specific follow-up question via Gemini
    if (analysis.needsMoreInfo) {
      const missingFieldsText: string[] = [];
      if (!analysis.profile.level) { missingFieldsText.push('education level (12th, B.Tech, etc.)'); }
      if (!analysis.profile.field) { missingFieldsText.push('field of interest (CS, engineering, business, etc.)'); }
      if (!analysis.profile.score) { missingFieldsText.push('academic score/GPA'); }
      if (!analysis.profile.country) { missingFieldsText.push('preferred study country'); }

      const missingInfo = missingFieldsText.length > 0
        ? `Ask ONE specific question to collect this missing info: ${missingFieldsText.join(', ')}. Do NOT ask the same question twice. Do NOT list courses yet.`
        : 'Ask ONE clarifying question to better understand their profile.';

      const followUp = await directGeminiChat(missingInfo, safeHistory, { temperature: 0.3, language: responseLanguage });
      return {
        reply: followUp,
        responseLanguage,
        responseType: 'general',
        timestamp: Date.now(),
      };
    }

    // Have enough profile info — search catalog for matches
    const allPrograms = ProgramService.search({
      qualification: `${analysis.profile.qualification || ''} ${combinedUserText}`,
      gpa:           analysis.profile.score || '',
      interests:     analysis.profile.field || '',
      preferredCountry: analysis.profile.country || '',
      targetLevel:   requestedLevel || 'Any',
    });
    const recentNames = getRecentlyRecommendedProgramNames(safeHistory);
    const questionIntent = inferQuestionIntent(cleanMessage);
    const filteredPrograms = questionIntent === 'alternative'
      ? allPrograms.filter(p => !recentNames.has(normalize(p.name)))
      : allPrograms;

    const topPrograms = (filteredPrograms.length ? filteredPrograms : allPrograms).slice(0, 5);
    const isFinalRecommendation = isFinalChoiceRequest(cleanMessage) && topPrograms.length > 0;
    const responsePrograms = isFinalRecommendation ? topPrograms.slice(0, 1) : topPrograms;


    // Build a catalog context string for Gemini
    const catalogContext = responsePrograms.length
      ? responsePrograms
          .map(p => `• ${p.name} | ${p.university}, ${p.country} | ${p.duration} | Intake: ${p.intake} | Eligibility: ${p.eligibility} | Careers: ${p.careerOpportunities.slice(0, 2).join(', ')}`)
          .join('\n')
      : 'No close matches found in catalog. Advise generally based on your knowledge.';

    // Let Gemini compose a context-aware, intelligent answer
    const geminiPrompt = `The student just said: "${cleanMessage}"

Conversation profile extracted so far:
- Education Level: ${analysis.profile.level || 'Not specified'}
- Field of Interest: ${analysis.profile.field || 'Not specified'}
- Score/GPA: ${analysis.profile.score || 'Not specified'}
- Preferred Country: ${analysis.profile.country || 'Not specified'}

Matching programs from our catalog:
${catalogContext}

INSTRUCTIONS:
1. Read the student's message carefully and answer EXACTLY what they asked.
2. If they asked for a list → recommend the most suitable ones from above based on their profile.
3. If they asked about careers → explain career paths.
4. If they asked about one specific program → give details about that program only.
5. Do NOT dump a generic list. Reason over their profile and the catalog context above.
6. Keep the response concise (2–4 sentences or a short list of max 3 items).
7. Reply in ${responseLanguage === 'hi' ? 'Hindi ONLY' : 'English ONLY'}.`;

    let finalReply = await directGeminiChat(geminiPrompt, safeHistory, {
      temperature: 0.5,
      language: responseLanguage,
      systemPrompt: buildSystemPrompt(),
    });

    if (isDuplicateReply(finalReply, safeHistory)) {
      const breakPrompt = `The student asked: "${cleanMessage}". Your last response was repeated. Give a FRESH, different helpful answer in ${responseLanguage === 'hi' ? 'Hindi' : 'English'} only.`;
      finalReply = await directGeminiChat(breakPrompt, safeHistory, { temperature: 0.8, language: responseLanguage });
    }

    return {
      reply: finalReply,
      responseLanguage,
      responseType: isFinalRecommendation ? 'final_recommendation' : 'recommendation',
      programs: responsePrograms,
      rules: relevantRules.map(rule => rule.id),
      knowledge: knowledgeHits.map(hit => hit.id),
      timestamp: Date.now(),
    };
  }

  // 7. General chat flow fallback
  let reply = 'AI request failed. Please check your network connection.';
  try {
    reply = await directGeminiChat(cleanMessage, safeHistory, {
      temperature: 0.3,
      userImage,
      language: responseLanguage,
    });

    if (isDuplicateReply(reply, safeHistory)) {
      const breakPrompt = `The user's query is: "${cleanMessage}". 
I have already given the response: "${reply}" recently. 
Please provide a different, helpful response in ${responseLanguage === 'hi' ? 'Hindi' : 'English'}. Answer their actual question directly, or ask a clarifying question. Do NOT repeat the previous answer.`;
      
      reply = await directGeminiChat(breakPrompt, safeHistory, { temperature: 0.7, language: responseLanguage });
    }
  } catch (error) {
    console.error('[ChatEngine] Fallback Chat error:', error);
  }

  return {
    reply,
    responseLanguage,
    responseType: 'general',
    timestamp: Date.now(),
  };
};
