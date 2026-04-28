
import { describe, it, expect, vi } from 'vitest';
import { parseBandecTxt } from '../bandecParser';

vi.mock('../../utils', () => ({
  generateHash: vi.fn().mockResolvedValue('mock-hash'),
  standardizeDate: (d: string) => d,
  extractCommission: (s: string) => {
      const match = s.match(/Comis:?\s*([0-9.]+)/i);
      return match ? Math.round(parseFloat(match[1]) * 100) : 0;
  }
}));

describe('bandecParser', () => {
  it('should extract commission with colon', async () => {
    const mockTxt = `
01/08/25
      YR60000008646   98025A6248224                                              1,330.00 Cr
<XML>algo Comis: 10.50</XML>
`;
    const result = await parseBandecTxt(mockTxt);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].comision_cents).toBe(1050);
  });

  it('should extract commission (reactive logic)', async () => {
      const mockTxt = `
01/08/25
      YR60000008646   98025A6248224                                              1,330.00 Cr
<XML>algo Comis 5.00</XML>
`;
      const result = await parseBandecTxt(mockTxt);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].comision_cents).toBe(500);
  });
});
