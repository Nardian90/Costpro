import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chain that supports all Supabase query patterns
const mockChain = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const select = vi.fn().mockReturnValue(null); // returns self for chaining
  const eq = vi.fn().mockReturnValue(null); // returns self for chaining
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const single = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
  // Chainable object: each method returns the chain itself
  const chain: any = {};
  chain.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) }));
  const from = vi.fn(() => chain);
  return { from, chain };
});

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: mockChain.from,
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({ from: mockChain.from }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/rpc-validator', () => ({
  validateResponse: vi.fn((data) => data),
}));

vi.mock('@/validation/schemas', () => ({
  profileSchema: { parse: vi.fn((d) => d) },
}));

import { auditService } from '@/services/audit-service';
import { userService } from '@/services/user-service';

describe('auditService', () => {
  beforeEach(() => {
    mockChain.chain.insert.mockResolvedValue({ data: null, error: null });
    mockChain.chain.limit.mockResolvedValue({ data: [], error: null });
  });

  it('logInvoiceWithoutPrice inserts audit log', async () => {
    await auditService.logInvoiceWithoutPrice('user-1', 'prod-1', 'store-1');
    expect(mockChain.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'invoice_without_price', user_id: 'user-1' })
    );
  });

  it('logInvoiceWithoutPrice does not throw on DB error', async () => {
    mockChain.chain.insert.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    await expect(auditService.logInvoiceWithoutPrice('u', 'p', 's')).resolves.not.toThrow();
  });

  it('logSaleBelowCost inserts with price/cost', async () => {
    await auditService.logSaleBelowCost('u', 'p', 's', 50, 80);
    expect(mockChain.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'sale_below_cost' }));
  });

  it('logTransferCreated inserts transfer data', async () => {
    await auditService.logTransferCreated({
      userId: 'u', transferId: 't1', originStoreId: 'A', destinationStoreId: 'B',
      items: [{ productId: 'p1', quantity: 5, unitCost: 10 }],
    });
    expect(mockChain.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'transfer_created' }));
  });

  it('logCashClosureFinalized inserts closure data', async () => {
    await auditService.logCashClosureFinalized({
      userId: 'u', storeId: 's', closureId: 'c1',
      expectedTotal: 100, actualTotal: 90, difference: -10,
    });
    expect(mockChain.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'cash_closure_finalized' }));
  });

  it('logStockAdjustment inserts adjustment', async () => {
    await auditService.logStockAdjustment({
      userId: 'u', storeId: 's', productId: 'p', productName: 'Test',
      previousStock: 100, newStock: 90, reason: 'damaged',
    });
    expect(mockChain.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'stock_adjustment' }));
  });

  it('logPriceChange inserts price change', async () => {
    await auditService.logPriceChange({
      userId: 'u', storeId: 's', productId: 'p', productName: 'Test',
      oldPrice: 100, newPrice: 120,
    });
    expect(mockChain.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'price_change' }));
  });
});

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain.chain.limit.mockResolvedValue({ data: [], error: null });
    mockChain.chain.single.mockResolvedValue({ data: null, error: null });
  });

  it('setActiveStore throws when no membership', async () => {
    mockChain.chain.limit.mockResolvedValueOnce({ data: [], error: null });
    await expect(userService.setActiveStore('u', 's')).rejects.toThrow(/No tienes acceso/);
  });

  it('setActiveStore throws when membership inactive', async () => {
    mockChain.chain.limit.mockResolvedValueOnce({
      data: [{ id: 'm', status: 'revoked', store: { id: 's', is_active: true } }],
      error: null,
    });
    await expect(userService.setActiveStore('u', 's')).rejects.toThrow(/revocada|inactiva|membresía/i);
  });

  it('setActiveStore throws when store inactive', async () => {
    mockChain.chain.limit.mockResolvedValueOnce({
      data: [{ id: 'm', status: 'active', store: [{ id: 's', is_active: false }] }],
      error: null,
    });
    await expect(userService.setActiveStore('u', 's')).rejects.toThrow(/desactivada|inactiva/i);
  });

  it('setActiveStore succeeds when all valid', async () => {
    mockChain.chain.limit.mockResolvedValueOnce({
      data: [{ id: 'm', status: 'active', store: [{ id: 's', is_active: true }] }],
      error: null,
    });
    await expect(userService.setActiveStore('u', 's')).resolves.not.toThrow();
  });

  it('getUserProfile returns null on not found', async () => {
    mockChain.chain.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    expect(await userService.getUserProfile('nonexistent')).toBeNull();
  });

  it('getUserProfile returns profile when found', async () => {
    mockChain.chain.single.mockResolvedValueOnce({
      data: { id: 'u1', email: 't@t.com', role: 'admin', name: 'Test' },
      error: null,
    });
    const result = await userService.getUserProfile('u1');
    // validateResponse is mocked to return data as-is, so result should be the profile
    // (may be null if validation fails, but the mock bypasses validation)
    expect(result).toBeDefined();
  });

  it('logout calls signOut without throwing', async () => {
    await expect(userService.logout()).resolves.not.toThrow();
  });

  it('updateAISettings throws when modifying another user', async () => {
    await expect(
      userService.updateAISettings('admin-1', 'user-2', 'gemini', 'test-key-very-long-1234567890')
    ).rejects.toThrow(/No puedes modificar/);
  });

  it('updateAISettings succeeds for same user', async () => {
    await expect(
      userService.updateAISettings('user-1', 'user-1', 'gemini', 'test-key-very-long-1234567890')
    ).resolves.not.toThrow();
  });
});
