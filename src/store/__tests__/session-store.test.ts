import { describe, it, expect } from 'vitest';
import { useSessionStore } from '../session-store';

describe('Session Store', () => {
  it('should update online status', () => {
    useSessionStore.getState().setOnlineStatus(false);
    expect(useSessionStore.getState().isOnline).toBe(false);
    expect(useSessionStore.getState().status).toBe('offline');

    useSessionStore.getState().setOnlineStatus(true);
    expect(useSessionStore.getState().isOnline).toBe(true);
    expect(useSessionStore.getState().status).toBe('online');
  });

  it('should update session checking status', () => {
    useSessionStore.getState().setSessionStatus(true);
    expect(useSessionStore.getState().isCheckingSession).toBe(true);
    expect(useSessionStore.getState().status).toBe('checking');
    expect(useSessionStore.getState().lastChecked).toBeGreaterThan(0);
  });
});
