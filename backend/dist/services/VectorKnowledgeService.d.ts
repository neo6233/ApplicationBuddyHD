export interface KnowledgeHit {
    id: string;
    type: 'rule' | 'program' | 'app';
    text: string;
    score: number;
}
declare class VectorKnowledgeService {
    search(query: unknown, limit?: number): Promise<KnowledgeHit[]>;
}
declare const _default: VectorKnowledgeService;
export default _default;
//# sourceMappingURL=VectorKnowledgeService.d.ts.map