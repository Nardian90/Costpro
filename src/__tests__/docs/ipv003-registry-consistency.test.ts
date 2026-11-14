/**
 * CP-SECURITY-BACKLOG-CLOSURE-001 — Prueba de consistencia del texto de CP-IPV-003.
 *
 * CONTEXTO: la misión COSTPRO-FINAL-CYCLE-CLOSE-001 (2026-11-08) cerró
 * CP-IPV-003 por decisión del propietario con una redacción EXACTA exigida
 * («CERRADA POR DECISIÓN DEL PROPIETARIO — COSTOS EN CUP DE PROCEDENCIA NO
 * VERIFICADA (RIESGO ACEPTADO, SIN CORRECCIÓN DE DATOS)»). El commit
 * b7d8a8f93 la anunció en su mensaje, pero el diff real solo tocó
 * CP-POS-002: el texto NUNCA llegó a los registros vivos. El 2026-11-14
 * (CP-SECURITY-AND-BACKLOG-CLOSURE-001 §8) se aplicó a los tres registros
 * canónicos. Esta prueba impide que la divergencia reaparezca.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');

const REDACCION_CIERRE =
  'CERRADA POR DECISIÓN DEL PROPIETARIO — COSTOS EN CUP DE PROCEDENCIA NO VERIFICADA (RIESGO ACEPTADO, SIN CORRECCIÓN DE DATOS)';

function leer(rutaRelativa: string): string {
  return readFileSync(join(REPO, rutaRelativa), 'utf8');
}

describe('CP-IPV-003 — consistencia del texto de cierre en los registros vivos', () => {
  it('1. tareas.csv registra el estado de cierre con la redacción exigida', () => {
    const csv = leer('scripts/extracted/tareas.csv');
    const fila = csv.split('\n').find((l) => l.startsWith('"CP-IPV-003"'));
    expect(fila).toBeDefined();
    expect(fila!).toContain(REDACCION_CIERRE);
    expect(fila!).toContain('"CERRADA"');
  });

  it('2. INVENTARIO_MAESTRO (tabla resumen §2 y ficha §3.3) usa la misma redacción', () => {
    const md = leer('docs/audits/INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md');
    const filas = md.split('\n').filter((l) => l.startsWith('| CP-IPV-003 |'));
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(f).toContain(REDACCION_CIERRE);
      expect(f).not.toContain('| PENDIENTE CONFIRMADA |');
    }
    // Ficha detallada §3.3
    const seccion = md.slice(md.indexOf('#### CP-IPV-003'));
    const ficha = seccion.slice(0, seccion.indexOf('#### CP-IPV-004'));
    expect(ficha).toContain(REDACCION_CIERRE);
    expect(ficha).toContain('audit-evidence/FINAL-CYCLE-CLOSE-001/T6-IPV-003.md');
  });

  it('3. WORKLOG_RESOLUCION (§2.3 IPV) refleja el cierre en la columna de evolución', () => {
    const md = leer('docs/audits/WORKLOG_RESOLUCION_TAREAS_COSTPRO.md');
    const fila = md.split('\n').find((l) => l.startsWith('| CP-IPV-003 |'));
    expect(fila).toBeDefined();
    expect(fila!).toContain(REDACCION_CIERRE);
  });

  it('4. la evidencia T6 (fuente de la redacción) sigue presente y citada', () => {
    const t6 = leer('audit-evidence/FINAL-CYCLE-CLOSE-001/T6-IPV-003.md');
    expect(t6).toContain(REDACCION_CIERRE);
    // la fuente de la decisión es la premisa medida, no una invención
    expect(t6).toContain('RIESGO ACEPTADO');
    expect(t6).toContain('SKU 107');
  });
});
