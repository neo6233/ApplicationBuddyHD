"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eligibilityController = exports.programFinderController = exports.chatController = exports.healthController = void 0;
const GeminiService_1 = __importDefault(require("../services/GeminiService")); // Ollama-backed service with the same controller API
const ProgramService_1 = __importDefault(require("../services/ProgramService"));
const programCatalog_1 = require("../data/programCatalog");
const appRules_1 = require("../data/appRules");
const VectorKnowledgeService_1 = __importDefault(require("../services/VectorKnowledgeService"));
const pdf_parse_1 = require("pdf-parse");
const mammoth_1 = __importDefault(require("mammoth"));
const sharp_1 = __importDefault(require("sharp"));
const toSafeText = (value) => {
    if (typeof value === 'string') {
        return value;
    }
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        const candidate = value;
        const nested = candidate.content ?? candidate.text ?? candidate.message;
        if (typeof nested === 'string') {
            return nested;
        }
    }
    return String(value);
};
const normalize = (text) => toSafeText(text).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const includesAny = (text, keywords) => keywords.some(keyword => text.includes(keyword));
const isPdfDocument = (mimeType, fileName) => (typeof mimeType === 'string' && mimeType.toLowerCase().includes('pdf')) ||
    (typeof fileName === 'string' && fileName.toLowerCase().endsWith('.pdf'));
