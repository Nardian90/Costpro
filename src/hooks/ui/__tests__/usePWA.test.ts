import { renderHook, act } from '@testing-library/react';
import { usePWA } from '../usePWA';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// @vitest-environment jsdom

describe('usePWA', () => {
  beforeEach(() => {
    // Mock window methods via vi.spyOn (works in jsdom)
    vi.spyOn(window, 'addEventListener').mockImplementation(vi.fn());
    vi.spyOn(window, 'removeEventListener').mockImplementation(vi.fn());
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as any);
    vi.spyOn(window, 'open').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with isInstallable as false', () => {
    const { result } = renderHook(() => usePWA());
    expect(result.current.isInstallable).toBe(false);
  });

  it('should set isInstallable to true when beforeinstallprompt event is fired', () => {
    let eventHandler: any;
    (window.addEventListener as any).mockImplementation((event: string, handler: any) => {
      if (event === 'beforeinstallprompt') eventHandler = handler;
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

    (window.addEventListener as any).mockImplementation((event: string, handler: any) => {
      if (event === 'beforeinstallprompt') eventHandler = handler;
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
    (window.open as any).mockImplementation(mockOpen);

    const { result } = renderHook(() => usePWA());

    let success;
    await act(async () => {
      success = await result.current.installApp();
    });

    expect(success).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
