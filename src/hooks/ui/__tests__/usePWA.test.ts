import { renderHook, act } from '@testing-library/react';
import { usePWA } from '../usePWA';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('usePWA', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      open: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize with isInstallable as false', () => {
    const { result } = renderHook(() => usePWA());
    expect(result.current.isInstallable).toBe(false);
  });

  it('should set isInstallable to true when beforeinstallprompt event is fired', () => {
    let eventHandler: any;
    vi.stubGlobal('window', {
      addEventListener: vi.fn((event, handler) => {
        if (event === 'beforeinstallprompt') eventHandler = handler;
      }),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    const { result } = renderHook(() => usePWA());

    act(() => {
      eventHandler({ preventDefault: vi.fn() });
    });

    expect(result.current.isInstallable).toBe(true);
  });

  it('should call prompt on installApp if deferredPrompt exists', async () => {
    let eventHandler: any;
    const mockPrompt = vi.fn();
    const mockUserChoice = Promise.resolve({ outcome: 'accepted' });

    vi.stubGlobal('window', {
      addEventListener: vi.fn((event, handler) => {
        if (event === 'beforeinstallprompt') eventHandler = handler;
      }),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    const { result } = renderHook(() => usePWA());

    act(() => {
      eventHandler({
        preventDefault: vi.fn(),
        prompt: mockPrompt,
        userChoice: mockUserChoice,
      });
    });

    let success = false;
    await act(async () => {
      success = await result.current.installApp();
    });

    expect(success).toBe(true);
    expect(mockPrompt).toHaveBeenCalled();
    expect(result.current.isInstallable).toBe(false);
  });

  it('should return false on installApp if deferredPrompt does not exist', async () => {
    const { result } = renderHook(() => usePWA());

    let success = true;
    await act(async () => {
      success = await result.current.installApp();
    });

    expect(success).toBe(false);
  });
});
