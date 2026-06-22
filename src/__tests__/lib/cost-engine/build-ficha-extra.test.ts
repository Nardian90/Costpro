import { describe, it, expect } from 'vitest';
import { buildEngineFichaWithAnnexes } from '@/lib/cost-engine/build-ficha';
import { CostSheetDataFactory } from '@/contracts/cost-sheet';
import { isResultRow } from '@/lib/cost-engine/constants';

describe('build-ficha-extra', () => {
  it('buildEngineFichaWithAnnexes handles input', () => {
    const data = CostSheetDataFactory.create() as any;
    const result = buildEngineFichaWithAnnexes(data, []);
    expect(result).toBeDefined();
  });
});

describe('constants extra', () => {
  it('isResultRow works', () => {
    expect(isResultRow('14.1')).toBe(true);
    expect(isResultRow('13.1')).toBe(true);
    expect(isResultRow('non-existent')).toBe(false);
  });
});
