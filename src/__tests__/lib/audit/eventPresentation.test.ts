/**
 * eventPresentation — tests de la capa de traducción auditoría → negocio.
 *
 * DASHBOARD V3 (feat/dashboard-v3-audit-ux):
 *   - Títulos de negocio para acciones conocidas (UPDATE_STORE_CONFIG ya NO
 *     se muestra como código crudo — Criterio B).
 *   - Veracidad (Criterio C): descripciones SOLO con datos reales; sin datos
 *     → sin descripción (el modal usa frase genérica honesta).
 *   - Whitelist de documentos: SOLO las relaciones demostradas tienen
 *     documento asociado; jamás se fabrica una relación (FASE 11).
 *   - Fallback humanizado para acciones desconocidas (traducción literal,
 *     el código original queda en trazabilidad interna).
 *
 * REMEDIACIÓN (fix/audit-sale-document-link):
 *   - "Venta realizada" (CREATE_SALE / CREATE_SALE_V2) → documento con intent
 *     'sale' (botón "Ver venta") — relación demostrada en los RPC y
 *     verificada contra datos reales.
 *   - "Venta anulada" (sale_voided / REVERSE_TRANSACTION_V2) → intent
 *     'voided-sale' (botón "Ver documento" — comportamiento certificado).
 *   - La etiqueta de negocio NO participa en el discriminador: recepciones,
 *     órdenes de producción/trabajo/servicio, cambios de estado y alertas de
 *     control NO obtienen botón aunque su título suene a venta.
 *   - saleSummary / saleRef SOLO con datos reales del registro.
 *   - Filtro: hechos con dos eras técnicas se agrupan en UNA opción.
 */

import { describe, it, expect } from 'vitest';
import {
  getAuditEventPresentation,
  getGenericSentence,
  getActorLabel,
  AUDIT_FILTER_OPTIONS,
  AUDIT_EVENT_TITLES,
  resolveAuditFilterActions,
} from '@/lib/audit/eventPresentation';
import type { AuditLogEntry } from '@/hooks/api/useAuditLogs';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'evt-1',
    created_at: '2026-10-03T19:19:41Z',
    user_id: '',
    action: 'UPDATE_STORE_CONFIG',
    table_name: 'stores',
    record_id: 'bd247564-0000-0000-0000-000000000000',
    store_id: 'store-1',
    metadata: {},
    ...overrides,
  };
}

describe('getAuditEventPresentation — títulos de negocio', () => {
  it('UPDATE_STORE_CONFIG → "Configuración de tienda actualizada" (no código crudo)', () => {
    const p = getAuditEventPresentation(makeEntry());
    expect(p.title).toBe('Configuración de tienda actualizada');
    expect(p.title).not.toContain('UPDATE_STORE_CONFIG');
    expect(p.title).not.toContain('_');
  });

  it('sale_voided → "Venta anulada" + severidad warning (consistente con lógica previa: void=warning)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'sale_voided', table_name: 'transactions' })
    );
    expect(p.title).toBe('Venta anulada');
    expect(p.severity).toBe('warning');
  });

  it('reception_created descripción construida SOLO con metadata real', () => {
    const p = getAuditEventPresentation(
      makeEntry({
        action: 'reception_created',
        table_name: 'receipts',
        metadata: { supplier: 'Distribuidora X', invoice_number: 'F-001', items_count: 12, total_cost: 1500 },
      })
    );
    expect(p.description).toContain('Distribuidora X');
    expect(p.description).toContain('F-001');
    expect(p.description).toContain('12 artículo(s)');
  });

  it('evento SIN metadata → sin descripción (cero invención — Criterio C)', () => {
    const p = getAuditEventPresentation(makeEntry({ action: 'UPDATE_STORE_CONFIG', metadata: {} }));
    expect(p.description).toBeUndefined();
  });

  it('acción desconocida → humanización literal del código (no invención)', () => {
    const p = getAuditEventPresentation(makeEntry({ action: 'SOME_NEW_ACTION' }));
    expect(p.title).toBe('Some new action');
  });

  it('severidad warning para anulaciones y alertas de control', () => {
    expect(getAuditEventPresentation(makeEntry({ action: 'reception_voided' })).severity).toBe('warning');
    expect(getAuditEventPresentation(makeEntry({ action: 'sale_below_cost' })).severity).toBe('warning');
  });
});

