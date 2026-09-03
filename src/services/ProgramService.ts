import {PROGRAM_CATALOG, ProgramCatalogItem} from '../data/programCatalog';

type ProgramLevel = ProgramCatalogItem['level'];

export interface ProgramSearchFilters {
  qualification?: string;
  gpa?: string;
  interests?: string;
  preferredCountry?: string;
  targetLevel?: ProgramLevel | 'Any';
}

const normalize = (text: string) =>
  text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();

const includesAny = (text: string, keywords: string[]) =>
  keywords.some(keyword => text.includes(keyword));

const hasSchoolQualification = (text: string) =>
  includesAny(text, ['high school', 'secondary', '12th', '12 pass', 'class 12', '10th', '10 pass', 'intermediate']) ||
  /\b(?:after\s+(?:my\s+)?|class\s*)12\b|\b12\s*(?:pass|standard|std|grade)\b/i.test(text);

const hasBachelorQualification = (text: string) =>
  includesAny(text, ['bachelor', "bachelor's", 'bachelors', 'btech', 'b.tech', 'b.sc', 'bsc', 'bba', 'b.e', 'graduation', 'graduate']);

const SCHOOL_PASS_PERCENTAGE = 35;

const COUNTRY_ALIASES: Record<string, string[]> = {
  uk: ['uk', 'united kingdom', 'england', 'britain', 'great britain'],
  usa: ['usa', 'us', 'united states', 'america'],
  canada: ['canada'],
  australia: ['australia'],
  'new zealand': ['new zealand', 'nz'],
  germany: ['germany'],
};

const parseNumericScore = (input: string): number | undefined => {
  const normalized = normalize(input);
  const percentageMatch = normalized.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (percentageMatch?.[1]) return Number(percentageMatch[1]);

  const gpaMatch = normalized.match(/(\d{1,2}(?:\.\d{1,2})?)\s*(?:\/\s*10|gpa)/);
  if (gpaMatch?.[1]) {
    const gpa = Number(gpaMatch[1]);
    if (Number.isFinite(gpa)) return Math.min(100, Math.max(0, gpa * 10));
  }

  const rawNumber = normalized.match(/\b(\d{1,3}(?:\.\d{1,2})?)\b/);
  if (rawNumber?.[1]) return Number(rawNumber[1]);
  return undefined;
};

const inferQualificationLevel = (qualification: string): ProgramLevel | 'Any' => {
  const text = normalize(qualification);
  if (includesAny(text, ['phd', 'doctorate'])) return 'PG';
  if (includesAny(text, ['master', 'msc', 'mtech', 'mba', 'postgraduate', 'post graduate']) || /\b(?:ma|pg)\b/i.test(text)) return 'PG';
  if (includesAny(text, ['diploma', 'certificate'])) return 'Diploma';
  if (hasBachelorQualification(text) || includesAny(text, ['undergraduate'])) return 'UG';
  if (hasSchoolQualification(text)) return 'UG';
  return 'Any';
};

const inferNextLevelFromQualification = (qualification: string): ProgramLevel | 'Any' => {
  const text = normalize(qualification);
  if (hasBachelorQualification(text) || includesAny(text, ['undergraduate'])) return 'PG';
  if (includesAny(text, ['master', 'msc', 'mtech', 'mba', 'postgraduate', 'post graduate']) || /\b(?:ma|pg)\b/i.test(text)) return 'PG';
  if (includesAny(text, ['diploma', 'certificate'])) return 'UG';
  if (hasSchoolQualification(text)) return 'UG';
  return 'Any';
};

const inferTargetLevel = (text: string): ProgramLevel | 'Any' => {
  const normalized = normalize(text);
  if (includesAny(normalized, ['master', 'masters', 'msc', 'mtech', 'mba', 'postgraduate', 'pg course'])) return 'PG';
  if (includesAny(normalized, ['diploma', 'certificate'])) return 'Diploma';
  if (includesAny(normalized, ['bachelor', 'undergraduate', 'ug course', 'degree after 12th'])) return 'UG';
  if (hasSchoolQualification(normalized)) return 'UG';
  return 'Any';
};

const countryMatches = (programCountry: string, preferredCountry: string): boolean => {
  const preferred = normalize(preferredCountry);
  const catalogCountry = normalize(programCountry);

  if (!preferred) return false;
  if (catalogCountry.includes(preferred) || preferred.includes(catalogCountry)) return true;

  return Object.values(COUNTRY_ALIASES).some(
    aliases =>
      aliases.includes(catalogCountry) &&
      aliases.some(alias => preferred.includes(alias)),
  );
};

const inferField = (text: string): string | undefined => {
  const normalized = normalize(text);
  const patterns: Array<{keywords: string[]; value: string}> = [
    {keywords: ['physics chemistry mathematics', 'physics chemistry and mathematics', 'pcm', 'physics', 'chemistry', 'mathematics', 'maths', 'math'], value: 'math_science'},
    {keywords: ['data science', 'machine learning', 'ai', 'artificial intelligence', 'analytics'], value: 'data'},
    {keywords: ['computer science', 'software', 'programmer', 'developer', 'engineer', 'it', 'technology', 'coding'], value: 'technology'},
    {keywords: ['business', 'management', 'commerce', 'finance', 'marketing', 'mba', 'bba'], value: 'business'},
    {keywords: ['engineering', 'civil', 'mechanical', 'electrical', 'electronics', 'chemical'], value: 'engineering'},
    {keywords: ['healthcare', 'nursing', 'pharmacy', 'medical', 'biology', 'doctor', 'nurse'], value: 'health'},
    {keywords: ['education', 'teaching', 'teacher', 'academic'], value: 'education'},
    {keywords: ['law', 'legal', 'lawyer', 'llb'], value: 'law'},
    {keywords: ['design', 'arts', 'media', 'animation', 'graphic'], value: 'arts'},
    {keywords: ['cyber security', 'cybersecurity', 'security', 'hacking'], value: 'security'},
  ];
  return patterns.find(item => includesAny(normalized, item.keywords))?.value;
};

