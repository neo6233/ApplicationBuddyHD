"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eligibilityController = exports.programFinderController = exports.chatController = exports.healthController = void 0;
const GeminiService_1 = __importDefault(require("../services/GeminiService")); // still named GeminiService.ts, just uses Ollama now
const ProgramService_1 = __importDefault(require("../services/ProgramService"));
const programCatalog_1 = require("../data/programCatalog");
const normalize = (text) => text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const includesAny = (text, keywords) => keywords.some(keyword => text.includes(keyword));
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
    const fullText = `${history.map(h => h.content).join(' ')} ${message}`;
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
const isFollowUpProgramQuestion = (text) => {
    const normalized = normalize(text);
    return includesAny(normalized, [
        'this course',
        'that course',
        'this program',
        'that program',
        'it',
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
const findLastMentionedProgram = (history) => {
    // Search backwards through history to find any program mention
    for (let i = history.length - 1; i >= 0; i--) {
        const mentions = findProgramMentions(history[i].content);
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
        return { program: null, ambiguous: true };
    }
    // 2. If it's a follow-up question, find the last mentioned program
    if (isFollowUpProgramQuestion(message)) {
        const lastMentioned = findLastMentionedProgram(history);
        if (lastMentioned) {
            return { program: lastMentioned, ambiguous: false };
        }
    }
    return { program: null, ambiguous: false };
};
const buildProgramDetailReply = (program, message, language) => {
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
    // Default: provide full info
    return language === 'hi'
        ? `${program.name} - ${program.university}, ${program.country}। अवधि: ${program.duration}। Intake: ${program.intake}। पात्रता: ${program.eligibility}।`
        : `${program.name} at ${program.university}, ${program.country}. Duration: ${program.duration}. Intake: ${program.intake}. Eligibility: ${program.eligibility}.`;
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
        // ── "List all" shortcut ────────────────────────────────────────────────
        const listAllRegex = /\b(all|list|show all|give me all|show|display|tell me)\b.*\b(course|program|option|programs|courses)s?\b/i;
        const isListRequest = listAllRegex.test(cleanMessage) ||
            includesAny(normalize(cleanMessage), ['list of programs', 'program list', 'all programs', 'all courses', 'सभी कोर्स', 'सभी प्रोग्राम']);
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
            const reply = buildProgramDetailReply(programContext.program, cleanMessage, responseLanguage);
            res.json({
                reply,
                responseLanguage,
                responseType: 'detail',
                programs: [programContext.program],
                timestamp: Date.now(),
            });
            return;
        }
        if (programContext.ambiguous) {
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
        // ── LOCAL EXTRACTION — Fill gaps in Ollama analysis ────────────────────
        const localData = extractProfileLocally(cleanMessage, safeHistory);
        if (analysis?.profile) {
            if (!analysis.profile.level && localData.level) {
                analysis.profile.level = localData.level;
            }
            if (!analysis.profile.field && localData.field) {
                analysis.profile.field = localData.field;
            }
            if (!analysis.profile.score && localData.score) {
                analysis.profile.score = localData.score;
            }
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
            if (hasLevel && hasField) {
                analysis.needsMoreInfo = false;
            }
        }
        console.log('[ANALYSIS AFTER PROCESSING]', JSON.stringify(analysis, null, 2));
        // ── Course recommendation flow ─────────────────────────────────────────
        if (analysis?.topic === 'course' && analysis?.profile) {
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
            const programs = ProgramService_1.default.search({
                qualification: analysis.profile.qualification || analysis.profile.level || '',
                gpa: analysis.profile.score || '',
                interests: analysis.profile.field || '',
                preferredCountry: analysis.profile.country || '',
            });
            const programNames = programs.map(p => `• ${p.name}`).join('\n');
            const reply = `Based on your profile, I found these matching programs in my catalog:\n${programNames}`;
            res.json({
                reply,
                responseLanguage,
                responseType: 'recommendation',
                programs,
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
        // Ollama is offline or unreachable
        res.status(500).json({
            reply: "I'm having trouble connecting to the AI. Please ensure Ollama is running (`ollama serve`).",
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
        // Strip markdown fences if Ollama wraps JSON in them
        const cleaned = rawResult.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const result = JSON.parse(cleaned);
        res.json({ ...result, timestamp: Date.now() });
    }
    catch (error) {
        console.error('[EligibilityController] Error:', error?.message || error);
        res.status(500).json({ message: 'Eligibility check failed', timestamp: Date.now() });
    }
};
exports.eligibilityController = eligibilityController;
//# sourceMappingURL=controllers.js.map