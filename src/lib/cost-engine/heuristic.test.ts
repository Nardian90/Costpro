import { describe, it, expect } from 'vitest';
import { validateFicha } from './index';
import { FichaJSON } from './types';

describe('Dependency Validation Heuristics', () => {
  const baseFicha: FichaJSON = {
    meta: { id: 'test', name: 'Test', currency: 'USD', decimals: 2 },
    rows: [],
    anexos: []
  };

  it('should flag A->B->A as CRITICAL cycle', () => {
    const ficha: FichaJSON = {
      ...baseFicha,
      rows: [
        { id: '1', classification: '1', label: 'Row A', formula: "ref('2')", formaCalculo: 'FORMULA', type: 'COST' },
        { id: '2', classification: '2', label: 'Row B', formula: "ref('1')", formaCalculo: 'FORMULA', type: 'COST' },
      ]
    };

    const result = validateFicha(ficha);
    expect(result.valid).toBe(false);
    expect(result.validationErrors.some(e => e.type === 'CRITICAL' && e.message.includes('Referencia Circular Detectada'))).toBe(true);
  });

  it('should flag Parent Ref (Parent->Child->Parent) as WARNING, not CRITICAL', () => {
    const ficha: FichaJSON = {
      ...baseFicha,
      rows: [
        { id: '1', classification: '1', label: 'Parent', formula: "sum(children)", formaCalculo: 'FORMULA', type: 'COST' },
        { id: '1.1', parentId: '1', classification: '1.1', label: 'Child', formula: "ref('1') * 0.1", formaCalculo: 'FORMULA', type: 'COST' },
      ]
    };

    const result = validateFicha(ficha);
    // It's valid because the hierarchical cycle is now a WARNING
    expect(result.valid).toBe(true);
    expect(result.validationErrors.some(e => e.type === 'WARNING' && e.message.includes('Validación de Jerarquía'))).toBe(true);
  });

  it('should flag Sibling references as valid and NOT cycles', () => {
    const ficha: FichaJSON = {
      ...baseFicha,
      rows: [
        { id: '1', classification: '1', label: 'Parent', formula: "sum(children)", formaCalculo: 'FORMULA', type: 'COST' },
        { id: '1.1', parentId: '1', classification: '1.1', label: 'Child 1', valorHistorico: 100, formaCalculo: 'FIJO', type: 'COST' },
        { id: '1.2', parentId: '1', classification: '1.2', label: 'Child 2', formula: "ref('1.1') * 0.5", formaCalculo: 'FORMULA', type: 'COST' },
      ]
    };

    const result = validateFicha(ficha);
    expect(result.valid).toBe(true);
    expect(result.validationErrors.filter(e => e.code === 'CYCLE')).toHaveLength(0);
  });

  it('should flag external section references as INFO', () => {
    const ficha: FichaJSON = {
      ...baseFicha,
      rows: [
        { id: '1', classification: '1.1', label: 'Row in Sec 1', valorHistorico: 100, formaCalculo: 'FIJO', type: 'COST' },
        { id: '2', classification: '2.1', label: 'Row in Sec 2', formula: "ref('1.1')", formaCalculo: 'FORMULA', type: 'COST' },
      ]
    };

    const result = validateFicha(ficha);
    expect(result.valid).toBe(true);
    expect(result.validationErrors.some(e => e.type === 'INFO' && e.message.includes('Vínculo Externo'))).toBe(true);
    expect(result.validationErrors.find(e => e.message.includes('Vínculo Externo'))?.message).toContain('Sección 1');
  });
});
