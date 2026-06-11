"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRelevantAppRules = exports.APP_RULES = void 0;
exports.APP_RULES = [
    {
        id: 'app_role',
        priority: 110,
        keywords: ['what my app do', 'what can you do', 'aria', 'admission counsellor', 'counsellor'],
        text: 'ARIA is an AI admission counsellor. It helps students choose programs, understand eligibility, compare courses, explore career outcomes, and prepare next admission steps.',
    },
    {
        id: 'master_requires_bachelor',
        priority: 100,
        keywords: ['master', 'masters', 'msc', 'mtech', 'mba', 'pg', 'postgraduate', '12th', 'secondary'],
        text: "A student cannot directly start a Master's program after 12th. They must complete a relevant bachelor's degree first.",
    },
    {
        id: 'after_12th_options',
        priority: 90,
        keywords: ['12th', '12 pass', 'class 12', 'secondary', 'intermediate', 'after 12th'],
        text: 'After 12th, show only undergraduate bachelor programs and diploma programs from the catalog.',
    },
    {
        id: 'diploma_request',
        priority: 85,
        keywords: ['diploma', 'certificate'],
        text: 'When the user asks for diploma, recommend only catalog programs with level Diploma unless they ask for postgraduate diploma and have a bachelor qualification.',
    },
    {
        id: 'current_question_first',
        priority: 80,
        keywords: ['how', 'can i', 'i want', 'because', 'you give me'],
        text: 'Always answer the current question first before recommending another list.',
    },
    {
        id: 'career_questions',
        priority: 78,
        keywords: ['career', 'job', 'scope', 'opportunity', 'salary', 'future'],
        text: 'When the user asks about career, answer with career outcomes from the selected catalog program and add a short practical recommendation.',
    },
    {
        id: 'best_fit_questions',
        priority: 76,
        keywords: ['best', 'suggest', 'recommend', 'prefer', 'strong with math', 'maths', 'pcm'],
        text: 'When the user asks what is best, use their strengths and profile. Explain why one program fits better instead of repeating a generic list.',
    },
    {
        id: 'opinion_questions',
        priority: 74,
        keywords: ['what you think', 'is it good', 'should i', 'go with', 'better'],
        text: 'When the user asks for an opinion, give a clear recommendation with one reason and one caution.',
    },
    {
        id: 'answer_before_list',
        priority: 95,
        keywords: ['tell me', 'about', 'details', 'qualification', 'eligibility', 'duration', 'fees', 'intake', 'बताओ', 'जानकारी', 'डिटेल'],
        text: 'If the user asks a specific question or wants details about a specific program, answer that question directly using the program details. Do NOT show a program list.',
    },
    {
        id: 'save_intent',
        priority: 96,
        keywords: ['save', 'bookmark', 'सेव', 'कैन यू सावे', 'प्लीज सेव', 'सेव करो'],
        text: 'When the user wants to save, bookmark, or keep a program (e.g. says save/सेव), save the mentioned program using the save action and confirm the save. Do NOT list unrelated courses.',
    },
    {
        id: 'no_repeat',
        priority: 97,
        keywords: ['again', 'repeat', 'recommend', 'computer', 'course', 'program', 'courses', 'programs'],
        text: 'Never output the same recommendation list of programs twice. If you have already recommended a set of programs, focus on addressing the user’s follow-up query directly or ask clarifying questions.',
    },
    {
        id: 'detail_vs_list',
        priority: 98,
        keywords: ['bachelor', 'master', 'diploma', 'science', 'technology', 'management', 'engineering'],
        text: 'When the user mentions one specific program name (e.g. "Bachelor of Computer Science" or "बैचलर ऑफ़ कंप्यूटर साइंस"), provide information or details about that specific program instead of listing other different courses.',
    },
];
const normalize = (text) => text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const findRelevantAppRules = (text, limit = 3) => {
    const normalized = normalize(text);
    return exports.APP_RULES.map(rule => ({
        rule,
        score: rule.keywords.reduce((total, keyword) => total + (normalized.includes(normalize(keyword)) ? 1 : 0), 0),
    }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || b.rule.priority - a.rule.priority)
        .slice(0, limit)
        .map(item => item.rule);
};
exports.findRelevantAppRules = findRelevantAppRules;
//# sourceMappingURL=appRules.js.map