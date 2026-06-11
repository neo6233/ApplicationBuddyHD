"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eligibilityController = exports.programFinderController = exports.chatController = exports.healthController = void 0;
const GeminiService_1 = __importDefault(require("../services/GeminiService")); // Gemini-backed service with the same controller API
const ProgramService_1 = __importDefault(require("../services/ProgramService"));
const programCatalog_1 = require("../data/programCatalog");
const appRules_1 = require("../data/appRules");
const VectorKnowledgeService_1 = __importDefault(require("../services/VectorKnowledgeService"));
const normalize = (text) => text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const includesAny = (text, keywords) => keywords.some(keyword => text.includes(keyword));
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
const hasSchoolQualification = (text) => includesAny(normalize(text), ['12th', '12 pass', 'class 12', 'high school', 'secondary', 'intermediate', '10th']);
const hasBachelorQualification = (text) => /\b(passed|completed|done|finished|have|holding)\s+(a\s+)?(bachelor|bachelor's|btech|b\.tech|b\.sc|bsc|b\.e|be|graduation|graduate)\b/i.test(text) ||
    /\b(bachelor's degree|bachelor degree|graduation completed|graduate with)\b/i.test(text);
const inferLevel = (text) => {
    const t = normalize(text);
    if (includesAny(t, ['phd', 'doctorate', 'dr.']))
        return 'PG';
    if (includesAny(t, ['master', 'msc', 'ma', 'mtech', 'mba', 'pg', 'post graduate', 'postgraduate']))
        return 'PG';
    if (includesAny(t, ['diploma', 'certificate', 'polytechnic']))
        return 'Diploma';
    if (includesAny(t, ['bachelor', 'be', 'btech', 'b.sc', 'bba', 'undergraduate', 'ug', 'b.a', 'b.com']))
        return 'UG';
    if (includesAny(t, ['12th', '12 pass', 'class 12', 'high school', 'secondary', '10th', '10 pass']))
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
const extractProfileLocally = (message, history) => {
    const fullText = `${history.filter(h => h.role === 'user').map(h => h.content).join(' ')} ${message}`;
    const normalized = normalize(fullText);
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
    // Extract field
    let field = '';
    if (includesAny(normalized, ['computer', 'cs', 'it', 'software', 'कंप्यूटर', 'सीएस', 'आईटी', 'सॉफ्टवेयर'])) {
        field = 'computer science';
    }
    else if (includesAny(normalized, ['data science', 'data', 'analytics', 'डेटा', 'एनालिटिक्स'])) {
        field = 'data science';
    }
    else if (includesAny(normalized, ['engineering', 'engineer', 'इंजीनियर'])) {
        field = 'engineering';
    }
    else if (includesAny(normalized, ['business', 'commerce', 'management', 'mba', 'बिजनेस', 'कॉमर्स'])) {
        field = 'business';
    }
    else if (includesAny(normalized, ['healthcare', 'health', 'medical', 'nurse', 'हेल्थ', 'मेडिकल'])) {
        field = 'healthcare';
    }
    // Extract score
    const scoreMatch = fullText.match(/(\d{1,3})%/);
    const score = scoreMatch ? scoreMatch[1] : '';
    return { level, field, score };
};
const containsDevanagari = (message) => /[\u0900-\u097F]/.test(message);
const detectResponseLanguage = (message, history) => {
    // Check current message for Devanagari script first (most reliable indicator)
    if (containsDevanagari(message))
        return 'hi';
    // Check recent conversation history for language pattern
    const recentHistory = history.slice(-6); // Last 3 exchanges
    const hasRecentHindi = recentHistory.some(item => containsDevanagari(item.content));
    if (hasRecentHindi)
        return 'hi';
    // Check for common Hindi question words
    const normalized = normalize(message);
    const hindiIndicators = [' mujhe ', ' kya ', ' kaise ', ' kyu ', ' kyun ', ' batao ', ' chahiye ', ' karna ', ' kaun ', ' kis ', ' aap ', ' hai ', ' hain ', ' aapka ', ' mere '];
    if (hindiIndicators.some(indicator => normalized.includes(indicator))) {
        return 'hi';
    }
    // Default to English for ambiguous cases
    return 'en';
};
const PROGRAM_NAME_LIST = [...programCatalog_1.PROGRAM_CATALOG]
    .map(program => program.name)
    .sort((a, b) => b.length - a.length);
const findProgramMentions = (text) => {
    const normalized = normalize(text);
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
        'tell me',
        'what is',
        'what are',
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
const getRecentlyRecommendedProgramNames = (history) => {
    const names = new Set();
    history.forEach(message => {
        message.programs?.forEach(program => names.add(normalize(program.name)));
    });
    return names;
};
const filterProgramsByLevel = (programs, message) => {
    const levelHint = inferLevel(message);
    if (levelHint === 'Any') {
        return programs;
    }
    return programs.filter(program => program.level === levelHint);
};
const resolveProgramFromKeywords = (message) => {
    const keywordMatches = ProgramService_1.default.searchByKeyword(message);
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
    // 3. If it's a follow-up question, reuse the last recommended program from history
    if (isFollowUpProgramQuestion(message) && !hasFreshQualificationSignal(message)) {
        const lastRecommended = getLastRecommendedProgram(history) || findLastMentionedProgram(history);
        if (lastRecommended) {
            return { program: lastRecommended, ambiguous: false };
        }
    }
    return { program: null, ambiguous: false };
};
const buildProgramRecommendationReply = (programs, language) => {
    const topPrograms = programs.slice(0, 3);
    const heading = language === 'hi'
        ? 'मैंने आपके लिए ये सबसे अच्छे मिलते-जुलते कोर्स पाए हैं:'
        : 'I found these matching courses for you:';
    return {
        reply: `${heading}\n${topPrograms.map(program => `• ${program.name}`).join('\n')}`,
        programs: topPrograms,
    };
};
const buildProgramRecommendationText = (programs, language, intro) => {
    const visiblePrograms = programs.slice(0, 3);
    const heading = intro || (language === 'hi'
        ? 'आपके लिए ये कोर्स सही रहेंगे:'
        : 'These are the best matching courses from my catalog:');
    return `${heading}\n${visiblePrograms.map(program => `• ${program.name} - ${program.eligibility}`).join('\n')}`;
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
    const normalized = normalize(userText);
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
const buildLocalEligibilityResult = (qualification, percentage, englishScore, workExperience) => {
    const qualificationText = normalize(qualification);
    const scoreValue = parseScoreValue(percentage);
    const englishScoreValue = parseScoreValue(englishScore);
    const hasWorkExperience = workExperience.trim().length > 0 && !includesAny(normalize(workExperience), ['none', 'no']);
    const scoredPrograms = programCatalog_1.PROGRAM_CATALOG.map(program => {
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
        if (program.level === inferLevel(qualification)) {
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
        const safeHistory = Array.isArray(history) ? history : [];
        const cleanMessage = message.trim();
        const responseLanguage = detectResponseLanguage(cleanMessage, safeHistory);
        const historyText = safeHistory.map(item => item.content).join(' ');
        const knowledgeHits = VectorKnowledgeService_1.default.search(`${historyText} ${cleanMessage}`);
        // ── "List all" shortcut ────────────────────────────────────────────────
        const listAllRegex = /\b(all|list|show all|give me all|show|display|tell me)\b.*\b(course|program|option|programs|courses)s?\b/i;
        const isListRequest = listAllRegex.test(cleanMessage) ||
            includesAny(normalize(cleanMessage), ['course list', 'courses list', 'program list', 'list of programs', 'list of courses', 'all programs', 'all courses', 'सभी कोर्स', 'सभी प्रोग्राम']);
        if (isListRequest) {
            const programs = ProgramService_1.default.getAllPrograms();
            res.json({
                reply: responseLanguage === 'hi'
                    ? 'मेरे कैटलॉग में उपलब्ध सभी कोर्स यहाँ हैं:'
                    : 'Here are all the courses I have in my catalog:',
                programs,
                responseLanguage,
                timestamp: Date.now(),
            });
            return;
        }
        const userImage = typeof image === 'string' ? image : undefined;
        // ── Direct program follow-up flow ─────────────────────────────────────
        const programContext = resolveProgramFromConversation(cleanMessage, safeHistory);
        if (programContext.program) {
            const reply = buildThoughtfulProgramReply(programContext.program, cleanMessage, safeHistory, responseLanguage, knowledgeHits);
            res.json({
                reply,
                responseLanguage,
                responseType: 'detail',
                programs: [programContext.program],
                knowledge: knowledgeHits.map(hit => hit.id),
                timestamp: Date.now(),
            });
            return;
        }
        if (programContext.ambiguous) {
            const searchInput = `${cleanMessage} ${safeHistory.map(item => item.content).join(' ')}`;
            const programs = ProgramService_1.default.search({
                qualification: searchInput,
                gpa: '',
                interests: searchInput,
                preferredCountry: '',
            });
            if (programs.length > 0) {
                const recommendation = buildProgramRecommendationReply(programs, responseLanguage);
                res.json({
                    reply: recommendation.reply,
                    responseLanguage,
                    responseType: 'recommendation',
                    programs: recommendation.programs,
                    knowledge: knowledgeHits.map(hit => hit.id),
                    timestamp: Date.now(),
                });
                return;
            }
            res.json({
                reply: responseLanguage === 'hi'
                    ? 'पिछली सूची में आप किस कोर्स की बात कर रहे हैं?'
                    : 'Which course do you mean from the previous list?',
                responseLanguage,
                timestamp: Date.now(),
            });
            return;
        }
        // ── Greeting shortcut — skip analysis, just reply ──────────────────────
        const greetings = ['hi', 'hii', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
        if (greetings.includes(cleanMessage.toLowerCase())) {
            const reply = await GeminiService_1.default.chat(cleanMessage, safeHistory, { userImage, language: responseLanguage });
            res.json({ reply, responseLanguage, timestamp: Date.now() });
            return;
        }
        // ── Analyze intent ─────────────────────────────────────────────────────
        let analysis = await GeminiService_1.default.analyzeConversation(cleanMessage, safeHistory);
        console.log('[ANALYSIS BEFORE PROCESSING]', JSON.stringify(analysis, null, 2));
        // ── LOCAL EXTRACTION — Fill gaps in Gemini analysis ────────────────────
        const localData = extractProfileLocally(cleanMessage, safeHistory);
        const combinedText = normalize(`${historyText} ${cleanMessage}`);
        const combinedUserText = normalize(`${safeHistory.filter(item => item.role === 'user').map(item => item.content).join(' ')} ${cleanMessage}`);
        const currentRequestedLevel = inferRequestedProgramLevel(cleanMessage);
        const previousRequestedLevel = inferRequestedProgramLevel(safeHistory.map(item => item.content).join(' '));
        const requestedLevel = currentRequestedLevel || previousRequestedLevel || (localData.level || undefined);
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
        // ── Course recommendation flow ─────────────────────────────────────────
        if (analysis?.topic === 'course' && analysis?.profile) {
            if (requestedLevel === 'PG' && hasSchoolQualification(combinedUserText) && !hasBachelorQualification(combinedUserText)) {
                res.json({
                    reply: buildMasterPathReply(responseLanguage),
                    responseLanguage,
                    responseType: 'general',
                    timestamp: Date.now(),
                    rules: relevantRules.map(rule => rule.id),
                    knowledge: knowledgeHits.map(hit => hit.id),
                });
                return;
            }
            // Still missing info — ask one follow-up question
            if (analysis.needsMoreInfo) {
                const missingFieldsText = [];
                if (!analysis.profile.level)
                    missingFieldsText.push('education level (12th, B.Tech, etc.)');
                if (!analysis.profile.field)
                    missingFieldsText.push('field of interest (CS, engineering, etc.)');
                if (!analysis.profile.score)
                    missingFieldsText.push('academic score/GPA');
                if (!analysis.profile.country)
                    missingFieldsText.push('preferred country');
                const missingInfo = missingFieldsText.length > 0
                    ? `Ask ONE specific question to collect this: ${missingFieldsText.join(', ')}. Do NOT ask the same question twice.`
                    : 'Ask ONE clarifying question to better understand their profile.';
                const followUp = await GeminiService_1.default.chat(missingInfo, safeHistory, { temperature: 0.3, language: responseLanguage });
                res.json({ reply: followUp, responseLanguage, timestamp: Date.now() });
                return;
            }
            // Have enough info — search catalog and explain matches
            const questionIntent = inferQuestionIntent(cleanMessage);
            const allPrograms = ProgramService_1.default.search({
                qualification: `${analysis.profile.qualification || ''} ${combinedUserText}`,
                gpa: analysis.profile.score || '',
                interests: analysis.profile.field || '',
                preferredCountry: analysis.profile.country || '',
                targetLevel: requestedLevel || 'Any',
            });
            const recentNames = getRecentlyRecommendedProgramNames(safeHistory);
            const programs = questionIntent === 'alternative'
                ? allPrograms.filter(program => !recentNames.has(normalize(program.name)))
                : allPrograms;
            const reply = questionIntent === 'best_fit'
                ? buildBestFitReply(programs.length ? programs : allPrograms, combinedUserText, responseLanguage)
                : buildProgramRecommendationText(programs.length ? programs : allPrograms, responseLanguage, questionIntent === 'alternative'
                    ? responseLanguage === 'hi'
                        ? 'ये कुछ दूसरे अच्छे options हैं:'
                        : 'Here are other good options from my catalog:'
                    : undefined);
            res.json({
                reply,
                responseLanguage,
                responseType: 'recommendation',
                programs: programs.length ? programs : allPrograms,
                rules: relevantRules.map(rule => rule.id),
                knowledge: knowledgeHits.map(hit => hit.id),
                timestamp: Date.now(),
            });
            return;
        }
        // ── General chat flow ──────────────────────────────────────────────────
        const reply = await GeminiService_1.default.chat(cleanMessage, safeHistory, {
            temperature: 0.3,
            userImage,
            language: responseLanguage,
        });
        res.json({ reply, responseLanguage, timestamp: Date.now() });
    }
    catch (error) {
        console.error('[ChatController] Error:', error?.message || error);
        // Gemini is offline or unreachable
        res.status(500).json({
            reply: "I'm having trouble connecting to the AI. Please check your Gemini API key and network connection.",
            timestamp: Date.now(),
        });
    }
};
exports.chatController = chatController;
const programFinderController = async (req, res) => {
    try {
        const { qualification, gpa, interests, preferredCountry } = req.body;
        if (!qualification || !interests) {
            res.status(400).json({ message: 'qualification and interests are required' });
            return;
        }
        const programs = ProgramService_1.default.search({
            qualification: qualification || '',
            gpa: gpa || '',
            interests: interests || '',
            preferredCountry: preferredCountry || '',
        });
        const summary = await GeminiService_1.default.chat(`Summarize in ONE sentence why these programs suit a student with: qualification=${qualification}, interests=${interests}.
Programs: ${JSON.stringify(programs.map(p => p.name))}`, [], { temperature: 0.2 });
        res.json({ programs, summary, totalFound: programs.length, timestamp: Date.now() });
    }
    catch (error) {
        console.error('[ProgramFinderController] Error:', error?.message || error);
        res.status(500).json({ message: 'Program search failed', timestamp: Date.now() });
    }
};
exports.programFinderController = programFinderController;
const eligibilityController = async (req, res) => {
    try {
        const { qualification, percentage, englishScore, workExperience } = req.body;
        if (!qualification || !percentage) {
            res.status(400).json({ message: 'qualification and percentage are required' });
            return;
        }
        const rawResult = await GeminiService_1.default.checkEligibility({
            qualification,
            percentage,
            englishScore: englishScore || 'Not provided',
            workExperience: workExperience || 'None',
        });
        const result = parseEligibilityJson(rawResult);
        res.json({ ...result, timestamp: Date.now() });
    }
    catch (error) {
        console.error('[EligibilityController] Error:', error?.message || error);
        const fallback = buildLocalEligibilityResult(String(req.body?.qualification || ''), String(req.body?.percentage || ''), String(req.body?.englishScore || 'Not provided'), String(req.body?.workExperience || 'None'));
        res.json({ ...fallback, timestamp: Date.now(), source: 'local_fallback' });
    }
};
exports.eligibilityController = eligibilityController;
//# sourceMappingURL=controllers.js.map