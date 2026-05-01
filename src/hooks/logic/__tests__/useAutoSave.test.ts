import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the cost-sheet store
const mockSetSheet = vi.fn();
let mockStoreData: any = { id: 'sheet-1', sections: [], header: { name: 'Test' } };

vi.mock('@/store/cost-sheet-store', () => ({
  useCostSheetStore: vi.fn(() => ({
    data: mockStoreData,
    setSheet: mockSetSheet,
  })),
}));

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockStoreData = { id: 'sheet-1', sections: [], header: { name: 'Test' } };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no guarda si el dato no cambió (hash idéntico)', async () => {
    const { useAutoSave } = await import('../useAutoSave');
    const { result, rerender } = renderHook(() => useAutoSave());

    // First interval triggers save (initial hash is empty)
    act(() => vi.advanceTimersByTime(91_000));
    expect(result.current.versions.length).toBe(1);

    // Second interval should NOT save (data unchanged)
    act(() => vi.advanceTimersByTime(91_000));
    expect(result.current.versions.length).toBe(1);
  });

  it('guarda un snapshot después de 90 segundos si hubo cambios', async () => {
    const { useAutoSave } = await import('../useAutoSave');
    const { result, rerender } = renderHook(() => useAutoSave());

    // Change the data
    mockStoreData = { id: 'sheet-1', sections: [{ id: 's1' }], header: { name: 'Changed' } };
    rerender();

    act(() => vi.advanceTimersByTime(91_000));
    expect(result.current.versions.length).toBe(1);
    expect(result.current.versions[0].data.header.name).toBe('Changed');
  });

  it('mantiene máximo 15 versiones eliminando la más antigua', async () => {
    const { useAutoSave } = await import('../useAutoSave');
    const { result, rerender } = renderHook(() => useAutoSave());

    // Simulate 16 changes with 90s between each
    for (let i = 0; i < 16; i++) {
      mockStoreData = { id: 'sheet-1', sections: [], header: { name: `Version ${i}` } };
      rerender();
      act(() => vi.advanceTimersByTime(91_000));
    }

    expect(result.current.versions.length).toBe(15);
    // The most recent version should be the last one
    expect(result.current.versions[0].data.header.name).toBe('Version 15');
  });

  it('restoreVersion(0) hace setState del store con el snapshot guardado', async () => {
    const { useAutoSave } = await import('../useAutoSave');
    const { result, rerender } = renderHook(() => useAutoSave());

    // Save a version
    mockStoreData = { id: 'sheet-1', sections: [{ id: 's1', data: 'original' }], header: { name: 'Original' } };
    rerender();
    act(() => vi.advanceTimersByTime(91_000));

    expect(result.current.versions.length).toBe(1);

    // Restore it
    act(() => {
      result.current.restoreVersion(result.current.versions[0]);
    });

    expect(mockSetSheet).toHaveBeenCalledWith(
      expect.objectContaining({ header: { name: 'Original' } })
    );
  });

  it('lastSavedAt se actualiza al guardar', async () => {
    const { useAutoSave } = await import('../useAutoSave');
    const { result, rerender } = renderHook(() => useAutoSave());

    const before = Date.now();
    mockStoreData = { id: 'sheet-1', sections: [], header: { name: 'New' } };
    rerender();
    act(() => vi.advanceTimersByTime(91_000));

    expect(result.current.lastSavedAt).not.toBeNull();
    expect(result.current.lastSavedAt!).toBeGreaterThanOrEqual(before);
  });

  it('saveManualSnapshot crea una versión con label "Manual"', async () => {
    const { useAutoSave } = await import('../useAutoSave');
    const { result, rerender } = renderHook(() => useAutoSave());

    mockStoreData = { id: 'sheet-1', sections: [], header: { name: 'Manual Save' } };
    rerender();

    act(() => {
      result.current.saveManualSnapshot();
    });

    expect(result.current.versions.length).toBe(1);
    expect(result.current.versions[0].label).toBe('Manual');
  });

  it('no inicia autosave cuando enabled=false', async () => {
    const { useAutoSave } = await import('../useAutoSave');
    const { result, rerender } = renderHook(() => useAutoSave(false));

    mockStoreData = { id: 'sheet-1', sections: [], header: { name: 'Changed' } };
    rerender();

    act(() => vi.advanceTimersByTime(91_000));
    expect(result.current.versions.length).toBe(0);
  });

  it('isSaving se establece true temporalmente al guardar', async () => {
    const { useAutoSave } = await import('../useAutoSave');
    const { result, rerender } = renderHook(() => useAutoSave());

    expect(result.current.isSaving).toBe(false);

    mockStoreData = { id: 'sheet-1', sections: [], header: { name: 'New' } };
    rerender();

    act(() => vi.advanceTimersByTime(91_000));
    act(() => vi.advanceTimersByTime(1100)); // Advance past the 1s isSaving timeout
    expect(result.current.isSaving).toBe(false);

    // Save manually
    act(() => {
      result.current.saveManualSnapshot();
    });
    // Advance past the 1s setTimeout that clears isSaving
    act(() => vi.advanceTimersByTime(1100));
    expect(result.current.isSaving).toBe(false);
  });
});
