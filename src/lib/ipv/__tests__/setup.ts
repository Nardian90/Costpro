import { indexedDB, IDBKeyRange, IDBFactory } from 'fake-indexeddb';
import { vi } from 'vitest';

// ✅ GLOBAL SETUP PARA fake-indexeddb
if (typeof global !== 'undefined') {
  (global as any).indexedDB = indexedDB;
  (global as any).IDBKeyRange = IDBKeyRange;
  (global as any).IDBFactory = IDBFactory;
}

// ✅ MOCK console.error PARA TESTS (opcional)
// vi.stubGlobal('console', {
//   ...console,
//   error: vi.fn(),
//   warn: vi.fn(),
//   log: vi.fn(),
// });

// ✅ AGREGAR timeout para async operations
vi.setConfig({ testTimeout: 30000 });
