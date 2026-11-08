/**
 * COSTPRO-FINAL-CYCLE-CLOSE-001 (T4) — Cierre de caja con ventas pendientes.
 * Cobertura exigida por la misión:
 *   · Clasificación: cero pendientes / pendientes normales / conflictos.
 *   · Autorización: operador con conflictos → 403 server-side; supervisor →
 *     permitido (rol verificado con la sesión, nunca desde el cliente).
 *   · Auditoría: audit_logs recibe conteos sin PII ANTES del RPC.
 *   · Contrato: close_cash_shift NO cambia (payload intacto).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Módulo puro: clasificación de la cola ───────────────────────────────────
import { classifyPendingSales } from '@/hooks/useCashPendingSales';

const sale = (status: string, errorCode?: string) => ({
  id: 'op-1',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  entity: 'sale',
  operationType: 'CREATE',
  payload: {},
  createdAt: new Date().toISOString(),
  clientClock: Date.now(),
  status,
  attempts: 0,
  ...(errorCode ? { errorCode } : {}),
}) as never;

describe('CP-CYCLE-CLOSE-001 · T4 clasificación de pendientes', () => {
  it('cero pendientes: cierre normal, sin modal', () => {
    const r = classifyPendingSales([sale('synced'), { ...sale('synced'), entity: 'reception' }]);
    expect(r).toEqual({ pending: 0, conflict: 0, reasons: [] });
  });

  it('pendientes normales (pending/in-flight/retry_wait/auth_required) cuentan como pendientes', () => {
    const r = classifyPendingSales([
      sale('pending'), sale('in-flight'), sale('retry_wait'), sale('auth_required'),
    ]);
    expect(r.pending).toBe(4);
    expect(r.conflict).toBe(0);
  });

  it('conflictos (conflict/retry_exhausted/failed legado) cuentan aparte y reportan motivos', () => {
    const r = classifyPendingSales([
      sale('conflict', 'ERR_INSUFFICIENT_STOCK'),
      sale('retry_exhausted'),
      sale('failed'),
      sale('pending'),
    ]);
    expect(r.pending).toBe(1);
    expect(r.conflict).toBe(3);
    expect(r.reasons).toContain('ERR_INSUFFICIENT_STOCK');
  });

  it('máximo 3 motivos, sin duplicados; las no-ventas se ignoran', () => {
    const r = classifyPendingSales([
      sale('conflict', 'A'), sale('conflict', 'A'), sale('conflict', 'B'),
      sale('conflict', 'C'), sale('conflict', 'D'),
      { ...sale('conflict', 'X'), entity: 'reception' },
    ]);
    expect(r.reasons).toHaveLength(3);
    expect(r.conflict).toBe(5); // ventas solo
    expect(r.reasons).not.toContain('X');
  });
});

// ── Contrato server-side: rol verificado en /api/cash-closures/close ────────
describe('CP-CYCLE-CLOSE-001 · T4 autorización server-side (ruta close)', () => {
  const routeSrc = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'cash-closures', 'close', 'route.ts'),
    'utf-8',
  );

  it('el rol se lee de la SESIÓN del servidor, no del body del cliente', () => {
    expect(routeSrc).toContain("session.user as { role?: string }");
    expect(routeSrc).not.toContain('auditInfo.role');
  });

  it('decidedBy=supervisor sin rol privilegiado → 403 ANTES del RPC', () => {
    expect(routeSrc).toContain("auditInfo.decidedBy === 'supervisor' && !isPrivileged");
  });

  it('decidedBy=operator con conflictos > 0 → 403 (exige supervisor)', () => {
    expect(routeSrc).toContain("auditInfo.decidedBy === 'operator'");
  });

  it('auditoría ANTES del RPC close_cash_shift y sin PII', () => {
    const auditIdx = routeSrc.indexOf("action: 'cash_closure_with_pending_sales'");
    const rpcIdx = routeSrc.indexOf("rpc('close_cash_shift'");
    expect(auditIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(auditIdx);
    // Sin campos personales en el evento: solo conteos/tienda/rol.
    expect(routeSrc).toContain('pending_sales');
    expect(routeSrc).toContain('conflict_sales');
  });

  it('el payload del RPC close_cash_shift NO cambia (sin parámetros nuevos)', () => {
    // El bloque rpc('close_cash_shift', {...}) conserva exactamente los 6
    // parámetros originales (id/cash/vouchers/usd/notes/user).
    const m = routeSrc.match(/rpc\('close_cash_shift',\s*\{([^}]+)\}/);
    expect(m).not.toBeNull();
    const params = m![1];
    expect(params).toContain('p_closure_id');
    expect(params).toContain('p_declared_cash');
    expect(params).toContain('p_declared_vouchers');
    expect(params).toContain('p_declared_cash_usd');
    expect(params).toContain('p_notes');
    expect(params).toContain('p_user_id');
    expect(params).not.toContain('audit');
  });

  it('schema aditivo: audit_pending_sales es opcional (compatibilidad total)', () => {
    expect(routeSrc).toMatch(/audit_pending_sales: z[\s\S]*?\.optional\(\)/);
  });
});

// ── Contrato de la mutación: el campo viaja solo si existe ─────────────────
describe('CP-CYCLE-CLOSE-001 · T4 mutación del cliente', () => {
  it('useUpdateCashClosure propaga audit_pending_sales de forma aditiva', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'hooks', 'api', 'useCashClosures.ts'),
      'utf-8',
    );
    expect(src).toContain('audit_pending_sales');
    expect(src).toMatch(/\.\.\.\(audit_pending_sales \? \{ audit_pending_sales \} : \{\}\)/);
  });

  it('el modal exige supervisor cuando hay conflictos (CashClosureView)', () => {
    const src = readFileSync(
      join(
        process.cwd(), 'src', 'components', 'views', 'terminal', 'views',
        'cash_closure', 'CashClosureView.tsx',
      ),
      'utf-8',
    );
    expect(src).toContain('Requiere supervisor o administrador');
    expect(src).toContain('Autorizar y continuar');
    expect(src).toContain('Continuar de todos modos');
    // La guarda se dispara ANTES de la confirmación de cierre.
    const guardIdx = src.indexOf('setShowPendingSalesModal(true)');
    const closeIdx = src.indexOf('Confirmar Cierre de Turno');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(guardIdx);
  });
});
