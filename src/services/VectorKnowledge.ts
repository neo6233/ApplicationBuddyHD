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
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do',
  'for', 'from', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of',
  'on', 'or', 'the', 'to', 'what', 'with', 'you',
  // Hindi/Hinglish stop words
  '\u092E\u0947\u0902', '\u0915\u0947', '\u0915\u093E', '\u0915\u094B', '\u0915\u0940', '\u0939\u0948', '\u0939\u0948\u0902', '\u0925\u093E', '\u0925\u0940', '\u0925\u0947',
  '\u0914\u0930', '\u0938\u0947', '\u092A\u0930', '\u092D\u0940', '\u0924\u094B', '\u0939\u0940', '\u0939\u094B', '\u0915\u0930', '\u0915\u0930\u094B', '\u0915\u0930\u0915\u0947',
  '\u0915\u0948\u0928', '\u092F\u0942', 'karo', 'kar', 'do', 'plez', 'please',
]);

const normalize = (text: string) =>
  text.toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9%+.\s\u0900-\u097F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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

  if (!normA || !normB) return 0;
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

  const conversationalDocs: Array<Omit<KnowledgeDocument, 'vector'>> = [
    {
      id: 'pattern:save',
      type: 'app',
      text: 'Save bookmark keep program \u0938\u0947\u0935 \u0938\u0947\u0935 \u0915\u0930\u094B \u0938\u0947\u0935 \u0915\u0930 \u0926\u094B \u092C\u091A\u093E\u0913 \u0930\u0916\u094B please save save bachelor of. Action: save the program to user profile.',
    },
    {
      id: 'pattern:detail',
      type: 'app',
      text: 'Tell me about details of details qualification eligibility duration \u092C\u0924\u093E\u0913 \u091C\u093E\u0928\u0915\u093E\u0930\u0940 \u0921\u093F\u091F\u0947\u0932 information university country. Action: show program details.',
    },
    {
      id: 'pattern:recommend',
      type: 'app',
      text: 'Recommend find search courses list computer science business engineering find courses suggest courses list. Action: list program recommendations.',
    },
    {
      id: 'pattern:career',
      type: 'app',
      text: 'Career jobs scope salary outcomes placement \u092D\u0935\u093F\u0937\u094D\u092F \u0928\u094C\u0915\u0930\u0940 \u0915\u0930\u093F\u092F\u0930 \u0938\u094D\u0915\u094B\u092A. Action: describe career options.',
    },
  ];

  const programDocs: Array<Omit<KnowledgeDocument, 'vector'>> = [];
  PROGRAM_CATALOG.forEach(program => {
    programDocs.push({
      id: `program:${program.name}:general`,
      type: 'program',
      text: `${program.name} details: offered at ${program.university} in ${program.country}. Level: ${program.level}, Duration: ${program.duration}, Intake: ${program.intake}. Eligibility: ${program.eligibility}. Fields: ${program.fields.join(', ')}.`,
    });
    programDocs.push({
      id: `program:${program.name}:general_hi`,
      type: 'program',
      text: `${program.name} \u0915\u0940 \u091C\u093E\u0928\u0915\u093E\u0930\u0940: \u0935\u093F\u0936\u094D\u0935\u0935\u093F\u0926\u094D\u092F\u093E\u0932\u092F: ${program.university}, \u0926\u0947\u0936: ${program.country}, \u0938\u094D\u0924\u0930: ${program.level}, \u0905\u0935\u0927\u093F: ${program.duration}, \u0926\u093E\u0916\u093F\u0932\u093E/\u0907\u0928\u091F\u0947\u0915: ${program.intake}, \u092F\u094B\u0917\u094D\u092F\u0924\u093E/\u090F\u0932\u093F\u091C\u093F\u092C\u093F\u0932\u093F\u091F\u0940: ${program.eligibility}.`,
    });
    programDocs.push({
      id: `program:${program.name}:eligibility`,
      type: 'program',
      text: `Eligibility and qualifications for ${program.name} at ${program.university}: ${program.eligibility}. Requirements include ${program.minQualificationKeywords.join(', ')}.`,
    });
    programDocs.push({
      id: `program:${program.name}:eligibility_hi`,
      type: 'program',
      text: `${program.name} \u0915\u0947 \u0932\u093F\u090F \u092A\u093E\u0924\u094D\u0930\u0924\u093E \u0914\u0930 \u092F\u094B\u0917\u094D\u092F\u0924\u093E: ${program.eligibility}. \u0907\u0938\u0915\u0947 \u0932\u093F\u090F \u0928\u094D\u092F\u0942\u0928\u0924\u092E \u092F\u094B\u0917\u094D\u092F\u0924\u093E ${program.minQualificationKeywords.join(', ')} \u0915\u0940 \u0906\u0935\u0936\u094D\u092F\u0915\u0924\u093E \u0939\u0948\u0964`,
    });
    programDocs.push({
      id: `program:${program.name}:careers`,
      type: 'program',
      text: `Career outcomes, jobs, salary, and scope for ${program.name} from ${program.university}: ${program.careerOpportunities.join(', ')}.`,
    });
    programDocs.push({
      id: `program:${program.name}:careers_hi`,
      type: 'program',
      text: `${program.name} \u0915\u0947 \u092C\u093E\u0926 \u0915\u0930\u093F\u092F\u0930 \u0915\u0947 \u0905\u0935\u0938\u0930, \u0928\u094C\u0915\u0930\u093F\u092F\u093E\u0902, \u092D\u0935\u093F\u0937\u094D\u092F, \u0938\u094D\u0915\u094B\u092A: ${program.careerOpportunities.join(', ')}.`,
    });
    programDocs.push({
      id: `program:${program.name}:duration_intake`,
      type: 'program',
      text: `Duration and intake session for ${program.name} at ${program.university}: duration is ${program.duration}, intake is during ${program.intake}.`,
    });
    programDocs.push({
      id: `program:${program.name}:duration_intake_hi`,
      type: 'program',
      text: `${program.name} \u0915\u0940 \u0905\u0935\u0927\u093F \u0914\u0930 \u0926\u093E\u0916\u093F\u0932\u093E: \u0905\u0935\u0927\u093F ${program.duration} \u0939\u0948 \u0914\u0930 \u0907\u0928\u091F\u0947\u0915/\u0926\u093E\u0916\u093F\u0932\u093E ${program.intake} \u092E\u0947\u0902 \u0939\u094B\u0924\u093E \u0939\u0948\u0964`,
    });
  });

  return [...appDocs, ...ruleDocs, ...conversationalDocs, ...programDocs].map(doc => ({
    ...doc,
    vector: toVector(doc.text),
  }));
};

class VectorKnowledgeService {
  private documents = buildDocuments();

  search(query: string, limit = 5): KnowledgeHit[] {
    const queryVector = toVector(query);

    return this.documents
      .map(doc => ({
        id: doc.id,
        type: doc.type,
        text: doc.text,
        score: cosineSimilarity(queryVector, doc.vector),
      }))
      .filter(hit => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

const vectorKnowledge = new VectorKnowledgeService();
export default vectorKnowledge;
