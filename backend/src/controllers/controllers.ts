import {Request, Response} from 'express';
import OllamaService, {AssistantAnalysis} from '../services/GeminiService'; // Ollama-backed service with the same controller API
import ProgramService from '../services/ProgramService';
import {PROGRAM_CATALOG, ProgramCatalogItem} from '../data/programCatalog';
import {findRelevantAppRules} from '../data/appRules';
import VectorKnowledgeService, {KnowledgeHit} from '../services/VectorKnowledgeService';

type ProgramLevel = ProgramCatalogItem['level'];
type QuestionIntent = 'career' | 'opinion' | 'best_fit' | 'alternative' | 'compare' | 'detail';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
  image?: string | null;
  programs?: ProgramCatalogItem[];
};

const toSafeText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    const candidate = value as {content?: unknown; text?: unknown; message?: unknown};
    const nested = candidate.content ?? candidate.text ?? candidate.message;
    if (typeof nested === 'string') {
      return nested;
    }
  }

  return String(value);
};

const normalize = (text: unknown) =>
  toSafeText(text).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();

const includesAny = (text: string, keywords: string[]) =>
  keywords.some(keyword => text.includes(keyword));

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
  includesAny(normalize(text), ['12th', '12 pass', 'class 12', 'high school', 'secondary', 'intermediate', '10th']);

const hasBachelorQualification = (text: string) =>
  /\b(passed|completed|done|finished|have|holding)\s+(a\s+)?(bachelor|bachelor's|btech|b\.tech|b\.sc|bsc|b\.e|be|graduation|graduate)\b/i.test(text) ||
  /\b(bachelor's degree|bachelor degree|graduation completed|graduate with)\b/i.test(text);

const inferLevel = (text: string): 'UG' | 'PG' | 'Diploma' | 'Any' => {
  const t = normalize(text);
  if (includesAny(t, ['phd', 'doctorate', 'dr.'])) return 'PG';
  if (includesAny(t, ['master', 'msc', 'ma', 'mtech', 'mba', 'pg', 'post graduate', 'postgraduate'])) return 'PG';
  if (includesAny(t, ['diploma', 'certificate', 'polytechnic'])) return 'Diploma';
  if (includesAny(t, ['bachelor', 'be', 'btech', 'b.sc', 'bba', 'undergraduate', 'ug', 'b.a', 'b.com'])) return 'UG';
  if (includesAny(t, ['12th', '12 pass', 'class 12', 'high school', 'secondary', '10th', '10 pass'])) return 'UG';
  // Hindi education levels
  if (includesAny(t, ['12वीं', '12वीं पास', 'बारहवीं', 'दसवीं', '10वीं'])) return 'UG';
  if (includesAny(t, ['स्नातक', 'स्नातकोत्तर', 'मास्टर्स', 'पीजी'])) return 'PG';
  if (includesAny(t, ['डिप्लोमा'])) return 'Diploma';
  return 'Any';
};

const extractProfileLocally = (message: string, history: ConversationMessage[]) => {
  const fullText = `${history.filter(h => h.role === 'user').map(h => h.content).join(' ')} ${message}`;
  const normalized = normalize(fullText);
  const currentMessage = normalize(message);
  
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
  
  const extractField = (text: string) => {
    if (includesAny(text, ['biology', 'biological', 'pcb', 'medical', 'medicine', 'doctor', 'nursing', 'pharmacy', 'healthcare', 'health', 'बायोलॉजी', 'मेडिकल'])) {
      return 'biology and healthcare';
    }
    if (includesAny(text, ['data science', 'analytics', 'machine learning', 'डेटा', 'एनालिटिक्स'])) {
      return 'data science';
    }
    if (includesAny(text, ['computer science', 'computer', 'coding', 'software', 'कंप्यूटर', 'सीएस', 'आईटी', 'सॉफ्टवेयर'])) {
      return 'computer science';
    }
    if (includesAny(text, ['engineering', 'engineer', 'इंजीनियर'])) return 'engineering';
    if (includesAny(text, ['business', 'commerce', 'management', 'mba', 'बिजनेस', 'कॉमर्स'])) return 'business';
    return '';
  };

  // The newest message wins when the student corrects or changes their profile.
  const field = extractField(currentMessage) || extractField(normalized);
  
  // Extract score
  const scoreMatch = fullText.match(/(\d{1,3})%/);
  const score = scoreMatch ? scoreMatch[1] : '';
  
  return {level, field, score};
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
  'padhai', 'course', 'kaam',
  'dost', 'bhai', 'behen',
  'paisa', 'paise', 'rupaye',
  'saal', 'mahina', 'din',
  'baad', 'pehle', 'pahle',
  'saath', 'sath',
  'jaruri', 'zaroori', 'zaruri',
  'dusra', 'dusri', 'doosra', 'doosri',
  // Education-related Hinglish
  'padhna', 'padhke', 'padhta',
  'pass', 'paas',
  'barahvi', 'dasvi',
  'wahan', 'yahan', 'idhar', 'udhar',
  // Common phrases used as single words
  'suno', 'suniye', 'sunte',
  'chalo', 'chaliye', 'chalega',
  'pata', 'maloom',
  'shukriya', 'dhanyawad', 'dhanyavaad',
]);

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
  
  const bigramCount = HINDI_BIGRAMS.filter(bg => normalized.includes(bg)).length;
  if (bigramCount >= 1) return true;
  
  let hindiWordCount = 0;
  for (const word of words) {
    if (HINDI_WORDS.has(word)) {
      hindiWordCount++;
    }
  }
  
  if (words.length <= 5 && hindiWordCount >= 2) return true;
  if (words.length > 5 && hindiWordCount >= 3) return true;
  if (words.length > 0 && hindiWordCount / words.length >= 0.3) return true;
  
  return false;
};

