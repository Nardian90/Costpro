
import { describe, it, expect } from 'vitest';
import { parseBandecTxt } from '../bandecParser';
import { extractCommissionCents } from '../utils';

describe('bandecParser', () => {
  it('should extract commission with colon', async () => {
    const mockTxt = `
01/08/25
      YR60000008646   98025A6248224                                              1,330.00 Cr
<XML>algo Comis: 10.50</XML>
`;
    const txs = await parseBandecTxt(mockTxt);
    expect(txs).toHaveLength(1);
    expect(txs[0].comision_cents).toBe(1050);
    expect(txs[0].importe_venta_cents).toBe(133000 + 1050);
  });

  it('should extract commission without colon', async () => {
      const mockTxt = `
01/08/25
      YR60000008646   98025A6248224                                              1,330.00 Cr
<XML>algo comis 5.00</XML>
`;
      const txs = await parseBandecTxt(mockTxt);
      expect(txs).toHaveLength(1);
      expect(txs[0].comision_cents).toBe(500);
  });

  it('should extract commission from raw string using utility', () => {
    expect(extractCommissionCents("Comis: 10.50")).toBe(1050);
    expect(extractCommissionCents("comis 5")).toBe(500);
    expect(extractCommissionCents("no commission")).toBe(0);
  });
});
