import { expect, test, describe } from "vitest";
import { Pick3ScraperService } from "./Pick3ScraperService";

describe("Pick3ScraperService", () => {
  test("getCleanOfficialResults returns scraped or fallback data", async () => {
    const results = await Pick3ScraperService.getCleanOfficialResults();
    expect(results.length).toBeGreaterThan(0);

    const first = results[0];
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(['midday', 'evening']).toContain(first.draw_time);
    expect(first.result.length).toBe(3);
  });

  test("deduplication works correctly", async () => {
    const results = await Pick3ScraperService.getCleanOfficialResults();
    const keys = results.map(r => `${r.date}-${r.draw_time}`);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});
