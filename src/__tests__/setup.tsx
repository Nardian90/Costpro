import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';
import { indexedDB, IDBKeyRange, IDBFactory } from 'fake-indexeddb';
import React from 'react';

// ✅ GLOBAL SETUP PARA fake-indexeddb
if (typeof global !== 'undefined') {
  (global as any).indexedDB = indexedDB;
  (global as any).IDBKeyRange = IDBKeyRange;
  (global as any).IDBFactory = IDBFactory;
}

// ✅ AGREGAR timeout para async operations
vi.setConfig({ testTimeout: 30000 });

// ── Mocks globales ────────────────────────────────────────────────────────────

// Logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));

// Sonner toasts
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn().mockReturnValue('toast-id'),
    dismiss: vi.fn(),
  },
  Toaster: () => null,
}));

// matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Framer Motion
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    AnimatePresence: ({ children }: any) => <>{children}</>,
    motion: {
      ...actual.motion,
      div: React.forwardRef(({ children, ...props }: any, ref) => (
        <div {...props} ref={ref}>{children}</div>
      )),
      button: React.forwardRef(({ children, ...props }: any, ref) => (
        <button {...props} ref={ref}>{children}</button>
      )),
    },
  };
});

// ── Limpieza entre tests ──────────────────────────────────────────────────────
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
