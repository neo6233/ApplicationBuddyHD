import { PROGRAM_CATALOG, ProgramCatalogItem as Program } from '../data/programCatalog';

type ProgramLevel = Program['level'];

interface ProgramSearchFilters {
  qualification?: string;
  gpa?: string;
  interests?: string;
  preferredCountry?: string;
  targetLevel?: ProgramLevel | 'Any';
}

const toSafeText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const candidate = value as {content?: unknown; text?: unknown; message?: unknown};
    const nested = candidate.content ?? candidate.text ?? candidate.message;
    if (typeof nested === 'string') return nested;
  }
  return String(value);
};

const normalize = (text: unknown) =>
  toSafeText(text)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const includesAny = (text: string, keywords: string[]) =>
  keywords.some(keyword => text.includes(keyword));

const parseNumericScore = (input: string): number | undefined => {
  const normalized = normalize(input);
  const percentageMatch = normalized.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (percentageMatch?.[1]) {
    return Number(percentageMatch[1]);
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

const inferQualificationLevel = (qualification: string): ProgramLevel | 'Any' => {
  const text = normalize(qualification);
  if (includesAny(text, ['phd', 'doctorate'])) return 'PG';
  if (includesAny(text, ['master', 'msc', 'ma', 'mtech', 'mba', 'pg'])) return 'PG';
  if (includesAny(text, ['diploma', 'certificate'])) return 'Diploma';
  if (includesAny(text, ['bachelor', 'be', 'btech', 'b.sc', 'bba', 'undergraduate'])) return 'UG';
  if (includesAny(text, ['high school', 'secondary', '12th', '10th'])) return 'UG';
  return 'Any';
};

const inferTargetLevel = (text: string): ProgramLevel | 'Any' => {
  const normalized = normalize(text);
  if (includesAny(normalized, ['master', 'masters', 'msc', 'mtech', 'mba', 'postgraduate', 'pg course'])) return 'PG';
  if (includesAny(normalized, ['bachelor', 'bachelors', 'degree after 12th', 'undergraduate', 'ug course'])) return 'UG';
  if (includesAny(normalized, ['diploma', 'certificate'])) return 'Diploma';
  if (includesAny(normalized, ['12th', '12 pass', 'class 12', 'high school', 'secondary', 'degree after 12th', 'ug course'])) return 'UG';
  return 'Any';
};

const inferField = (text: string): string | undefined => {
  const normalized = normalize(text);
  const patterns: Array<{keywords: string[]; value: string}> = [
    {keywords: ['computer science', 'software', 'programmer', 'developer', 'engineer', 'it', 'technology', 'coding'], value: 'technology'},
    {keywords: ['data science', 'machine learning', 'ai', 'artificial intelligence', 'analytics'], value: 'data'},
    {keywords: ['business', 'management', 'commerce', 'finance', 'marketing', 'mba', 'bba'], value: 'business'},
    {keywords: ['engineering', 'civil', 'mechanical', 'electrical', 'electronics', 'chemical'], value: 'engineering'},
    {keywords: ['healthcare', 'nursing', 'pharmacy', 'medical', 'biology', 'doctor', 'nurse'], value: 'health'},
    {keywords: ['education', 'teaching', 'teacher', 'academic'], value: 'education'},
    {keywords: ['law', 'legal', 'lawyer', 'llb'], value: 'law'},
    {keywords: ['design', 'arts', 'media', 'animation', 'graphic'], value: 'arts'},
    {keywords: ['cyber security', 'cybersecurity', 'security', 'hacking'], value: 'security'},
  ];

  const match = patterns.find(item => includesAny(normalized, item.keywords));
  return match?.value;
};

class ProgramService {
  search(filters: ProgramSearchFilters): Program[] {
    console.log('[PROGRAM SEARCH FILTER]', filters);

    const { qualification, gpa, interests, preferredCountry } = filters;
    const targetLevel = filters.targetLevel && filters.targetLevel !== 'Any'
      ? filters.targetLevel
      : inferTargetLevel(`${interests || ''} ${qualification || ''}`);

    const candidateCatalog = targetLevel !== 'Any'
      ? PROGRAM_CATALOG.filter(item => item.level === targetLevel)
      : PROGRAM_CATALOG;

    const selected = [...candidateCatalog]
      .map(item => ({
        item,
        matchScore: this.scoreCatalogItem(item, { qualification, gpa, interests, preferredCountry }),
      }))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    const programs: Program[] = selected.map(({ item, matchScore }) => ({
      ...item,
      matchScore,
    }));

    console.log('[PROGRAM SEARCH RESULT]', JSON.stringify(programs, null, 2));
    return programs;
  }

  searchByKeyword(keyword: unknown): Program[] {
    const normalizedKeyword = normalize(keyword);
    const programs = PROGRAM_CATALOG.filter(program =>
      normalize(program.name).includes(normalizedKeyword) ||
      program.fields.some(field => normalize(field).includes(normalizedKeyword))
    );
    return programs;
  }

  getAllPrograms(): Program[] {
    return PROGRAM_CATALOG;
  }

  private scoreCatalogItem(item: Program, data: ProgramSearchFilters): number {
    const qualificationText = normalize(data.qualification || '');
    const interestsText = normalize(data.interests || '');
    const countryText = normalize(data.preferredCountry || '');
    const qualificationLevel = inferQualificationLevel(data.qualification || '');
    const score = parseNumericScore(data.gpa || '');

    let total = 45;

    if (item.countries.some((country: string) => normalize(country).includes(countryText) || countryText.includes(normalize(country)))) {
      total += 20;
    }

    if (qualificationLevel === 'UG' && item.level === 'PG') {
      total -= 45;
    } else if (qualificationLevel === item.level || qualificationLevel === 'Any') {
      total += 20;
    } else if (qualificationLevel === 'UG' && item.level === 'Diploma') {
      total += 10;
    } else if (qualificationLevel === 'PG' && item.level !== 'UG') {
      total += 10;
    }

    if (item.fields.some((field: string) => includesAny(interestsText, [field]))) {
      total += 20;
    } else {
      const inferredField = inferField(interestsText);
      if (inferredField && item.fields.some((field: string) => includesAny(normalize(field), [inferredField]))) {
        total += 15;
      }
    }

    if (score !== undefined && item.minGpa !== undefined) {
      if (score >= item.minGpa * 10) {
        total += 10;
      } else {
        total -= 10;
      }
    }

    if (
      qualificationText &&
      item.minQualificationKeywords.some((keyword: string) => qualificationText.includes(keyword))
    ) {
      total += 10;
    }

    return Math.max(35, Math.min(98, total));
  }
}

export default new ProgramService();
