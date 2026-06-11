import { ProgramCatalogItem as Program } from '../data/programCatalog';
type ProgramLevel = Program['level'];
interface ProgramSearchFilters {
    qualification?: string;
    gpa?: string;
    interests?: string;
    preferredCountry?: string;
    targetLevel?: ProgramLevel | 'Any';
}
declare class ProgramService {
    search(filters: ProgramSearchFilters): Program[];
    searchByKeyword(keyword: string): Program[];
    getAllPrograms(): Program[];
    private scoreCatalogItem;
}
declare const _default: ProgramService;
export default _default;
//# sourceMappingURL=ProgramService.d.ts.map