"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const programCatalog_1 = require("../data/programCatalog");
const normalize = (text) => text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
const includesAny = (text, keywords) => keywords.some(keyword => text.includes(keyword));
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
const inferLevel = (qualification) => {
    const text = normalize(qualification);
    if (includesAny(text, ['phd', 'doctorate']))
        return 'PG';
    if (includesAny(text, ['master', 'msc', 'ma', 'mtech', 'mba', 'pg']))
        return 'PG';
    if (includesAny(text, ['diploma', 'certificate']))
        return 'Diploma';
    if (includesAny(text, ['bachelor', 'be', 'btech', 'b.sc', 'bba', 'undergraduate']))
        return 'UG';
    if (includesAny(text, ['high school', 'secondary', '12th', '10th']))
        return 'UG';
    return 'Any';
};
const inferField = (text) => {
    const normalized = normalize(text);
    const patterns = [
        { keywords: ['computer science', 'software', 'it', 'technology'], value: 'technology' },
        { keywords: ['data science', 'machine learning', 'ai', 'artificial intelligence'], value: 'data' },
        { keywords: ['business', 'management', 'commerce', 'finance', 'marketing'], value: 'business' },
        { keywords: ['engineering', 'civil', 'mechanical', 'electrical', 'electronics'], value: 'engineering' },
        { keywords: ['healthcare', 'nursing', 'pharmacy', 'medical', 'biology'], value: 'health' },
        { keywords: ['education', 'teaching'], value: 'education' },
        { keywords: ['law', 'legal'], value: 'law' },
        { keywords: ['design', 'arts', 'media', 'animation'], value: 'arts' },
        { keywords: ['cyber security', 'cybersecurity', 'security'], value: 'security' },
    ];
    const match = patterns.find(item => includesAny(normalized, item.keywords));
    return match?.value;
};
class ProgramService {
    search(filters) {
        console.log('[PROGRAM SEARCH FILTER]', filters);
        const { qualification, gpa, interests, preferredCountry } = filters;
        const selected = [...programCatalog_1.PROGRAM_CATALOG]
            .map(item => ({
            item,
            matchScore: this.scoreCatalogItem(item, { qualification, gpa, interests, preferredCountry }),
        }))
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
        const countryText = normalize(data.preferredCountry || '');
        const level = inferLevel(data.qualification || '');
        const score = parseNumericScore(data.gpa || '');
        let total = 45;
        if (item.countries.some((country) => normalize(country).includes(countryText) || countryText.includes(normalize(country)))) {
            total += 20;
        }
        if (level === item.level || level === 'Any') {
            total += 20;
        }
        else if (level === 'UG' && item.level === 'Diploma') {
            total += 10;
        }
        else if (level === 'PG' && item.level !== 'UG') {
            total += 10;
        }
        if (item.fields.some((field) => includesAny(interestsText, [field]))) {
            total += 20;
        }
        else {
            const inferredField = inferField(interestsText);
            if (inferredField && item.fields.some((field) => includesAny(normalize(field), [inferredField]))) {
                total += 15;
            }
        }
        if (score !== undefined && item.minGpa !== undefined) {
            if (score >= item.minGpa * 10) {
                total += 10;
            }
            else {
                total -= 10;
            }
        }
        if (qualificationText &&
            item.minQualificationKeywords.some((keyword) => qualificationText.includes(keyword))) {
            total += 10;
        }
        return Math.max(35, Math.min(98, total));
    }
}
exports.default = new ProgramService();
//# sourceMappingURL=ProgramService.js.map