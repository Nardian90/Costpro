import { describe, it, expect } from 'vitest';
import { Pick3PdfService } from './Pick3PdfService';

describe('Pick3PdfService Parser', () => {
  it('should parse two-column data correctly from sample text', () => {
    // We are testing the logic in parsePageText which doesn't use the pdf-parse instance directly
    const sampleText = "FLORIDA LOTTERY\n27-MAR-2026\nPage 1 of 129\nPICK 3\n03/26/26\n03/26/26\n03/25/26\nE\nM\nE\nFB\nFB\nFB\n3\n3\n7\n0\n1\n8\n6\n0\n5\n3\n6\n8";
    const results = (Pick3PdfService as any).parsePageText(sampleText);

    expect(results).toHaveLength(3);
    expect(results[0].date).toBe('2026-03-26');
    expect(results[0].draw_time).toBe('evening');
    expect(results[0].result).toEqual([3, 0, 6]);
    expect(results[0].fireball).toBe(3);

    expect(results[1].date).toBe('2026-03-26');
    expect(results[1].draw_time).toBe('midday');
    expect(results[1].result).toEqual([3, 1, 0]);
    expect(results[1].fireball).toBe(6);
  });
});
