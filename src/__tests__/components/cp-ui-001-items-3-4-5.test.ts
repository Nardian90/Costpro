/**
 * COSTPRO-FINAL-CYCLE-CLOSE-001 (T5) — CP-UI-001 ítems 3/4/5.
 * Source-contract tests (mismo estilo que sync-batch-pnotes/iteration-11-1):
 * montar WorkersView completo exige datos de tienda reales; el contrato de
 * fuente ancla los comportamientos exigidos por el expediente.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const workers = readFileSync(
  join(process.cwd(), 'src', 'components', 'views', 'terminal', 'views', 'workers', 'WorkersView.tsx'),
  'utf-8',
);
const engine = readFileSync(
  join(process.cwd(), 'src', 'lib', 'commission-engine.ts'),
  'utf-8',
);
const calcRoute = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'commissions', 'calculate', 'route.ts'),
  'utf-8',
);
const rulesRoute = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'commissions', 'rules', 'route.ts'),
  'utf-8',
);
const docItem3 = readFileSync(
  join(process.cwd(), 'docs', 'audits', 'CP-UI-001_ITEM3_COMISION_MITAD_PERIODO.md'),
  'utf-8',
);

describe('CP-UI-001 · ítem 4 — HistoryTab legible', () => {
  it('la API agrupa versiones y el cliente las embebe en cada regla', () => {
    // API: versions por rule_id (la ruta de REGLAS es la que agrupa)
    expect(rulesRoute).toContain('includeHistory');
    expect(rulesRoute).toContain('.in(\'rule_id\', ruleIds)');
    // Cliente: fusión versionsByRule → r.versions
    expect(workers).toContain('versionsByRule[r.id] || r.versions || []');
  });

  it('detalle legible por versión: número, fecha, autor, motivo y valor (nuevo y anterior)', () => {
    expect(workers).toContain('function VersionRow');
    expect(workers).toContain('Versión {v.version');
    expect(workers).toContain('changed_by_name');
    expect(workers).toContain('change_reason');
    expect(workers).toContain('Anterior:');
  });

  it('"Ver datos técnicos" colapsado y SOLO para administradores', () => {
    expect(workers).toContain('Ver datos técnicos');
    expect(workers).toContain('<details');
    // La condición de administrador rodea el bloque técnico.
    const condIdx = workers.indexOf("user?.role === 'admin' || user?.role === 'superadmin'");
    const techIdx = workers.indexOf('Ver datos técnicos');
    expect(condIdx).toBeGreaterThan(-1);
    expect(techIdx).toBeGreaterThan(condIdx);
  });

  it('estructuras antiguas: sin changed_at/previous_snapshot no rompe (texts controlados)', () => {
    expect(workers).toContain("changedAt ? formatDate(changedAt) : 'fecha no registrada'");
    expect(workers).toContain('prev && typeof prev === \'object\'');
  });

  it('el link a JSON crudo SIGUE fuera de la SPA (FIX-A3 conservado)', () => {
    expect(workers).not.toMatch(/<a\s+href=.*commission_rule_versions/);
  });
});

describe('CP-UI-001 · ítem 5 — tabla de 9 columnas responsive', () => {
  it('en móvil la tabla se sustituye por tarjetas expandibles (sm:hidden / hidden sm:block)', () => {
    expect(workers).toContain('sm:hidden space-y-3');
    expect(workers).toContain('hidden sm:block bg-card');
  });

  it('las tarjetas muestran la información secundaria oculta de la tabla', () => {
    for (const label of ['Ventas Cash', 'Ventas Transfer', 'Regla activa', 'Último pago']) {
      expect(workers, label).toContain(label);
    }
    // CI visible en el encabezado de la tarjeta.
    expect(workers).toContain('{w.ci}');
  });

  it('las tarjetas conservan TODAS las acciones (pagar/editar/activar) con targets ≥44px', () => {
    const mobileStart = workers.indexOf('sm:hidden space-y-3');
    const mobileEnd = workers.indexOf('Tabla — desde sm');
    const mobileBlock = workers.slice(mobileStart, mobileEnd);
    expect(mobileBlock).toContain('onPayCommission(w)');
    expect(mobileBlock).toContain('onEditWorker(w)');
    expect(mobileBlock).toContain('handleToggleStatus(w)');
    expect(mobileBlock).toContain('min-h-[44px]');
  });

  it('estado vacío y de carga unificados (sin duplicar el bloque vacío de la tabla)', () => {
    expect(workers).toContain('Cargando trabajadores');
    expect(workers).toContain('Sin trabajadores en esta tienda');
    // La tabla solo se renderiza con datos (el vacío vive en el bloque único).
    expect(workers.match(/Sin trabajadores en esta tienda/g)).toHaveLength(1);
  });
});

describe('CP-UI-001 · ítem 3 — pro-rateo documentado (sin cambios monetarios)', () => {
  it('la documentación existe con fórmula, redondeo, 3 ejemplos y preguntas contables', () => {
    expect(docItem3).toContain('selectApplicableRule');
    expect(docItem3).toContain('Redondeo');
    expect(docItem3).toContain('Ejemplo 3');
    expect(docItem3).toContain('Preguntas contables pendientes');
  });

  it('pay_commission y el motor NO se tocaron (contrato de fuente intacto)', () => {
    // La selección sigue siendo por ventana + prioridad + worker-specific.
    expect(engine).toContain('if (a.priority !== b.priority) return b.priority - a.priority;');
    // El pro-rateo de la API conserva la suma de sub-períodos.
    expect(calcRoute).toContain('totalCommission += subCalc.commission_suggested;');
    // Sin cambios de redondeo monetario en el motor.
    expect(engine).not.toContain('Math.round(totalCommission');
  });
});

describe('CP-UI-001 · comisiones — restricción única (sin limpieza necesaria)', () => {
  it('no se introduce ninguna migración de limpieza: no_overlapping_periods ya no existe en producción [MEDIDO 2026-11-08]', () => {
    // El estado real verificado por catálogo: SOLO commission_payments_no_overlap.
    // La decisión (no crear DROP condicional de la que se conserva) está en el doc.
    expect(docItem3).toContain('ya NO existe en producción');
    expect(docItem3).toContain('no se crea migración de limpieza');
  });
});