const detectResponseLanguage = (message: string, history: ConversationMessage[]): 'en' | 'hi' => {
  if (containsDevanagari(message)) return 'hi';
  if (detectHinglish(message)) return 'hi';
  
  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-2);
  const recentHindi = recentAssistant.filter(m => {
    return containsDevanagari(m.content);
  });
  if (recentHindi.length >= 1) {
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

const transliterateText = (text: unknown): string => {
  let normalized = toSafeText(text).toLowerCase();
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

const isSaveIntent = (text: unknown): boolean => {
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

const isProgramSelectionIntent = (text: unknown): boolean => {
  const normalized = normalize(transliterateText(text));
  return includesAny(normalized, [
    'i choose',
    'i select',
    'i will take',
    'i will go with',
    'finalize this',
    'finalise this',
    'this is my final',
    'choose this course',
    'select this course',
    'go with this course',
    'ye final',
    'yeh final',
    'isko final',
    'is course ko final',
  ]);
};

const isFinalChoiceRequest = (text: unknown): boolean => {
  const normalized = normalize(transliterateText(text));
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

// const PROGRAM_NAME_LIST = [...PROGRAM_CATALOG]
//   .map(program => program.name)
//   .sort((a, b) => b.length - a.length);

const findProgramMentions = (text: unknown): ProgramCatalogItem[] => {
  const transliterated = transliterateText(text);
  const normalized = normalize(transliterated);
  const matches: ProgramCatalogItem[] = [];
  
  // Exact matches first
  PROGRAM_CATALOG.forEach(program => {
    if (normalized.includes(normalize(program.name))) {
      matches.push(program);
    }
  });
  
  // If no exact matches, try partial matching (first few key words)
  if (matches.length === 0) {
    PROGRAM_CATALOG.forEach(program => {
      const programWords = normalize(program.name).split(' ');
      const textHasMultipleWords = programWords.filter(word => 
        word.length > 3 && normalized.includes(word)
      ).length >= 2;
      if (textHasMultipleWords) {
        matches.push(program);
      }
    });
  }
  
  return matches;
};

const getCatalogProgramByName = (programName?: unknown) => {
  if (!programName) {
    return null;
  }

  const normalizedName = normalize(programName);
  return PROGRAM_CATALOG.find(program => normalize(program.name) === normalizedName) || null;
};

const isFollowUpProgramQuestion = (text: unknown) => {
  const normalized = normalize(text);
  return /it/i.test(normalized) || includesAny(normalized, [
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

const hasFreshQualificationSignal = (text: unknown) => {
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
      return getCatalogProgramByName(message.programs[0].name) || message.programs[0];
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
      (a, b) => (b.matchScore || 0) - (a.matchScore || 0),
    )[0];
    return getCatalogProgramByName(best.name) || best;
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

const resolveProgramFromKeywords = (message: unknown): ProgramCatalogItem | null => {
  const messageText = toSafeText(message);
  const keywordMatches = ProgramService.searchByKeyword(messageText);
  if (keywordMatches.length === 0) {
    return null;
  }

  if (keywordMatches.length === 1) {
    return keywordMatches[0];
  }

  const levelFiltered = filterProgramsByLevel(keywordMatches, messageText);
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
  // Search backwards through history to find any program mention
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];

    if (message.programs?.length) {
      return getCatalogProgramByName(message.programs[0].name) || message.programs[0];
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
): {program: ProgramCatalogItem | null; ambiguous: boolean} => {
  // 1. Check if current message directly mentions a program
  const directMentions = findProgramMentions(message);
  if (directMentions.length === 1) {
    return {program: directMentions[0], ambiguous: false};
  }

  if (directMentions.length > 1) {
    const recentProgramNames = getRecentlyRecommendedProgramNames(history);
    const recentMatch = directMentions.find(program => recentProgramNames.has(normalize(program.name)));

    if (recentMatch) {
      return {program: recentMatch, ambiguous: false};
    }

    return {program: null, ambiguous: true};
  }

  // 2. Resolve from the current message keywords if possible
  const keywordMatch = resolveProgramFromKeywords(message);
  if (keywordMatch) {
    return {program: keywordMatch, ambiguous: false};
  }

  if (isFinalChoiceRequest(message)) {
    const bestRecommended = getBestRecommendedProgram(history);
    if (bestRecommended) {
      return {program: bestRecommended, ambiguous: false};
    }
  }

  // 3. If it's a follow-up question, reuse the last recommended program from history
  if ((isFollowUpProgramQuestion(message) || isProgramSelectionIntent(message)) && !hasFreshQualificationSignal(message)) {
    const lastRecommended = getLastRecommendedProgram(history) || findLastMentionedProgram(history);
    if (lastRecommended) {
      return {program: lastRecommended, ambiguous: false};
    }
  }

  return {program: null, ambiguous: false};
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

const hasExplicitlyNoMathBackground = (text: unknown) => {
  const normalized = normalize(text);
  return includesAny(normalized, [
    'not math',
    'no math',
    'without math',
    'biology not math',
    'pcb background',
    'pcb stream',
    'maths nahi',
    'math nahi',
  ]);
};

const programMatchesField = (program: ProgramCatalogItem, field: unknown) => {
  const programText = normalize(`${program.name} ${program.fields.join(' ')}`);
  const normalizedField = normalize(field);

  if (includesAny(normalizedField, ['biology', 'health', 'medical', 'pharmacy', 'nursing'])) {
    return includesAny(programText, ['biology', 'health', 'medical', 'pharmacy', 'nursing']);
  }
  if (includesAny(normalizedField, ['data science', 'analytics', 'machine learning'])) {
    return includesAny(programText, ['data science', 'analytics', 'machine learning', 'statistics', 'ai']);
  }
  if (includesAny(normalizedField, ['computer', 'software', 'coding', 'it'])) {
    return includesAny(programText, ['computer', 'software', 'technology', ' it']);
  }
  if (includesAny(normalizedField, ['business', 'commerce', 'management'])) {
    return includesAny(programText, ['business', 'commerce', 'management', 'marketing']);
  }
  if (normalizedField.includes('engineering')) return programText.includes('engineering');
  return true;
};

const selectCompatiblePrograms = (
  programs: ProgramCatalogItem[],
  field: string,
  userContext: string,
) => programs.filter(program => {
  if (!programMatchesField(program, field)) return false;
  if (hasExplicitlyNoMathBackground(userContext) && /math|mathematics/i.test(program.eligibility)) return false;
  return true;
});

const buildRecommendationPrompt = (
  message: string,
  profile: NonNullable<AssistantAnalysis['profile']>,
  programs: ProgramCatalogItem[],
  language: 'en' | 'hi',
) => {
  const catalogContext = programs.length
    ? programs.slice(0, 5).map(program =>
        `- ${program.name}: ${program.eligibility}; careers: ${program.careerOpportunities.join(', ')}`,
      ).join('\n')
    : 'No catalog program is a strong subject and eligibility match.';

  return `Answer the student's latest question as an intelligent admission counsellor.

Latest question: ${message}
Student profile: ${JSON.stringify(profile)}
Compatible programs in this app's catalog:
${catalogContext}

Instructions:
1. Treat the latest user correction as authoritative. Never assume math when they say PCB, biology, or no math.
2. Answer the exact question first and briefly explain your reasoning.
3. Recommend only the compatible catalog programs listed above as programs available in this app.
4. Previous assistant recommendations may be wrong. Do not copy or defend program names from earlier assistant replies.
5. If there is no suitable catalog match, do not mention any previous catalog program as relevant. Say there is no direct match, then give useful general education paths from your knowledge, clearly labeling them as general options outside the current catalog.
6. Do not repeat a previous generic course list. Ask at most one useful follow-up question.
7. Reply in ${language === 'hi' ? 'natural Hindi/Hinglish' : 'English only'} using short paragraphs or a compact list.`;
};

const buildNoCatalogMatchReply = (field: string, language: 'en' | 'hi') => {
  const isBiologyProfile = includesAny(normalize(field), ['biology', 'health', 'medical', 'pharmacy', 'nursing']);

  if (isBiologyProfile) {
    return language === 'hi'
      ? 'आप सही हैं: PCB/biology background और बिना mathematics के Computer Science, IT Engineering, या Data Science सही recommendations नहीं हैं। मेरे current catalog में direct biology/medical UG match नहीं है। Catalog के बाहर general options में MBBS, BDS, B.Pharm, BSc Nursing, Biotechnology, Microbiology, Biochemistry, और Allied Health courses शामिल हैं। आप clinical work, research, pharmacy, या healthcare में से किस दिशा में जाना चाहते हैं?'
      : 'You are right: with a PCB/biology background and no mathematics, Computer Science, IT Engineering, and Data Science are not suitable recommendations. My current catalog has no direct biology or medical undergraduate match. General options outside the catalog include MBBS, BDS, B.Pharm, BSc Nursing, Biotechnology, Microbiology, Biochemistry, and allied health courses. Are you more interested in clinical work, research, pharmacy, or healthcare?';
  }

  return language === 'hi'
    ? 'मेरे current catalog में आपके profile का direct match नहीं है। मैं गलत course suggest नहीं करना चाहता। अपना preferred subject या career goal बताइए, ताकि मैं catalog के बाहर भी सही general pathways समझा सकूँ।'
    : 'My current catalog does not have a direct match for your profile, and I do not want to suggest an unsuitable course. Tell me your preferred subject or career goal, and I can explain suitable general pathways outside the catalog.';
};

const isUnusableRecommendationReply = (reply: string, programs: ProgramCatalogItem[]) => {
  const normalizedReply = normalize(reply);
  if (includesAny(normalizedReply, ['insert program', 'program name here', '[program name', 'placeholder'])) return true;
  if (programs.length > 0) return false;

  return PROGRAM_CATALOG.some(program => normalizedReply.includes(normalize(program.name)));
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
  knowledgeHits: KnowledgeHit[],
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

const parseEligibilityJson = (rawResult: string) => {
  const cleaned = rawResult.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Invalid eligibility JSON');
  }
};

const parseScoreValue = (input: string): number | undefined => {
  const normalized = normalize(input);
  const percentMatch = normalized.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (percentMatch?.[1]) {
    return Number(percentMatch[1]);
  }

  const gpaMatch = normalized.match(/(\d{1,2}(?:\.\d{1,2})?)\s*(?:\/\s*10|gpa)/);
  if (gpaMatch?.[1]) {
    const gpa = Number(gpaMatch[1]);
    if (Number.isFinite(gpa)) {
      return Math.min(100, Math.max(0, gpa * 10));
    }
  }

  const rawNumber = normalized.match(/\b(\d{1,3}(?:\.\d{1,2})?)\b/);
  if (rawNumber?.[1]) {
    return Number(rawNumber[1]);
  }

  return undefined;
};

const isDuplicateReply = (reply: string, history: ConversationMessage[]): boolean => {
  const assistantMessages = history.filter(m => m.role === 'assistant');
  if (assistantMessages.length === 0) return false;
  
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanReply = clean(reply);
  
  // Check if any of the last 2 assistant replies are identical to this reply
  const last2 = assistantMessages.slice(-2);
  return last2.some(m => clean(m.content) === cleanReply);
};

const sendResponse = async (
  res: Response,
  cleanMessage: string,
  safeHistory: ConversationMessage[],
  responseLanguage: 'en' | 'hi',
  payload: {
    reply: string;
    responseLanguage: 'en' | 'hi';
    responseType?: string;
    programs?: ProgramCatalogItem[];
    rules?: string[];
    knowledge?: string[];
    timestamp?: number;
  }
) => {
  let finalReply = payload.reply;
  if (isDuplicateReply(finalReply, safeHistory)) {
    console.log('[DUPLICATE DETECTED] Breaking cycle...');
    const breakPrompt = `The user's query is: "${cleanMessage}". 
I have already given the response: "${finalReply}" recently. 
Please provide a different, helpful response in ${responseLanguage === 'hi' ? 'Hindi' : 'English'}. Answer their actual question directly, or ask a clarifying question. Do NOT repeat the list of courses or the previous answer.`;
    
    finalReply = await OllamaService.chat(
      breakPrompt,
      safeHistory,
      {temperature: 0.7, language: responseLanguage}
    );
  }
  res.json({
    ...payload,
    reply: finalReply,
    timestamp: payload.timestamp || Date.now(),
  });
};

const buildLocalEligibilityResult = (qualification: string, percentage: string, englishScore: string, workExperience: string) => {
  const qualificationText = normalize(qualification);
  const scoreValue = parseScoreValue(percentage);
  const englishScoreValue = parseScoreValue(englishScore);
  const hasWorkExperience = workExperience.trim().length > 0 && !includesAny(normalize(workExperience), ['none', 'no']);

  const scoredPrograms = PROGRAM_CATALOG.map(program => {
    let score = 0;

    if (qualificationText.includes('computer') || qualificationText.includes('science') || qualificationText.includes('it')) {
      if (program.fields.some(field => includesAny(normalize(field), ['computer', 'it', 'technology', 'software']))) {
        score += 3;
      }
    }

    if (scoreValue !== undefined && program.minGpa !== undefined) {
      if (scoreValue >= program.minGpa * 10) {
        score += 3;
      } else {
        score -= 3;
      }
    }

    if (qualificationText && program.minQualificationKeywords.some(keyword => qualificationText.includes(keyword))) {
      score += 2;
    }

    if (program.level === inferLevel(qualification)) {
      score += 2;
    }

    if (englishScoreValue !== undefined && englishScoreValue >= 65) {
      score += 1;
    }

    if (hasWorkExperience && program.level === 'PG') {
      score += 1;
    }

    return {program, score};
  });

  const eligible = scoredPrograms
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => ({
      name: item.program.name,
      university: item.program.university,
      country: item.program.country,
      minimumRequirement: item.program.eligibility,
      status: 'eligible' as const,
      reason:
        scoreValue !== undefined && item.program.minGpa !== undefined && scoreValue >= item.program.minGpa * 10
          ? 'Your score meets the catalog minimum.'
          : 'Your profile matches the catalog entry.',
    }));

  const notEligible = scoredPrograms
    .filter(item => item.score < 2)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map(item => ({
      name: item.program.name,
      university: item.program.university,
      country: item.program.country,
      minimumRequirement: item.program.eligibility,
      status: 'not_eligible' as const,
      reason: 'Your current profile does not match the catalog requirements as well as the eligible options.',
    }));

  return {
    eligibleCourses: eligible,
    notEligibleCourses: notEligible,
    summary:
      eligible.length > 0
        ? 'These programs best match your current profile.'
        : 'No strong match found. Please refine your qualification or score.',
    recommendations: eligible.map(item => item.name),
  };
};

export const healthController = (_req: Request, res: Response) => {
  res.json({status: 'ok', timestamp: Date.now()});
};

export const chatController = async (req: Request, res: Response) => {
  try {
    const {message, history, image} = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({reply: 'Message is required', timestamp: Date.now()});
      return;
    }

    const safeHistory = Array.isArray(history) ? history : [];
    const cleanMessage = message.trim();
    const responseLanguage = detectResponseLanguage(cleanMessage, safeHistory);
    const knowledgeHits = VectorKnowledgeService.search(cleanMessage);

    // ── Save program intent check ──────────────────────────────────────────
    if (isSaveIntent(cleanMessage)) {
      const programToSave = findProgramMentions(cleanMessage)[0] || findProgramMentions(safeHistory.map(m => m.content).join(' '))[0];
      if (programToSave) {
        await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
          reply:
            responseLanguage === 'hi'
              ? `${programToSave.name} आपके saved programs में जोड़ दिया गया है.`
              : `${programToSave.name} has been added to your saved programs.`,
          responseLanguage,
          responseType: 'save_confirmation',
          programs: [programToSave],
        });
        return;
      }
    }

    // ── "List all" shortcut ────────────────────────────────────────────────
    const listAllRegex = /\b(all|list|show all|give me all|show|display|tell me)\b.*\b(course|program|option|programs|courses)s?\b/i;
    const isListRequest = listAllRegex.test(cleanMessage) ||
                          includesAny(normalize(cleanMessage), ['course list', 'courses list', 'program list', 'list of programs', 'list of courses', 'all programs', 'all courses', 'सभी कोर्स', 'सभी प्रोग्राम']);
    if (isListRequest) {
      const programs = ProgramService.getAllPrograms();
      res.json({
        reply:
          responseLanguage === 'hi'
            ? 'मेरे कैटलॉग में उपलब्ध सभी कोर्स यहाँ हैं:'
            : 'Here are all the courses I have in my catalog:',
        programs,
        responseLanguage,
        timestamp: Date.now(),
      });
      return;
    }
    const userImage = typeof image === 'string' ? image : undefined;

    if (isGreetingMessage(cleanMessage)) {
      const reply = await OllamaService.chat(cleanMessage, safeHistory, {userImage, language: responseLanguage});
      await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {reply, responseLanguage});
      return;
    }

    // ── Direct program follow-up flow ─────────────────────────────────────
    const finalChoiceRequested = isFinalChoiceRequest(cleanMessage);
    const finalizedProgram = finalChoiceRequested ? getBestRecommendedProgram(safeHistory) : null;
    const programContext = finalizedProgram
      ? {program: finalizedProgram, ambiguous: false}
      : resolveProgramFromConversation(cleanMessage, safeHistory);
    if (programContext.program) {
      const reply = buildThoughtfulProgramReply(
        programContext.program,
        cleanMessage,
        safeHistory,
        responseLanguage,
        knowledgeHits,
      );
      await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
        reply,
        responseLanguage,
        responseType:
          isProgramSelectionIntent(cleanMessage) || finalChoiceRequested
            ? 'final_recommendation'
            : 'detail',
        programs: [programContext.program],
        knowledge: knowledgeHits.map(hit => hit.id),
      });
      return;
    }

    if (programContext.ambiguous) {
      const level = inferLevel(`${cleanMessage} ${safeHistory.map(m => m.content).join(' ')}`);
      if (level !== 'Any') {
        const searchInput = `${cleanMessage} ${safeHistory.map(item => item.content).join(' ')}`;
        const programs = ProgramService.search({
          qualification: searchInput,
          gpa: '',
          interests: searchInput,
          preferredCountry: '',
          targetLevel: level,
        });

        if (programs.length > 0) {
          const recommendation = buildProgramRecommendationReply(programs, responseLanguage);
          await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
            reply: recommendation.reply,
            responseLanguage,
            responseType: 'recommendation',
            programs: recommendation.programs,
            knowledge: knowledgeHits.map(hit => hit.id),
          });
          return;
        }

        await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
          reply:
            responseLanguage === 'hi'
              ? 'पिछली सूची में आप किस कोर्स की बात कर रहे हैं?'
              : 'Which course do you mean from the previous list?',
          responseLanguage,
        });
        return;
      }
    }

    // ── Analyze intent ─────────────────────────────────────────────────────
    let analysis = await OllamaService.analyzeConversation(cleanMessage, safeHistory);
    console.log('[ANALYSIS BEFORE PROCESSING]', JSON.stringify(analysis, null, 2));
    
    // ── LOCAL EXTRACTION — Fill gaps in AI analysis ────────────────────────
    const localData = extractProfileLocally(cleanMessage, safeHistory);
    const combinedText = normalize(cleanMessage);
    const combinedUserText = normalize(cleanMessage);
    const currentRequestedLevel = inferRequestedProgramLevel(cleanMessage);
    const previousRequestedLevel = inferRequestedProgramLevel(safeHistory.map(item => item.content).join(' '));
    const requestedLevel = currentRequestedLevel || previousRequestedLevel || (localData.level || undefined);
    const relevantRules = findRelevantAppRules(`${combinedUserText} ${cleanMessage}`);
    const hasCourseContext = includesAny(combinedText, [
      'course',
      'courses',
      'program',
      'programs',
      'degree',
      'study',
      'studies',
      'admission',
      'admissions',
      'university',
      'college',
      'after 12th',
      '12th pass',
      'class 12',
      'secondary',
      'intermediate',
      'high school',
      'master',
      'diploma',
      'bachelor',
    ]);

    if (!analysis) {
      analysis = {
        topic: 'general',
        confidence: 0,
        needsMoreInfo: false,
        profile: {},
      };
    }

    if (!analysis.profile) {
      analysis.profile = {};
    }

    if (localData.level && !analysis.profile.level) {
      analysis.profile.level = localData.level;
    }
    if (localData.field && !analysis.profile.field) {
      analysis.profile.field = localData.field;
    }
    if (localData.score && !analysis.profile.score) {
      analysis.profile.score = localData.score;
    }
    if (requestedLevel) {
      analysis.profile.level = requestedLevel;
    }

    if (hasCourseContext || analysis.profile.level || analysis.profile.field) {
      analysis.topic = 'course';
      analysis.confidence = Math.max(analysis.confidence || 0, 0.8);
    }
    console.log('[ANALYSIS WITH LOCAL EXTRACTION]', JSON.stringify(analysis, null, 2));
    
    // ── Smart post-processing of analysis ──────────────────────────────────
    if (analysis?.topic === 'course' && analysis?.profile) {
      // Try to infer missing level from current message if not captured
      if (!analysis.profile.level || analysis.profile.level === 'Any') {
        const inferredLevel = inferLevel(`${cleanMessage} ${safeHistory.map(m => m.content).join(' ')}`);
        if (inferredLevel !== 'Any') {
          analysis.profile.level = inferredLevel;
        }
      }
      
      // Check if we have enough info now (level + field is minimum)
      const hasLevel = analysis.profile.level && analysis.profile.level !== 'Any';
      const hasField = analysis.profile.field && analysis.profile.field.trim().length > 0;
      
      // Only mark needsMoreInfo if we're genuinely missing critical info
      analysis.needsMoreInfo = !(hasLevel && hasField);
    }
    
    console.log('[ANALYSIS AFTER PROCESSING]', JSON.stringify(analysis, null, 2));

    // ── Course recommendation flow ─────────────────────────────────────────
    if (analysis?.topic === 'course' && analysis?.profile) {
      const fullUserContext = `${safeHistory
        .filter(item => item.role === 'user')
        .map(item => item.content)
        .join(' ')} ${cleanMessage}`;

      if (requestedLevel === 'PG' && hasSchoolQualification(fullUserContext) && !hasBachelorQualification(fullUserContext)) {
        await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
          reply: includesAny(combinedUserText, ['option', 'options', 'course', 'courses', 'kya kya', 'कौन', 'कौनसे'])
            ? buildMasterOptionsAfter12thReply(responseLanguage)
            : buildMasterPathReply(responseLanguage),
          responseLanguage,
          responseType: 'general',
          rules: relevantRules.map(rule => rule.id),
          knowledge: knowledgeHits.map(hit => hit.id),
        });
        return;
      }

      // Still missing info — ask one follow-up question
      if (analysis.needsMoreInfo) {
        const missingFieldsText = [];
        if (!analysis.profile.level) missingFieldsText.push('education level (12th, B.Tech, etc.)');
        if (!analysis.profile.field) missingFieldsText.push('field of interest (CS, engineering, etc.)');
        if (!analysis.profile.score) missingFieldsText.push('academic score/GPA');
        if (!analysis.profile.country) missingFieldsText.push('preferred country');
        
        const missingInfo = missingFieldsText.length > 0 
          ? `Ask ONE specific question to collect this: ${missingFieldsText.join(', ')}. Do NOT ask the same question twice.`
          : 'Ask ONE clarifying question to better understand their profile.';
        
        const followUp = await OllamaService.chat(
          missingInfo,
          safeHistory,
          {temperature: 0.3, language: responseLanguage},
        );
        await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {reply: followUp, responseLanguage});
        return;
      }

      // Have enough info — search catalog and explain matches
      const questionIntent = inferQuestionIntent(cleanMessage);
      const allPrograms = ProgramService.search({
        qualification: `${analysis.profile.qualification || ''} ${fullUserContext}`,
        gpa:           analysis.profile.score || '',
        interests:     analysis.profile.field || '',
        preferredCountry: analysis.profile.country || '',
        targetLevel: requestedLevel || 'Any',
      });
      const compatiblePrograms = selectCompatiblePrograms(
        allPrograms,
        analysis.profile.field || '',
        fullUserContext,
      );
      const recentNames = getRecentlyRecommendedProgramNames(safeHistory);
      const programs = questionIntent === 'alternative'
        ? compatiblePrograms.filter(program => !recentNames.has(normalize(program.name)))
        : compatiblePrograms;
      const isFinalRecommendation = finalChoiceRequested && programs.length > 0;
      const responsePrograms = isFinalRecommendation ? programs.slice(0, 1) : programs;

      let reply = await OllamaService.chat(
        buildRecommendationPrompt(cleanMessage, analysis.profile, responsePrograms, responseLanguage),
        safeHistory.filter(item => item.role === 'user'),
        {
          systemPrompt: `You are ARIA, a thoughtful AI admission counsellor. Reason from the full conversation and the student's latest correction. Catalog facts are authoritative for programs available in the app, while general educational guidance is allowed when clearly identified as outside the catalog.`,
          temperature: 0.35,
          maxOutputTokens: 420,
          language: responseLanguage,
        },
      );
      if (isUnusableRecommendationReply(reply, responsePrograms)) {
        reply = buildNoCatalogMatchReply(analysis.profile.field || '', responseLanguage);
      }

      await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
        reply,
        responseLanguage,
        responseType: isFinalRecommendation ? 'final_recommendation' : 'recommendation',
        programs: responsePrograms,
        rules: relevantRules.map(rule => rule.id),
        knowledge: knowledgeHits.map(hit => hit.id),
      });
      return;
    }

    // ── General chat flow ──────────────────────────────────────────────────
    const reply = await OllamaService.chat(cleanMessage, safeHistory, {
      temperature: 0.3,
      userImage,
      language: responseLanguage,
    });

    await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {reply, responseLanguage});
  } catch (error: any) {
    console.error('[ChatController] Error:', error?.message || error);
    // Ollama is offline or unreachable
    res.status(500).json({
      reply: "I'm having trouble connecting to Ollama. Please check that the Ollama service is running and reachable.",
      timestamp: Date.now(),
    });
  }
};

