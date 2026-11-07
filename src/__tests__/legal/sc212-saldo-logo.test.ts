import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildSc212ModelData,
  fetchSc212SourceData,
  setSc212Client,
  formatSc212Saldo,
  type Sc212SourceData,
} from '@/lib/legal/sc212';
import type { SaldoPosteriorMovement, SaldoPosteriorResultado } from '@/lib/inventory/saldo-posterior';

/**
 * MISIÓN 2026-11-07 — SC-2-12 «Factura»: logo de la TIENDA + saldo posterior
 * ===========================================================================
 * 1. El fetch copia store.logo_url al modelo (bug: se consultaba pero no se
 *    copiaba → el PDF caía siempre al logo general de la aplicación).
 * 2. El saldo en existencia sale del ledger real por enlace documental
 *    (reference_id = venta) — historial insuficiente → «s/d».
 */

const TX = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  status: 'completed',
  total_amount: 10000,
  created_at: '2026-11-05T16:00:00Z',
  completed_at: '2026-11-05T16:00:00Z',
  sale_currency: 'CUP',
  store_id: 'store-1',
};

const ITEM = {
  product_id: 'producto-1',
  quantity: 2,
  price_at_sale: 5000,
  price_currency: 'CUP',
  price_at_sale_cup: 5000,
  exchange_rate: 1,
  products: { name: 'Producto QA', sku: 'P-1', unit_of_measure: 'unidades' },
};

/** Cliente Supabase simulado con respuestas por tabla. */
function mkClient(tables: Record<string, unknown[]>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: tables[table]?.[0] ?? null, error: null }),
          order: () => ({
            // transaction_items usa order().eq-encadenado; receipts path no aplica aquí
            eq: () => ({ data: tables[table] ?? [], error: null }),
            data: tables[table] ?? [],
            error: null,
          }),
          data: tables[table] ?? [],
          error: null,
        }),
        in: () => ({
          order: () => ({
            range: async () => {
              // stock_movements: devolver todas las filas simuladas
              const rows = (tables[table] || []) as unknown[];
              return { data: rows, error: null };
            },
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof setSc212Client>[0];
}

const SALDO_OK: SaldoPosteriorResultado = { saldoAnterior: 8, saldoPosterior: 12, fuente: 'ledger' };

describe('SC-2-12 — logo de la tienda emisora', () => {
  beforeEach(() => setSc212Client(null));

  it('el fetch copia logo_url de la tienda de la venta al storeConfig (bug corregido)', async () => {
    const store = {
      name: 'ENERVIDA-VITALLCONS',
      address: 'Calle 1',
      phone: '24412345',
      email: 'a@b.cu',
      reeup: '12345678901',
      nit: 'NIT-1',
      bank_account: '00000000',
      bank_branch: null,
      logo_url: 'https://supabase.co/storage/v1/object/public/logos/enervida.png',
    };
    setSc212Client(mkClient({ stores: [store] }));
    const source = await fetchSc212SourceData(TX as unknown as Sc212SourceData['transaction']);
    expect(source.storeConfig?.logo_url).toBe(store.logo_url);
    const model = buildSc212ModelData(source);
    expect(model.logoUrl).toBe(store.logo_url);
  });

  it('sin logo en la tienda → null → el render cae al fallback institucional (resolveScLogoDataUrl)', async () => {
    setSc212Client(mkClient({ stores: [{ name: 'Tienda sin logo', logo_url: null }] }));
    const source = await fetchSc212SourceData(TX as unknown as Sc212SourceData['transaction']);
    expect(source.storeConfig?.logo_url).toBeNull();
    expect(buildSc212ModelData(source).logoUrl).toBeNull();
  });

  it('el modelo puro toma el logo del storeConfig sin fetch (aislamiento multi-tenant por venta)', () => {
    const source: Partial<Sc212SourceData> = {
      transaction: TX as unknown as Sc212SourceData['transaction'],
      items: [ITEM],
      entidadNombre: 'Tienda A',
      storeConfig: { logo_url: 'https://x/logos/tienda-a.png' },
    };
    const model = buildSc212ModelData(source as Sc212SourceData);
    expect(model.logoUrl).toBe('https://x/logos/tienda-a.png');
  });
});

describe('SC-2-12 — saldo en existencia según almacén', () => {
  it('línea con saldo posterior del ledger → cifra formateada', () => {
    const model = buildSc212ModelData({
      transaction: TX as unknown as Sc212SourceData['transaction'],
      items: [ITEM],
      entidadNombre: 'Tienda A',
      storeConfig: null,
      saldosPorProducto: { 'producto-1': SALDO_OK },
    } as Sc212SourceData);
    expect(model.lineas[0].saldoExistencia).toBe('12');
    expect(model.saldoNota).toBe('');
  });

  it('sin saldo determinable → «s/d» + nota al pie (nunca cifra inventada)', () => {
    const model = buildSc212ModelData({
      transaction: TX as unknown as Sc212SourceData['transaction'],
      items: [{ ...ITEM, product_id: 'producto-x' }],
      entidadNombre: 'Tienda A',
      storeConfig: null,
      saldosPorProducto: {
        'producto-x': { saldoAnterior: NaN, saldoPosterior: NaN, fuente: 'limitacion' },
      },
    } as Sc212SourceData);
    expect(model.lineas[0].saldoExistencia).toBe('s/d');
    expect(model.saldoNota).toContain('s/d');
  });

  it('venta pendiente → proyección con nota (saldo actual − cantidad vendida)', () => {
    const model = buildSc212ModelData({
      transaction: { ...TX, status: 'pending' } as unknown as Sc212SourceData['transaction'],
      items: [ITEM],
      entidadNombre: 'Tienda A',
      storeConfig: null,
      saldosPorProducto: {
        'producto-1': { saldoAnterior: 20, saldoPosterior: 18, fuente: 'proyeccion' },
      },
    } as Sc212SourceData);
    expect(model.lineas[0].saldoExistencia).toBe('18');
    expect(model.saldoNota).toContain('proyección');
  });

  it('formatSc212Saldo: NaN → s/d; número → texto es-CU', () => {
    expect(formatSc212Saldo(undefined)).toBe('s/d');
    expect(formatSc212Saldo({ saldoAnterior: 0, saldoPosterior: NaN, fuente: 'limitacion' })).toBe('s/d');
    expect(formatSc212Saldo({ saldoAnterior: 8, saldoPosterior: 12, fuente: 'ledger' })).toBe('12');
  });

  it('el ledger simulado se filtra por el enlace documental (movement_type sale + reference_id)', async () => {
    const movs: SaldoPosteriorMovement[] = [
      { id: 'm1', created_at: '2026-01-05T10:00:00Z', quantity_change: 12, movement_type: 'purchase', notes: null, reference_id: null },
      { id: 'm2', created_at: '2026-02-01T10:00:00Z', quantity_change: -4, movement_type: 'sale', notes: null, reference_id: TX.id },
    ];
    // Probar el filtro puro reutilizando la librería (contrato del fetch):
    const { movimientosDeVenta, calcularSaldoPosterior } = await import('@/lib/inventory/saldo-posterior');
    const propios = movimientosDeVenta(movs, TX.id);
    expect(propios).toHaveLength(1);
    const r = calcularSaldoPosterior({
      movimientos: movs,
      movimientosPropios: propios,
      deltaDocumento: -4,
    });
    expect(r.saldoAnterior).toBe(12);
    expect(r.saldoPosterior).toBe(8); // 12 − 4
  });
});
