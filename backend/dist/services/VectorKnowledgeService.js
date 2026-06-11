"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const appRules_1 = require("../data/appRules");
const programCatalog_1 = require("../data/programCatalog");
const STOP_WORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'can',
    'do',
    'for',
    'from',
    'how',
    'i',
    'in',
    'is',
    'it',
    'me',
    'my',
    'of',
    'on',
    'or',
    'the',
    'to',
    'what',
    'with',
    'you',
    // Hindi/Hinglish stop words
    'में',
    'के',
    'का',
    'को',
    'की',
    'है',
    'हैं',
    'था',
    'थी',
    'थे',
    'और',
    'से',
    'पर',
    'भी',
    'तो',
    'ही',
    'हो',
    'कर',
    'करो',
    'करके',
    'कैन',
    'यू',
    'karo',
    'kar',
    'do',
    'plez',
    'please'
]);
const normalize = (text) => text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9%+.\s\u0900-\u097F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tokenize = (text) => normalize(text)
    .split(' ')
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
const toVector = (text) => {
    const tokens = tokenize(text);
    const vector = new Map();
    tokens.forEach(token => {
        vector.set(token, (vector.get(token) || 0) + 1);
    });
    return vector;
};
const cosineSimilarity = (a, b) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    a.forEach((value, key) => {
        dot += value * (b.get(key) || 0);
        normA += value * value;
    });
    b.forEach(value => {
        normB += value * value;
    });
    if (!normA || !normB) {
        return 0;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};
const buildDocuments = () => {
    const appDocs = [
        {
            id: 'app:purpose',
            type: 'app',
            text: 'ARIA helps students find suitable study abroad programs, understand eligibility, compare courses, explore career outcomes, and plan admission next steps.',
        },
        {
            id: 'app:answer_style',
            type: 'app',
            text: 'ARIA should answer the exact current question first, use the student profile from user messages, and avoid repeating the same generic list.',
        },
    ];
    const ruleDocs = appRules_1.APP_RULES.map(rule => ({
        id: `rule:${rule.id}`,
        type: 'rule',
        text: `${rule.text} Keywords: ${rule.keywords.join(', ')}`,
    }));
    const conversationalDocs = [
        {
            id: 'pattern:save',
            type: 'app',
            text: 'Save bookmark keep program सेव सेव करो सेव कर दो बचाओ रखो please save save bachelor of. Action: save the program to user profile.',
        },
        {
            id: 'pattern:detail',
            type: 'app',
            text: 'Tell me about details of details qualification eligibility duration बताओ जानकारी डिटेल information university country. Action: show program details.',
        },
        {
            id: 'pattern:recommend',
            type: 'app',
            text: 'Recommend find search courses list computer science business engineering find courses suggest courses list. Action: list program recommendations.',
        },
        {
            id: 'pattern:career',
            type: 'app',
            text: 'Career jobs scope salary outcomes placement भविष्य नौकरी करियर स्कोप. Action: describe career options.',
        }
    ];
    const programDocs = [];
    programCatalog_1.PROGRAM_CATALOG.forEach(program => {
        // 1. General English description
        programDocs.push({
            id: `program:${program.name}:general`,
            type: 'program',
            text: `${program.name} details: offered at ${program.university} in ${program.country}. Level: ${program.level}, Duration: ${program.duration}, Intake: ${program.intake}. Eligibility: ${program.eligibility}. Fields: ${program.fields.join(', ')}.`,
        });
        // 2. Hindi General details
        programDocs.push({
            id: `program:${program.name}:general_hi`,
            type: 'program',
            text: `${program.name} की जानकारी: विश्वविद्यालय: ${program.university}, देश: ${program.country}, स्तर: ${program.level}, अवधि: ${program.duration}, दाखिला/इनटेक: ${program.intake}, योग्यता/एलिजिबिलिटी: ${program.eligibility}.`,
        });
        // 3. Eligibility/Qualifications English
        programDocs.push({
            id: `program:${program.name}:eligibility`,
            type: 'program',
            text: `Eligibility and qualifications for ${program.name} at ${program.university}: ${program.eligibility}. Requirements include ${program.minQualificationKeywords.join(', ')}.`,
        });
        // 4. Eligibility/Qualifications Hindi
        programDocs.push({
            id: `program:${program.name}:eligibility_hi`,
            type: 'program',
            text: `${program.name} के लिए पात्रता और योग्यता: ${program.eligibility}. इसके लिए न्यूनतम योग्यता ${program.minQualificationKeywords.join(', ')} की आवश्यकता है।`,
        });
        // 5. Careers English
        programDocs.push({
            id: `program:${program.name}:careers`,
            type: 'program',
            text: `Career outcomes, jobs, salary, and scope for ${program.name} from ${program.university}: ${program.careerOpportunities.join(', ')}.`,
        });
        // 6. Careers Hindi
        programDocs.push({
            id: `program:${program.name}:careers_hi`,
            type: 'program',
            text: `${program.name} के बाद करियर के अवसर, नौकरियां, भविष्य, स्कोप: ${program.careerOpportunities.join(', ')}.`,
        });
        // 7. Intake & Duration English
        programDocs.push({
            id: `program:${program.name}:duration_intake`,
            type: 'program',
            text: `Duration and intake session for ${program.name} at ${program.university}: duration is ${program.duration}, intake is during ${program.intake}.`,
        });
        // 8. Intake & Duration Hindi
        programDocs.push({
            id: `program:${program.name}:duration_intake_hi`,
            type: 'program',
            text: `${program.name} की अवधि और दाखिला: अवधि ${program.duration} है और इनटेक/दाखिला ${program.intake} में होता है।`,
        });
    });
    return [...appDocs, ...ruleDocs, ...conversationalDocs, ...programDocs].map(document => ({
        ...document,
        vector: toVector(document.text),
    }));
};
class VectorKnowledgeService {
    constructor() {
        this.documents = buildDocuments();
    }
    search(query, limit = 5) {
        const queryVector = toVector(query);
        return this.documents
            .map(document => ({
            id: document.id,
            type: document.type,
            text: document.text,
            score: cosineSimilarity(queryVector, document.vector),
        }))
            .filter(hit => hit.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
}
exports.default = new VectorKnowledgeService();
//# sourceMappingURL=VectorKnowledgeService.js.map