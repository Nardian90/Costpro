/**
 * CP-CAT-MAESTRO-002 — Fase 3/4: GC de imágenes condicionado a referencias vivas.
 *
 * uploadProductImage eliminaba SIEMPRE el archivo anterior tras un reemplazo.
 * Con imágenes compartidas (maestro + tiendas conectadas apuntando al mismo
 * objeto del bucket), ese borrado rompía referencias ajenas. Ahora:
 *  · Referencias vivas (products.image_url o master_products.image_path) ⇒
 *    el archivo se conserva.
 *  · Sin referencias ⇒ se limpia (comportamiento de higiene anterior).
 *  · Verificación no ejecutable ⇒ se conserva (fail-safe).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadMock = vi.fn();
const removeMock = vi.fn();

type CountResult = { count: number | null; error: { message: string } | null };

let productsRefCount: CountResult;
let masterRefCount: CountResult;

const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PREV_FILE = `${PRODUCT_ID}-old.webp`;
let prevImageUrl: string | null = PREV_FILE;

/**
 * Builder thenable encadenable que imita el query builder del cliente:
 *  · select('image_url')…maybeSingle()   → { data, error } (lectura previa)
 *  · select('id', {count,head})          → awaitable con { count, error } (GC)
 *  · update(…)…eq(…)                     → { error: null }
 */
function makeBuilder(table: string) {
  const state: { count: number | null; error: { message: string } | null; selectArg?: string; hasCountOpts?: boolean; updated?: boolean } = { count: null, error: null };
  const resolveNow = (): CountResult => (table === 'products' ? productsRefCount : masterRefCount);
  const builder: Record<string, unknown> = {
    select: vi.fn((arg?: string, opts?: { count?: string }) => {
      state.selectArg = arg;
      state.hasCountOpts = !!opts && typeof opts.count === 'string';
      return builder;
    }),
    eq: vi.fn(() => builder),
    update: vi.fn(() => { state.updated = true; return builder; }),
    maybeSingle: vi.fn(async () => ({ data: { image_url: prevImageUrl }, error: null })),
    then(onFul: (r: CountResult) => void, onRej?: (e: unknown) => void) {
      // Lectura previa (select('image_url')) ⇒ { data, error }
      if (state.selectArg && !state.hasCountOpts && !state.updated) {
        return Promise.resolve({ data: null, error: null }).then(onFul as never, onRej);
      }
      // UPDATE…eq() ⇒ { error: null }
      if (state.updated) {
        return Promise.resolve({ error: null }).then(onFul as never, onRej);
      }
      // Conteo de referencias (select('id', {count:'exact', head:true})) ⇒ { count, error }
      return Promise.resolve(resolveNow()).then(onFul, onRej);
    },
  };
  return builder;
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (t: string) => makeBuilder(t),
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
      }),
    },
  },
}));

import { catalogService, importCatalogFromCSV } from '@/services/catalog-service';

beforeEach(() => {
  uploadMock.mockReset().mockResolvedValue({ error: null });
  removeMock.mockReset().mockResolvedValue({ error: null });
  productsRefCount = { count: 0, error: null };
  masterRefCount = { count: 0, error: null };
  prevImageUrl = PREV_FILE;
});

describe('uploadProductImage — GC de imagen compartida', () => {
  it('CONSERVA el archivo anterior cuando el maestro todavía lo referencia', async () => {
    masterRefCount = { count: 1, error: null }; // p.ej. ENERVIDA activó el producto con esa imagen
    const out = await catalogService.uploadProductImage(PRODUCT_ID, new File(['x'], 'nueva.webp'));
    expect(typeof out).toBe('string'); // sube el archivo nuevo y devuelve su nombre
    expect(uploadMock).toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('CONSERVA el archivo anterior cuando otro producto de otra tienda lo referencia', async () => {
    productsRefCount = { count: 2, error: null };
    await catalogService.uploadProductImage(PRODUCT_ID, new File(['x'], 'nueva.webp'));
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('LIMPIA el archivo anterior cuando ya no hay referencias vivas', async () => {
    productsRefCount = { count: 0, error: null };
    masterRefCount = { count: 0, error: null };
    await catalogService.uploadProductImage(PRODUCT_ID, new File(['x'], 'nueva.webp'));
    expect(removeMock).toHaveBeenCalledWith([PREV_FILE]);
  });

  it('FAIL-SAFE: si la verificación de referencias falla, conserva el archivo', async () => {
    productsRefCount = { count: null, error: { message: 'RLS denied' } };
    masterRefCount = { count: 0, error: null };
    await catalogService.uploadProductImage(PRODUCT_ID, new File(['x'], 'nueva.webp'));
    expect(removeMock).not.toHaveBeenCalled();
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
 * CP-CAT-MAESTRO-002 — Cobertura real del servicio (Fase 4): importación CSV.
 * Ejercita el mapeo de headers, la naturaleza del artículo (Servicio), la
 * validación de filas y el dedup de SKU dentro del archivo (Caso H).
 * ═══════════════════════════════════════════════════════════════════════════ */

const csvFile = (content: string) => new File([content], 'catalogo.csv', { type: 'text/csv' });

describe('importCatalogFromCSV — importación y dedup (Caso H)', () => {
  it('mapea headers flexibles, reconoce «Servicio» y autogenera barcode', async () => {
    const csv = [
      'SKU,Nombre,Categoría,Tipo de Artículo,Unidad de Medida,Costo,Precio Venta,Stock Mínimo,Proveedor',
      'PAR-500,Paracetamol 500 mg,Medicamentos,Servicio,unidad,90,150,10,Farmacia Central',
      'PAN-1,Pan Francés,Panadería,,unidad,0.05,0.15,50,Panadería Local',
    ].join('\n');
    const res = await importCatalogFromCSV(csvFile(csv));
    expect(res.totalCount).toBe(2);
    expect(res.errors).toHaveLength(0);
    expect(res.rows[0]).toMatchObject({ sku: 'PAR-500', name: 'Paracetamol 500 mg', is_service: true, price: 150, cost_price: 90, unit_of_measure: 'unidad' });
    expect(res.rows[1].is_service).toBe(false); // ausencia ⇒ producto físico
    expect(String(res.rows[1].barcode)).toMatch(/^\d{13}$/); // autogenerado por SKU
  });

  it('registra errores por fila: SKU obligatorio y SKU duplicado en el archivo', async () => {
    const csv = [
      'SKU,Nombre',
      ',Sin SKU',
      'DUP-1,Primero',
      'DUP-1,Duplicado',
    ].join('\n');
    const res = await importCatalogFromCSV(csvFile(csv));
    expect(res.rows).toHaveLength(1);
    expect(res.errors.map(e => e.message)).toEqual(
      expect.arrayContaining(['SKU es obligatorio', 'SKU duplicado en el archivo: DUP-1'])
    );
  });

  it('rechaza CSV vacío con error claro', async () => {
    await expect(importCatalogFromCSV(csvFile('SKU,Nombre\n'))).rejects.toThrow('vacío');
  });
});