class ProgramService {
  search(filters: ProgramSearchFilters): ProgramCatalogItem[] {
    const {qualification, gpa, interests, preferredCountry} = filters;
    const qualificationText = normalize(qualification || '');
    const inferredTargetLevel = inferTargetLevel(interests || '');
    const qualificationNextLevel = inferNextLevelFromQualification(qualification || '');
    const schoolLevelOnly = hasSchoolQualification(qualificationText) && !hasBachelorQualification(qualificationText);
    const targetLevel = schoolLevelOnly && inferredTargetLevel !== 'Diploma'
      ? 'UG'
      : filters.targetLevel && filters.targetLevel !== 'Any'
      ? filters.targetLevel
      : inferredTargetLevel !== 'Any'
      ? inferredTargetLevel
      : qualificationNextLevel;

    let candidateCatalog = targetLevel !== 'Any'
      ? PROGRAM_CATALOG.filter(item => item.level === targetLevel)
      : PROGRAM_CATALOG;

    if (schoolLevelOnly) {
      candidateCatalog = candidateCatalog.filter(item => item.level !== 'PG');
    } else if (hasBachelorQualification(qualificationText)) {
      candidateCatalog = candidateCatalog.filter(item => item.level === 'PG');
    }

    const selected = [...candidateCatalog]
      .map(item => ({
        item,
        matchScore: this.scoreCatalogItem(item, {qualification, gpa, interests, preferredCountry}),
      }))
      .filter(item => item.matchScore >= 60)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    return selected.map(({item, matchScore}) => ({
      ...item,
      matchScore,
    })) as any;
  }

  searchByKeyword(keyword: string): ProgramCatalogItem[] {
    const normalizedKeyword = normalize(keyword);
    return PROGRAM_CATALOG.filter(program =>
      normalize(program.name).includes(normalizedKeyword) ||
      program.fields.some(field => normalize(field).includes(normalizedKeyword)),
    );
  }

  getAllPrograms(): ProgramCatalogItem[] {
    return PROGRAM_CATALOG;
  }

  private scoreCatalogItem(item: ProgramCatalogItem, data: ProgramSearchFilters): number {
    const qualificationText = normalize(data.qualification || '');
    const interestsText = normalize(data.interests || '');
    const rawCountryText = normalize(data.preferredCountry || '');
    const countryText = includesAny(rawCountryText, ['any', 'no preference']) ? '' : rawCountryText;
    const qualificationLevel = inferQualificationLevel(data.qualification || '');
    const score = parseNumericScore(data.gpa || '');

    const schoolLevelOnly = hasSchoolQualification(qualificationText) && !hasBachelorQualification(qualificationText);
    if (schoolLevelOnly && item.level === 'PG') {
      return -999;
    }

    if (hasBachelorQualification(qualificationText) && item.level !== 'PG') {
      return -999;
    }

    if (qualificationLevel === 'PG' && (item.level === 'UG' || item.level === 'Diploma')) {
      return -999;
    }

    let total = 15;

    if (countryText) {
      if (countryMatches(item.country, countryText)) {
        total += 20;
      } else if (item.countries.some(country => countryMatches(country, countryText))) {
        total += 5;
      } else {
        total -= 8;
      }
    }

    const nextLevel = inferNextLevelFromQualification(data.qualification || '');
    if (nextLevel === item.level) {
      total += 20;
    } else if (qualificationLevel === item.level || qualificationLevel === 'Any') {
      total += 10;
    } else if (qualificationLevel === 'UG' && item.level === 'Diploma') {
      total -= 15;
    } else if (qualificationLevel === 'PG' && item.level !== 'UG') {
      total += 5;
    }

    if (item.fields.some(field => includesAny(interestsText, [field]))) {
      total += 30;
    } else {
      const inferredField = inferField(interestsText);
      const catalogText = normalize(`${item.name} ${item.eligibility} ${item.fields.join(' ')}`);
      if (
        inferredField === 'math_science' &&
        includesAny(catalogText, ['math', 'mathematics', 'science', 'engineering', 'data science', 'computer science', 'software', 'technology', 'statistics', 'it'])
      ) {
        total += 22;
      } else if (inferredField && item.fields.some(field => includesAny(normalize(field), [inferredField]))) {
        total += 18;
      } else if (interestsText) {
        total -= 20;
      }
    }

    if (score !== undefined && item.minGpa !== undefined) {
      if (score >= item.minGpa * 10) {
        total += 15;
      } else {
        total -= 15;
      }
    }

    if (score !== undefined && score < SCHOOL_PASS_PERCENTAGE) {
      total -= 50;
    }

    if (qualificationText && item.minQualificationKeywords.some(keyword => qualificationText.includes(keyword))) {
      total += 5;
    }

    if (score !== undefined && score < SCHOOL_PASS_PERCENTAGE) {
      return 0;
    }

    return Math.max(0, Math.min(98, total));
  }
}

const programService = new ProgramService();
export default programService;
