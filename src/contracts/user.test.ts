import { describe, it, expect } from 'vitest';
import { UserFactory, mapProfileToContract, UserContractFactory } from './user';
import { Profile } from '../../types';

describe('User Contract', () => {
  it('should create an empty user contract', () => {
    const user = UserContractFactory.createEmpty();
    expect(user.fullName).toBe('');
    expect(user.role).toBe('clerk');
    expect(user.isActive).toBe(true);
  });

  it('should map profile to contract correctly', () => {
    const profile: Profile = {
      id: '123',
      full_name: 'John Doe',
      email: 'john@example.com',
      role: 'admin',
      is_active: true,
      store_id: 'store-1',
      active_store_id: 'store-1',
      created_at: '2021-01-01',
    };

    const contract = mapProfileToContract(profile);
    expect(contract.id).toBe('123');
    expect(contract.fullName).toBe('John Doe');
    expect(contract.email).toBe('john@example.com');
    expect(contract.role).toBe('admin');
    expect(contract.isActive).toBe(true);
    expect(contract.storeId).toBe('store-1');
  });
});
