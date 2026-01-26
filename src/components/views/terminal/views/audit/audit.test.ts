import { describe, it, expect } from 'vitest';
import { getAuditCategory } from './AuditEventIcon';

describe('Audit Category Logic', () => {
  it('should categorize inventory tables correctly', () => {
    expect(getAuditCategory('products', 'INSERT')).toBe('inventory');
    expect(getAuditCategory('inventory', 'UPDATE')).toBe('inventory');
    expect(getAuditCategory('stock_movements', 'INSERT')).toBe('inventory');
  });

  it('should categorize sales tables correctly', () => {
    expect(getAuditCategory('transactions', 'INSERT')).toBe('sales');
    expect(getAuditCategory('cash_movements', 'INSERT')).toBe('sales');
  });

  it('should prioritize adjustments for DELETE action', () => {
    expect(getAuditCategory('products', 'DELETE')).toBe('adjustments');
    expect(getAuditCategory('transactions', 'VOID')).toBe('adjustments');
  });

  it('should categorize user related tables correctly', () => {
    expect(getAuditCategory('profiles', 'UPDATE')).toBe('users');
    expect(getAuditCategory('user_store_memberships', 'INSERT')).toBe('users');
  });

  it('should return other for unknown tables', () => {
    expect(getAuditCategory('unknown_table', 'UPDATE')).toBe('other');
  });
});
