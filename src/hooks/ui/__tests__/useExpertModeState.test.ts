import { renderHook, act } from '@testing-library/react';
import { useExpertModeState } from '../useExpertModeState';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useExpertModeState', () => {
  const STORAGE_KEY = 'cost_module_expert_state';
  let storage: Record<string, string> = {};

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => storage[key] || null),
      setItem: vi.fn((key, value) => {
        storage[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete storage[key];
      }),
      clear: vi.fn(() => {
        storage = {};
      }),
    });

    // Better mock for StorageEvent that JSDOM/EventTarget likes
    vi.stubGlobal('StorageEvent', class extends Event {
      constructor(type: string) {
        super(type);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should initialize with default state when localStorage is empty', () => {
    const { result } = renderHook(() => useExpertModeState());

    expect(result.current.expandedSections).toEqual([]);
    expect(result.current.activeAnnexId).toBe(null);
    expect(result.current.isAnnexesRootExpanded).toBe(false);
    expect(result.current.helpContext).toBe(null);
    expect(result.current.isHelpOpen).toBe(false);
  });

  it('should load state from localStorage on initialization', () => {
    const savedState = {
      expandedSections: ['header', 's1'],
      activeAnnexId: 'I',
      isAnnexesRootExpanded: true,
      helpContext: 'header',
      isHelpOpen: true,
      isProblemsOpen: false
    };

    storage[STORAGE_KEY] = JSON.stringify(savedState);

    const { result } = renderHook(() => useExpertModeState());

    expect(result.current.expandedSections).toEqual(['header', 's1']);
    expect(result.current.activeAnnexId).toBe('I');
    expect(result.current.isAnnexesRootExpanded).toBe(true);
    expect(result.current.helpContext).toBe('header');
    expect(result.current.isHelpOpen).toBe(true);
  });

  it('should toggle a section', () => {
    const { result } = renderHook(() => useExpertModeState());

    act(() => {
      result.current.toggleSection('header');
    });
    expect(result.current.expandedSections).toEqual(['header']);

    act(() => {
      result.current.toggleSection('header');
    });
    expect(result.current.expandedSections).toEqual([]);
  });

  it('should set active annex and toggle if same', () => {
    const { result } = renderHook(() => useExpertModeState());

    act(() => {
      result.current.setActiveAnnex('I');
    });
    expect(result.current.activeAnnexId).toBe('I');

    act(() => {
      result.current.setActiveAnnex('I');
    });
    expect(result.current.activeAnnexId).toBe(null);
  });

  it('should toggle annexes root', () => {
    const { result } = renderHook(() => useExpertModeState());

    act(() => {
      result.current.toggleAnnexesRoot();
    });
    expect(result.current.isAnnexesRootExpanded).toBe(true);

    act(() => {
      result.current.toggleAnnexesRoot();
    });
    expect(result.current.isAnnexesRootExpanded).toBe(false);
  });

  it('should set help context and open help', () => {
    const { result } = renderHook(() => useExpertModeState());

    act(() => {
      result.current.setHelpContext('s1');
    });
    expect(result.current.helpContext).toBe('s1');
    expect(result.current.isHelpOpen).toBe(true);
  });

  it('should close help', () => {
    const { result } = renderHook(() => useExpertModeState());

    act(() => {
      result.current.setHelpContext('s1');
    });
    expect(result.current.isHelpOpen).toBe(true);

    act(() => {
      result.current.closeHelp();
    });
    expect(result.current.isHelpOpen).toBe(false);
  });

  it('should persist state to localStorage when it changes', () => {
    const { result } = renderHook(() => useExpertModeState());

    act(() => {
      result.current.toggleSection('header');
    });

    expect(localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining('\"expandedSections\":[\"header\"]')
    );
  });
});
