/**
 * Vitest global setup file.
 * Provides DOM polyfills and mocks for tests running in jsdom.
 */

import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// ─── Mock: window.matchMedia ────────────────────────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ─── Mock: IntersectionObserver (jsdom does not provide it) ──────────────────
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin = '';
  readonly thresholds = [0];

  constructor(
    private callback: IntersectionObserverCallback,
  ) {}

  observe() {
    // No-op: tests that rely on IntersectionObserver
    // should trigger the callback manually if needed.
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// ─── Mock: ResizeObserver ───────────────────────────────────────────────────
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  readonly root: Element | null = null;
  constructor(private callback: ResizeObserverCallback) {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// ─── Mock: window.scrollTo ──────────────────────────────────────────────────
window.scrollTo = () => {};

// ─── Suppress console noise from component under test ──────────────────────
const noop = () => {};
['log', 'warn', 'error', 'info'].forEach((method) => {
  const original = (console as any)[method];
  // We keep the original but let tests override if needed
  // No-op by default to reduce noise in test output
});
