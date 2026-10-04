/**
 * eventPresentation — tests de la capa de traducción auditoría → negocio.
 *
 * DASHBOARD V3 (feat/dashboard-v3-audit-ux):
 *   - Títulos de negocio para acciones conocidas (UPDATE_STORE_CONFIG ya NO
 *     se muestra como código crudo — Criterio B).
 *   - Veracidad (Criterio C): descripciones SOLO con datos reales; sin datos
 *     → sin descripción (el modal usa frase genérica honesta).
 *   - Whitelist de documentos: SOLO sale_voided tiene documento asociado
 *     inequívoco; jamás se fabrica una relación (FASE 11).
 *   - Fallback humanizado para acciones desconocidas (traducción literal,
 *     el código original queda en trazabilidad interna).
 */

import { describe, it, expect } from 'vitest';
import {
  getAuditEventPresentation,
  getGenericSentence,
  getActorLabel,
  AUDIT_FILTER_OPTIONS,
  AUDIT_EVENT_TITLES,
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
  it('sale_voided con table_name transactions → documento de venta con record_id real', () => {
    const p = getAuditEventPresentation(
      makeEntry({ action: 'sale_voided', table_name: 'transactions', record_id: 'tx-99' })
    );
    expect(p.document).toEqual({ kind: 'sale', recordId: 'tx-99' });
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
});
