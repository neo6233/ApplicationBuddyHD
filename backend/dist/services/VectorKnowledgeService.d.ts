export interface KnowledgeHit {
    id: string;
    type: 'rule' | 'program' | 'app';
    text: string;
    score: number;
}
declare class VectorKnowledgeService {
    private documents;
    search(query: unknown, limit?: number): KnowledgeHit[];
}
declare const _default: VectorKnowledgeService;
export default _default;
//# sourceMappingURL=VectorKnowledgeService.d.ts.map