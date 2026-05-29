import { expect, test, describe, vi, beforeEach } from "vitest";
import { Pick3ScraperService } from "./Pick3ScraperService";

// Mock supabase for Pick3Storage.saveHistory
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Pick3ScraperService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("getCleanOfficialResults returns scraped or fallback data", async () => {
    // Mock fetch to fail for all sources (so it falls back to seed data)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('', { status: 500 });
    });

    const results = await Pick3ScraperService.getCleanOfficialResults();
    expect(results.length).toBeGreaterThan(0);

    const first = results[0];
    expect(first.date).toBeDefined();
    expect(['midday', 'evening']).toContain(first.draw_time);
    expect(first.result.length).toBe(3);
  });

  test("deduplication works correctly", async () => {
    // Mock fetch to fail for all sources (so it falls back to seed data)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('', { status: 500 });
    });

    const results = await Pick3ScraperService.getCleanOfficialResults();
    const keys = results.map(r => `${r.date}-${r.draw_time}`);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});
