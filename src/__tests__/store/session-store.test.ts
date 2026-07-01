import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '@/store/session-store';

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({
      isOnline: true, isCheckingSession: false, lastChecked: 0, status: 'stable',
    });
  });

  it('setOnlineStatus(true) sets online', () => {
    useSessionStore.getState().setOnlineStatus(true);
    expect(useSessionStore.getState().isOnline).toBe(true);
    expect(useSessionStore.getState().status).toBe('online');
  });

  it('setOnlineStatus(false) sets offline', () => {
    useSessionStore.getState().setOnlineStatus(false);
    expect(useSessionStore.getState().isOnline).toBe(false);
    expect(useSessionStore.getState().status).toBe('offline');
  });

  it('setSessionStatus(true) sets checking', () => {
    useSessionStore.getState().setSessionStatus(true);
    const s = useSessionStore.getState();
    expect(s.isCheckingSession).toBe(true);
    expect(s.status).toBe('checking');
    expect(s.lastChecked).toBeGreaterThan(0);
  });

  it('setSessionStatus(false, error) sets error', () => {
    useSessionStore.getState().setSessionStatus(false, 'error');
    expect(useSessionStore.getState().isCheckingSession).toBe(false);
    expect(useSessionStore.getState().status).toBe('error');
  });

  it('setStatus sets status directly', () => {
    useSessionStore.getState().setStatus('stable');
    expect(useSessionStore.getState().status).toBe('stable');
  });
});