const isWordDocument = (mimeType, fileName) => {
    const normalizedMimeType = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
    const normalizedFileName = typeof fileName === 'string' ? fileName.toLowerCase() : '';
    return (normalizedMimeType.includes('word') ||
        normalizedMimeType.includes('officedocument.wordprocessingml') ||
        normalizedFileName.endsWith('.doc') ||
        normalizedFileName.endsWith('.docx'));
};
const isImageDocument = (mimeType, fileName) => {
    const normalizedMimeType = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
    const normalizedFileName = typeof fileName === 'string' ? fileName.toLowerCase() : '';
    return (normalizedMimeType.startsWith('image/') ||
        /\.(?:jpe?g|png|webp|heic|heif)$/i.test(normalizedFileName));
};
const extractPdfTextFromBase64 = async (base64) => {
    const parser = new pdf_parse_1.PDFParse({ data: Buffer.from(base64, 'base64') });
    try {
        const result = await parser.getText();
        return toSafeText(result.text).replace(/\s+/g, ' ').trim();
    }
    finally {
        await parser.destroy();
    }
};
const extractWordTextFromBase64 = async (base64) => {
    const result = await mammoth_1.default.extractRawText({ buffer: Buffer.from(base64, 'base64') });
    return toSafeText(result.value).replace(/\s+/g, ' ').trim();
};
const extractEligibilityProfileLocallyFromText = (documentText) => {
    const text = toSafeText(documentText).replace(/\s+/g, ' ').trim();
    const educationSection = text.match(/\bEDUCATION\b(.{0,450}?)(?:\bSKILLS\b|\bEXPERIENCE\b|\bPROJECTS\b|\bCERTIFICATIONS\b|$)/i)?.[1] || text;
    const educationMatch = educationSection.match(/\b((?:Bachelor|Master|B\.Tech|BTech|B\.Sc|BSc|B\.E|BE|MBA|MCA|Diploma|Higher Secondary|12th)(?:\s+(?:of|in|Science|Arts|Engineering|Technology|Computer|Information|Business|Data|Management|Commerce|Administration|[A-Z][a-z]+)){0,12})/i);
    const gpaMatch = text.match(/\b(\d{1,2}(?:\.\d{1,2})?\s*(?:\/\s*10|CGPA|GPA)|\d{2,3}(?:\.\d{1,2})?\s*%)\b/i);
    const englishMatch = text.match(/\b((?:IELTS|PTE|TOEFL)\s*[:\-]?\s*\d{1,3}(?:\.\d{1,2})?)\b/i);
    const experienceMatch = text.match(/\b(EXPERIENCE|WORK EXPERIENCE|INTERNSHIP|INTERNSHIPS)\b(.{0,700})/i);
    return {
        qualification: educationMatch?.[1]?.trim() || '',
        percentage: gpaMatch?.[1]?.trim() || '',
        englishScore: englishMatch?.[1]?.trim() || '',
        workExperience: experienceMatch?.[2]
            ? experienceMatch[2]
                .replace(/\b(EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|STRENGTHS)\b.*$/i, '')
                .trim()
                .slice(0, 260)
            : '',
    };
};
const convertImageBase64ToPng = async (base64) => {
    const pngBuffer = await (0, sharp_1.default)(Buffer.from(base64, 'base64'))
        .rotate()
        .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    return pngBuffer.toString('base64');
};
const sanitizeConversationHistory = (history) => {
    if (!Array.isArray(history)) {
        return [];
    }
    return history
        .map(item => {
        const message = item;
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const content = toSafeText(message.content);
        const image = typeof message.image === 'string' ? message.image : null;
        const programs = Array.isArray(message.programs)
            ? message.programs.filter(program => program && typeof program === 'object')
            : undefined;
        return {
            role,
            content,
            image,
            ...(programs?.length ? { programs } : {}),
        };
    })
        .filter(message => message.content.trim().length > 0 || message.programs?.length);
};
const inferQuestionIntent = (text) => {
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
const isAlternativeReasonQuestion = (text) => {
    const normalized = normalize(text);
    return includesAny(normalized, [
        'why another course',
        'why other course',
        'why this course',
        'why this program',
        'why data science',
        'means why',
        'reason',
    ]);
};
const isCareerExplorationContext = (message, history) => {
    const normalized = normalize(`${history.filter(item => item.role === 'user').map(item => item.content).join(' ')} ${message}`);
    const broadCareer = includesAny(normalized, [
        'career option',
        'career options',
        'choose career',
        'career path',
        'career advice',
        'what should i do',
        'what can i do',
        'help me choose',
        'career choices',
        'career direction',
        'job options',
        'job roles',
    ]);
    const explicitProgramAsk = includesAny(normalized, [
        'program',
        'course',
        'college',
        'university',
        'degree',
        'diploma',
        'bachelor',
        'master',
        'apply',
        'admission',
    ]);
    return broadCareer && !explicitProgramAsk;
};
const isCivilServiceQuestion = (text) => {
    const normalized = normalize(text);
    return includesAny(normalized, [
        'ias',
        'pcs',
        'upsc',
        'civil service',
        'civil services',
        'public service commission',
        'state pcs',
    ]);
};
const buildCivilServiceReply = (language) => {
    if (language === 'hi') {
        return [
            'IAS/PCS ke liye aap kisi bhi recognized bachelor degree ke baad eligible hote hain. 12th ke baad pehle graduation complete karein.',
            'Best path: 1. 12th ke baad BA/BSc/BCom/BBA ya koi bhi degree choose karein. 2. Graduation ke saath NCERT, current affairs, polity, history, geography, economy aur aptitude prepare karein. 3. UPSC/State PCS syllabus aur previous year papers follow karein.',
            'Agar aap abhi 12th ke baad course choose kar rahe hain, BA Political Science, History, Public Administration, Economics, Sociology, ya BSc/BCom bhi useful ho sakte hain. Mere app catalog mein direct IAS/PCS course nahi hai, but bachelor degree planning mein main help kar sakta hoon.',
        ].join('\n\n');
    }
    return [
        'For IAS/PCS, you first need to complete a recognized bachelor degree. You cannot apply directly after 12th.',
        'Best path: 1. Choose any bachelor degree after 12th. 2. Alongside graduation, prepare NCERTs, current affairs, polity, history, geography, economy, and aptitude. 3. Follow the UPSC or State PCS syllabus and previous year papers.',
        'Helpful bachelor subjects include Political Science, History, Public Administration, Economics, Sociology, BA, BSc, BCom, or BBA. My app catalog does not have a direct IAS/PCS program, but I can help you choose a suitable bachelor path.',
    ].join('\n\n');
};
const inferRequestedProgramLevel = (text) => {
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
const hasSchoolQualification = (text) => /\b(?:after\s+(?:my\s+)?|class\s*)12\b|\b12\s*(?:pass|standard|std|grade)\b/i.test(normalize(text)) ||
    includesAny(normalize(text), ['12th', '12 pass', 'class 12', 'high school', 'secondary', 'intermediate', '10th']);
const isAfter12CatalogFilterRequest = (text) => {
    const normalized = normalize(text);
    const asksForCatalogOptions = /\b(?:which|what)\b[\s\S]*\b(?:course|courses|program|programs|option|options)\b/i.test(normalized) ||
        /\b(?:course|courses|program|programs|option|options)\b[\s\S]*\b(?:available|eligible|possible|can i do|can do|pursue|list|show)\b/i.test(normalized) ||
        includesAny(normalized, [
            'course options',
            'program options',
            'list courses',
            'show courses',
            'show programs',
            'which i can',
            'kya kya',
            'कौनसे',
            'कौन से',
        ]);
    return hasSchoolQualification(normalized) && asksForCatalogOptions && includesAny(normalized, [
        'only',
        'can i do',
        'can do',
        'directly',
        'eligible',
        'pursue',
        'available',
        'possible',
        'which i can',
        'course options',
        'program options',
        'list courses',
        'show courses',
        'show programs',
        'kya kya',
        'कौनसे',
        'कौन से',
    ]);
};
const getProgramsForRequestedLevel = (level) => {
    if (level === 'UG') {
        return ProgramService_1.default.getAllPrograms().filter(program => program.level === 'UG' || program.level === 'Diploma');
    }
    if (level === 'Any') {
        return ProgramService_1.default.getAllPrograms();
    }
    return ProgramService_1.default.getAllPrograms().filter(program => program.level === level);
};
const hasBachelorQualification = (text) => /\b(passed|completed|done|finished|have|holding)\s+(a\s+)?(bachelor|bachelor's|btech|b\.tech|b\.sc|bsc|b\.e|be|graduation|graduate)\b/i.test(text) ||
    /\b(bachelor's degree|bachelor degree|graduation completed|graduate with)\b/i.test(text);
const hasSchoolOnlyQualification = (text) => hasSchoolQualification(text) && !hasBachelorQualification(text);
const hasBachelorLevelQualification = (text) => includesAny(normalize(text), [
    'bachelor',
    "bachelor's",
    'bachelors',
    'btech',
    'b.tech',
    'b.sc',
    'bsc',
    'bba',
    'b.e',
    'graduation',
    'graduate',
    'undergraduate degree',
]);
const inferLevel = (text) => {
    const t = normalize(text);
    if (includesAny(t, ['phd', 'doctorate', 'dr.']))
        return 'PG';
    if (includesAny(t, ['master', 'msc', 'mtech', 'mba', 'post graduate', 'postgraduate']) || /\b(?:ma|pg)\b/i.test(t))
        return 'PG';
    if (includesAny(t, ['diploma', 'certificate', 'polytechnic']))
        return 'Diploma';
    if (includesAny(t, ['bachelor', 'be', 'btech', 'b.sc', 'bba', 'undergraduate', 'ug', 'b.a', 'b.com']))
        return 'UG';
    if (includesAny(t, ['12th', '12 pass', 'class 12', 'high school', 'secondary', '10th', '10 pass']))
        return 'UG';
    if (/\b(?:after\s+(?:my\s+)?|class\s*)12\b|\b12\s*(?:pass|standard|std|grade)\b/i.test(t))
        return 'UG';
    // Hindi education levels
    if (includesAny(t, ['12वीं', '12वीं पास', 'बारहवीं', 'दसवीं', '10वीं']))
        return 'UG';
    if (includesAny(t, ['स्नातक', 'स्नातकोत्तर', 'मास्टर्स', 'पीजी']))
        return 'PG';
    if (includesAny(t, ['डिप्लोमा']))
        return 'Diploma';
    return 'Any';
};
const inferEligibilityTargetLevel = (qualification) => {
    const normalized = normalize(qualification);
    const schoolLevelOnly = hasSchoolQualification(normalized) && !hasBachelorLevelQualification(normalized);
    if (schoolLevelOnly) {
        return 'UG';
    }
    if (hasBachelorLevelQualification(normalized)) {
        return 'PG';
    }
    const currentLevel = inferLevel(qualification);
    if (currentLevel === 'Diploma') {
        return 'UG';
    }
    if (currentLevel === 'PG') {
        return 'PG';
    }
    return 'Any';
};
const extractProfileLocally = (message, history) => {
    const fullText = `${history.filter(h => h.role === 'user').map(h => h.content).join(' ')} ${message}`;
    const normalized = normalize(fullText);
    const currentMessage = normalize(message);
    // Extract level
    let level = '';
    if (includesAny(normalized, ['12th', '12वीं', 'बारहवीं', 'secondary', 'intermediate', 'इंटरमीडिएट'])) {
        level = 'UG';
    }
    else if (includesAny(normalized, ['bachelor', 'be', 'btech', 'b.tech', 'b.sc', 'बीटेक', 'बीएससी'])) {
        level = 'UG';
    }
    else if (includesAny(normalized, ['master', 'mtech', 'msc', 'mba', 'pg', 'postgraduate', 'मास्टर', 'एमबीए'])) {
        level = 'PG';
    }
    else if (includesAny(normalized, ['diploma', 'डिप्लोमा'])) {
        level = 'Diploma';
    }
    const extractField = (text) => {
        if (includesAny(text, ['physics chemistry mathematics', 'physics chemistry and mathematics', 'pcm', 'physics', 'chemistry', 'mathematics', 'maths', 'math'])) {
            return 'math science pcm';
        }
        if (includesAny(text, ['biology', 'biological', 'pcb', 'medical', 'medicine', 'doctor', 'nursing', 'pharmacy', 'healthcare', 'health', 'बायोलॉजी', 'मेडिकल'])) {
            return 'biology and healthcare';
        }
        if (includesAny(text, ['data science', 'analytics', 'machine learning', 'डेटा', 'एनालिटिक्स'])) {
            return 'data science';
        }
        if (includesAny(text, ['computer science', 'computer', 'coding', 'software', 'कंप्यूटर', 'सीएस', 'आईटी', 'सॉफ्टवेयर'])) {
            return 'computer science';
        }
        if (includesAny(text, ['engineering', 'engineer', 'इंजीनियर']))
            return 'engineering';
        if (includesAny(text, ['business', 'commerce', 'management', 'mba', 'बिजनेस', 'कॉमर्स']))
            return 'business';
        return '';
    };
    // The newest message wins when the student corrects or changes their profile.
    const field = extractField(currentMessage) || extractField(normalized);
    // Extract score
    const scoreMatch = fullText.match(/(\d{1,3})%/);
    const score = scoreMatch ? scoreMatch[1] : '';
    return { level, field, score };
};
const containsDevanagari = (message) => /[\u0900-\u097F]/.test(message);
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
const AMBIGUOUS_HINGLISH_WORDS = new Set([
    'hi',
    'me',
    'the',
    'to',
    'do',
    'course',
    'pass',
    'ya',
]);
const detectHinglish = (text) => {
    const normalized = normalize(text);
    const words = normalized
        .split(/\s+/)
        .map(word => word.replace(/[^a-z0-9.-]/g, ''))
        .filter(Boolean);
    const bigramCount = HINDI_BIGRAMS.filter(bg => normalized.includes(bg)).length;
    if (bigramCount >= 1)
        return true;
    let hindiWordCount = 0;
    let strongHindiWordCount = 0;
    for (const word of words) {
        if (HINDI_WORDS.has(word)) {
            hindiWordCount++;
            if (!AMBIGUOUS_HINGLISH_WORDS.has(word)) {
                strongHindiWordCount++;
            }
        }
    }
    if (strongHindiWordCount === 0)
        return false;
    if (words.length <= 5 && strongHindiWordCount >= 2)
        return true;
    if (words.length > 5 && strongHindiWordCount >= 2 && hindiWordCount >= 3)
        return true;
    if (words.length > 0 && strongHindiWordCount >= 2 && hindiWordCount / words.length >= 0.3)
        return true;
    return false;
};
const detectResponseLanguage = (message, history) => {
    if (containsDevanagari(message))
        return 'hi';
    if (detectHinglish(message))
        return 'hi';
    const recentAssistant = history.filter(m => m.role === 'assistant').slice(-2);
    const recentHindi = recentAssistant.filter(m => {
        return containsDevanagari(m.content);
    });
    if (recentHindi.length >= 1) {
        const normalized = normalize(message);
        const words = normalized
            .split(/\s+/)
            .map(word => word.replace(/[^a-z0-9.-]/g, ''))
            .filter(Boolean);
        const hasStrongHindiWord = words.some(w => HINDI_WORDS.has(w) && !AMBIGUOUS_HINGLISH_WORDS.has(w));
        if (hasStrongHindiWord)
            return 'hi';
    }
    return 'en';
};
const isGreetingMessage = (text) => {
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
const TRANSLITERATION_MAP = {
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
const transliterateText = (text) => {
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
const isSaveIntent = (text) => {
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
    if (hasPhraseIntent)
        return true;
    const words = normalized.split(/\s+/);
    const origWords = normalize(text).split(/\s+/);
    return ['save', 'सेव', 'बचाओ', 'रखो'].some(kw => words.includes(kw) || origWords.includes(kw));
};
const isProgramSelectionIntent = (text) => {
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
const isFinalChoiceRequest = (text) => {
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
const findProgramMentions = (text) => {
    const transliterated = transliterateText(text);
    const normalized = normalize(transliterated);
    const matches = [];
    // Exact matches first
    programCatalog_1.PROGRAM_CATALOG.forEach(program => {
        if (normalized.includes(normalize(program.name))) {
            matches.push(program);
        }
    });
    // If no exact matches, try partial matching (first few key words)
    if (matches.length === 0) {
        programCatalog_1.PROGRAM_CATALOG.forEach(program => {
            const programWords = normalize(program.name).split(' ');
            const textHasMultipleWords = programWords.filter(word => word.length > 3 && normalized.includes(word)).length >= 2;
            if (textHasMultipleWords) {
                matches.push(program);
            }
        });
    }
    return matches;
};
const getCatalogProgramByName = (programName) => {
    if (!programName) {
        return null;
    }
    const normalizedName = normalize(programName);
    return programCatalog_1.PROGRAM_CATALOG.find(program => normalize(program.name) === normalizedName) || null;
};
const isFollowUpProgramQuestion = (text) => {
    const normalized = normalize(text);
    return /\bit\b/i.test(normalized) || includesAny(normalized, [
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
        'why this',
        'why this course',
        'why this program',
        'why another course',
        'why other course',
        'means why',
    ]);
};
const hasFreshQualificationSignal = (text) => {
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
const getLastRecommendedProgram = (history) => {
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
const getBestRecommendedProgram = (history) => {
    for (let i = history.length - 1; i >= 0; i--) {
        const programs = history[i].programs;
        if (!programs?.length)
            continue;
        const best = [...programs].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0];
        return getCatalogProgramByName(best.name) || best;
    }
    return null;
};
const getRecentlyRecommendedProgramNames = (history) => {
    const names = new Set();
    history.forEach(message => {
        message.programs?.forEach(program => names.add(normalize(program.name)));
    });
    return names;
};
const filterProgramsForStudentProfile = (programs, userContext) => {
    if (hasSchoolOnlyQualification(userContext)) {
        return programs.filter(program => program.level === 'UG' || program.level === 'Diploma');
    }
    return programs;
};
const filterProgramsByLevel = (programs, message) => {
    const levelHint = inferLevel(message);
    if (levelHint === 'Any') {
        return programs;
    }
    return programs.filter(program => program.level === levelHint);
};
const resolveProgramFromKeywords = (message) => {
    const messageText = toSafeText(message);
    const keywordMatches = ProgramService_1.default.searchByKeyword(messageText);
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
const findLastMentionedProgram = (history) => {
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
const resolveProgramFromConversation = (message, history) => {
    // 1. Check if current message directly mentions a program
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
    // 2. Resolve from the current message keywords if possible
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
    // 3. If it's a follow-up question, reuse the last recommended program from history
    if ((isFollowUpProgramQuestion(message) || isProgramSelectionIntent(message)) && !hasFreshQualificationSignal(message)) {
        const lastRecommended = getLastRecommendedProgram(history) || findLastMentionedProgram(history);
        if (lastRecommended) {
            return { program: lastRecommended, ambiguous: false };
        }
    }
    return { program: null, ambiguous: false };
};
const buildProgramRecommendationReply = (programs, language) => {
    const heading = language === 'hi'
        ? 'मैंने आपके लिए ये सबसे अच्छे मिलते-जुलते कोर्स पाए हैं:'
        : 'I found these matching courses for you:';
    return {
        reply: `${heading}\n${programs.map(program => `• ${program.name}`).join('\n')}`,
        programs,
    };
};
const buildProgramRecommendationText = (programs, language, intro) => {
    const heading = intro || (language === 'hi'
        ? 'आपके लिए ये कोर्स सही रहेंगे:'
        : 'These are the best matching courses from my catalog:');
    return `${heading}\n${programs.map(program => `• ${program.name} - ${program.eligibility}`).join('\n')}`;
};
const formatProgramLine = (program) => `• ${program.name} at ${program.university}, ${program.country}. Duration: ${program.duration}. Intake: ${program.intake}. Eligibility: ${program.eligibility}.`;
const buildCatalogListReply = (programs, language) => {
    const heading = language === 'hi'
        ? 'मेरे catalog में ये courses available हैं:'
        : 'Here are all the courses I have in my catalog:';
    return `${heading}\n${programs.map(formatProgramLine).join('\n')}`;
};
const buildAfter12CatalogListReply = (programs, language) => {
    const heading = language === 'hi'
        ? '12th ke baad mere catalog mein ye UG/Diploma courses available hain:'
        : 'After 12th, these UG/Diploma courses are available in my catalog:';
    return `${heading}\n${programs.map(formatProgramLine).join('\n')}`;
};
const buildAlternativeReasonReply = (currentProgram, history, language) => {
    const previousProgram = getLastRecommendedProgram(history);
    const previousText = previousProgram && previousProgram.name !== currentProgram.name
        ? ` I suggested it as another option because your profile can match more than one catalog path; ${previousProgram.name} is one option, while ${currentProgram.name} is another.`
        : '';
    if (language === 'hi') {
        return `${currentProgram.name} suggest karne ka reason ye hai ki iski eligibility "${currentProgram.eligibility}" hai aur ye ${currentProgram.fields.slice(0, 2).join(' / ')} interest se match karta hai. Agar aap 12th ke baad options dekh rahe ho, to main catalog ke UG/Diploma options compare karke best fit batata hoon.`;
    }
    return `${currentProgram.name} is suggested because its eligibility is "${currentProgram.eligibility}" and it matches ${currentProgram.fields.slice(0, 2).join(' / ')} interests.${previousText} If you want courses after 12th, I compare only UG and Diploma catalog options and explain why one fits better than another.`;
};
const hasExplicitlyNoMathBackground = (text) => {
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
const programMatchesField = (program, field) => {
    const programText = normalize(`${program.name} ${program.eligibility} ${program.fields.join(' ')}`);
    const normalizedField = normalize(field);
    if (includesAny(normalizedField, ['math science', 'pcm', 'physics', 'chemistry', 'mathematics', 'maths', 'math'])) {
        return includesAny(programText, [
            'math',
            'mathematics',
            'science',
            'computer',
            'data science',
            'engineering',
            'technology',
            'software',
            'statistics',
            'it',
        ]);
    }
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
    if (normalizedField.includes('engineering'))
        return programText.includes('engineering');
    return true;
};
const selectCompatiblePrograms = (programs, field, userContext) => programs.filter(program => {
    if (!programMatchesField(program, field))
        return false;
    if (hasExplicitlyNoMathBackground(userContext) && /math|mathematics/i.test(program.eligibility))
        return false;
    return true;
});
const buildRetrievedKnowledgeContext = (hits) => {
    if (!hits.length)
        return '';
    const topHits = hits.slice(0, 3);
    const kbLines = topHits.map((hit, index) => `${index + 1}. ${hit.text}`);
    return `Relevant app knowledge from the vector store:
${kbLines.join('\n')}

Use these facts to answer the user's question accurately. Do not make up details outside the knowledge provided here.`;
};
const buildCourseFollowUpQuestion = (profile, language) => {
    const level = normalize(profile.level);
    if (!profile.level || profile.level === 'Any') {
        return language === 'hi'
            ? 'Aap kis level ka course dekh rahe hain: 12th ke baad UG, diploma, ya graduation ke baad PG?'
            : 'Which level are you looking for: UG after 12th, diploma, or PG after graduation?';
    }
    if (!profile.field) {
        if (level === 'ug' || level === 'diploma') {
            return language === 'hi'
                ? '12th ke baad main UG/Diploma options dekhunga. Aapki interest kis side mein hai: computer/IT, business, engineering, healthcare, design, ya kuch aur?'
                : 'After 12th, I will look at UG/Diploma options. What interests you most: computer/IT, business, engineering, healthcare, design, or something else?';
        }
        return language === 'hi'
            ? 'Aap kis subject ya career direction mein interest rakhte hain?'
            : 'What subject or career direction are you most interested in?';
    }
    if (!profile.score) {
        return language === 'hi'
            ? 'Aapka latest percentage ya GPA kya hai?'
            : 'What is your latest percentage or GPA?';
    }
    if (!profile.country) {
        return language === 'hi'
            ? 'Aap kis country mein study prefer karte hain?'
            : 'Which country would you prefer to study in?';
    }
    return language === 'hi'
        ? 'Aapka main goal kya hai: job, higher studies, ya migration?'
        : 'What is your main goal: jobs, higher studies, or migration?';
};
const buildRecommendationPrompt = (message, profile, programs, language, knowledgeHits) => {
    const catalogContext = programs.length
        ? programs.slice(0, 5).map(program => `- ${program.name}: ${program.eligibility}; careers: ${program.careerOpportunities.join(', ')}`).join('\n')
        : 'No catalog program is a strong subject and eligibility match.';
    const retrievedKnowledge = buildRetrievedKnowledgeContext(knowledgeHits);
    // FIX: removed stray `};` that was terminating the template literal prematurely,
    // and removed the duplicate instructions (items 5 and 6 appeared twice).
    return `Answer the student's latest question as an intelligent admission counsellor.

Latest question: ${message}
Student profile: ${JSON.stringify(profile)}
Compatible programs in this app's catalog:
${catalogContext}

${retrievedKnowledge ? `${retrievedKnowledge}

` : ''}Instructions:
1. Treat the latest user correction as authoritative. Never assume math when they say PCB, biology, or no math.
2. Answer the exact question first and briefly explain your reasoning.
3. Recommend only the compatible catalog programs listed above as programs available in this app.
4. Previous assistant recommendations may be wrong. Do not copy or defend program names from earlier assistant replies.
5. If the user is exploring career routes rather than asking for a specific program recommendation, offer 1-2 short high-level pathways and then ask one clarifying follow-up question to narrow further.
6. Avoid long, exhaustive lists. Keep the answer short and narrow; do not dump all career options at once.
7. If there is no suitable catalog match, do not mention any previous catalog program as relevant. Say there is no direct match, then give useful general education paths from your knowledge, clearly labeling them as general options outside the current catalog.
8. Do not repeat a previous generic course list. Ask at most one useful follow-up question.
9. Reply in ${language === 'hi' ? 'natural Hindi/Hinglish because the latest user message is Hindi/Hinglish' : 'English only because the latest user message is English. Do not use Hindi words'} using short paragraphs or a compact list.`;
};
const buildNoCatalogMatchReply = (field, language) => {
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
const isUnusableRecommendationReply = (reply, programs) => {
    const normalizedReply = normalize(reply);
    if (includesAny(normalizedReply, ['insert program', 'program name here', '[program name', 'placeholder']))
        return true;
    if (programs.length > 0)
        return false;
    return programCatalog_1.PROGRAM_CATALOG.some(program => normalizedReply.includes(normalize(program.name)));
};
const buildCareerReply = (program, language) => {
    if (language === 'hi') {
        return `${program.name} के बाद करियर विकल्प: ${program.careerOpportunities.join(', ')}। अगर आपको ${program.fields.slice(0, 2).join(' और ')} पसंद है, तो यह अच्छा विकल्प है।`;
    }
    return `${program.name} can lead to roles like ${program.careerOpportunities.join(', ')}. It is a good fit if you enjoy ${program.fields.slice(0, 2).join(' and ')}.`;
};
const buildOpinionReply = (program, userText, language) => {
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
const buildBestFitReply = (programs, userText, language) => {
    const mathFriendly = programs.filter(program => includesAny(normalize(`${program.name} ${program.eligibility} ${program.fields.join(' ')}`), ['math', 'mathematics', 'data science', 'engineering', 'computer science', 'it']));
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
const buildThoughtfulProgramReply = (program, message, history, language, knowledgeHits) => {
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
const buildMasterPathReply = (language) => {
    const bachelorOptions = ProgramService_1.default.search({
        qualification: '12th PCM 80%',
        gpa: '80%',
        interests: 'computer science information technology',
        preferredCountry: '',
        targetLevel: 'UG',
    }).slice(0, 2);
    const masterOption = programCatalog_1.PROGRAM_CATALOG.find(program => program.level === 'PG' && normalize(program.name).includes('computer science'));
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
const buildMasterOptionsAfter12thReply = (language) => {
    const masterOptions = programCatalog_1.PROGRAM_CATALOG
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
const parseEligibilityJson = (rawResult) => {
    const cleaned = rawResult.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        }
        throw new Error('Invalid eligibility JSON');
    }
};
const SCHOOL_PASS_PERCENTAGE = 35;
const isFailingAcademicScore = (scoreValue) => scoreValue !== undefined && scoreValue < SCHOOL_PASS_PERCENTAGE;
const sanitizeEligibilityResult = (result, qualification, percentage, englishScore, workExperience) => {
    const targetLevel = inferEligibilityTargetLevel(qualification);
    const localFallback = buildLocalEligibilityResult(qualification, percentage, englishScore, workExperience);
    const scoreValue = parseScoreValue(percentage);
    if (isFailingAcademicScore(scoreValue)) {
        return localFallback;
    }
    const isEligibleStatus = (status) => status === 'eligible' || status === 'conditional';
    const mapCatalogCourse = (course, fallbackStatus) => {
        const catalogItem = programCatalog_1.PROGRAM_CATALOG.find(program => normalize(program.name) === normalize(course?.name));
        if (!catalogItem) {
            return null;
        }
        if (targetLevel !== 'Any' && catalogItem.level !== targetLevel) {
            return null;
        }
        return {
            name: catalogItem.name,
            university: catalogItem.university,
            country: catalogItem.country,
            minimumRequirement: course?.minimumRequirement || catalogItem.eligibility,
            status: isEligibleStatus(course?.status) ? course.status : fallbackStatus,
            reason: typeof course?.reason === 'string' && course.reason.trim().length > 0
                ? course.reason
                : fallbackStatus === 'eligible'
                    ? 'Your profile matches the catalog entry.'
                    : 'Your profile does not meet this program in the current catalog.',
        };
    };
    const eligibleCourses = Array.isArray(result?.eligibleCourses)
        ? result.eligibleCourses
            .map((course) => mapCatalogCourse(course, 'eligible'))
            .filter(Boolean)
            .slice(0, 3)
        : [];
    const notEligibleCourses = Array.isArray(result?.notEligibleCourses)
        ? result.notEligibleCourses
            .map((course) => mapCatalogCourse(course, 'not_eligible'))
            .filter(Boolean)
            .slice(0, 2)
        : [];
    if (eligibleCourses.length === 0 && notEligibleCourses.length === 0) {
        return localFallback;
    }
    const summary = eligibleCourses.length > 0
        ? 'These programs best match your current profile.'
        : typeof result?.summary === 'string' && result.summary.trim().length > 0
            ? result.summary
            : localFallback.summary;
    const recommendations = eligibleCourses.map((course) => course.name);
    return {
        eligibleCourses,
        notEligibleCourses,
        summary,
        recommendations,
    };
};
const parseScoreValue = (input) => {
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
const isDuplicateReply = (reply, history) => {
    const assistantMessages = history.filter(m => m.role === 'assistant');
    if (assistantMessages.length === 0)
        return false;
    const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanReply = clean(reply);
    // Check if any of the last 2 assistant replies are identical to this reply
    const last2 = assistantMessages.slice(-2);
    return last2.some(m => clean(m.content) === cleanReply);
};
const sendResponse = async (res, cleanMessage, safeHistory, responseLanguage, payload) => {
    let finalReply = payload.reply;
    if (isDuplicateReply(finalReply, safeHistory)) {
        console.log('[DUPLICATE DETECTED] Breaking cycle...');
        const breakPrompt = `The user's query is: "${cleanMessage}". 
I have already given the response: "${finalReply}" recently. 
Please provide a different, helpful response in ${responseLanguage === 'hi' ? 'Hindi' : 'English'}. Answer their actual question directly, or ask a clarifying question. Do NOT repeat the list of courses or the previous answer.`;
        finalReply = await GeminiService_1.default.chat(breakPrompt, safeHistory, { temperature: 0.7, language: responseLanguage });
    }
    res.json({
        ...payload,
        reply: finalReply,
        timestamp: payload.timestamp || Date.now(),
    });
};
const buildLocalEligibilityResult = (qualification, percentage, englishScore, workExperience) => {
    const qualificationText = normalize(qualification);
    const scoreValue = parseScoreValue(percentage);
    const englishScoreValue = parseScoreValue(englishScore);
    const hasWorkExperience = workExperience.trim().length > 0 && !includesAny(normalize(workExperience), ['none', 'no']);
    const targetLevel = inferEligibilityTargetLevel(qualification);
    const candidatePrograms = targetLevel === 'Any'
        ? programCatalog_1.PROGRAM_CATALOG
        : programCatalog_1.PROGRAM_CATALOG.filter(program => program.level === targetLevel);
    if (isFailingAcademicScore(scoreValue)) {
        const notEligible = candidatePrograms.slice(0, 3).map(program => ({
            name: program.name,
            university: program.university,
            country: program.country,
            minimumRequirement: program.eligibility,
            status: 'not_eligible',
            reason: `Your ${scoreValue}% score is below the usual ${SCHOOL_PASS_PERCENTAGE}% pass mark, so you need to clear 12th before applying.`,
        }));
        return {
            eligibleCourses: [],
            notEligibleCourses: notEligible,
            summary: `A ${scoreValue}% score is below the usual pass mark. Please clear 12th or improve your result before applying to these programs.`,
            recommendations: [],
        };
    }
    const scoredPrograms = candidatePrograms.map(program => {
        let score = 0;
        if (qualificationText.includes('computer') || qualificationText.includes('science') || qualificationText.includes('it')) {
            if (program.fields.some(field => includesAny(normalize(field), ['computer', 'it', 'technology', 'software']))) {
                score += 3;
            }
        }
        if (scoreValue !== undefined && program.minGpa !== undefined) {
            if (scoreValue >= program.minGpa * 10) {
                score += 3;
            }
            else {
                score -= 3;
            }
        }
        if (qualificationText && program.minQualificationKeywords.some(keyword => qualificationText.includes(keyword))) {
            score += 2;
        }
        if (program.level === targetLevel) {
            score += 2;
        }
        if (englishScoreValue !== undefined && englishScoreValue >= 65) {
            score += 1;
        }
        if (hasWorkExperience && program.level === 'PG') {
            score += 1;
        }
        return { program, score };
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
        status: 'eligible',
        reason: scoreValue !== undefined && item.program.minGpa !== undefined && scoreValue >= item.program.minGpa * 10
            ? 'Your score meets the catalog minimum.'
            : targetLevel === 'PG'
                ? 'Your profile indicates you should look at postgraduate options next.'
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
        status: 'not_eligible',
        reason: 'Your current profile does not match the catalog requirements as well as the eligible options.',
    }));
    return {
        eligibleCourses: eligible,
        notEligibleCourses: notEligible,
        summary: eligible.length > 0
            ? 'These programs best match your current profile.'
            : 'No strong match found. Please refine your qualification or score.',
        recommendations: eligible.map(item => item.name),
    };
};
const healthController = (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
};
exports.healthController = healthController;
const chatController = async (req, res) => {
    try {
        const { message, history, image } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            res.status(400).json({ reply: 'Message is required', timestamp: Date.now() });
            return;
        }
        const safeHistory = sanitizeConversationHistory(history);
        const cleanMessage = message.trim();
        const responseLanguage = detectResponseLanguage(cleanMessage, safeHistory);
        const retrievalContext = `${safeHistory.slice(-6).map(item => item.content).join(' ')} ${cleanMessage}`;
        const knowledgeHits = await VectorKnowledgeService_1.default.search(retrievalContext);
        // ── Save program intent check ──────────────────────────────────────────
        if (isSaveIntent(cleanMessage)) {
            const programToSave = findProgramMentions(cleanMessage)[0] || findProgramMentions(safeHistory.map(m => m.content).join(' '))[0];
            if (programToSave) {
                await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
                    reply: responseLanguage === 'hi'
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
            const listLevel = inferLevel(cleanMessage);
            const programs = getProgramsForRequestedLevel(listLevel);
            res.json({
                reply: listLevel === 'UG'
                    ? buildAfter12CatalogListReply(programs, responseLanguage)
                    : buildCatalogListReply(programs, responseLanguage),
                programs,
                responseLanguage,
                responseType: 'recommendation',
                timestamp: Date.now(),
            });
            return;
        }
        // ── Follow-up filter: "only courses I can do after 12th" ───────────────
        if (isAfter12CatalogFilterRequest(cleanMessage)) {
            const programs = getProgramsForRequestedLevel('UG');
            res.json({
                reply: buildAfter12CatalogListReply(programs, responseLanguage),
                programs,
                responseLanguage,
                responseType: 'recommendation',
                timestamp: Date.now(),
            });
            return;
        }
        const userImage = typeof image === 'string' ? image : undefined;
        if (isGreetingMessage(cleanMessage)) {
            const reply = await GeminiService_1.default.chat(cleanMessage, safeHistory, { userImage, language: responseLanguage });
            await sendResponse(res, cleanMessage, safeHistory, responseLanguage, { reply, responseLanguage });
            return;
        }
        // ── Direct program follow-up flow ─────────────────────────────────────
        const finalChoiceRequested = isFinalChoiceRequest(cleanMessage);
        const finalizedProgram = finalChoiceRequested ? getBestRecommendedProgram(safeHistory) : null;
        const programContext = finalizedProgram
            ? { program: finalizedProgram, ambiguous: false }
            : resolveProgramFromConversation(cleanMessage, safeHistory);
        if (programContext.program) {
            const reply = isAlternativeReasonQuestion(cleanMessage)
                ? buildAlternativeReasonReply(programContext.program, safeHistory, responseLanguage)
                : buildThoughtfulProgramReply(programContext.program, cleanMessage, safeHistory, responseLanguage, knowledgeHits);
            await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
                reply,
                responseLanguage,
                responseType: isProgramSelectionIntent(cleanMessage) || finalChoiceRequested
                    ? 'final_recommendation'
                    : 'detail',
                programs: [programContext.program],
                knowledge: knowledgeHits.map(hit => hit.id),
            });
            return;
        }
        if (isAlternativeReasonQuestion(cleanMessage)) {
            const recentProgram = getBestRecommendedProgram(safeHistory) || getLastRecommendedProgram(safeHistory);
            if (recentProgram) {
                await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
                    reply: buildAlternativeReasonReply(recentProgram, safeHistory, responseLanguage),
                    responseLanguage,
                    responseType: 'detail',
                    programs: [recentProgram],
                    knowledge: knowledgeHits.map(hit => hit.id),
                });
                return;
            }
        }
        if (programContext.ambiguous) {
            const userContextOnly = `${cleanMessage} ${safeHistory.filter(m => m.role === 'user').map(m => m.content).join(' ')}`;
            const level = hasSchoolOnlyQualification(userContextOnly)
                ? 'UG'
                : inferLevel(userContextOnly);
            if (level !== 'Any') {
                const searchInput = userContextOnly;
                const programs = filterProgramsForStudentProfile(ProgramService_1.default.search({
                    qualification: searchInput,
                    gpa: '',
                    interests: searchInput,
                    preferredCountry: '',
                    targetLevel: level,
                }), searchInput);
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
                    reply: responseLanguage === 'hi'
                        ? 'पिछली सूची में आप किस कोर्स की बात कर रहे हैं?'
                        : 'Which course do you mean from the previous list?',
                    responseLanguage,
                });
                return;
            }
        }
        // ── Analyze intent ─────────────────────────────────────────────────────
        let analysis = await GeminiService_1.default.analyzeConversation(cleanMessage, safeHistory);
        console.log('[ANALYSIS BEFORE PROCESSING]', JSON.stringify(analysis, null, 2));
        // ── LOCAL EXTRACTION — Fill gaps in AI analysis ────────────────────────
        const localData = extractProfileLocally(cleanMessage, safeHistory);
        const combinedText = normalize(cleanMessage);
        const combinedUserText = normalize(cleanMessage);
        const userHistoryText = safeHistory.filter(item => item.role === 'user').map(item => item.content).join(' ');
        const userOnlyContext = `${userHistoryText} ${cleanMessage}`;
        const currentRequestedLevel = inferRequestedProgramLevel(cleanMessage);
        const previousRequestedLevel = inferRequestedProgramLevel(userHistoryText);
        const requestedLevel = hasSchoolOnlyQualification(userOnlyContext)
            ? 'UG'
            : currentRequestedLevel || previousRequestedLevel || (localData.level || undefined);
        const relevantRules = (0, appRules_1.findRelevantAppRules)(`${combinedUserText} ${cleanMessage}`);
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
        // Course recommendation flow
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
                const followUp = buildCourseFollowUpQuestion(analysis.profile, responseLanguage);
                await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
                    reply: followUp,
                    responseLanguage,
                    responseType: 'general',
                    rules: relevantRules.map(rule => rule.id),
                    knowledge: knowledgeHits.map(hit => hit.id),
                });
                return;
            }
            // Have enough info — search catalog and explain matches
            const questionIntent = inferQuestionIntent(cleanMessage);
            const isCareerExploration = isCareerExplorationContext(cleanMessage, safeHistory);
            if (isCareerExploration) {
                const followUp = responseLanguage === 'hi'
                    ? `Maths एक अच्छी शुरुआत है। क्या आप programming, data analytics, या finance/business में अधिक रुचि लेते हैं? इससे मैं आपको अगला छोटा कदम स्वयं narrow करके दे सकता हूँ।`
                    : `Math is a strong foundation. Which direction interests you more: programming, data analytics, or finance/business? That will help me narrow down the next step in a short answer.`;
                await sendResponse(res, cleanMessage, safeHistory, responseLanguage, {
                    reply: followUp,
                    responseLanguage,
                    responseType: 'general',
                    rules: relevantRules.map(rule => rule.id),
                    knowledge: knowledgeHits.map(hit => hit.id),
                });
                return;
            }
            const allPrograms = filterProgramsForStudentProfile(ProgramService_1.default.search({
                qualification: `${analysis.profile.qualification || ''} ${fullUserContext}`,
                gpa: analysis.profile.score || '',
                interests: analysis.profile.field || '',
                preferredCountry: analysis.profile.country || '',
                targetLevel: requestedLevel || 'Any',
            }), fullUserContext);
            const compatiblePrograms = selectCompatiblePrograms(allPrograms, analysis.profile.field || '', fullUserContext);
            const recentNames = getRecentlyRecommendedProgramNames(safeHistory);
            const programs = questionIntent === 'alternative'
                ? compatiblePrograms.filter(program => !recentNames.has(normalize(program.name)))
                : compatiblePrograms;
            const isFinalRecommendation = finalChoiceRequested && programs.length > 0;
            const responsePrograms = isFinalRecommendation ? programs.slice(0, 1) : programs;
            let reply = await GeminiService_1.default.chat(buildRecommendationPrompt(cleanMessage, analysis.profile, responsePrograms, responseLanguage, knowledgeHits), safeHistory.filter(item => item.role === 'user'), {
                systemPrompt: `You are ARIA, a thoughtful AI admission counsellor. Reason from the full conversation and the student's latest correction. Catalog facts are authoritative for programs available in the app, while general educational guidance is allowed when clearly identified as outside the catalog.`,
                temperature: 0.35,
                maxOutputTokens: 420,
                language: responseLanguage,
            });
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
        const reply = await GeminiService_1.default.chat(cleanMessage, safeHistory, {
            extraSystemPrompt: buildRetrievedKnowledgeContext(knowledgeHits),
            temperature: 0.3,
            userImage,
            language: responseLanguage,
        });
        await sendResponse(res, cleanMessage, safeHistory, responseLanguage, { reply, responseLanguage });
    }
    catch (error) {
        console.error('[ChatController] Error:', error?.message || error);
        res.json({
            reply: "I had trouble reading the previous chat context, but I can still help. Please ask that question again in one line.",
            responseLanguage: 'en',
            responseType: 'general',
            timestamp: Date.now(),
        });
    }
};
exports.chatController = chatController;
const hasRecognizableProgramQualification = (qualification) => {
    const text = normalize(qualification);
    return includesAny(text, [
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
    ]);
};
const hasRecognizableProgramInterest = (interests) => {
    const text = normalize(interests);
    return includesAny(text, [
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
    ]);
};
const hasRecognizableProgramCountry = (country) => {
    const text = normalize(country);
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
};
const hasValidProgramScore = (gpa) => {
    const text = normalize(gpa);
    const numericValue = Number(text.replace(/[^0-9.]/g, ''));
    return Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 100;
};
const programFinderController = async (req, res) => {
    try {
        const { qualification, gpa, interests, preferredCountry } = req.body;
        if (!qualification || !gpa || !interests || !preferredCountry) {
            res.status(400).json({ message: 'qualification, score, interests, and preferred country are required' });
            return;
        }
        if (!hasRecognizableProgramQualification(qualification)) {
            res.status(400).json({ message: 'Please enter a real qualification, e.g. 12th Science or B.Tech Computer Science.' });
            return;
        }
        if (!hasValidProgramScore(gpa)) {
            res.status(400).json({ message: 'Please enter a valid score, e.g. 75%, 8.1 CGPA, or 3.2 GPA.' });
            return;
        }
        if (!hasRecognizableProgramInterest(interests)) {
            res.status(400).json({ message: 'Please enter a real study interest like computer science, business, data, engineering, health, or design.' });
            return;
        }
        if (!hasRecognizableProgramCountry(preferredCountry)) {
            res.status(400).json({ message: 'Please choose a supported country like Canada, UK, USA, Australia, Germany, or type Any.' });
            return;
        }
        const userProfileAnalysis = await GeminiService_1.default.analyzeConversation(`Highest qualification: ${qualification}. GPA: ${gpa || 'not provided'}. Interests: ${interests}. Preferred country: ${preferredCountry || 'not provided'}`, []);
        const programs = ProgramService_1.default.search({
            qualification: qualification || '',
            gpa: gpa || '',
            interests: interests || '',
            preferredCountry: preferredCountry || '',
        });
        const scoreValue = parseScoreValue(gpa || '');
        const hasBachelorProfile = hasBachelorQualification(String(qualification || ''));
        const summary = isFailingAcademicScore(scoreValue)
            ? `Your ${scoreValue}% score is below the usual ${SCHOOL_PASS_PERCENTAGE}% pass mark. These programs are only options to explore after you clear 12th or improve your result.`
            : hasBachelorProfile
                ? `Because your highest qualification is a Bachelor's degree, I ranked postgraduate programs and prioritized ${preferredCountry || 'your preferred location'} plus ${interests}.`
                : await GeminiService_1.default.chat(`You are ARIA. In one short sentence, explain why these programs fit the student's profile.
Profile: ${JSON.stringify(userProfileAnalysis?.profile || {})}
Programs: ${JSON.stringify(programs.map(p => ({ name: p.name, level: p.level, field: p.fields, country: p.country })))}`, [], { temperature: 0.2, maxOutputTokens: 80 });
        res.json({
            programs,
            summary,
            totalFound: programs.length,
            suggestedLevel: userProfileAnalysis?.profile?.level || 'Any',
            timestamp: Date.now(),
        });
    }
    catch (error) {
        console.error('[ProgramFinderController] Error:', error?.message || error);
        res.status(500).json({ message: 'Program search failed', timestamp: Date.now() });
    }
};
exports.programFinderController = programFinderController;
const eligibilityController = async (req, res) => {
    try {
        const { qualification, percentage, englishScore, workExperience, document } = req.body;
        const uploadedDocument = document && typeof document === 'object'
            ? document
            : null;
        let extractedProfile = {};
        if (uploadedDocument?.base64 && typeof uploadedDocument.base64 === 'string') {
            let documentText = '';
            let sourceType = 'document';
            try {
                const mimeType = typeof uploadedDocument.mimeType === 'string' ? uploadedDocument.mimeType : undefined;
                const fileName = typeof uploadedDocument.fileName === 'string' ? uploadedDocument.fileName : undefined;
                sourceType = isPdfDocument(mimeType, fileName)
                    ? 'PDF'
                    : isWordDocument(mimeType, fileName)
                        ? 'Word document'
                        : isImageDocument(mimeType, fileName)
                            ? 'image'
                            : 'document';
                documentText = isPdfDocument(mimeType, fileName)
                    ? await extractPdfTextFromBase64(uploadedDocument.base64)
                    : isWordDocument(mimeType, fileName)
                        ? await extractWordTextFromBase64(uploadedDocument.base64)
                        : '';
                const localDocumentProfile = documentText
                    ? extractEligibilityProfileLocallyFromText(documentText)
                    : { qualification: '', percentage: '', englishScore: '', workExperience: '' };
                const rawDocumentProfile = documentText
                    ? await GeminiService_1.default.extractEligibilityProfileFromTextDocument({
                        documentText,
                        fileName,
                        typedQualification: qualification || '',
                        typedPercentage: percentage || '',
                        typedEnglishScore: englishScore || '',
                        typedWorkExperience: workExperience || '',
                    })
                    : isImageDocument(mimeType, fileName)
                        ? await GeminiService_1.default.extractEligibilityProfileFromDocument({
                            imageBase64: await convertImageBase64ToPng(uploadedDocument.base64),
                            mimeType: 'image/png',
                            fileName,
                            typedQualification: qualification || '',
                            typedPercentage: percentage || '',
                            typedEnglishScore: englishScore || '',
                            typedWorkExperience: workExperience || '',
                        })
                        : await GeminiService_1.default.extractEligibilityProfileFromDocument({
                            imageBase64: uploadedDocument.base64,
                            mimeType,
                            fileName,
                            typedQualification: qualification || '',
                            typedPercentage: percentage || '',
                            typedEnglishScore: englishScore || '',
                            typedWorkExperience: workExperience || '',
                        });
                const parsedProfile = parseEligibilityJson(rawDocumentProfile);
                const extractedQualification = toSafeText(parsedProfile?.qualification).trim() || localDocumentProfile.qualification || '';
                const extractedPercentage = toSafeText(parsedProfile?.percentage).trim() || localDocumentProfile.percentage || '';
                const extractedEnglishScore = toSafeText(parsedProfile?.englishScore).trim() || localDocumentProfile.englishScore || '';
                const extractedWorkExperience = toSafeText(parsedProfile?.workExperience).trim() || localDocumentProfile.workExperience || '';
                extractedProfile = {
                    qualification: extractedQualification,
                    percentage: extractedPercentage,
                    englishScore: extractedEnglishScore,
                    workExperience: extractedWorkExperience,
                    documentSummary: toSafeText(parsedProfile?.documentSummary).trim(),
                    nextStep: toSafeText(parsedProfile?.nextStep).trim(),
                    sourceType,
                    extractionStatus: 'read',
                    extractionMessage: extractedPercentage
                        ? `Read ${sourceType}${fileName ? `: ${fileName}` : ''}`
                        : `Read ${sourceType}${fileName ? `: ${fileName}` : ''}. I found your qualification${extractedWorkExperience ? ' and experience' : ''}, but no percentage/CGPA in the document.`,
                };
            }
            catch (documentError) {
                console.warn('[EligibilityDocument] Extraction failed:', documentError?.message || documentError);
                const localDocumentProfile = documentText
                    ? extractEligibilityProfileLocallyFromText(documentText)
                    : { qualification: '', percentage: '', englishScore: '', workExperience: '' };
                extractedProfile = {
                    qualification: localDocumentProfile.qualification,
                    percentage: localDocumentProfile.percentage,
                    englishScore: localDocumentProfile.englishScore,
                    workExperience: localDocumentProfile.workExperience,
                    sourceType,
                    extractionStatus: localDocumentProfile.qualification || localDocumentProfile.percentage ? 'read' : 'failed',
                    extractionMessage: localDocumentProfile.qualification || localDocumentProfile.percentage
                        ? `Read ${sourceType}. I used the text I could extract from the document, but please add percentage/CGPA if available.`
                        : 'I could not read qualification and marks from this file. Try a clearer PDF/DOCX/JPG/PNG or type the details below.',
                };
            }
        }
        const finalQualification = toSafeText(qualification).trim() || extractedProfile.qualification || '';
        const finalPercentage = toSafeText(percentage).trim() || extractedProfile.percentage || (uploadedDocument ? 'Not provided' : '');
        const finalEnglishScore = toSafeText(englishScore).trim() || extractedProfile.englishScore || 'Not provided';
        const finalWorkExperience = toSafeText(workExperience).trim() || extractedProfile.workExperience || 'None';
        if (!finalQualification || (!uploadedDocument && !finalPercentage)) {
            res.status(400).json({
                message: uploadedDocument
                    ? 'I could not read your qualification from this file. Please upload a clearer document or type your highest qualification below.'
                    : 'qualification and percentage are required',
            });
            return;
        }
        let result;
        try {
            const rawResult = await GeminiService_1.default.checkEligibility({
                qualification: finalQualification,
                percentage: finalPercentage,
                englishScore: finalEnglishScore,
                workExperience: finalWorkExperience,
                targetLevel: inferEligibilityTargetLevel(finalQualification),
            });
            result = sanitizeEligibilityResult(parseEligibilityJson(rawResult), finalQualification, finalPercentage, finalEnglishScore, finalWorkExperience);
        }
        catch (eligibilityError) {
            console.warn('[EligibilityController] AI eligibility failed, using local result:', eligibilityError?.message || eligibilityError);
            result = buildLocalEligibilityResult(finalQualification, finalPercentage, finalEnglishScore, finalWorkExperience);
        }
        res.json({
            ...result,
            extractedProfile: uploadedDocument
                ? {
                    qualification: finalQualification,
                    percentage: finalPercentage,
                    englishScore: finalEnglishScore === 'Not provided' ? '' : finalEnglishScore,
                    workExperience: finalWorkExperience === 'None' ? '' : finalWorkExperience,
                    documentSummary: extractedProfile.documentSummary,
                    nextStep: extractedProfile.nextStep,
                    sourceType: extractedProfile.sourceType,
                    extractionStatus: extractedProfile.extractionStatus,
                    extractionMessage: extractedProfile.extractionMessage,
                }
                : undefined,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        console.error('[EligibilityController] Error:', error?.message || error);
        const fallback = buildLocalEligibilityResult(String(req.body?.qualification || ''), String(req.body?.percentage || ''), String(req.body?.englishScore || 'Not provided'), String(req.body?.workExperience || 'None'));
        res.json({ ...fallback, timestamp: Date.now(), source: 'local_fallback' });
    }
};
exports.eligibilityController = eligibilityController;
//# sourceMappingURL=controllers.js.map