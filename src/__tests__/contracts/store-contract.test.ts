import { describe, it, expect } from 'vitest';
import { StoreFactory, mapStoreToContract, UserStoreMembershipFactory } from '@/contracts/store';
import type { Store } from '@/types';

describe('StoreFactory', () => {
  it('create() returns an object with all default values', () => {
    const store = StoreFactory.create();

    expect(store.id).toBe('');
    expect(store.name).toBe('');
    expect(store.address).toBe('');
    expect(store.phone).toBe('');
    expect(store.email).toBe('');
    expect(store.logo_url).toBe('');
    expect(store.reeup).toBe('');
    expect(store.nit).toBe('');
    expect(store.bank_account).toBe('');
    expect(store.signature_url).toBe('');
    expect(store.stamp_url).toBe('');
    expect(store.latitude).toBeNull();
    expect(store.longitude).toBeNull();
    expect(store.is_active).toBe(true);
    expect(store.slug).toBe('');
    expect(store.plantilla).toBe('construccion');
    expect(store.created_at).toBeTypeOf('string');
    // Validate the ISO date is parseable
    expect(new Date(store.created_at).getTime()).not.toBeNaN();
  });

  it('create() merges partial overrides', () => {
    const store = StoreFactory.create({
      id: 'store-123',
      name: 'Mi Tienda',
      address: 'Calle 5',
      plantilla: 'moderna',
      latitude: 23.1,
      longitude: -82.3,
    });

    expect(store.id).toBe('store-123');
    expect(store.name).toBe('Mi Tienda');
    expect(store.address).toBe('Calle 5');
    expect(store.plantilla).toBe('moderna');
    expect(store.latitude).toBe(23.1);
    expect(store.longitude).toBe(-82.3);
    // Non-overridden fields keep defaults
    expect(store.phone).toBe('');
    expect(store.is_active).toBe(true);
  });
});

describe('mapStoreToContract', () => {
  it('converts optional Store fields to guaranteed StoreContract values', () => {
    const rawStore: Store = {
      id: 'store-abc',
      name: 'Tienda Raw',
      // All other fields are undefined (optional)
    };

    const contract = mapStoreToContract(rawStore);

    expect(contract.id).toBe('store-abc');
    expect(contract.name).toBe('Tienda Raw');
    expect(contract.address).toBe('');
    expect(contract.phone).toBe('');
    expect(contract.email).toBe('');
    expect(contract.logo_url).toBe('');
    expect(contract.reeup).toBe('');
    expect(contract.nit).toBe('');
    expect(contract.bank_account).toBe('');
    expect(contract.signature_url).toBe('');
    expect(contract.stamp_url).toBe('');
    expect(contract.latitude).toBeNull();
    expect(contract.longitude).toBeNull();
    expect(contract.is_active).toBe(true);
    expect(contract.slug).toBe('');
    expect(contract.plantilla).toBeNull();
    expect(contract.created_at).toBeTypeOf('string');
  });

  it('preserves non-null optional fields from Store', () => {
    const rawStore: Store = {
      id: 'store-full',
      name: 'Full Store',
      address: 'Av. 27',
      phone: '+53 555 123',
      email: 'full@store.com',
      logo_url: 'https://img.com/logo.png',
      reeup: '12345678901',
      nit: '9876543210',
      bank_account: 'ACC-001',
      signature_url: 'https://img.com/sign.png',
      stamp_url: 'https://img.com/stamp.png',
      latitude: 20.0,
      longitude: -75.0,
      is_active: false,
      slug: 'full-store',
      plantilla: 'clasica',
      created_at: '2025-01-15T10:30:00.000Z',
    };

    const contract = mapStoreToContract(rawStore);

    expect(contract.address).toBe('Av. 27');
    expect(contract.phone).toBe('+53 555 123');
    expect(contract.email).toBe('full@store.com');
    expect(contract.logo_url).toBe('https://img.com/logo.png');
    expect(contract.reeup).toBe('12345678901');
    expect(contract.nit).toBe('9876543210');
    expect(contract.bank_account).toBe('ACC-001');
    expect(contract.is_active).toBe(false);
    expect(contract.plantilla).toBe('clasica');
    expect(contract.created_at).toBe('2025-01-15T10:30:00.000Z');
  });

  it('converts null optional fields to defaults', () => {
    const rawStore: Store = {
      id: 'store-nulls',
      name: 'Null Store',
      address: null,
      phone: null,
      email: null,
      logo_url: null,
      reeup: null,
      nit: null,
      bank_account: null,
      signature_url: null,
      stamp_url: null,
      latitude: null,
      longitude: null,
      is_active: undefined,
      slug: null,
      plantilla: null,
      created_at: undefined,
    };

    const contract = mapStoreToContract(rawStore);

    expect(contract.address).toBe('');
    expect(contract.phone).toBe('');
    expect(contract.email).toBe('');
    expect(contract.logo_url).toBe('');
    expect(contract.is_active).toBe(true);
    expect(contract.plantilla).toBeNull();
    expect(contract.created_at).toBeTypeOf('string');
  });
});

describe('UserStoreMembershipFactory', () => {
  it('create() returns default membership values', () => {
    const membership = UserStoreMembershipFactory.create();

    expect(membership.user_id).toBe('');
    expect(membership.store_id).toBe('');
    expect(membership.role).toBe('');
    expect(membership.status).toBe('active');
  });

  it('create() merges partial overrides', () => {
    const membership = UserStoreMembershipFactory.create({
      user_id: 'user-1',
      store_id: 'store-1',
      role: 'admin',
    });

    expect(membership.user_id).toBe('user-1');
    expect(membership.store_id).toBe('store-1');
    expect(membership.role).toBe('admin');
    expect(membership.status).toBe('active');
  });
});
