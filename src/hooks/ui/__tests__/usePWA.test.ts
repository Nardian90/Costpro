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

    await act(async () => {
      await result.current.installApp();
    });

    expect(mockPrompt).toHaveBeenCalled();
    expect(result.current.isInstallable).toBe(false);
  });

  it('should return false and not redirect if deferredPrompt is null', async () => {
    const mockOpen = vi.fn();
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      open: mockOpen,
    });

    const { result } = renderHook(() => usePWA());

    let success;
    await act(async () => {
      success = await result.current.installApp();
    });

    expect(success).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
