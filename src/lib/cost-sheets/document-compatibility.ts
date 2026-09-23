/**
 * FASE C — C2-B: Guard central de compatibilidad documental (decisión D2/D4/D5 de C1R).
 *
 * `cost_sheets` es un almacenamiento GLOBAL que convive con DOS familias de
 * documentos con contratos distintos:
 *
 *   - CostSheet (terminal):  { header, sections, annexes, signature, ... }
 *   - FC.html (Res.148):     { model: "FC_RES148_2023_V1", ficha, header:{name}, meta2 }
 *
 * La coexistencia física en la misma tabla NO implica interoperabilidad (D6):
 * una biblioteca no debe mostrar documentos que su editor no puede abrir.
 * Esta utilidad es la ÚNICA fuente de verdad para decidir si un documento
 * crudo (tal cual viene de la columna `data`) pertenece a la biblioteca
 * CostSheet. Capas de defensa:
 *
 *   1. Query-level  → exclusión PostgREST de la familia FC (best-effort).
 *   2. Guard central → isCostSheetDocument() (esta función, en cada lector).
 *   3. Apertura      → costSheetDataSchema (Zod) en setSheet (ya existente).
 *
 * Determinista y testeable. Prohibido duplicar esta lógica en superficies:
 * importa la función, no la re-implementes.
 */

/** Marcador de modelo autodeclarado por el motor FC.html (único emisor: su POST de sync). */
export const FC_MODEL_MARKER = 'FC_RES148_2023_V1';

/** Categoría hardcodeada por el sync de FC.html. */
export const FC_CATEGORY = 'FC Res148';

/** Pila de documentos FC detectada por cualquier señal. */
export function isFCDocument(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  const meta2 = d.meta2 as Record<string, unknown> | undefined | null;
  return (
    d.model === FC_MODEL_MARKER ||
    'ficha' in d ||
    meta2?.app === 'FC'
  );
}

/**
 * ¿Este documento (la columna `data` de una fila de `cost_sheets`) es un
 * documento CostSheet compatible con el editor del terminal?
 *
 * REGLAS (deterministas):
 *  - Rechaza no-objetos, arrays y objetos vacíos (semillas de test: data = {}).
 *  - Rechaza documentos de la familia FC (cualquiera de sus señales:
 *    model / ficha / meta2.app / category — defensa en profundidad, no una sola).
 *  - Exige los 4 pilares del contrato CostSheet: header, sections, annexes,
 *    signature. (La validación Zod completa ocurre al ABRIR, en setSheet.)
 */
export function isCostSheetDocument(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;

  // 1. Rechazo de la familia FC — por cualquiera de sus señales existentes.
  if (isFCDocument(d)) return false;
  if (d.category === FC_CATEGORY) return false;

  // 2. Pilares estructurales del contrato CostSheet (todos requeridos).
  //    Un documento sin los 4 no es abrible por el editor del terminal.
  const hasHeader =
    !!d.header && typeof d.header === 'object' && !Array.isArray(d.header);
  const hasSections = Array.isArray(d.sections);
  const hasAnnexes = Array.isArray(d.annexes);
  const hasSignature =
    !!d.signature && typeof d.signature === 'object' && !Array.isArray(d.signature);

  return hasHeader && hasSections && hasAnnexes && hasSignature;
}

/**
 * Filtro PostgREST (nivel query) que excluye la familia FC en el servidor,
 * ANTES de que los documentos lleguen a la aplicación (mandato §13: no filtrar
 * solo en UI). Aplicar con .or(...) + .filter(...) en lectores de cost_sheets.
 *
 * Nota: la semilla vacía (data = {}) pasa este filtro de servidor pero es
 * rechazada por isCostSheetDocument — por eso el guard central es obligatorio.
 */
export const COST_SHEET_CONTRACT_FILTER = {
  /** Excluye model = FC_RES148_2023_V1 (conserva filas sin model). */
  excludeFcModelOr: `data->>model.is.null,data->>model.neq.${FC_MODEL_MARKER}`,
  /** Excluye filas con data.ficha (estructura propia del motor FC). */
  excludeFcFicha: { column: 'data->ficha', operator: 'is', value: null } as const,
};
