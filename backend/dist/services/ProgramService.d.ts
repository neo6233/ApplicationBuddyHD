import { ProgramCatalogItem as Program } from '../data/programCatalog';
declare class ProgramService {
    search(filters: any): Program[];
    searchByKeyword(keyword: string): Program[];
    getAllPrograms(): Program[];
    private scoreCatalogItem;
}
declare const _default: ProgramService;
export default _default;
//# sourceMappingURL=ProgramService.d.ts.map