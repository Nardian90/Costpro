
import { describe, it, expect } from 'vitest';
import { parseBandecTxt } from '../bandecParser';
import { extractCommission } from '../utils';

describe('bandecParser', () => {
  it('should extract commission with colon', async () => {
    const mockTxt = `
01/08/25
      YR60000008646   98025A6248224                                              1.330,00 Cr
<XML>algo Comis: 10.50</XML>
`;
    const txs = await parseBandecTxt(mockTxt);
    expect(txs).toHaveLength(1);
    expect(txs[0].comision_cents).toBe(1050);
    expect(txs[0].importe_venta_cents).toBe(133000 + 1050);
  });

  it('should extract commission (reactive logic)', async () => {
      const mockTxt = `
01/08/25
      YR60000008646   98025A6248224                                              1.330,00 Cr
<XML>algo comis 5.00</XML>
`;
      const txs = await parseBandecTxt(mockTxt);
      expect(txs).toHaveLength(1);
      expect(txs[0].comision_cents).toBe(500);
      expect(txs[0].importe_venta_cents).toBe(133000 + 500);
  });

  it('should extract commission from raw string using utility', () => {
    expect(extractCommission("Comis: 10.50")).toBe(1050);
    expect(extractCommission("comis 5")).toBe(500);
    expect(extractCommission("comi 7.25")).toBe(725);
    expect(extractCommission("Comisión: 12.00")).toBe(1200);
    expect(extractCommission("comision 8")).toBe(800);
    expect(extractCommission("no commission")).toBe(0);
  });
});