export const programFinderController = async (req: Request, res: Response) => {
  try {
    const {qualification, gpa, interests, preferredCountry} = req.body;

    if (!qualification || !interests) {
      res.status(400).json({message: 'qualification and interests are required'});
      return;
    }

    const userProfileAnalysis = await OllamaService.analyzeConversation(
      `Highest qualification: ${qualification}. GPA: ${gpa || 'not provided'}. Interests: ${interests}. Preferred country: ${preferredCountry || 'not provided'}`,
      [],
    );

    const programs = ProgramService.search({
      qualification: qualification || '',
      gpa:           gpa || '',
      interests:     interests || '',
      preferredCountry: preferredCountry || '',
    });

    const summary = await OllamaService.chat(
      `You are ARIA. In one short sentence, explain why these programs fit the student's profile.
Profile: ${JSON.stringify(userProfileAnalysis?.profile || {})}
Programs: ${JSON.stringify(programs.map(p => ({name: p.name, level: p.level, field: p.fields, country: p.country})))}`,
      [],
      {temperature: 0.2, maxOutputTokens: 80},
    );

    res.json({
      programs,
      summary,
      totalFound: programs.length,
      suggestedLevel: userProfileAnalysis?.profile?.level || 'Any',
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('[ProgramFinderController] Error:', error?.message || error);
    res.status(500).json({message: 'Program search failed', timestamp: Date.now()});
  }
};

export const eligibilityController = async (req: Request, res: Response) => {
  try {
    const {qualification, percentage, englishScore, workExperience} = req.body;

    if (!qualification || !percentage) {
      res.status(400).json({message: 'qualification and percentage are required'});
      return;
    }

    const rawResult = await OllamaService.checkEligibility({
      qualification,
      percentage,
      englishScore: englishScore || 'Not provided',
      workExperience: workExperience || 'None',
    });

    const result = parseEligibilityJson(rawResult);

    res.json({...result, timestamp: Date.now()});
  } catch (error: any) {
    console.error('[EligibilityController] Error:', error?.message || error);

    const fallback = buildLocalEligibilityResult(
      String(req.body?.qualification || ''),
      String(req.body?.percentage || ''),
      String(req.body?.englishScore || 'Not provided'),
      String(req.body?.workExperience || 'None'),
    );

    res.json({...fallback, timestamp: Date.now(), source: 'local_fallback'});
  }
};
