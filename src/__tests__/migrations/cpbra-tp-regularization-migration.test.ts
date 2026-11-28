/**
 * FASE 4 — Tienda Pueblo: contrato de la migración
 * 20261127160000_cpbra_tienda_pueblo_receipts.sql (estático, sin BD).
 *
 * Misión CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §0.3/§6:
 * regularización gobernada de las 3 recepciones históricas al proveedor
 * Tienda Pueblo — fuente OWNER_CONFIRMATION (decisión vinculante del
 * propietario). Corrección SOLO del campo textual supplier; intactos
 * importes, fechas, kardex, pagos y estados. Guards fail-closed con
 * detención automática; replay-safe; idempotente; auditable y reversible.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TP = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20261127160000_cpbra_tienda_pueblo_receipts.sql'), 'utf8'
);

const stripComments = (s: string): string => s.replace(/--[^\n]*/g, '');
const CODE = stripComments(TP);

describe('CP-BRA FASE 4 — 20261127160000_cpbra_tienda_pueblo_receipts.sql', () => {
  it('1. migración transaccional (BEGIN/COMMIT) con lista CERRADA de exactamente 3 IDs', () => {
    expect(TP).toMatch(/^BEGIN;/m);
    expect(TP).toMatch(/\nCOMMIT;/);
    expect(CODE).toContain("'0b026405-d090-46cc-9d68-60ff7cca3783'");
    expect(CODE).toContain("'79ffb3a9-9aa5-4258-b845-78049e06d814'");
    expect(CODE).toContain("'e564adca-c9b9-479b-bdbe-146033712085'");
    // Importes esperados EXACTOS en el mismo orden
    expect(CODE).toContain('ARRAY[19200.00, 35.00, 200.00]');
    expect(CODE).toContain("ARRAY['—', '0000', '0002']");
  });

  it('2. replay-safe: entorno sin la excepción (0 de 3) → no-op idempotente, sin abortar el replay', () => {
    expect(CODE).toContain('la excepción histórica no existe en este entorno');
    expect(CODE).toContain('RETURN;');
  });

  it('3. guards fail-closed: precondiciones EXACTAS por ID y estado parcial → detención automática', () => {
    expect(CODE).toContain("v_r.status <> 'active'");
    expect(CODE).toContain('v_r.total_cost <> v_totals[v_i]');
    expect(CODE).toContain('TP-GUARD-G1: precondición alterada');
    expect(CODE).toContain('TP-GUARD-G1b: estado PARCIAL');
  });

  it('4. cero pagos sobre las recepciones (G2) y proveedor canónico ÚNICO (G3) — sin inventar alta ni asociación arbitraria', () => {
    expect(CODE).toContain('TP-GUARD-G2: hay');
    expect(CODE).toContain("lower(regexp_replace(btrim(name), '\\s', '', 'g')) = 'tiendapueblo'");
    expect(CODE).toContain('TP-GUARD-G3: no existe proveedor canónico');
    expect(CODE).toContain('TP-GUARD-G3b: hay');
  });

  it('5. la corrección toca SOLO el campo supplier (identidad) — importes/fechas/kardex/pagos intactos', () => {
    const m = CODE.match(/UPDATE public\.receipts[\s\S]*?;/);
    expect(m).toBeTruthy();
    const update = m![0];
    expect(update).toContain('supplier = v_canon_name');
    expect(update).toContain('updated_at = now()');
    // Solo el SET (el WHERE tiene status = 'active' como precondición legítima)
    const setClause = update.slice(update.indexOf('SET'), update.indexOf('WHERE'));
    expect(setClause).toContain('supplier = v_canon_name');
    expect(setClause).toContain('updated_at = now()');
    expect(setClause).not.toMatch(/total_cost\s*=/);
    expect(setClause).not.toMatch(/reception_date\s*=/);
    expect(setClause).not.toMatch(/payment_status\s*=/);
    expect(setClause).not.toMatch(/status\s*=/);
  });

  it('6. VERIFY atómico: exactamente 3 filas corregidas o rollback', () => {
    expect(CODE).toContain('TP-VERIFY: se corrigieron');
    expect(CODE).toContain('GET DIAGNOSTICS v_rows = ROW_COUNT');
    expect(CODE).toContain('IF v_rows <> 3 THEN');
  });

  it('7. auditoría OWNER_CONFIRMATION por recepción — sin datos inventados y con rollback_hint', () => {
    expect(CODE).toContain("'RECEIPT_SUPPLIER_REGULARIZED'");
    expect(CODE).toContain("'OWNER_CONFIRMATION'");
    expect(CODE).toContain('LAS TRES RECEPCIONES PERTENECEN AL PROVEEDOR TIENDA PUEBLO');
    expect(CODE).toContain('AUSENTE — sin factura/NIT/teléfono/dirección/documento');
    expect(CODE).toContain("'reversible', true");
    expect(CODE).toContain("rollback_hint");
    expect(CODE).toContain("'supplier_before', '—'");
    expect(CODE).toContain("'supplier_after', v_canon_name");
    expect(CODE).toContain('SR_SUPPLIER_NORMALIZED');
  });

  it('8. sin borrado ni recreación de recepciones ni pagos nuevos', () => {
    expect(CODE).not.toMatch(/DELETE\s+FROM\s+public\.receipts/i);
    expect(CODE).not.toMatch(/INSERT\s+INTO\s+public\.receipts/i);
    expect(CODE).not.toMatch(/INSERT\s+INTO\s+public\.payment_transactions/i);
    expect(CODE).not.toMatch(/UPDATE\s+public\.payment_transactions/i);
    // La única escritura de auditoría es audit_logs
    expect(CODE).toMatch(/INSERT INTO public\.audit_logs/);
  });

  it('9. sin secretos en el SQL', () => {
    const patterns = [
      'github' + '_pat_',
      'sb_' + 'secret_',
      'sbp_',
      'sb_' + 'publishable_',
      'eyJ' + 'hbGciOi',
    ];
    for (const p of patterns) expect(TP).not.toContain(p);
  });

  it('10. el manifiesto replay incluye la migración (posición 224 tras integrar PC/main; baseline 224)', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'audit-evidence', 'INFRA-011', 'e2e-migrations-manifest.json'), 'utf8')
    );
    // COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001: el stream creció
    // a 226 con 20261128120000 (+1 R-06 de main) (create_sale_v2 /36, transfer identity).
    expect(manifest.total_incluidos).toBe(233); // CP-FIN-REM-001 PR-A (rebase sobre main 44b2ff27b): 227 incluidos en main (CP-FX-001 incluida) + 6 del PR (F2/F3/F4/F5/TR, 20261128153000-153500) → stream 233
    const entry = manifest.archivos.find((a: { nombre: string }) => a.nombre === '20261127160000_cpbra_tienda_pueblo_receipts.sql');
    expect(entry).toBeDefined();
    expect(entry.estado).toBe('incluido');
    expect(entry.sha256_original).toBe(entry.sha256_generado);
  });
});