describe('getAuditEventPresentation — documentos asociados (whitelist estricta)', () => {
  it('sale_voided con table_name transactions → documento de venta con record_id real (intent voided-sale)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'sale_voided', table_name: 'transactions', record_id: 'tx-99' })
    );
    expect(p.document).toEqual({ kind: 'sale', recordId: 'tx-99', intent: 'voided-sale' });
  });

  it('UPDATE_STORE_CONFIG NO tiene documento (no fabricar relación — FASE 11)', () => {
    const p = getAuditEventPresentation(makeEntry());
    expect(p.document).toBeNull();
  });

  it('invoice_without_price NO tiene documento (record_id = product id, no transacción)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'invoice_without_price', table_name: 'transactions', record_id: 'product-1' })
    );
    expect(p.document).toBeNull();
  });

  it('sale_voided sin table_name transactions → sin documento (relación no inequívoca)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'sale_voided', table_name: 'otra_tabla', record_id: 'x' })
    );
    expect(p.document).toBeNull();
  });
});

describe('REMEDIACIÓN — Ver venta (fix/audit-sale-document-link)', () => {
  // Caso A del mandato: evento real "Venta realizada" con referencia demostrada.
  const REAL_V2_METADATA = {
    total_amount: 300,
    item_count: 1,
    payment_method: 'cash',
    v2_checkout: true,
    supervisor_id: 'sup-1',
  };

  it('CREATE_SALE_V2 + transactions → "Venta realizada" con intent sale y record_id real', () => {
    const p = getAuditEventPresentation(
      makeEntry({
        action: 'CREATE_SALE_V2',
        table_name: 'transactions',
        record_id: 'f3d176a6-3151-48fb-bb70-0914d2b9626d',
        metadata: REAL_V2_METADATA,
      })
    );
    expect(p.title).toBe('Venta realizada');
    expect(p.document).toEqual({
      kind: 'sale',
      recordId: 'f3d176a6-3151-48fb-bb70-0914d2b9626d',
      intent: 'sale',
    });
  });

  it('CREATE_SALE_V2 → saleRef usa la convención del visor ("Ref: XXXXXXXX") y saleSummary solo datos reales', () => {
    const p = getAuditEventPresentation(
      makeEntry({
        action: 'CREATE_SALE_V2',
        table_name: 'transactions',
        record_id: 'f3d176a6-3151-48fb-bb70-0914d2b9626d',
        metadata: REAL_V2_METADATA,
      })
    );
    expect(p.saleRef).toBe('Ref: f3d176a6');
    expect(p.saleSummary).toBe('1 artículo(s) · Efectivo · Total: $300.00');
  });

  it('CREATE_SALE (V1) + transactions → intent sale; saleSummary desde new_data', () => {
    const p = getAuditEventPresentation(
      makeEntry({
        action: 'CREATE_SALE',
        table_name: 'transactions',
        record_id: 'tx-v1-1',
        new_data: { total_amount: 120.5, items_count: 3, payment_method: 'transfer' },
      })
    );
    expect(p.title).toBe('Venta realizada');
    expect(p.document).toEqual({ kind: 'sale', recordId: 'tx-v1-1', intent: 'sale' });
    expect(p.saleSummary).toBe('3 artículo(s) · Transferencia · Total: $120.50');
  });

  it('evento de venta con metadata vacía → saleSummary undefined (cero invención)', () => {
    const p = getAuditEventPresentation(
      makeEntry({
        action: 'CREATE_SALE_V2',
        table_name: 'transactions',
        record_id: 'a1b2c3d4-0000-0000-0000-000000000000',
        metadata: {},
      })
    );
    expect(p.saleSummary).toBeUndefined();
    expect(p.saleRef).toBe('Ref: a1b2c3d4');
  });

  it('payment_method fuera del enum conocido → se omite (no se traduce a ciegas)', () => {
    const p = getAuditEventPresentation(
      makeEntry({
        action: 'CREATE_SALE_V2',
        table_name: 'transactions',
        record_id: 'tx-2',
        metadata: { total_amount: 10, payment_method: 'crypto_coin' },
      })
    );
    expect(p.saleSummary).toBe('Total: $10.00');
  });

  it('REVERSE_TRANSACTION_V2 → "Venta anulada" con intent voided-sale (misma clase que sale_voided)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'REVERSE_TRANSACTION_V2', table_name: 'transactions', record_id: 'tx-v2-9' })
    );
    expect(p.title).toBe('Venta anulada');
    expect(p.document).toEqual({ kind: 'sale', recordId: 'tx-v2-9', intent: 'voided-sale' });
    // Paridad con sale_voided: mismo hecho de negocio → misma severidad.
    expect(p.severity).toBe('warning');
  });

  it('REVERSE_TRANSACTION_V2 con motivo → descripción con datos reales (paridad con sale_voided)', () => {
    const p = getAuditEventPresentation(
      makeEntry({
        action: 'REVERSE_TRANSACTION_V2',
        table_name: 'transactions',
        record_id: 'tx-v2-9',
        metadata: { reason: 'error de caja', units_restored: 3, operation: 'ADMIN_REVERSE' },
      })
    );
    expect(p.description).toContain('Motivo registrado: error de caja');
  });

  it('LA ETIQUETA NO ES EL DISCRIMINADOR: reception_created nunca obtiene venta (advertencia del mandato)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'reception_created', table_name: 'receipts', record_id: 'rc-1' })
    );
    expect(p.document).toBeNull();
  });

  it('acción tipo orden de producción/trabajo/servicio → sin botón documental', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'CREATE_PRODUCTION_ORDER', table_name: 'production_orders', record_id: 'po-1' })
    );
    expect(p.document).toBeNull();
  });

  it('CREATE_SALE_V2 con otra tabla → sin documento (la terna exige transactions)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'CREATE_SALE_V2', table_name: 'production_orders', record_id: 'po-2' })
    );
    expect(p.document).toBeNull();
  });

  it('UPDATE_STATUS sobre transactions → sin documento (cambio de estado, no registro de venta — fuera de alcance)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'UPDATE_STATUS', table_name: 'transactions', record_id: 'tx-3' })
    );
    expect(p.document).toBeNull();
  });

  it('evento con record_id vacío → sin documento (nada que abrir, nada que fabricar)', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'CREATE_SALE_V2', table_name: 'transactions', record_id: '' })
    );
    expect(p.document).toBeNull();
  });
});

