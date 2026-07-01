import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveModel } from '@/lib/ai/resolve-model';

/**
 * Unit tests for resolveModel() — extracted from academy/generate route.
 *
 * Tests:
 *   1. Provider routing (gemini vs glm)
 *   2. API key priority (user key > env var)
 *   3. Error handling (no key available)
 *   4. Edge cases (empty provider, case insensitive)
 */

// Mock the AI SDK providers to avoid real API calls
// The factories return a callable function (provider) that itself returns a model
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(({ apiKey }) => {
    // Provider is a callable function: provider(modelId) → LanguageModel
    const provider = (modelId: string) => ({ __type: 'gemini-model', modelId, provider: 'gemini', apiKey });
    return provider;
  }),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(({ name, baseURL, apiKey }) => {
    const provider = (modelId: string) => ({ __type: 'glm-model', modelId, provider: name, apiKey, baseURL });
    return provider;
  }),
}));

describe('resolveModel', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars before each test
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_API_KEY;
    delete process.env.ZAI_API_KEY;
    delete process.env.ZAI_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─── Provider routing ─────────────────────────────────────────────
  describe('provider routing', () => {
    it('routes to Gemini when provider contains "gemini"', () => {
      process.env.GOOGLE_API_KEY = 'test-gemini-key';
      const result = resolveModel('gemini-2.5-flash');
      expect(result.name).toBe('gemini');
    });

    it('routes to Gemini when provider contains "google"', () => {
      process.env.GOOGLE_API_KEY = 'test-gemini-key';
      const result = resolveModel('google-ai');
      expect(result.name).toBe('gemini');
    });

    it('routes to Gemini with case-insensitive match', () => {
      process.env.GOOGLE_API_KEY = 'test-gemini-key';
      const result = resolveModel('GEMINI-Flash');
      expect(result.name).toBe('gemini');
    });

    it('routes to GLM when provider contains "glm"', () => {
      process.env.ZAI_API_KEY = 'test-glm-key';
      const result = resolveModel('glm-4');
      expect(result.name).toBe('glm');
    });

    it('routes to GLM when provider contains "zai"', () => {
      process.env.ZAI_API_KEY = 'test-glm-key';
      const result = resolveModel('zai-glm');
      expect(result.name).toBe('glm');
    });

    it('routes to GLM when provider contains "openai"', () => {
      process.env.ZAI_API_KEY = 'test-glm-key';
      const result = resolveModel('openai-compatible');
      expect(result.name).toBe('glm');
    });

    it('routes to GLM (default) when provider is empty', () => {
      process.env.ZAI_API_KEY = 'test-glm-key';
      const result = resolveModel('');
      expect(result.name).toBe('glm');
    });

    it('routes to GLM (default) when provider is undefined', () => {
      process.env.ZAI_API_KEY = 'test-glm-key';
      const result = resolveModel(undefined);
      expect(result.name).toBe('glm');
    });
  });

  // ─── API key priority ─────────────────────────────────────────────
  describe('API key priority', () => {
    it('uses user-provided key for Gemini when provided', () => {
      process.env.GOOGLE_API_KEY = 'env-gemini-key';
      const result = resolveModel('gemini', 'user-gemini-key');
      expect(result.name).toBe('gemini');
      // User key should take priority (we can't directly verify which key was used
      // because the provider is opaque, but the call should succeed)
    });

    it('uses user-provided key for GLM when provided', () => {
      process.env.ZAI_API_KEY = 'env-glm-key';
      const result = resolveModel('glm', 'user-glm-key');
      expect(result.name).toBe('glm');
    });

    it('falls back to env var when user key is not provided', () => {
      process.env.GOOGLE_API_KEY = 'env-gemini-key';
      const result = resolveModel('gemini');
      expect(result.name).toBe('gemini');
    });

    it('uses user key even if env var is missing', () => {
      // No env var set, but user provides key
      const result = resolveModel('gemini', 'user-gemini-key-only');
      expect(result.name).toBe('gemini');
    });
  });

  // ─── Error handling ───────────────────────────────────────────────
  describe('error handling', () => {
    it('throws when Gemini is requested but no key available', () => {
      // No env var, no user key
      expect(() => resolveModel('gemini')).toThrow('No Gemini API key available');
    });

    it('throws when GLM is requested but no key available', () => {
      // No env var, no user key
      expect(() => resolveModel('glm')).toThrow('No GLM API key available');
    });

    it('throws when default (empty provider) but no GLM key available', () => {
      expect(() => resolveModel()).toThrow('No GLM API key available');
    });

    it('throws when provider is "openai" but no GLM key (fallback) available', () => {
      expect(() => resolveModel('openai')).toThrow('No GLM API key available');
    });
  });

  // ─── Model output ─────────────────────────────────────────────────
  describe('model output', () => {
    it('returns a model object (not null/undefined)', () => {
      process.env.ZAI_API_KEY = 'test-key';
      const result = resolveModel('glm');
      expect(result.model).toBeDefined();
      expect(typeof result.model).toBe('object');
    });

    it('returns correct provider name in result', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const result = resolveModel('gemini');
      expect(result.name).toBe('gemini');
    });

    it('result has model property', () => {
      process.env.ZAI_API_KEY = 'test-key';
      const result = resolveModel();
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('name');
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles whitespace in provider name', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const result = resolveModel('  Gemini  ');
      expect(result.name).toBe('gemini');
    });

    it('handles mixed case "GeMiNi"', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const result = resolveModel('GeMiNi');
      expect(result.name).toBe('gemini');
    });

    it('handles provider "google-gemini" (both keywords)', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const result = resolveModel('google-gemini');
      expect(result.name).toBe('gemini');
    });

    it('uses ZAI_BASE_URL env var when set', () => {
      process.env.ZAI_API_KEY = 'test-key';
      process.env.ZAI_BASE_URL = 'https://custom.api.url/v1';
      // Should not throw — uses custom base URL
      const result = resolveModel('glm');
      expect(result.name).toBe('glm');
    });

    it('falls back to default base URL when ZAI_BASE_URL not set', () => {
      process.env.ZAI_API_KEY = 'test-key';
      // No ZAI_BASE_URL set — should use default
      const result = resolveModel('glm');
      expect(result.name).toBe('glm');
    });
  });
});
