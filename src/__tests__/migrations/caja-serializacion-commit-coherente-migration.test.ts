/**
 * MISIÓN AUTÓNOMA INTEGRAL (2026-10-24) — Verificación estática de la migración
 * 20261026000000_caja_serializacion_commit_coherente.sql (Fase A).
 *
 * Contrato crítico de la serialización commit-coherente del cajón:
 *   - MECANISMO corregido: las lecturas de AUTORIZACIÓN de los writers del
 *     cajón ya no anclan su ventana a now() (= inicio de la transacción del
 *     LECTOR): upper bound 'infinity'::timestamptz en TODOS los agregados que
 *     autorizan salidas de efectivo y en el arqueo congelado. Así la lectura
 *     post-advisory-lock ve TODO lo confirmado (coherente con el orden del
 *     lock) y la carrera sub-2ms (orden de inicio invertido respecto al orden
 *     del lock) queda cerrada estructuralmente.
 *   - Los REPORTES conservan su contrato as-of (get_cash_ledger /
 *     get_cash_report / get_cash_flow_summary sin cambios de ventana).
 *   - TODOS los reducers del cajón bajo el MISMO protocolo: advisory por
 *     tienda ANTES de las lecturas que autorizan la salida:
 *     · register_supplier_payment (ANTES sin lock NI validación física):
 *       advisory + validación física por moneda para efectivo.
 *     · NUEVO register_cash_adjustment (reemplaza el INSERT directo de
 *       /api/cash-report/adjustments): fila idéntica (ref_type='adjustment',
 *       CUP, exchange_rate=1) + lock + validación física para direction='out'
 *       + idempotencia.
 *     · NUEVO pay_commission (reemplaza el UPDATE directo de
 *       /api/commissions/payments/[id] y la rama commission de
 *       /api/accounts-payable/bulk-pay): marca 'paid' bajo lock + validación
 *       física por moneda para efectivo + idempotencia natural +
 *       ERR_PAYMENT_DATE_FUTURE en servidor.
 *   - close_cash_shift / get_cash_shift_expected: ventana de lectura unificada
 *     con el arqueo congelado (upper bound 'infinity').
 *   - Sin DDL de esquema; sin cambios de RLS; ACL preservadas (caja:
 *     service_role; register_supplier_payment/nuevas: authenticated +
 *     service_role — las invoca la app con el cliente de sesión).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261026000000_caja_serializacion_commit_coherente.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

describe('migración 20261026000000 — serialización commit-coherente del cajón', () => {
  it('contiene las 8 funciones y NADA de DDL de esquema', () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.create_cash_flow_document\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_cash_flow_document\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.create_devolution_v2\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.close_cash_shift\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_shift_expected\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.register_supplier_payment\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.register_cash_adjustment\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.pay_commission\(/);
    // Sin cambios de esquema (anti-regresión: solo lógica)
    expect(s).not.toMatch(/\bCREATE TABLE\b/i);
    expect(s).not.toMatch(/\bALTER TABLE\b/i);
    expect(s).not.toMatch(/\bDROP TABLE\b/i);
    expect(s).not.toMatch(/\bCREATE INDEX\b/i);
    expect(s).not.toMatch(/\bCREATE POLICY\b/i);
    expect(s).not.toMatch(/\bDROP POLICY\b/i);
  });

  it('create_cash_flow_document: lecturas de autorización con upper bound infinity', () => {
    const s = sql();
    const start = s.indexOf('CREATE OR REPLACE FUNCTION public.create_cash_flow_document');
    const end = s.indexOf('$function$;', start);
    const body = s.slice(start, end);
    // 7 ventanas de agregado convertidas (created_at ×1, payment_date ×4,
    // paid_at ×1, operation_date del fondo ×1)
    expect((body.match(/<= 'infinity'::timestamptz;/g) || []).length).toBe(7);
    // Las 2 llamadas autoritativas al summary (entrega_efectivo + otro_egreso)
    expect((body.match(/get_cash_currency_summary\(p_store_id, NULL, 'infinity'::timestamptz\)/g) || []).length).toBe(2);
    // SIN ventanas now() en agregados: la validación semántica de fecha
    // (v_op_date > now() — rechaza fechas futuras) y los defaults de fecha
    // SE CONSERVAN; los agregados de turno ya no usan now().
    expect(body).not.toMatch(/created_at > v_shift\.created_at AND created_at <= now\(\);/);
    expect(body).not.toMatch(/payment_date > v_shift\.created_at AND payment_date <= now\(\);/);
    expect(body).not.toMatch(/paid_at > v_shift\.created_at AND paid_at <= now\(\);/);
    expect(body).not.toMatch(/AND operation_date <= now\(\);/);
    // La validación semántica de fecha futura permanece (no es agregado)
    expect(body).toMatch(/v_op_date > now\(\) THEN/);
    // Protocolo: advisory ANTES de las lecturas de saldo
    expect(body).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(p_store_id::text\)\);/);
  });

  it('reverse_cash_flow_document: ventana coherente + validación física intacta', () => {
    const s = sql();
    const start = s.indexOf('CREATE OR REPLACE FUNCTION public.reverse_cash_flow_document');
    const end = s.indexOf('$function$;', start);
    const body = s.slice(start, end);
    expect((body.match(/<= 'infinity'::timestamptz;/g) || []).length).toBe(7);
    expect((body.match(/get_cash_currency_summary\(v_doc\.store_id, NULL, 'infinity'::timestamptz\)/g) || []).length).toBe(1);
    expect(body).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(v_doc\.store_id::text\)\);/);
    // Los stamps del evento de reversión (payment_date de la compensación,
    // annulled_at) SIGEN siendo now() — son hechos, no ventanas de lectura
    expect(body).toMatch(/annulled_at = now\(\)/);
  });

  it('create_devolution_v2: las 3 lecturas físicas con upper bound infinity', () => {
    const s = sql();
    const start = s.indexOf('CREATE OR REPLACE FUNCTION public.create_devolution_v2');
    const end = s.indexOf('$function$;', start);
    const body = s.slice(start, end);
    expect((body.match(/get_cash_currency_summary\(p_store_id, NULL, 'infinity'::timestamptz\)/g) || []).length).toBe(3);
    expect(body).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(p_store_id::text\)\);/);
  });

  it('close_cash_shift: arqueo congelado coherente (11 ventanas + summary USD)', () => {
    const s = sql();
    const start = s.indexOf('CREATE OR REPLACE FUNCTION public.close_cash_shift');
    const end = s.indexOf('$function$;', start);
    const body = s.slice(start, end);
    expect((body.match(/<= 'infinity'::timestamptz;/g) || []).length).toBe(11);
    expect(body).toMatch(/get_cash_currency_summary\(\s*v_closure\.store_id, v_closure\.created_at, 'infinity'::timestamptz\)/);
    expect(body).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(v_closure\.store_id::text\)\);/);
    // El stamp del cierre sigue siendo NOW() (hecho, no ventana)
    expect(body).toMatch(/closed_at = NOW\(\)/);
  });

  it('get_cash_shift_expected: misma ventana que el arqueo congelado (9)', () => {
    const s = sql();
    const start = s.indexOf('CREATE OR REPLACE FUNCTION public.get_cash_shift_expected');
    const end = s.indexOf('$function$;', start);
    const body = s.slice(start, end);
    expect((body.match(/<= 'infinity'::timestamptz;/g) || []).length).toBe(9);
  });

  it('register_supplier_payment: adopta advisory + validación física por moneda', () => {
    const s = sql();
    const start = s.indexOf('CREATE OR REPLACE FUNCTION public.register_supplier_payment');
    const end = s.indexOf('$function$;', start);
    const body = s.slice(start, end);
    // Protocolo: advisory ANTES de la lectura de idempotencia (antes de toda
    // lectura que autorice la salida)
    expect(body).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(p_store_id::text\)\);/);
    const lockPos = body.indexOf('pg_advisory_xact_lock');
    const idemPos = body.indexOf('-- Idempotencia');
    expect(lockPos).toBeLessThan(idemPos);
    // Validación física solo para efectivo, por moneda, fail-closed
    expect(body).toMatch(/IF lower\(trim\(p_payment_method\)\) = 'cash' THEN/);
    expect(body).toMatch(/ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, pago=/);
    expect(body).toMatch(/get_cash_currency_summary\(\s*p_store_id, NULL, 'infinity'::timestamptz\)/);
    // ACL preservada (la app la invoca con el cliente de sesión)
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.register_supplier_payment\(uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz\) TO authenticated, service_role;/);
  });

  it('register_cash_adjustment (NUEVO): fila idéntica al INSERT directo + protocolo', () => {
    const s = sql();
    const start = s.indexOf('CREATE OR REPLACE FUNCTION public.register_cash_adjustment');
    const end = s.indexOf('$function$;', start);
    const body = s.slice(start, end);
    // Fiel a la semántica histórica de /api/cash-report/adjustments
    expect(body).toMatch(/'adjustment'/);
    expect(body).toMatch(/'cash', 'CUP', 1,/);
    // Protocolo del cajón + validación física para direction='out'
    expect(body).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(p_store_id::text\)\);/);
    expect(body).toMatch(/IF lower\(trim\(p_direction\)\) = 'out' THEN/);
    expect(body).toMatch(/ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=%, ajuste=/);
    // Idempotencia por clave (replay devuelve la fila original)
    expect(body).toMatch(/idempotent_replay.*true/s);
    // Gate de fecha canónico
    expect(body).toMatch(/PERFORM public\.validate_operation_date/);
    // Roles: admin, manager o encargado (espejo de la ruta)
    expect(body).toMatch(/ERR_FORBIDDEN_ROLE: ajustes requieren admin, manager o encargado/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.register_cash_adjustment\(uuid, text, numeric, text, timestamptz, text, uuid\) TO authenticated, service_role;/);
  });

  it('pay_commission (NUEVO): marca paid bajo protocolo del cajón', () => {
    const s = sql();
    const start = s.indexOf('CREATE OR REPLACE FUNCTION public.pay_commission');
    const end = s.indexOf('$function$;', start);
    const body = s.slice(start, end);
    // Protocolo + validación física por moneda para efectivo
    expect(body).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(v_comm\.store_id::text\)\);/);
    expect(body).toMatch(/ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, comisión=/);
    expect(body).toMatch(/get_cash_currency_summary\(\s*v_comm\.store_id, NULL, 'infinity'::timestamptz\)/);
    // Idempotencia natural (ya pagada → replay con mensaje de la ruta)
    expect(body).toMatch(/La comisión ya estaba pagada/);
    // Estados válidos: approved|draft (semántica de la ruta)
    expect(body).toMatch(/v_comm\.status NOT IN \('approved', 'draft'\)/);
    // Fecha del pago nunca futura — regla 1 del negocio VALIDADA EN SERVIDOR
    expect(body).toMatch(/ERR_PAYMENT_DATE_FUTURE/);
    // Roles admin/manager (la ruta individual exige lo mismo)
    expect(body).toMatch(/ERR_FORBIDDEN_ROLE: pagar comisiones requiere admin o manager/);
    // Concurrencia de estado: ERR_COMMISSION_STATE_CHANGED fail-closed
    expect(body).toMatch(/ERR_COMMISSION_STATE_CHANGED/);
    // p_currency/p_exchange_rate preservan la semántica de la ruta
    expect(body).toMatch(/currency = COALESCE\(upper\(btrim\(p_currency\)\), currency\)/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.pay_commission\(uuid, text, text, text, numeric, timestamptz, uuid\) TO authenticated, service_role;/);
  });

  it('los REPORTES conservan su contrato as-of (sin infinity en la migración)', () => {
    const s = sql();
    // La migración NO toca get_cash_ledger / get_cash_report /
    // get_cash_flow_summary (reportes as-of, sin cambios de ventana)
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_ledger\(/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_report\(/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_flow_summary\(/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_devolution\(/);
    expect(s).not.toMatch(/CREATE OR REPLACE FUNCTION public\.validate_payment_transactions_invariants\(/);
  });

  it('BEGIN/COMMIT explícitos y comentario de causa raíz documentado', () => {
    const s = sql();
    expect(s).toMatch(/^BEGIN;$/m);
    expect(s).toMatch(/^COMMIT;$/m);
    // El mecanismo (ventana <= now() anclada al inicio de la transacción del
    // lector) debe quedar documentado en la propia migración
    expect(s).toMatch(/now\(\) es el INICIO DE LA TRANSACCIÓN DEL LECTOR/);
  });
});
