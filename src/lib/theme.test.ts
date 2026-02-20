import { describe, it, expect } from 'vitest';
import { isPerformanceTheme, isDarkTheme } from './utils';

describe('Theme utilities', () => {
  it('identifies performance themes correctly', () => {
    expect(isPerformanceTheme('neumo')).toBe(true);
    expect(isPerformanceTheme('fast-light')).toBe(true);
    expect(isPerformanceTheme('fast-dark')).toBe(true);
    expect(isPerformanceTheme('dark')).toBe(false);
    expect(isPerformanceTheme('light')).toBe(false);
    expect(isPerformanceTheme(undefined)).toBe(false);
  });

  it('identifies dark themes correctly', () => {
    expect(isDarkTheme('dark')).toBe(true);
    expect(isDarkTheme('fast-dark')).toBe(true);
    expect(isDarkTheme('light')).toBe(false);
    expect(isDarkTheme('fast-light')).toBe(false);
    expect(isDarkTheme('neumo')).toBe(false);
    expect(isDarkTheme(undefined)).toBe(false);
  });
});
