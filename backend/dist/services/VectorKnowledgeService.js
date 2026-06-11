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
]);
const normalize = (text) => text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9%+.\s]/g, ' ').replace(/\s+/g, ' ').trim();
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
    const programDocs = programCatalog_1.PROGRAM_CATALOG.map(program => ({
        id: `program:${program.name}`,
        type: 'program',
        text: [
            `${program.name} at ${program.university}, ${program.country}.`,
            `Level: ${program.level}. Duration: ${program.duration}. Intake: ${program.intake}.`,
            `Eligibility: ${program.eligibility}.`,
            `Fields: ${program.fields.join(', ')}.`,
            `Career outcomes: ${program.careerOpportunities.join(', ')}.`,
        ].join(' '),
    }));
    return [...appDocs, ...ruleDocs, ...programDocs].map(document => ({
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