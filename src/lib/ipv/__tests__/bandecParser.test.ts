
import { describe, it, expect } from 'vitest';
import { parseBandecTxt } from '../bandecParser';
import { extractCommission } from '../utils';

describe('bandecParser', () => {
  it('should extract commission with colon', async () => {
    const mockTxt = `
01/08/25
      YR60000008646   98025A6248224                                              1,330.00 Cr
<XML>algo Comis: 10.50</XML>
`;
    const txs = await parseBandecTxt(mockTxt);
    expect(txs).toHaveLength(1);
    expect(txs[0].comision_cents).toBe(10.50);
    expect(txs[0].importe_venta_cents).toBe(1330 + 10.50);
  });

  it('should extract commission without colon', async () => {
      const mockTxt = `
01/08/25
      YR60000008646   98025A6248224                                              1,330.00 Cr
<XML>algo comis 5.00</XML>
`;
      const txs = await parseBandecTxt(mockTxt);
      expect(txs).toHaveLength(1);
      expect(txs[0].comision_cents).toBe(5);
  });

  it('should extract commission from raw string using utility', () => {
    expect(extractCommission("Comis: 10.50")).toBe(10.50);
    expect(extractCommission("comis 5")).toBe(5);
    expect(extractCommission("comi 7.25")).toBe(7.25);
    expect(extractCommission("Comisión: 12.00")).toBe(12.00);
    expect(extractCommission("comision 8")).toBe(8);
    expect(extractCommission("no commission")).toBe(0);
  });
});
