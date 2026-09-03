"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const appRules_1 = require("../data/appRules");
const programCatalog_1 = require("../data/programCatalog");
const VECTOR_DB_MODE = (process.env.VECTOR_DB_MODE || 'local').toLowerCase();
const QDRANT_URL = process.env.QDRANT_URL?.replace(/\/+$/g, '') ?? '';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? '';
const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'aria_knowledge';
const QDRANT_VECTOR_DIM = Number(process.env.QDRANT_VECTOR_DIM || '256');
const QDRANT_DISTANCE = (process.env.QDRANT_DISTANCE || 'Cosine');
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
const toSafeText = (value) => {
    if (typeof value === 'string')
        return value;
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'object') {
        const candidate = value;
        const nested = candidate.content ?? candidate.text ?? candidate.message;
        if (typeof nested === 'string')
            return nested;
    }
    return String(value);
};
const normalize = (text) => toSafeText(text)
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
const hashString = (value) => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0;
};
const toDenseVector = (text, dimension = QDRANT_VECTOR_DIM) => {
    const vector = new Array(dimension).fill(0);
    const tokens = tokenize(text);
    tokens.forEach(token => {
        const index = hashString(token) % dimension;
        vector[index] += 1;
    });
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!norm)
        return vector;
    return vector.map(value => value / norm);
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
        denseVector: toDenseVector(document.text),
    }));
};
const qdrantHeaders = () => {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (QDRANT_API_KEY) {
        headers['api-key'] = QDRANT_API_KEY;
    }
    return headers;
};
const qdrantRequest = async (path, method, body) => {
    if (!QDRANT_URL) {
        throw new Error('QDRANT_URL is not configured');
    }
    const response = await fetch(`${QDRANT_URL}${path}`, {
        method,
        headers: qdrantHeaders(),
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(`Qdrant request failed ${response.status}: ${responseBody}`);
    }
    return response.json();
};
class QdrantVectorDatabase {
    constructor(documents) {
        this.initialized = false;
        this.initPromise = null;
        this.documents = documents;
        if (QDRANT_URL) {
            this.initPromise = this.initialize();
        }
    }
    async ensureInitialized() {
        if (this.initPromise) {
            await this.initPromise;
        }
    }
    async initialize() {
        console.log('[VectorKnowledgeService] Initializing Qdrant vector database', {
            collection: QDRANT_COLLECTION_NAME,
            url: QDRANT_URL,
            vectorDim: QDRANT_VECTOR_DIM,
            distance: QDRANT_DISTANCE,
        });
        try {
            await qdrantRequest(`/collections/${QDRANT_COLLECTION_NAME}`, 'GET');
            console.log('[VectorKnowledgeService] Qdrant collection exists:', QDRANT_COLLECTION_NAME);
        }
        catch (err) {
            console.log('[VectorKnowledgeService] Qdrant collection not found, creating:', QDRANT_COLLECTION_NAME);
            await qdrantRequest(`/collections/${QDRANT_COLLECTION_NAME}`, 'PUT', {
                vectors: {
                    size: QDRANT_VECTOR_DIM,
                    distance: QDRANT_DISTANCE,
                },
            });
        }
        const points = this.documents.map((document, index) => ({
            id: index + 1,
            vector: document.denseVector,
            payload: {
                docId: document.id,
                type: document.type,
                text: document.text,
            },
        }));
        await qdrantRequest(`/collections/${QDRANT_COLLECTION_NAME}/points?wait=true`, 'PUT', {
            points,
        });
        this.initialized = true;
    }
    async search(query, limit = 5) {
        await this.ensureInitialized();
        if (!QDRANT_URL) {
            return [];
        }
        console.log('[VectorKnowledgeService] Running Qdrant search', {
            collection: QDRANT_COLLECTION_NAME,
            query: typeof query === 'string' ? query : JSON.stringify(query),
            limit,
        });
        const queryVector = toDenseVector(query);
        const body = {
            vector: queryVector,
            top: limit,
            with_payload: true,
            include_vectors: false,
        };
        const result = await qdrantRequest(`/collections/${QDRANT_COLLECTION_NAME}/points/search`, 'POST', body);
        if (!Array.isArray(result.result)) {
            return [];
        }
        return result.result
            .map((item) => {
            const docId = item.payload?.docId ?? item.id;
            const document = this.documents.find(doc => String(doc.id) === String(docId));
            return document
                ? {
                    id: document.id,
                    type: document.type,
                    text: document.text,
                    score: item.score ?? 0,
                }
                : null;
        })
            .filter((hit) => hit !== null);
    }
}
class LocalVectorDatabase {
    constructor(documents) {
        this.documents = documents;
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
const localVectorDatabase = new LocalVectorDatabase(buildDocuments());
const qdrantVectorDatabase = new QdrantVectorDatabase(buildDocuments());
class VectorKnowledgeService {
    async search(query, limit = 5) {
        console.log('[VectorKnowledgeService] search called', {
            mode: VECTOR_DB_MODE,
            hasQdrantUrl: Boolean(QDRANT_URL),
            query: typeof query === 'string' ? query : JSON.stringify(query),
            limit,
        });
        if (VECTOR_DB_MODE === 'qdrant') {
            try {
                const qdrantHits = await qdrantVectorDatabase.search(query, limit);
                if (qdrantHits.length > 0) {
                    console.log('[VectorKnowledgeService] Returning Qdrant search results', {
                        count: qdrantHits.length,
                    });
                    return qdrantHits;
                }
                console.log('[VectorKnowledgeService] Qdrant search returned no results, falling back to local vector search');
            }
            catch (err) {
                console.warn('[VectorKnowledgeService] Qdrant search failed, falling back to local vector search.', err);
            }
        }
        else {
            console.log('[VectorKnowledgeService] Qdrant mode disabled, using local vector search');
        }
        console.log('[VectorKnowledgeService] Using local vector search');
        return localVectorDatabase.search(query, limit);
    }
}
exports.default = new VectorKnowledgeService();
//# sourceMappingURL=VectorKnowledgeService.js.map