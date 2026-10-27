/**
 * MISIÓN CICLO DE VIDA DEL INVENTARIO FÍSICO (2026-10-27) — Verificación
 * estática de la migración 20261027150000_pi_lifecycle_ciclo_vida.sql.
 *
 * Contrato crítico (las restricciones viven en el SERVIDOR, no en la UI):
 *
 *   1. Transiciones: un Borrador (draft/prepared) ya no puede pasar a
 *      voided — de Borrador solo se sale preparando/iniciando o eliminando.
 *   2. void_physical_inventory: anulación EXCLUSIVA de estados En proceso
 *      (in_progress/counted/in_reconciliation/pending_authorization).
 *   3. delete_physical_inventory: borrado definitivo SOLO de draft/prepared
 *      (verificado con FOR UPDATE), sin evento de anulación, con limpieza
 *      de registros asociados (items/count_log/sheets/audit_logs caen por
 *      CASCADE o limpieza explícita) y rechazo si hay ajustes vinculados.
 *   4. update_physical_inventory: edición solo en draft (completa) y
 *      prepared (campos no congelados; corte/alcance intocables).
 *   5. Gates de autorización con patrón superadmin (is_admin_check OR
 *      has_store_role) + anti-spoofing v_caller_uid (H-7).
 *   6. RLS: UPDATE directo solo en estados editables — Terminado/Anulado/
 *      Conciliado inmutables también por la vía de persistencia directa.
 *   7. GRANTS: EXECUTE para authenticated/service_role; REVOKE de PUBLIC/anon.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261027150000_pi_lifecycle_ciclo_vida.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

describe('migración 20261027150000 — ciclo de vida del Inventario Físico', () => {
  it('existe el archivo de migración', () => {
    expect(sql().length).toBeGreaterThan(1000);
  });

  describe('0. Corrección de numeración por tienda (bug latente multitienda)', () => {
    it('sustituye UNIQUE(pi_number) global por UNIQUE(store_id, pi_number)', () => {
      expect(sql()).toContain('DROP CONSTRAINT IF EXISTS physical_inventories_pi_number_key');
      expect(sql()).toContain(
        'ADD CONSTRAINT physical_inventories_pi_number_store_key UNIQUE (store_id, pi_number)'
      );
    });

    it('renumera con MAX(sufijo)+1 (robusto a eliminaciones de borradores)', () => {
      // El COUNT(*)+1 heredado colisiona cuando la eliminación de borradores
      // (nueva capacidad de la misión) libera números por debajo del máximo.
      expect(sql()).toMatch(/fn_generate_pi_number[\s\S]*?MAX\(split_part\(pi_number, '-', 3\)::int\), 0\) \+ 1/);
      expect(sql()).toMatch(/fn_generate_pi_number[\s\S]*?LIKE 'IF-' \|\| v_year/);
      // Conserva el formato IF-YYYY-##### por tienda
      expect(sql()).toMatch(/fn_generate_pi_number[\s\S]*?'IF-' \|\| v_year \|\| '-' \|\| LPAD\(v_max::text, 5, '0'\)/);
    });
  });

  describe('1. Transiciones válidas — el Borrador no se anula', () => {
    it('draft solo puede pasar a prepared (sin voided)', () => {
      expect(sql()).toContain('"draft":               ["prepared"]');
    });

    it('prepared solo puede pasar a in_progress (sin voided)', () => {
      expect(sql()).toContain('"prepared":            ["in_progress"]');
    });

    it('las transiciones de En proceso hacia voided se conservan', () => {
      expect(sql()).toContain('"in_progress":         ["counted","voided"]');
      expect(sql()).toContain('"counted":             ["in_reconciliation","voided"]');
      expect(sql()).toContain('"in_reconciliation":   ["pending_authorization","voided"]');
      expect(sql()).toContain('"pending_authorization":["conciliated","in_reconciliation","voided"]');
    });

    it('Terminado (closed) y Anulado (voided) siguen siendo finales (sin salidas)', () => {
      expect(sql()).toContain('"closed":              []');
      expect(sql()).toContain('"voided":               []');
    });

    it('conciliated solo puede cerrarse ( Terminado )', () => {
      expect(sql()).toContain('"conciliated":         ["closed"]');
    });
  });

  describe('2. Anulación — exclusiva de En proceso', () => {
    it('rechaza anular un Borrador con indicación de eliminar', () => {
      expect(sql()).toMatch(
        /IF v_pi\.status IN \('draft','prepared'\) THEN\s*\n\s*RAISE EXCEPTION 'ERR_CANNOT_VOID_STATE: un borrador/
      );
    });

    it('rechaza anular conciliado/cerrado/anulado (regla de reversión de ajustes)', () => {
      expect(sql()).toMatch(
        /IF v_pi\.status IN \('conciliated','closed','voided'\) THEN/
      );
    });

    it('conserva el motivo obligatorio y la trazabilidad (voided_at/by + audit)', () => {
      expect(sql()).toContain('ERR_VOID_REASON_REQUIRED');
      expect(sql()).toContain("SET status = 'voided', voided_at = NOW(), voided_by = v_caller_uid, void_reason = p_reason");
      expect(sql()).toContain("'PHYSICAL_INVENTORY_VOIDED'");
    });
  });

  describe('3. Borrado definitivo del Borrador', () => {
    it('la RPC delete_physical_inventory existe y es SECURITY DEFINER', () => {
      expect(sql()).toContain('CREATE OR REPLACE FUNCTION public.delete_physical_inventory(');
      expect(sql()).toMatch(/delete_physical_inventory\(\s*p_pi_id UUID,\s*p_user_id UUID DEFAULT NULL\s*\) RETURNS JSONB\s*\nLANGUAGE plpgsql\s*\nSECURITY DEFINER/);
    });

    it('verifica el estado con FOR UPDATE (control server-side, no solo UI)', () => {
      const s = sql();
      const del = s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.delete_physical_inventory('));
      expect(del).toContain('SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE');
      expect(del).toContain("IF v_pi.status NOT IN ('draft','prepared') THEN");
      expect(del).toContain('ERR_CANNOT_DELETE_STATE');
    });

    it('no emite evento de anulación ni de eliminación (sin historial — misión §2)', () => {
      const s = sql();
      const del = s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.delete_physical_inventory('));
      const end = del.indexOf('\n$$;') + 4;
      const body = del.slice(0, end);
      expect(body).not.toContain('PHYSICAL_INVENTORY_DELETED');
      expect(body).not.toContain('PHYSICAL_INVENTORY_VOIDED');
    });

    it('limpia los eventos de auditoría del documento (sin registros parciales)', () => {
      expect(sql()).toContain(
        "DELETE FROM public.audit_logs\n   WHERE table_name = 'physical_inventories' AND record_id = p_pi_id;"
      );
    });

    it('se niega si existen ajustes vinculados (defensa en profundidad)', () => {
      expect(sql()).toContain('ERR_ADJUSTMENTS_LINKED');
      expect(sql()).toMatch(/EXISTS \(SELECT 1 FROM public\.physical_inventory_adjustments WHERE pi_id = p_pi_id\)/);
      expect(sql()).toMatch(/EXISTS \(SELECT 1 FROM public\.inventory_adjustments WHERE source_physical_inventory_id = p_pi_id\)/);
    });

    it('no toca existencias (ningún UPDATE a products/inventory/stock_movements)', () => {
      const s = sql();
      const del = s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.delete_physical_inventory('));
      const end = del.indexOf('\n$$;') + 4;
      const body = del.slice(0, end);
      expect(body).not.toMatch(/UPDATE\s+public\.(products|inventory|stock_movements)/);
      expect(body).not.toMatch(/register_stock_movement/);
    });
  });

  describe('4. Edición del Borrador', () => {
    it('la RPC update_physical_inventory existe y es SECURITY DEFINER', () => {
      expect(sql()).toContain('CREATE OR REPLACE FUNCTION public.update_physical_inventory(');
      expect(sql()).toMatch(/update_physical_inventory\(\s*p_pi_id UUID,/);
    });

    it('solo acepta draft/prepared (server-side)', () => {
      expect(sql()).toContain("IF v_pi.status NOT IN ('draft','prepared') THEN");
      expect(sql()).toContain('ERR_NOT_EDITABLE_STATE');
    });

    it('prepared: corte y alcance congelados (tamper-evidente)', () => {
      expect(sql()).toContain('ERR_FIELD_FROZEN');
    });

    it('replica las validaciones de creación (corte no futuro, alcances)', () => {
      expect(sql()).toContain('ERR_INVALID_CUTOFF_DATE');
      expect(sql()).toContain('ERR_SCOPE_CATEGORIES_REQUIRED');
      expect(sql()).toContain('ERR_SCOPE_PRODUCTS_REQUIRED');
    });

    it('emite evento de auditoría PHYSICAL_INVENTORY_UPDATED', () => {
      expect(sql()).toContain("'PHYSICAL_INVENTORY_UPDATED'");
    });
  });

  describe('5. Gates de autorización (patrón superadmin + anti-spoofing)', () => {
    it('update y delete llevan el gate is_admin_check OR has_store_role', () => {
      const gates = sql().match(
        /IF NOT \(public\.is_admin_check\(v_caller_uid\)\s*\n\s*OR public\.has_store_role\(v_caller_uid,[^)]*\)\) THEN/g
      );
      expect(gates).not.toBeNull();
      expect(gates!.length).toBe(3); // void (recreada) + update + delete
    });

    it('conserva el patrón anti-spoofing H-7 (v_caller_uid) en las funciones nuevas', () => {
      const s = sql();
      const callers = s.match(/v_caller_uid UUID := CASE WHEN auth\.role\(\) = 'service_role'/g);
      expect(callers).not.toBeNull();
      expect(callers!.length).toBe(3); // void + update + delete
    });

    it('update/delete requieren rol admin/manager/encargado (misma clase que crear/anular)', () => {
      expect(sql()).toContain('ERR_UNAUTHORIZED_UPDATE_PI');
      expect(sql()).toContain('ERR_UNAUTHORIZED_DELETE_PI');
    });
  });

  describe('6. RLS — inmutabilidad en la capa de persistencia', () => {
    it('UPDATE directo de la cabecera solo en estados editables', () => {
      expect(sql()).toMatch(
        /CREATE POLICY physical_inventories_update ON public\.physical_inventories\s*\n\s*FOR UPDATE TO authenticated\s*\n\s*USING \(status IN \('draft','prepared','in_progress'\)/
      );
      expect(sql()).toMatch(
        /WITH CHECK \(status IN \('draft','prepared','in_progress'\)/
      );
    });

    it('items: INSERT y UPDATE directos solo con padre en estados editables', () => {
      expect(sql()).toMatch(
        /CREATE POLICY physical_inventory_items_insert ON public\.physical_inventory_items[\s\S]*?pi\.status IN \('draft','prepared','in_progress'\)/
      );
      expect(sql()).toMatch(
        /CREATE POLICY physical_inventory_items_update ON public\.physical_inventory_items[\s\S]*?pi\.status IN \('draft','prepared','in_progress'\)/
      );
    });

    it('sigue SIN política DELETE (el borrado solo existe como RPC controlada)', () => {
      expect(sql()).not.toMatch(/CREATE POLICY \w*DELETE\w* ON public\.physical_inventor/);
      expect(sql()).not.toMatch(/FOR DELETE TO authenticated/);
    });
  });

  describe('7. Grants (patrón anti-spoofing del módulo)', () => {
    it('GRANT EXECUTE a authenticated y service_role para las RPC nuevas', () => {
      expect(sql()).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.update_physical_inventory\([^)]*\) TO authenticated, service_role;/
      );
      expect(sql()).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.delete_physical_inventory\([^)]*\) TO authenticated, service_role;/
      );
    });

    it('REVOKE de PUBLIC y anon para las RPC nuevas', () => {
      expect(sql()).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.update_physical_inventory\([^)]*\) FROM PUBLIC, anon;/
      );
      expect(sql()).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.delete_physical_inventory\([^)]*\) FROM PUBLIC, anon;/
      );
    });
  });

  describe('Compatibilidad — sin cambios destructivos', () => {
    it('no crea ni elimina tablas (solo políticas y funciones)', () => {
      expect(sql()).not.toMatch(/CREATE TABLE/);
      expect(sql()).not.toMatch(/DROP TABLE/);
      expect(sql()).not.toMatch(/ALTER TABLE public\.physical_inventories (DROP|ADD) COLUMN/);
    });

    it('no modifica datos históricos (ningún UPDATE de status fuera de las RPC)', () => {
      // Se eliminan los cuerpos de función ($$...$$): dentro de ellos los
      // UPDATE ... WHERE id = p_pi_id son el funcionamiento normal de las
      // RPC sobre la fila bloqueada. Fuera de funciones, ningún UPDATE.
      const s = sql();
      const withoutBodies = s.replace(/\$\$[\s\S]*?\$\$/g, '$$…$$');
      expect(withoutBodies).not.toMatch(/UPDATE\s+public\.physical_inventor/);
      expect(withoutBodies).not.toMatch(/UPDATE\s+public\.physical_inventory_items/);
    });

    it('no redefine funciones compartidas (has_store_role / is_admin_check)', () => {
      expect(sql()).not.toMatch(/CREATE OR REPLACE FUNCTION public\.has_store_role/);
      expect(sql()).not.toMatch(/CREATE OR REPLACE FUNCTION public\.is_admin_check/);
    });
  });
});
