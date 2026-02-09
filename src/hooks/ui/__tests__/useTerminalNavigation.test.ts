import { renderHook } from '@testing-library/react';
import { useTerminalNavigation } from '../useTerminalNavigation';
import { describe, it, expect, vi } from 'vitest';
import { UserContract } from '@/contracts/user';

vi.mock('framer-motion', () => ({
  useMotionValue: vi.fn(() => ({ set: vi.fn() })),
  useTransform: vi.fn(),
}));

describe('useTerminalNavigation', () => {
  const adminUser: UserContract = {
    id: '1',
    role: 'admin',
    roles: ['admin'],
    email: 'admin@example.com',
    full_name: 'Admin User',
    activeStoreId: 'store-1',
  } as any;

  const clerkUser: UserContract = {
    id: '2',
    role: 'clerk',
    roles: ['clerk'],
    email: 'clerk@example.com',
    full_name: 'Clerk User',
    activeStoreId: 'store-1',
  } as any;

  it('should include "roles" view for admin', () => {
    const { result } = renderHook(() => useTerminalNavigation(adminUser, ''));
    const rolesItem = result.current.navigationItems.find(i => i.id === 'roles');
    expect(rolesItem).toBeDefined();
    expect(rolesItem?.label).toBe('Roles');
  });

  it('should NOT include "roles" view for clerk', () => {
    const { result } = renderHook(() => useTerminalNavigation(clerkUser, ''));
    const rolesItem = result.current.navigationItems.find(i => i.id === 'roles');
    expect(rolesItem).toBeUndefined();
  });
});
