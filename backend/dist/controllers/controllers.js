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
const findProgramMentions = (text) => {
    const normalized = normalize(text);
    return programCatalog_1.PROGRAM_CATALOG.filter(program => normalized.includes(normalize(program.name)));
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
    ]);
};
const resolveProgramFromConversation = (message, history) => {
    const directMentions = findProgramMentions(message);
    if (directMentions.length === 1) {
        return { program: directMentions[0], ambiguous: false };
    }
    if (directMentions.length > 1) {
        return { program: null, ambiguous: true };
    }
    if (!isFollowUpProgramQuestion(message)) {
        return { program: null, ambiguous: false };
    }
    const lastAssistantMessage = [...history].reverse().find(item => item.role === 'assistant');
    if (!lastAssistantMessage?.content) {
        return { program: null, ambiguous: true };
    }
    const assistantMentions = findProgramMentions(lastAssistantMessage.content);
    if (assistantMentions.length === 1) {
        return { program: assistantMentions[0], ambiguous: false };
    }
    return { program: null, ambiguous: assistantMentions.length !== 0 };
};
const buildProgramDetailReply = (program, message) => {
    const normalized = normalize(message);
    if (includesAny(normalized, ['duration', 'how long', 'years', 'months'])) {
        return `${program.name} is ${program.duration} long.`;
    }
    if (includesAny(normalized, ['eligib', 'require', 'criteria', 'qualif'])) {
        return `Eligibility for ${program.name} is ${program.eligibility}.`;
    }
    if (includesAny(normalized, ['intake', 'when', 'start', 'semester'])) {
        return `${program.name} intake is ${program.intake}.`;
    }
    return `${program.name} at ${program.university}, ${program.country}, is a ${program.duration} program. Intake: ${program.intake}. Eligibility: ${program.eligibility}.`;
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
        // ── "List all" shortcut ────────────────────────────────────────────────
        const listAllRegex = /\b(all|list|show all|give me all)\b.*\b(course|program|option)s?\b/i;
        if (listAllRegex.test(cleanMessage)) {
            const programs = ProgramService_1.default.getAllPrograms();
            res.json({
                reply: 'Here are all the courses I have in my catalog:',
                programs,
                timestamp: Date.now(),
            });
            return;
        }
        const userImage = typeof image === 'string' ? image : undefined;
        // ── Direct program follow-up flow ─────────────────────────────────────
        const programContext = resolveProgramFromConversation(cleanMessage, safeHistory);
        if (programContext.program) {
            const reply = buildProgramDetailReply(programContext.program, cleanMessage);
            res.json({
                reply,
                responseType: 'detail',
                programs: [programContext.program],
                timestamp: Date.now(),
            });
            return;
        }
        if (programContext.ambiguous) {
            res.json({
                reply: 'Which course do you mean from the previous list?',
                timestamp: Date.now(),
            });
            return;
        }
        // ── Greeting shortcut — skip analysis, just reply ──────────────────────
        const greetings = ['hi', 'hii', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
        if (greetings.includes(cleanMessage.toLowerCase())) {
            const reply = await GeminiService_1.default.chat(cleanMessage, safeHistory, { userImage });
            res.json({ reply, timestamp: Date.now() });
            return;
        }
        // ── Analyze intent ─────────────────────────────────────────────────────
        const analysis = await GeminiService_1.default.analyzeConversation(cleanMessage, safeHistory);
        console.log('[ANALYSIS]', JSON.stringify(analysis, null, 2));
        // ── Course recommendation flow ─────────────────────────────────────────
        if (analysis?.topic === 'course' && analysis?.profile) {
            // Still missing info — ask one follow-up question
            if (analysis.needsMoreInfo) {
                const followUp = await GeminiService_1.default.chat(`Ask ONE short question (under 15 words) to collect this missing info: ${analysis.followUpQuestion || 'more details about their profile'}.`, [], { temperature: 0.3 });
                res.json({ reply: followUp, timestamp: Date.now() });
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
        });
        res.json({ reply, timestamp: Date.now() });
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