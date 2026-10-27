/**
 * MISIÓN CICLO DE VIDA DEL INVENTARIO FÍSICO (2026-10-27) — Matriz de
 * permisos por estado (misión §3) verificada sobre la capa compartida
 * pi-types, que es la que consume la interfaz (los botones REFLEJAN al
 * servidor; las validaciones reales viven en las RPC y en el trigger
 * fn_validate_pi_transition — ver pi-lifecycle-migration.test.ts).
 *
 * Etiquetas EXACTAS requeridas (misión §5):
 *   Borrador · En proceso · Terminado · Anulado
 */
import { describe, it, expect } from 'vitest';
import {
  PI_LIFECYCLE_META,
  PI_LIFECYCLE_FILTER_LABELS,
  piLifecycleOf,
  statusesOfLifecycle,
  canEditPI,
  canCountPI,
  canStartPI,
  canVoidPI,
  canDeletePI,
  isReadOnlyPI,
  PI_STATUS_META,
  type PIStatus,
} from '@/components/views/terminal/views/physical_inventory/pi-types';

const ALL_STATUSES: PIStatus[] = [
  'draft', 'prepared', 'in_progress', 'counted', 'in_reconciliation',
  'pending_authorization', 'conciliated', 'closed', 'voided',
];

describe('Mapeo 9 estados internos → 4 estados del ciclo de vida', () => {
  it('todos los estados internos están clasificados exactamente una vez', () => {
    const mapped = (['borrador', 'en_proceso', 'terminado', 'anulado'] as const)
      .flatMap((stage) => statusesOfLifecycle(stage));
    expect([...mapped].sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('Borrador = draft + prepared', () => {
    expect(piLifecycleOf('draft')).toBe('borrador');
    expect(piLifecycleOf('prepared')).toBe('borrador');
  });

  it('En proceso = in_progress … conciliated', () => {
    for (const s of ['in_progress', 'counted', 'in_reconciliation', 'pending_authorization', 'conciliated'] as PIStatus[]) {
      expect(piLifecycleOf(s)).toBe('en_proceso');
    }
  });

  it('Terminado = closed · Anulado = voided', () => {
    expect(piLifecycleOf('closed')).toBe('terminado');
    expect(piLifecycleOf('voided')).toBe('anulado');
  });

  it('las etiquetas del ciclo de vida son EXACTAS (misión §5)', () => {
    expect(PI_LIFECYCLE_META.borrador.label).toBe('Borrador');
    expect(PI_LIFECYCLE_META.en_proceso.label).toBe('En proceso');
    expect(PI_LIFECYCLE_META.terminado.label).toBe('Terminado');
    expect(PI_LIFECYCLE_META.anulado.label).toBe('Anulado');
  });

  it('el filtro del listado ofrece exactamente los 4 estados + Todos', () => {
    expect(Object.keys(PI_LIFECYCLE_FILTER_LABELS)).toEqual(['all', 'borrador', 'en_proceso', 'terminado', 'anulado']);
    expect(PI_LIFECYCLE_FILTER_LABELS.borrador).toBe('Borrador');
    expect(PI_LIFECYCLE_FILTER_LABELS.en_proceso).toBe('En proceso');
    expect(PI_LIFECYCLE_FILTER_LABELS.terminado).toBe('Terminado');
    expect(PI_LIFECYCLE_FILTER_LABELS.anulado).toBe('Anulado');
  });
});

describe('Matriz de permisos por estado (misión §3)', () => {
  describe('Consultar — siempre', () => {
    it('todos los estados son consultables (sin helper restrictivo: la vista de detalle carga en cualquier estado)', () => {
      // La consulta no tiene helper porque SIEMPRE se permite; el listado y el
      // detalle cargan para los 9 estados. Verificación indirecta: ningún
      // estado queda excluido de los metadatos de presentación.
      for (const s of ALL_STATUSES) {
        expect(PI_STATUS_META[s].label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Editar (datos/configuración) — Borrador: Sí · resto: No', () => {
    it('draft y prepared son editables; ningún otro estado', () => {
      expect(canEditPI('draft')).toBe(true);
      expect(canEditPI('prepared')).toBe(true);
      for (const s of ALL_STATUSES.filter((x) => x !== 'draft' && x !== 'prepared')) {
        expect(canEditPI(s)).toBe(false);
      }
    });
  });

  describe('Modificar cantidades — solo conteo activo', () => {
    it('in_progress permite capturar; los estados finales no', () => {
      expect(canCountPI('in_progress')).toBe(true);
      expect(canCountPI('draft')).toBe(false);
      expect(canCountPI('prepared')).toBe(false);
      expect(canCountPI('counted')).toBe(false);
      expect(canCountPI('closed')).toBe(false);
      expect(canCountPI('voided')).toBe(false);
    });
  });

  describe('Iniciar inventario — Borrador: Sí · No aplica/No en el resto', () => {
    it('solo draft (preparar) y prepared (iniciar) pueden iniciarse', () => {
      expect(canStartPI('draft')).toBe(true);
      expect(canStartPI('prepared')).toBe(true);
      expect(canStartPI('in_progress')).toBe(false);
      expect(canStartPI('closed')).toBe(false);
      expect(canStartPI('voided')).toBe(false);
    });
  });

  describe('Anular — En proceso: Sí (con trazabilidad) · Borrador/Terminado/Anulado: No', () => {
    it('solo in_progress…pending_authorization son anulables', () => {
      expect(canVoidPI('in_progress')).toBe(true);
      expect(canVoidPI('counted')).toBe(true);
      expect(canVoidPI('in_reconciliation')).toBe(true);
      expect(canVoidPI('pending_authorization')).toBe(true);
    });

    it('un BORRADOR no se anula: se elimina (misión §2 regla de eliminación)', () => {
      expect(canVoidPI('draft')).toBe(false);
      expect(canVoidPI('prepared')).toBe(false);
    });

    it('Terminado y Anulado no se anulan; conciliado se rectifica revirtiendo ajustes (regla vigente)', () => {
      expect(canVoidPI('conciliated')).toBe(false);
      expect(canVoidPI('closed')).toBe(false);
      expect(canVoidPI('voided')).toBe(false);
    });
  });

  describe('Eliminar definitivamente — Borrador: Sí (sin historial) · resto: No', () => {
    it('solo draft y prepared son eliminables', () => {
      expect(canDeletePI('draft')).toBe(true);
      expect(canDeletePI('prepared')).toBe(true);
      for (const s of ['in_progress', 'counted', 'in_reconciliation', 'pending_authorization', 'conciliated', 'closed', 'voided'] as PIStatus[]) {
        expect(canDeletePI(s)).toBe(false);
      }
    });
  });

  describe('Volver a un estado anterior — nunca (a nivel de ciclo de vida)', () => {
    it('Terminado y Anulado son de solo lectura (sin acciones de ciclo de vida)', () => {
      expect(isReadOnlyPI('closed')).toBe(true);
      expect(isReadOnlyPI('voided')).toBe(true);
      expect(isReadOnlyPI('draft')).toBe(false);
      expect(isReadOnlyPI('in_progress')).toBe(false);
    });

    it('ningún helper habilita edición/anulación/eliminación en Terminado', () => {
      expect(canEditPI('closed')).toBe(false);
      expect(canVoidPI('closed')).toBe(false);
      expect(canDeletePI('closed')).toBe(false);
      expect(canEditPI('voided')).toBe(false);
      expect(canVoidPI('voided')).toBe(false);
      expect(canDeletePI('voided')).toBe(false);
    });
  });
});
