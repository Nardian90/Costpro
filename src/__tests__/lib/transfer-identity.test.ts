/**
 * transfer-identity.test.ts — MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-
 * VALIDATION-001 (FASE 2). Función pura compartida por /api/pos/checkout
 * (422) y testeable sin I/O. La misma regla vive en create_sale_v2
 * (ERR_TRANSFER_IDENTITY_REQUIRED).
 *
 * Contrato clave:
 *  · canal canónico = filas por línea (items[].payments) o componentes
 *    (payment_components); los pools SOLOS NO activan la puerta (el flujo
 *    legado del Catálogo sin filas ni componentes no se toca).
 *  · los 4 datos: N.º por fila de transferencia + nombre + CI + teléfono.
 *  · espacios como único contenido = vacío.
 *  · sin transferencia NUNCA se exige nada personal.
 */
import { describe, it, expect } from 'vitest';
import {
  saleIncludesTransferChannel,
  missingTransferIdentityFields,
  missingTransferRowReferences,
} from '@/lib/pos/transfer-identity';

const base = {
  items: [] as unknown[],
  payment_components: undefined,
  transfer_amount: 0,
  external_transfer_amount: 0,
  zelle_amount: 0,
  customer_name: null,
  customer_ci: null,
  customer_phone: null,
};

function transferRow(amount = 500, reference?: string) {
  return { method: 'transfer', currency: 'CUP', amount, ...(reference !== undefined ? { reference } : {}) };
}

describe('saleIncludesTransferChannel — detección del canal canónico', () => {
  it('fila de transferencia con monto > 0 → hasTransfer', () => {
    const d = { ...base, items: [{ payments: [transferRow(500, 'TR-1')] }] };
    expect(saleIncludesTransferChannel(d).hasTransfer).toBe(true);
  });

  it('fila de transferencia con monto 0 → NO cuenta', () => {
    const d = { ...base, items: [{ payments: [transferRow(0, 'TR-1')] }] };
    expect(saleIncludesTransferChannel(d).hasTransfer).toBe(false);
  });

  it("fila heredada 'zelle' con monto > 0 → cuenta (normalización canónica)", () => {
    const d = { ...base, items: [{ payments: [{ method: 'zelle', currency: 'USD', amount: 10 }] }] };
    expect(saleIncludesTransferChannel(d).hasTransfer).toBe(true);
  });

  it('external_transfer (Transf. Exterior) → cuenta', () => {
    const d = { ...base, items: [{ payments: [{ method: 'external_transfer', currency: 'USD', amount: 20 }] }] };
    expect(saleIncludesTransferChannel(d).hasTransfer).toBe(true);
  });

  it('componente de transferencia → cuenta aunque no haya filas', () => {
    const d = { ...base, payment_components: [{ method: 'transfer' }, { method: 'cash' }] };
    expect(saleIncludesTransferChannel(d).hasTransfer).toBe(true);
  });

  it('pools de transferencia > 0 SIN filas ni componentes → NO activa la puerta (flujo legado del Catálogo)', () => {
    const d = { ...base, transfer_amount: 500 };
    expect(saleIncludesTransferChannel(d).hasTransfer).toBe(false);
    const d2 = { ...base, zelle_amount: 20 };
    expect(saleIncludesTransferChannel(d2).hasTransfer).toBe(false);
  });

  it('pools > 0 CON filas por línea declaradas → activa (defensa venta mixta)', () => {
    const d = {
      ...base,
      transfer_amount: 500,
      items: [{ payments: [{ method: 'cash', currency: 'CUP', amount: 100 }] }],
    };
    expect(saleIncludesTransferChannel(d).hasTransfer).toBe(true);
  });

  it('venta en efectivo puro → sin transferencia', () => {
    const d = { ...base, items: [{ payments: [{ method: 'cash', currency: 'CUP', amount: 500 }] }] };
    const r = saleIncludesTransferChannel(d);
    expect(r.hasTransfer).toBe(false);
    expect(r.declaresPerItemPayments).toBe(true);
  });

  it('payload sin items ni componentes → sin transferencia (robusto a null)', () => {
    expect(saleIncludesTransferChannel(base).hasTransfer).toBe(false);
    expect(saleIncludesTransferChannel({ ...base, items: null, payment_components: null }).hasTransfer).toBe(false);
  });
});

describe('missingTransferIdentityFields — los tres datos del pagador', () => {
  it('todo vacío → faltan los tres, en orden nombre/CI/teléfono', () => {
    expect(missingTransferIdentityFields(base)).toEqual(['nombre', 'carné de identidad', 'teléfono']);
  });

  it('completos → sin faltantes', () => {
    const d = { ...base, customer_name: 'Ana Pérez', customer_ci: '92031112345', customer_phone: '+53 51234567' };
    expect(missingTransferIdentityFields(d)).toEqual([]);
  });

  it('espacios como único contenido cuentan como vacío (cada campo individualmente)', () => {
    expect(missingTransferIdentityFields({ ...base, customer_name: '   ', customer_ci: '92031112345', customer_phone: '+5351234567' })).toEqual(['nombre']);
    expect(missingTransferIdentityFields({ ...base, customer_name: 'Ana', customer_ci: '  ', customer_phone: '+5351234567' })).toEqual(['carné de identidad']);
    expect(missingTransferIdentityFields({ ...base, customer_name: 'Ana', customer_ci: '92031112345', customer_phone: ' ' })).toEqual(['teléfono']);
  });

  it('sin transferencia el helper no se invoca, pero es inofensivo igualmente', () => {
    // documento el contrato: el helper no mira si hay transferencia — la
    // llamada está condicionada por saleIncludesTransferChannel en la ruta/RPC
    expect(missingTransferIdentityFields(base).length).toBe(3);
  });
});

describe('missingTransferRowReferences — N.º de operación por fila', () => {
  it('fila de transferencia sin referencia → true', () => {
    const d = { ...base, items: [{ payments: [transferRow(500)] }] };
    expect(missingTransferRowReferences(d)).toBe(true);
  });

  it('fila con referencia (aunque sean espacios) → espacios cuentan como vacío', () => {
    const d = { ...base, items: [{ payments: [transferRow(500, '   ')] }] };
    expect(missingTransferRowReferences(d)).toBe(true);
  });

  it('fila con referencia completa → false', () => {
    const d = { ...base, items: [{ payments: [transferRow(500, 'TR-0451-BCC')] }] };
    expect(missingTransferRowReferences(d)).toBe(false);
  });

  it('filas de efectivo sin referencia → false (la referencia solo en transferencias)', () => {
    const d = { ...base, items: [{ payments: [{ method: 'cash', currency: 'CUP', amount: 500 }] }] };
    expect(missingTransferRowReferences(d)).toBe(false);
  });
});
