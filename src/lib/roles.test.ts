import { describe, it, expect } from 'vitest';
import { getAllowedRoles, hasRole, canManageStore } from './roles';

describe('getAllowedRoles', () => {
  it('should return all roles for admin', () => {
    expect(getAllowedRoles('admin')).toEqual([
      'admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo',
    ]);
  });

  it('should return manager and below for manager', () => {
    expect(getAllowedRoles('manager')).toEqual([
      'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo',
    ]);
  });

  it('should return only clerk for clerk', () => {
    expect(getAllowedRoles('clerk')).toEqual(['clerk']);
  });

  it('should return only warehouse for warehouse', () => {
    expect(getAllowedRoles('warehouse')).toEqual(['warehouse']);
  });

  it('should return empty for undefined role', () => {
    expect(getAllowedRoles(undefined)).toEqual([]);
  });
});

describe('hasRole', () => {
  it('should return false for null user', () => {
    expect(hasRole(null, 'admin')).toBe(false);
  });

  it('should match direct role', () => {
    const user = { role: 'manager' } as any;
    expect(hasRole(user, 'manager')).toBe(true);
    expect(hasRole(user, 'admin')).toBe(false);
  });

  it('should match roles array', () => {
    const user = { role: 'clerk', roles: ['admin'] } as any;
    expect(hasRole(user, 'admin')).toBe(true);
  });

  it('should match active memberships', () => {
    const user = {
      role: 'clerk',
      memberships: [{ role: 'manager', store_id: 's1', status: 'active' }],
    } as any;
    expect(hasRole(user, 'manager')).toBe(true);
  });

  it('should NOT match inactive memberships', () => {
    const user = {
      role: 'clerk',
      memberships: [{ role: 'manager', store_id: 's1', status: 'inactive' }],
    } as any;
    expect(hasRole(user, 'manager')).toBe(false);
  });

  it('should grant all roles to admin', () => {
    const user = { role: 'admin' } as any;
    expect(hasRole(user, 'clerk')).toBe(true);
    expect(hasRole(user, 'warehouse')).toBe(true);
    expect(hasRole(user, 'costo')).toBe(true);
  });

  it('should map encargado to manager for targetRole=manager', () => {
    const user = { role: 'encargado' } as any;
    expect(hasRole(user, 'manager')).toBe(true);
  });

  it('should map encargado membership to manager', () => {
    const user = {
      role: 'clerk',
      memberships: [{ role: 'encargado', store_id: 's1', status: 'active' }],
    } as any;
    expect(hasRole(user, 'manager')).toBe(true);
  });
});

describe('canManageStore', () => {
  it('should return false for null user', () => {
    expect(canManageStore(null, 's1')).toBe(false);
  });

  it('should allow admin to manage any store', () => {
    const user = { role: 'admin' } as any;
    expect(canManageStore(user, 's1')).toBe(true);
    expect(canManageStore(user, 's2')).toBe(true);
  });

  it('should allow manager membership for specific store', () => {
    const user = {
      role: 'clerk',
      memberships: [{ role: 'manager', store_id: 's1', status: 'active' }],
    } as any;
    expect(canManageStore(user, 's1')).toBe(true);
    expect(canManageStore(user, 's2')).toBe(false);
  });

  it('should allow encargado membership for specific store', () => {
    const user = {
      role: 'clerk',
      memberships: [{ role: 'encargado', store_id: 's1', status: 'active' }],
    } as any;
    expect(canManageStore(user, 's1')).toBe(true);
  });

  it('should NOT allow inactive membership', () => {
    const user = {
      role: 'clerk',
      memberships: [{ role: 'manager', store_id: 's1', status: 'inactive' }],
    } as any;
    expect(canManageStore(user, 's1')).toBe(false);
  });

  it('should NOT allow clerk or usuario to manage', () => {
    const user = {
      role: 'clerk',
      memberships: [{ role: 'clerk', store_id: 's1', status: 'active' }],
    } as any;
    expect(canManageStore(user, 's1')).toBe(false);
  });
});