describe('getGenericSentence / getActorLabel', () => {
  it('frase genérica honesta cuando no hay descripción', () => {
    const s = getGenericSentence(makeEntry({ action: 'UPDATE_STORE_CONFIG' }));
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('actor: full_name → email → Sistema (jamás "sistema" crudo en UI)', () => {
    expect(getActorLabel(makeEntry({ profiles: { full_name: 'Adrián', email: 'a@x.co' } }))).toBe('Adrián');
    expect(getActorLabel(makeEntry({ profiles: { full_name: null, email: 'a@x.co' } }))).toBe('a@x.co');
    expect(getActorLabel(makeEntry({ profiles: undefined }))).toBe('Sistema');
  });
});

describe('AUDIT_FILTER_OPTIONS — FASE 13 (etiquetas de negocio)', () => {
  it('excluye acciones genéricas de trigger y ofrece etiquetas legibles', () => {
    const values = AUDIT_FILTER_OPTIONS.map(o => o.value);
    expect(values).not.toContain('INSERT');
    expect(values).not.toContain('UPDATE');
    expect(values).toContain('UPDATE_STORE_CONFIG');
    const opt = AUDIT_FILTER_OPTIONS.find(o => o.value === 'UPDATE_STORE_CONFIG');
    expect(opt?.label).toBe('Configuración de tienda actualizada');
  });

  it('todos los títulos de negocio no contienen guiones bajos', () => {
    for (const label of Object.values(AUDIT_EVENT_TITLES)) {
      expect(label).not.toContain('_');
    }
  });

  it('REMEDIACIÓN: "Venta realizada" es UNA opción que cubre V1+V2 (sin etiquetas duplicadas)', () => {
    const labels = AUDIT_FILTER_OPTIONS.map(o => o.label);
    const duplicates = labels.filter((l, i) => labels.indexOf(l) !== i);
    expect(duplicates).toEqual([]);

    const opt = AUDIT_FILTER_OPTIONS.find(o => o.value === 'CREATE_SALE_V2');
    expect(opt?.label).toBe('Venta realizada');
    expect(opt?.actions).toEqual(['CREATE_SALE_V2', 'CREATE_SALE']);
    expect(AUDIT_FILTER_OPTIONS.some(o => o.value === 'CREATE_SALE')).toBe(false);
  });

  it('REMEDIACIÓN: "Venta anulada" agrupa REVERSE_TRANSACTION_V2 + sale_voided', () => {
    const opt = AUDIT_FILTER_OPTIONS.find(o => o.value === 'REVERSE_TRANSACTION_V2');
    expect(opt?.label).toBe('Venta anulada');
    expect(opt?.actions).toEqual(['REVERSE_TRANSACTION_V2', 'sale_voided']);
    expect(AUDIT_FILTER_OPTIONS.some(o => o.value === 'sale_voided')).toBe(false);
  });

  it('resolveAuditFilterActions: opción sin grupo resuelve a su acción única (compatibilidad)', () => {
    const opt = AUDIT_FILTER_OPTIONS.find(o => o.value === 'UPDATE_STORE_CONFIG');
    expect(resolveAuditFilterActions(opt!)).toEqual(['UPDATE_STORE_CONFIG']);
  });
});
