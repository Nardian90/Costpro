/**
 * CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 — helpers de AUTORIDAD DEL NOMBRE
 * ============================================================================
 * DECISIÓN FUNCIONAL VINCULANTE (misión §1): el nombre del Catálogo Maestro es
 * el nombre oficial del producto y prevalece sobre cualquier nombre que
 * aparezca en un Excel de recepción. El Excel solo aporta el nombre INICIAL
 * de un producto VERDADERAMENTE nuevo.
 *
 * Este módulo es PRESENTACIÓN pura (sin I/O): aplica en la UI la misma regla
 * que el backend aplica en sus escritores (migración
 * 20261117120000_cp_reception_import_name_authority.sql):
 *   · `effective_name` del motor (clasificación backend) tiene prioridad.
 *   · Fallback al `master_name` (canónico) para filas clasificadas antes de
 *     que el backend migrado exponga `effective_name` (degradación segura).
 *   · Último recurso: el nombre literal del Excel (verdaderamente nuevos,
 *     tiendas no conectadas, fallo de clasificación).
 */

/** Fila clasificada del importador con los datos de nombre del motor. */
export interface ImportNameRow {
  /** Nombre que SE UTILIZARÁ (motor backend: maestro si existe; Excel si nuevo). */
  effectiveName?: string | null;
  /** Nombre canónico del Catálogo Maestro (null si no hay maestro). */
  masterName?: string | null;
  /** Nombre literal recibido del Excel (fidelidad para trazabilidad). */
  name: string;
}

/**
 * Nombre oficial que se muestra y se utiliza (misión §6/§7):
 * el del Catálogo Maestro para productos existentes; el nombre inicial del
 * Excel SOLO para productos verdaderamente nuevos (el motor ya lo decide en
 * `effective_name`; aquí solo se resuelve la cadena de respaldo).
 */
export function effectiveImportName(row: ImportNameRow): string {
  return row.effectiveName || row.masterName || row.name;
}

/**
 * ¿Trajo el Excel un nombre distinto del oficial del maestro? (misión §6:
 * la diferencia NO es error; se informa en la previsualización SOLO cuando
 * difieren — si coinciden, sin advertencia).
 */
export function importNameDiffers(row: ImportNameRow): boolean {
  return !!row.masterName && row.masterName !== row.name;
}
