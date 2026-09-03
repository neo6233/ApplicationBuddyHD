"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const programCatalog_1 = require("../data/programCatalog");
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
    .replace(/\s+/g, ' ')
    .trim();
const includesAny = (text, keywords) => keywords.some(keyword => text.includes(keyword));
const hasSchoolQualification = (text) => includesAny(text, ['high school', 'secondary', '12th', '12 pass', 'class 12', '10th', '10 pass', 'intermediate']) ||
    /\b(?:after\s+(?:my\s+)?|class\s*)12\b|\b12\s*(?:pass|standard|std|grade)\b/i.test(text);
const hasBachelorQualification = (text) => includesAny(text, ['bachelor', "bachelor's", 'bachelors', 'btech', 'b.tech', 'b.sc', 'bsc', 'bba', 'b.e', 'graduation', 'graduate']);
const SCHOOL_PASS_PERCENTAGE = 35;
const COUNTRY_ALIASES = {
    uk: ['uk', 'united kingdom', 'england', 'britain', 'great britain'],
    usa: ['usa', 'us', 'united states', 'america'],
    canada: ['canada'],
    australia: ['australia'],
    'new zealand': ['new zealand', 'nz'],
    germany: ['germany'],
};
const parseNumericScore = (input) => {
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
const inferQualificationLevel = (qualification) => {
    const text = normalize(qualification);
    if (includesAny(text, ['phd', 'doctorate']))
        return 'PG';
    if (includesAny(text, ['master', 'msc', 'mtech', 'mba', 'postgraduate', 'post graduate']) || /\b(?:ma|pg)\b/i.test(text))
        return 'PG';
    if (includesAny(text, ['diploma', 'certificate']))
        return 'Diploma';
    if (hasBachelorQualification(text) || includesAny(text, ['undergraduate']))
        return 'UG';
    if (hasSchoolQualification(text))
        return 'UG';
    return 'Any';
};
const inferNextLevelFromQualification = (qualification) => {
    const text = normalize(qualification);
    if (hasBachelorQualification(text) || includesAny(text, ['undergraduate']))
        return 'PG';
    if (includesAny(text, ['master', 'msc', 'mtech', 'mba', 'postgraduate', 'post graduate']) || /\b(?:ma|pg)\b/i.test(text))
        return 'PG';
    if (includesAny(text, ['diploma', 'certificate']))
        return 'UG';
    if (hasSchoolQualification(text))
        return 'UG';
    return 'Any';
};
const inferTargetLevel = (text) => {
    const normalized = normalize(text);
    if (includesAny(normalized, ['master', 'masters', 'msc', 'mtech', 'mba', 'postgraduate', 'pg course']))
        return 'PG';
    if (includesAny(normalized, ['bachelor', 'bachelors', 'degree after 12th', 'undergraduate', 'ug course']))
        return 'UG';
    if (includesAny(normalized, ['diploma', 'certificate']))
        return 'Diploma';
    if (includesAny(normalized, ['12th', '12 pass', 'class 12', 'high school', 'secondary', 'degree after 12th', 'ug course']))
        return 'UG';
    return 'Any';
};
const countryMatches = (programCountry, preferredCountry) => {
    const preferred = normalize(preferredCountry);
    const catalogCountry = normalize(programCountry);
    if (!preferred)
        return false;
    if (catalogCountry.includes(preferred) || preferred.includes(catalogCountry))
        return true;
    return Object.values(COUNTRY_ALIASES).some(aliases => aliases.includes(catalogCountry) &&
        aliases.some(alias => preferred.includes(alias)));
};
const inferField = (text) => {
    const normalized = normalize(text);
    const patterns = [
        { keywords: ['physics chemistry mathematics', 'physics chemistry and mathematics', 'pcm', 'physics', 'chemistry', 'mathematics', 'maths', 'math'], value: 'math_science' },
        { keywords: ['data science', 'machine learning', 'ai', 'artificial intelligence', 'analytics'], value: 'data' },
        { keywords: ['computer science', 'software', 'programmer', 'developer', 'engineer', 'it', 'technology', 'coding'], value: 'technology' },
        { keywords: ['business', 'management', 'commerce', 'finance', 'marketing', 'mba', 'bba'], value: 'business' },
        { keywords: ['engineering', 'civil', 'mechanical', 'electrical', 'electronics', 'chemical'], value: 'engineering' },
        { keywords: ['healthcare', 'nursing', 'pharmacy', 'medical', 'biology', 'doctor', 'nurse'], value: 'health' },
        { keywords: ['education', 'teaching', 'teacher', 'academic'], value: 'education' },
        { keywords: ['law', 'legal', 'lawyer', 'llb'], value: 'law' },
        { keywords: ['design', 'arts', 'media', 'animation', 'graphic'], value: 'arts' },
        { keywords: ['cyber security', 'cybersecurity', 'security', 'hacking'], value: 'security' },
    ];
    const match = patterns.find(item => includesAny(normalized, item.keywords));
    return match?.value;
};
class ProgramService {
    search(filters) {
        console.log('[PROGRAM SEARCH FILTER]', filters);
        const { qualification, gpa, interests, preferredCountry } = filters;
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
        // STRICT RULE: If student has only school-level qualification (12th), NEVER show PG programs
        let candidateCatalog = targetLevel !== 'Any'
            ? programCatalog_1.PROGRAM_CATALOG.filter(item => item.level === targetLevel)
            : programCatalog_1.PROGRAM_CATALOG;
        if (schoolLevelOnly) {
            candidateCatalog = candidateCatalog.filter(item => item.level !== 'PG');
        }
        else if (hasBachelorQualification(qualificationText)) {
            candidateCatalog = candidateCatalog.filter(item => item.level === 'PG');
        }
        const selected = [...candidateCatalog]
            .map(item => ({
            item,
            matchScore: this.scoreCatalogItem(item, { qualification, gpa, interests, preferredCountry }),
        }))
            .filter(item => item.matchScore >= 60)
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 5);
        const programs = selected.map(({ item, matchScore }) => ({
            ...item,
            matchScore,
        }));
        console.log('[PROGRAM SEARCH RESULT]', JSON.stringify(programs, null, 2));
        return programs;
    }
    searchByKeyword(keyword) {
        const normalizedKeyword = normalize(keyword);
        const programs = programCatalog_1.PROGRAM_CATALOG.filter(program => normalize(program.name).includes(normalizedKeyword) ||
            program.fields.some(field => normalize(field).includes(normalizedKeyword)));
        return programs;
    }
    getAllPrograms() {
        return programCatalog_1.PROGRAM_CATALOG;
    }
    scoreCatalogItem(item, data) {
        const qualificationText = normalize(data.qualification || '');
        const interestsText = normalize(data.interests || '');
        const rawCountryText = normalize(data.preferredCountry || '');
        const countryText = includesAny(rawCountryText, ['any', 'no preference']) ? '' : rawCountryText;
        const qualificationLevel = inferQualificationLevel(data.qualification || '');
        const score = parseNumericScore(data.gpa || '');
        // STRICT ELIGIBILITY CHECK: Block ineligible program levels completely
        const schoolLevelOnly = hasSchoolQualification(qualificationText) && !hasBachelorQualification(qualificationText);
        if (schoolLevelOnly && item.level === 'PG') {
            return -999; // Extremely low score ensures this program is never recommended
        }
        if (qualificationLevel === 'PG' && (item.level === 'UG' || item.level === 'Diploma')) {
            return -999; // Postgraduate students should not see UG/Diploma programs
        }
        if (hasBachelorQualification(qualificationText) && item.level !== 'PG') {
            return -999; // Bachelor-qualified students should see next-step postgraduate options only
        }
        let total = 15;
        if (countryText) {
            if (countryMatches(item.country, countryText)) {
                total += 20;
            }
            else if (item.countries.some((country) => countryMatches(country, countryText))) {
                total += 5;
            }
            else {
                total -= 8;
            }
        }
        const nextLevel = inferNextLevelFromQualification(data.qualification || '');
        if (nextLevel === item.level) {
            total += 20;
        }
        else if (qualificationLevel === item.level || qualificationLevel === 'Any') {
            total += 10;
        }
        else if (qualificationLevel === 'UG' && item.level === 'Diploma') {
            total -= 15;
        }
        else if (qualificationLevel === 'PG' && item.level !== 'UG') {
            total += 5;
        }
        if (item.fields.some((field) => includesAny(interestsText, [field]))) {
            total += 30;
        }
        else {
            const inferredField = inferField(interestsText);
            const catalogText = normalize(`${item.name} ${item.eligibility} ${item.fields.join(' ')}`);
            if (inferredField === 'math_science' &&
                includesAny(catalogText, ['math', 'mathematics', 'science', 'engineering', 'data science', 'computer science', 'software', 'technology', 'statistics', 'it'])) {
                total += 22;
            }
            else if (inferredField && item.fields.some((field) => includesAny(normalize(field), [inferredField]))) {
                total += 18;
            }
            else if (interestsText) {
                total -= 20;
            }
        }
        if (score !== undefined && item.minGpa !== undefined) {
            if (score >= item.minGpa * 10) {
                total += 15;
            }
            else {
                total -= 15;
            }
        }
        if (score !== undefined && score < SCHOOL_PASS_PERCENTAGE) {
            total -= 50;
        }
        if (qualificationText &&
            item.minQualificationKeywords.some((keyword) => qualificationText.includes(keyword))) {
            total += 5;
        }
        if (score !== undefined && score < SCHOOL_PASS_PERCENTAGE) {
            return 0;
        }
        return Math.max(0, Math.min(98, total));
    }
}
exports.default = new ProgramService();
//# sourceMappingURL=ProgramService.js.map