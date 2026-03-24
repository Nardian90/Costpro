import { expect, test, describe } from "bun:test";
import { Pick3ScraperService } from "./Pick3ScraperService";

describe("Pick3ScraperService", () => {
  test("getCleanOfficialResults returns correct historical data", async () => {
    const results = await Pick3ScraperService.getCleanOfficialResults();

    // Check 22/03/2026 evening
    const target = results.find(r => r.date === '2026-03-22' && r.draw_time === 'evening');
    expect(target).toBeDefined();
    expect(target?.result).toEqual([5, 7, 6]);
  });
});
