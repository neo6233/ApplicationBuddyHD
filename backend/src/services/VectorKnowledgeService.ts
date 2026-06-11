import {APP_RULES} from '../data/appRules';
import {PROGRAM_CATALOG} from '../data/programCatalog';

export interface KnowledgeHit {
  id: string;
  type: 'rule' | 'program' | 'app';
  text: string;
  score: number;
}

interface KnowledgeDocument {
  id: string;
  type: KnowledgeHit['type'];
  text: string;
  vector: Map<string, number>;
}

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

const normalize = (text: string) =>
  text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9%+.\s]/g, ' ').replace(/\s+/g, ' ').trim();

const tokenize = (text: string) =>
  normalize(text)
    .split(' ')
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));

const toVector = (text: string) => {
  const tokens = tokenize(text);
  const vector = new Map<string, number>();

  tokens.forEach(token => {
    vector.set(token, (vector.get(token) || 0) + 1);
  });

  return vector;
};

const cosineSimilarity = (a: Map<string, number>, b: Map<string, number>) => {
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

const buildDocuments = (): KnowledgeDocument[] => {
  const appDocs: Array<Omit<KnowledgeDocument, 'vector'>> = [
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

  const ruleDocs = APP_RULES.map(rule => ({
    id: `rule:${rule.id}`,
    type: 'rule' as const,
    text: `${rule.text} Keywords: ${rule.keywords.join(', ')}`,
  }));

  const programDocs = PROGRAM_CATALOG.map(program => ({
    id: `program:${program.name}`,
    type: 'program' as const,
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
  private documents = buildDocuments();

  search(query: string, limit = 5): KnowledgeHit[] {
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

export default new VectorKnowledgeService();
