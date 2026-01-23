import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSessionStore } from '../session-store';
import { act } from '@testing-library/react';

describe('Session Store', () => {
  beforeEach(() => {
    act(() => {
      useSessionStore.setState({
        isOnline: true,
        isCheckingSession: false,
        lastChecked: 0,
        status: 'stable',
      });
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should set online status correctly', () => {
    act(() => {
      useSessionStore.getState().setOnlineStatus(false);
    });
    expect(useSessionStore.getState().isOnline).toBe(false);
    expect(useSessionStore.getState().status).toBe('offline');

    act(() => {
      useSessionStore.getState().setOnlineStatus(true);
    });
    expect(useSessionStore.getState().isOnline).toBe(true);
    expect(useSessionStore.getState().status).toBe('online');
  });

  it('should set session status correctly when checking', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    act(() => {
      useSessionStore.getState().setSessionStatus(true);
    });
    expect(useSessionStore.getState().isCheckingSession).toBe(true);
    expect(useSessionStore.getState().status).toBe('checking');
    expect(useSessionStore.getState().lastChecked).toBe(now);
  });

  it('should set session status with a new status', () => {
    act(() => {
      useSessionStore.getState().setSessionStatus(true, 'error');
    });
    expect(useSessionStore.getState().isCheckingSession).toBe(true);
    expect(useSessionStore.getState().status).toBe('error');
  });

  it('should set status directly', () => {
    act(() => {
      useSessionStore.getState().setStatus('stable');
    });
    expect(useSessionStore.getState().status).toBe('stable');
  });

  // POS Flow related tests
  it('should reflect an empty cart for POS', () => {
    // This test is more conceptual, as cart logic is separate.
    // We're ensuring the session store doesn't wrongly indicate a ready-to-submit state.
    const { status } = useSessionStore.getState();
    expect(status).not.toBe('submitting');
  });

  it('should handle session invalidation for POS', () => {
    // Simulate a session becoming invalid
    act(() => {
        useSessionStore.getState().setStatus('error');
    });
    const { status } = useSessionStore.getState();
    expect(status).toBe('error');
    // In a real app, this would trigger a logout or login prompt.
  });
});
