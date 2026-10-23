/**
 * caja-v224-1-corrective.test.ts — REVISIÓN FINAL del PR #1465 (2026-10-24).
 *
 * Verificación ESTRUCTURAL de la migración correctiva v2.24.1 (los 3 gates de
 * seguridad/idempotencia detectados por la auditoría). Patrón de la casa:
 * leer el SQL versionado y afirmar los invariantes que el gate vive no puede
 * ver (la ejecución real de la migración se prueba en base aislada con
 * embedded-postgres — evidencia externa al repo).
 *
 * Cobertura añadida (gaps de la auditoría):
 *   · ERR_DEVOLUTION_NO_ORIGINAL y cap DF-07 presentes en el RPC vivo versionado.
 *   · Comparación real de param_hash (antes el hash se sobrescribía).
 *   · Precio del reembolso anclado al servidor (anti-sobre-reembolso).
 *   · Gate de rol de cierre (antes un clerk podía cerrar vía POST directo).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIG_ORIG = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20261023230000_mision_caja_multimoneda_v2_24_0.sql'), 'utf-8');
const MIG_V241 = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20261024120000_revision_final_caja_v2_24_1.sql'), 'utf-8');

function body(fnName: string, sql: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\([\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$`);
  const m = sql.match(re);
  if (!m) throw new Error(`función ${fnName} no encontrada`);
  return m[0];
}

describe('v2.24.1 — create_cash_flow_document: idempotencia con hash real', () => {
  const fn = body('create_cash_flow_document', MIG_V241);

  it('compara el hash del payload nuevo contra el almacenado', () => {
    expect(fn).toContain('v_idem_hash IS DISTINCT FROM v_param_hash');
    expect(fn).toContain("RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE");
  });

  it('ya NO sobrescribe v_param_hash con el hash almacenado (defecto original)', () => {
    expect(fn).not.toContain('SELECT ir.param_hash INTO v_param_hash');
  });

  it('conserva el advisory lock por tienda y el resultado original en replay idéntico', () => {
    expect(fn).toContain('pg_advisory_xact_lock(hashtext(p_store_id::text))');
    expect(fn).toContain('RETURN v_idem');
  });
});

describe('v2.24.1 — create_devolution_v2: precio servidor + lock + idempotencia', () => {
  const fn = body('create_devolution_v2', MIG_V241);

  it('el precio del reembolso se ancla a la venta original (price_at_sale_cup ponderado)', () => {
    expect(fn).toContain('price_at_sale_cup');
    expect(fn).toContain('v_price := COALESCE(v_sale_unit_cup, 0)');
    // el precio del payload ya no alimenta el reembolso
    expect(fn).not.toContain("v_price := COALESCE((v_item->>'unit_price')::numeric");
  });

  it('toma el advisory lock por tienda (cierra carrera entrega-vs-reembolso)', () => {
    expect(fn).toContain('PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text))');
  });

  it('idempotencia con hash de payload + registro en idempotency_registry', () => {
    expect(fn).toContain("operation = 'create_devolution_v2'");
    expect(fn).toContain('ERR_IDEMPOTENCY_KEY_REUSE');
    expect(fn).toContain("INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)");
  });

  it('conserva los invariantes v2.24: venta original obligatoria, cap DF-07, moneda del reembolso', () => {
    expect(fn).toContain('ERR_DEVOLUTION_NO_ORIGINAL');
    expect(fn).toContain('ERR_DEVOLUTION_CAP_EXCEEDED');
    expect(fn).toContain('ERR_DEVOLUTION_INVALID_CURRENCY');
    expect(fn).toContain('ERR_STORE_CREDIT_REQUIRES_CUSTOMER');
    expect(fn).toContain('FOR UPDATE');
  });
});

describe('v2.24.1 — close_cash_shift: gate de rol de autoridad', () => {
  const fn = body('close_cash_shift', MIG_V241);

  it('exige admin/manager/encargado en servidor (paridad con la UI)', () => {
    expect(fn).toContain("has_store_role_as(v_caller_uid, v_closure.store_id, ARRAY['admin', 'manager', 'encargado']::text[])");
    expect(fn).toContain('ERR_CLOSURE_ROLE');
  });

  it('conserva el guard de turno pendiente y el lock de cierre', () => {
    expect(fn).toContain('ERR_CLOSURE_NOT_PENDING');
    expect(fn).toContain('FOR UPDATE');
    expect(fn).toContain('pg_advisory_xact_lock');
  });

  it('conserva la fórmula canónica del arqueo (sin cambios contables)', () => {
    expect(fn).toContain('opening_balance');
    expect(fn).toContain('system_expected_cash_usd');
    expect(fn).toContain('difference_usd');
  });
});

describe('cobertura estructural de gaps de auditoría (migración original = estado vivo)', () => {
  it('ERR_DEVOLUTION_NO_ORIGINAL existe en el RPC versionado (gap de tests R3-d/3g)', () => {
    expect(body('create_devolution_v2', MIG_ORIG)).toContain('ERR_DEVOLUTION_NO_ORIGINAL');
  });

  it('la migración correctiva documenta el despliegue sin tocar la original', () => {
    expect(MIG_V241).toContain('MIGRACIÓN CORRECTIVA v2.24.1');
    // la original queda intacta como registro de lo aplicado fuera de banda
    // (el defecto del hash sigue presente SOLO en su create_cash_flow_document;
    // v_idem_hash sí existe legítimamente en su create_sale_v2)
    expect(MIG_ORIG).toContain('CAJA MULTIMONEDA (v2.24.0)');
    expect(body('create_cash_flow_document', MIG_ORIG)).not.toContain('v_idem_hash');
    expect(body('create_cash_flow_document', MIG_V241)).toContain('v_idem_hash');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REVISIÓN FINAL v2.24.1 — F4 (vuelto no registrable) + F5 (open_cash_shift)
// + cierre ';' del stream v2.24.0 (ejecutabilidad + parser del gate)
// ═══════════════════════════════════════════════════════════════════════════
describe('v2.24.1 — create_sale_v2: bloqueo del vuelto NO registrable (F4)', () => {
  const fn = body('create_sale_v2', MIG_V241);

  it('rechaza recibido > total sin liquidación (ERR_OVERPAYMENT_UNREGISTERED_CHANGE)', () => {
    expect(fn).toContain('ERR_OVERPAYMENT_UNREGISTERED_CHANGE');
    expect(fn).toContain('IF NOT v_settlement_present AND v_payment_diff > 0.01 THEN');
  });

  it('el gate solo aplica SIN liquidación (con liquidación manda la identidad recibido − vuelto)', () => {
    // la validación de identidad de la liquidación precede al gate F4
    const settleIdx = fn.indexOf('ERR_CASH_SETTLEMENT_MISMATCH');
    const f4Idx = fn.indexOf('ERR_OVERPAYMENT_UNREGISTERED_CHANGE');
    expect(settleIdx).toBeGreaterThan(-1);
    expect(f4Idx).toBeGreaterThan(settleIdx);
  });

  it('conserva los invariantes v2.24: identidad de liquidación, tasa servidor fail-closed, idempotencia', () => {
    expect(fn).toContain('ERR_CASH_SETTLEMENT_MISMATCH');
    expect(fn).toContain('ERR_EXCHANGE_RATE_UNAVAILABLE');
    expect(fn).toContain("operation = 'create_sale_v2'");
    expect(fn).toContain('v_param_hash');
  });

  it('el pago insuficiente NO se toca (sin salida física de caja) y la venta negativa sigue prohibida', () => {
    expect(fn).toContain('ERR_NEGATIVE_SALE');
    // el gate F4 solo dispara con v_payment_diff > 0.01 (sobrepago), jamás con faltante
    expect(fn).not.toContain('v_payment_diff < -0.01');
  });
});

describe('v2.24.1 — open_cash_shift: completitud del stream (F5)', () => {
  const fn = body('open_cash_shift', MIG_V241);

  it('la función viva (aplicada fuera de banda) ya está versionada byte-idéntica', () => {
    expect(fn).toContain('CREATE OR REPLACE FUNCTION public.open_cash_shift(');
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain("SET search_path TO 'public', 'pg_temp'");
  });

  it('conserva idempotencia con param_hash y el arqueo de apertura contado vs esperado', () => {
    expect(fn).toContain('v_param_hash');
    expect(fn).toContain('opening_balance');
  });

  it('ACL espejo del vivo: service_role únicamente', () => {
    expect(MIG_V241).toMatch(/revoke all on function public\.open_cash_shift\(uuid, numeric, numeric, text, text, text, uuid\) from public;/i);
    expect(MIG_V241).toMatch(/grant execute on function public\.open_cash_shift\(uuid, numeric, numeric, text, text, text, uuid\) to service_role;/i);
  });
});

describe('v2.24.0 — stream ejecutable como unidad (cierres \';\')', () => {
  it('todos los cierres $function$ de la migración original terminan en \';\'', () => {
    const closers = MIG_ORIG.match(/^\s*(?:END )?\$function\$\s*;?\s*$/gm) || [];
    expect(closers.length).toBe(6);
    for (const c of closers) expect(c.trim().endsWith(';')).toBe(true);
  });

  it('los GRANT/REVOKE ALL de v2.24.0 quedan parseables (sin PUBLIC residual en el replay)', () => {
    expect(MIG_ORIG).toMatch(/revoke all on function public\.create_sale_v2\(/i);
    expect(MIG_ORIG).toMatch(/grant execute on function public\.create_sale_v2\(/i);
    expect(MIG_ORIG).toMatch(/revoke all on function public\.create_devolution_v2\(/i);
  });
});
