import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../index';
import { UserFactory } from '@/contracts';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('should initialize with isMocked as false', () => {
    const state = useAuthStore.getState();
    expect(state.isMocked).toBe(false);
  });

  it('should set isMocked to true when login is called with isMocked true', () => {
    const mockUser = UserFactory.create({ id: 'test-id' });
    // Updated to match 4-argument signature: (user, token, status, isMocked)
    useAuthStore.getState().login(mockUser, 'test-token', 'authenticated_valid', true);

    const state = useAuthStore.getState();
    expect(state.isMocked).toBe(true);
    expect(state.user?.id).toBe('test-id');
  });

  it('should set isMocked to false when logout is called', () => {
    const mockUser = UserFactory.create({ id: 'test-id' });
    useAuthStore.getState().login(mockUser, 'test-token', 'authenticated_valid', true);
    expect(useAuthStore.getState().isMocked).toBe(true);

    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.isMocked).toBe(false);
    expect(state.loading).toBe(false);
  });
});
