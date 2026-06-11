export interface KnowledgeHit {
    id: string;
    type: 'rule' | 'program' | 'app';
    text: string;
    score: number;
}
declare class VectorKnowledgeService {
    private documents;
    search(query: string, limit?: number): KnowledgeHit[];
}
declare const _default: VectorKnowledgeService;
export default _default;
//# sourceMappingURL=VectorKnowledgeService.d.ts.map