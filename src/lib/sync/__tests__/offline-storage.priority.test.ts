import { describe, it, expect, vi, beforeEach } from 'vitest';
import { offlineStorage } from '../offline-storage';
import localforage from 'localforage';

vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

describe('offlineStorage priority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return pending operations sorted by priority', async () => {
    const mockQueue = [
      { id: '1', entity: 'inventory_adjust', status: 'pending', clientClock: 100 },
      { id: '2', entity: 'sale', status: 'pending', clientClock: 200 },
      { id: '3', entity: 'reception', status: 'pending', clientClock: 300 },
      { id: '4', entity: 'sale', status: 'pending', clientClock: 150 },
    ];

    (localforage.getItem as any).mockResolvedValue(mockQueue);

    const pending = await offlineStorage.getPendingOperations();

    expect(pending).toHaveLength(4);
    // Priority: sale (1), reception (2), inventory_adjust (4)
    expect(pending[0].id).toBe('4'); // sale, clock 150
    expect(pending[1].id).toBe('2'); // sale, clock 200
    expect(pending[2].id).toBe('3'); // reception
    expect(pending[3].id).toBe('1'); // inventory_adjust
  });
});
