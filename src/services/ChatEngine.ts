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
  responseType?: 'save_confirmation' | 'detail' | 'recommendation' | 'general';
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
  
  // Extract field
  let field = '';
  if (includesAny(normalized, ['computer', 'cs', 'it', 'software', 'कंप्यूटर', 'सीएस', 'आईटी', 'सॉफ्टवेयर'])) {
    field = 'computer science';
  } else if (includesAny(normalized, ['data science', 'data', 'analytics', 'डेटा', 'एनालिटिक्स'])) {
    field = 'data science';
  } else if (includesAny(normalized, ['engineering', 'engineer', 'इंजीनियर'])) {
    field = 'engineering';
  } else if (includesAny(normalized, ['business', 'commerce', 'management', 'mba', 'बिजनेस', 'कॉमर्स'])) {
    field = 'business';
  } else if (includesAny(normalized, ['healthcare', 'health', 'medical', 'nurse', 'हेल्थ', 'मेडिकल'])) {
    field = 'healthcare';
  }
  
  // Extract score
  const scoreMatch = fullText.match(/(\d{1,3})%/);
  const score = scoreMatch ? scoreMatch[1] : '';
  
  return { level, field, score };
};

const containsDevanagari = (message: string) => /[\u0900-\u097F]/.test(message);

const detectResponseLanguage = (message: string, _history: ConversationMessage[]): 'en' | 'hi' => {
  if (containsDevanagari(message)) return 'hi';

  const normalized = normalize(message);
  const hindiIndicators = [
    ' mujhe ', ' kya ', ' kaise ', ' kyu ', ' kyun ', ' batao ', ' chahiye ',
    ' karna ', ' kaun ', ' kis ', ' aap ', ' hai ', ' hain ', ' aapka ', ' mere '
  ];
  if (hindiIndicators.some(indicator => normalized.includes(indicator))) {
    return 'hi';
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
  
  // If no exact matches, try partial matching
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
    const programToSave = findProgramMentions(cleanMessage)[0] || findProgramMentions(safeHistory.map(m => m.content).join(' '))[0];
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
    if (requestedLevel === 'PG' && hasSchoolQualification(combinedUserText) && !hasBachelorQualification(combinedUserText)) {
      return {
        reply: buildMasterPathReply(responseLanguage),
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


    // Build a catalog context string for Gemini
    const catalogContext = topPrograms.length
      ? topPrograms
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
      responseType: 'recommendation',
      programs: topPrograms,
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
