import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chain that supports all Supabase query patterns.
//
// CP-ORG-001 ciclo 5: el mock original era una cadena ÚNICA compartida por
// todas las tablas. El contrato de setActiveStore cambió (lee profiles.role
// ANTES de user_store_memberships/stores) y la primera query consumía el stub
// pensado para la segunda → falsos negativos. Ahora `from(table)` enruta a una
// cadena POR TABLA y cada test stubbea la tabla que le corresponde explícitamente.
const mockChain = vi.hoisted(() => {
  const makeChain = () => {
    const chain: any = {};
    chain.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) }));
    return chain;
  };
  // Cadena genérica (audit_logs y cualquier otra tabla) — mantiene las
  // aserciones existentes de auditService sobre mockChain.chain.
  const chain = makeChain();
  // Cadenas por tabla usadas por userService.
  const profilesChain = makeChain();
  const membershipsChain = makeChain();
  const storesChain = makeChain();
  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profilesChain;
    if (table === 'user_store_memberships') return membershipsChain;
    if (table === 'stores') return storesChain;
    return chain;
  });
  const resetChain = (c: any) => {
    c.insert.mockReset().mockImplementation(() => Promise.resolve({ data: null, error: null }));
    c.select.mockReset().mockImplementation(() => c);
    c.eq.mockReset().mockImplementation(() => c);
    c.limit.mockReset().mockImplementation(() => Promise.resolve({ data: [], error: null }));
    c.single.mockReset().mockImplementation(() => Promise.resolve({ data: null, error: null }));
    c.update.mockReset().mockImplementation(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) }));
  };
  return { from, chain, profilesChain, membershipsChain, storesChain, resetChain };
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
      declaredCash: 100, declaredVouchers: 0,
      systemExpectedTotal: 100, difference: -10, status: 'closed',
    });
    expect(mockChain.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'cash_closure_finalized' }));
  });

  it('logStockAdjustment inserts adjustment', async () => {
    await auditService.logStockAdjustment({
      userId: 'u', storeId: 's', productId: 'p',
      oldStock: 100, newStock: 90, reason: 'damaged',
    });
    expect(mockChain.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'stock_adjustment' }));
  });

  it('logPriceChange inserts price change', async () => {
    await auditService.logPriceChange({
      userId: 'u', storeId: 's', productId: 'p',
      oldPrice: 100, newPrice: 120,
    });
    expect(mockChain.chain.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'price_change' }));
  });
});

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const c of [mockChain.chain, mockChain.profilesChain, mockChain.membershipsChain, mockChain.storesChain]) {
      mockChain.resetChain(c);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Empleado/rol ordinario: la membresía sigue siendo OBLIGATORIA
  // (aserciones originales FIX CRITICAL-001 — sin cambios de semántica)
  // ─────────────────────────────────────────────────────────────────────

  it('setActiveStore throws when no membership', async () => {
    // Perfil legible SIN rol administrativo (empleado) → exige membresía.
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'clerk' }], error: null });
    mockChain.membershipsChain.limit.mockResolvedValueOnce({ data: [], error: null });
    await expect(userService.setActiveStore('u', 's')).rejects.toThrow(/No tienes acceso/);
  });

  it('setActiveStore throws when membership inactive', async () => {
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'clerk' }], error: null });
    mockChain.membershipsChain.limit.mockResolvedValueOnce({
      data: [{ id: 'm', status: 'revoked', store: { id: 's', is_active: true } }],
      error: null,
    });
    await expect(userService.setActiveStore('u', 's')).rejects.toThrow(/revocada|inactiva|membresía/i);
  });

  it('setActiveStore throws when store inactive', async () => {
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'clerk' }], error: null });
    mockChain.membershipsChain.limit.mockResolvedValueOnce({
      data: [{ id: 'm', status: 'active', store: [{ id: 's', is_active: false }] }],
      error: null,
    });
    await expect(userService.setActiveStore('u', 's')).rejects.toThrow(/desactivada|inactiva/i);
  });

  it('setActiveStore succeeds when all valid', async () => {
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'clerk' }], error: null });
    mockChain.membershipsChain.limit.mockResolvedValueOnce({
      data: [{ id: 'm', status: 'active', store: [{ id: 's', is_active: true }] }],
      error: null,
    });
    await expect(userService.setActiveStore('u', 's')).resolves.not.toThrow();
    expect(mockChain.profilesChain.update).toHaveBeenCalledWith({ active_store_id: 's' });
  });

  // ─────────────────────────────────────────────────────────────────────
  // REGRESIÓN DEL INCIDENTE CP-ORG-001 (admin@demo.com):
  // SuperAdmin/admin global NO lleva membresías y DEBE poder seleccionar
  // tienda; el rol se resuelve server-side desde profiles vía RLS.
  // ─────────────────────────────────────────────────────────────────────

  it('superadmin selects store WITHOUT membership (incidente admin@demo.com)', async () => {
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'superadmin' }], error: null });
    mockChain.storesChain.limit.mockResolvedValueOnce({ data: [{ id: 's', is_active: true }], error: null });
    await expect(userService.setActiveStore('super-admin', 's')).resolves.not.toThrow();
    // La membresía NO se consulta: el SuperAdmin no la necesita ni puede ser
    // bloqueado por su ausencia (causa raíz del incidente).
    expect(mockChain.membershipsChain.limit).not.toHaveBeenCalled();
    // La tienda SÍ se valida (existe y activa) — sin membresías ficticias.
    expect(mockChain.storesChain.limit).toHaveBeenCalledTimes(1);
    expect(mockChain.profilesChain.update).toHaveBeenCalledWith({ active_store_id: 's' });
  });

  it('admin global (rol clásico) also selects store without membership', async () => {
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'admin' }], error: null });
    mockChain.storesChain.limit.mockResolvedValueOnce({ data: [{ id: 's', is_active: true }], error: null });
    await expect(userService.setActiveStore('a', 's')).resolves.not.toThrow();
    expect(mockChain.membershipsChain.limit).not.toHaveBeenCalled();
  });

  it('superadmin cannot select an inactive store', async () => {
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'superadmin' }], error: null });
    mockChain.storesChain.limit.mockResolvedValueOnce({ data: [{ id: 's', is_active: false }], error: null });
    await expect(userService.setActiveStore('super-admin', 's')).rejects.toThrow(/desactivada/i);
    // Nunca llega a persistir el cambio.
    expect(mockChain.profilesChain.update).not.toHaveBeenCalled();
  });

  it('superadmin cannot select a non-existent store', async () => {
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'superadmin' }], error: null });
    mockChain.storesChain.limit.mockResolvedValueOnce({ data: [], error: null });
    await expect(userService.setActiveStore('super-admin', 's')).rejects.toThrow(/Tienda no encontrada/);
    expect(mockChain.profilesChain.update).not.toHaveBeenCalled();
  });

  it('role read error falls back to membership check (fail-closed)', async () => {
    // Sin lectura de rol no se eleva NADIE: se mantiene la membresía obligatoria.
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [], error: { message: 'RLS blocked' } });
    mockChain.membershipsChain.limit.mockResolvedValueOnce({ data: [], error: null });
    await expect(userService.setActiveStore('u', 's')).rejects.toThrow(/No tienes acceso/);
  });

  it('role read returning non-admin profile keeps membership enforcement', async () => {
    // Anti-spoofing: un perfil de empleado NUNCA obtiene el bypass aunque la
    // tienda exista y esté activa.
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'clerk' }], error: null });
    mockChain.membershipsChain.limit.mockResolvedValueOnce({ data: [], error: null });
    mockChain.storesChain.limit.mockResolvedValueOnce({ data: [{ id: 's', is_active: true }], error: null });
    await expect(userService.setActiveStore('u', 's')).rejects.toThrow(/No tienes acceso/);
  });

  it('persist error rejects the store switch', async () => {
    mockChain.profilesChain.limit.mockResolvedValueOnce({ data: [{ role: 'superadmin' }], error: null });
    mockChain.storesChain.limit.mockResolvedValueOnce({ data: [{ id: 's', is_active: true }], error: null });
    mockChain.profilesChain.update.mockImplementationOnce(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: { message: 'update failed' } })) }));
    await expect(userService.setActiveStore('super-admin', 's')).rejects.toThrow(/update failed/);
  });

  it('getUserProfile returns null on not found', async () => {
    mockChain.profilesChain.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    expect(await userService.getUserProfile('nonexistent')).toBeNull();
  });

  it('getUserProfile returns profile when found', async () => {
    mockChain.profilesChain.single.mockResolvedValueOnce({
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
