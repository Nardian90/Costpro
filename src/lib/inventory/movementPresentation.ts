/**
 * Diccionario centralizado de presentación de movimientos de inventario.
 *
 * CAPA DE PRESENTACIÓN (§14-18 del requisito Trazabilidad/Kardex):
 * - Los valores internos (`movement_type` en la tabla `stock_movements`)
 *   PERMANECEN intactos en el código y en la base de datos.
 * - La UI JAMÁS imprime el valor crudo: siempre pasa por
 *   `obtenerEtiquetaMovimiento()` / `obtenerClaseMovimiento()` /
 *   `obtenerIconoMovimiento()`.
 * - Fallback seguro: cualquier tipo desconocido se presenta como "Otro"
 *   (nunca el enum crudo tipo `sale_reverse` en pantalla).
 *
 * Fuente única consumida por: StockHistoryView (Trazabilidad), KardexModal
 * y las exportaciones CSV. Un solo diccionario = etiquetas consistentes.
 */

import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown,
  RotateCcw,
  PackagePlus,
  Ban,
  Repeat,
  Wrench,
  Package,
  type LucideIcon,
} from 'lucide-react';

export interface MovementPresentation {
  /** Etiqueta profesional en español para mostrar al usuario. */
  label: string;
  /** Clasificación semántica del efecto en el inventario. */
  kind: 'entrada' | 'salida' | 'neutro' | 'ajuste' | 'reverso' | 'anulacion';
  /** Clases Tailwind para el color del texto/badge. */
  color: string;
  /** Clases Tailwind para el fondo/borde del badge. */
  badge: string;
}

/**
 * Diccionario de los 18 tipos de movimiento reales del sistema
 * (auditados en KardexModal.tsx, iteraciones V2.2) + categoría semántica.
 */
const MOVEMENT_PRESENTATION: Record<string, MovementPresentation> = {
  sale: {
    label: 'Venta',
    kind: 'salida',
    color: 'text-primary',
    badge: 'text-primary bg-primary/10 border-primary/20',
  },
  purchase: {
    label: 'Compra',
    kind: 'entrada',
    color: 'text-success',
    badge: 'text-success bg-success/10 border-success/20',
  },
  adjustment: {
    label: 'Ajuste',
    kind: 'ajuste',
    color: 'text-warning',
    badge: 'text-warning bg-warning/10 border-warning/20',
  },
  return: {
    label: 'Devolución',
    kind: 'entrada',
    color: 'text-blue-500',
    badge: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
  initial: {
    label: 'Inicial',
    kind: 'neutro',
    color: 'text-muted-foreground',
    badge: 'text-muted-foreground bg-muted/30 border-border',
  },
  transfer: {
    label: 'Transferencia',
    kind: 'neutro',
    color: 'text-blue-500',
    badge: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  },
  void: {
    label: 'Anulación',
    kind: 'anulacion',
    color: 'text-destructive',
    badge: 'text-destructive bg-destructive/10 border-destructive/20',
  },
  devolution_in: {
    label: 'Devolución recibida',
    kind: 'entrada',
    color: 'text-success',
    badge: 'text-success bg-success/10 border-success/20',
  },
  transfer_in: {
    label: 'Transferencia recibida',
    kind: 'entrada',
    color: 'text-success',
    badge: 'text-success bg-success/10 border-success/20',
  },
  transfer_out: {
    label: 'Transferencia enviada',
    kind: 'salida',
    color: 'text-destructive',
    badge: 'text-destructive bg-destructive/10 border-destructive/20',
  },
  out: {
    label: 'Salida',
    kind: 'salida',
    color: 'text-destructive',
    badge: 'text-destructive bg-destructive/10 border-destructive/20',
  },
  production: {
    label: 'Producción',
    kind: 'neutro',
    color: 'text-purple-500',
    badge: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  // Reversos v2 (iteración 11.3): siempre en púrpura para distinguir el reverso contable.
  sale_reverse: {
    label: 'Reverso de venta',
    kind: 'reverso',
    color: 'text-purple-500',
    badge: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  purchase_reverse: {
    label: 'Reverso de recepción',
    kind: 'reverso',
    color: 'text-purple-500',
    badge: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  sale_void: {
    label: 'Anulación de venta',
    kind: 'anulacion',
    color: 'text-destructive',
    badge: 'text-destructive bg-destructive/10 border-destructive/20',
  },
  production_in: {
    label: 'Producción (entrada)',
    kind: 'entrada',
    color: 'text-purple-500',
    badge: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  production_out: {
    label: 'Producción (salida)',
    kind: 'salida',
    color: 'text-purple-500',
    badge: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  // Valores REALES del enum `public.movement_type` en BD (auditado 2026-10 vía
  // OpenAPI de PostgREST) que faltaban en este diccionario. Sin ellos, los
  // vales de salida y sus reversos se mostraban como "Otro" (violación §7).
  issue_slip_out: {
    label: 'Vale de salida',
    kind: 'salida',
    color: 'text-destructive',
    badge: 'text-destructive bg-destructive/10 border-destructive/20',
  },
  issue_slip_reverse: {
    label: 'Reverso de vale',
    kind: 'reverso',
    color: 'text-purple-500',
    badge: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  production_reverse: {
    label: 'Reverso de producción',
    kind: 'reverso',
    color: 'text-purple-500',
    badge: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
  devolution_reverse: {
    label: 'Reverso de devolución',
    kind: 'reverso',
    color: 'text-purple-500',
    badge: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  },
};

/**
 * Los 18 valores REALES del enum `public.movement_type` en la base de datos
 * (auditado 2026-10 vía OpenAPI de PostgREST). Fuente de verdad para validar
 * que los grupos de filtro cubren todo el universo de movimientos posibles
 * sin inventar tipos (§6 del requisito de Trazabilidad Global).
 */
export const TIPOS_MOVIMIENTO_REALES: readonly string[] = [
  'sale',
  'purchase',
  'adjustment',
  'return',
  'initial',
  'transfer',
  'void',
  'transfer_in',
  'transfer_out',
  'sale_void',
  'production_out',
  'production_in',
  'sale_reverse',
  'purchase_reverse',
  'production_reverse',
  'issue_slip_out',
  'issue_slip_reverse',
  'devolution_reverse',
] as const;

/** Grupo de filtro por tipo de movimiento (§6/§14 de Trazabilidad Global). */
export interface GrupoFiltroMovimiento {
  /** Identificador estable del grupo (estado del filtro). */
  id: string;
  /** Etiqueta profesional en español para la UI. */
  label: string;
  /** Valores internos REALES del enum que integran el grupo ([] = todos). */
  tipos: string[];
}

/**
 * Grupos de filtro de tipo de movimiento — §6 de Trazabilidad Global.
 *
 * Reglas:
 * - Cada grupo mapea EXCLUSIVAMENTE valores reales del enum en BD.
 * - Los grupos son disjuntos y su unión cubre TIPOS_MOVIMIENTO_REALES
 *   al completo (verificado por test en kardexPeriod.test.ts).
 * - 'todos' (tipos: []) significa "sin filtro de tipo": el backend recibe
 *   el resto de filtros igualmente (§9).
 */
export const GRUPOS_FILTRO_MOVIMIENTO: readonly GrupoFiltroMovimiento[] = [
  { id: 'todos', label: 'Todos', tipos: [] },
  { id: 'ventas', label: 'Ventas', tipos: ['sale'] },
  { id: 'entradas', label: 'Entradas', tipos: ['purchase', 'initial'] },
  { id: 'vales-salida', label: 'Vales de salida', tipos: ['issue_slip_out'] },
  { id: 'devoluciones', label: 'Devoluciones', tipos: ['return', 'devolution_reverse'] },
  { id: 'ajustes', label: 'Ajustes', tipos: ['adjustment'] },
  { id: 'anulaciones', label: 'Anulaciones', tipos: ['void', 'sale_void'] },
  {
    id: 'reversos',
    label: 'Reversos',
    tipos: ['sale_reverse', 'purchase_reverse', 'issue_slip_reverse', 'production_reverse'],
  },
  { id: 'transferencias', label: 'Transferencias', tipos: ['transfer', 'transfer_in', 'transfer_out'] },
  { id: 'produccion', label: 'Producción', tipos: ['production_in', 'production_out'] },
] as const;

/** Grupo por id; undefined si el id no existe (llamador decide fallback). */
export function obtenerGrupoFiltro(id: string | null | undefined): GrupoFiltroMovimiento | undefined {
  if (!id) return undefined;
  return GRUPOS_FILTRO_MOVIMIENTO.find(g => g.id === id);
}

/**
 * Valida que los grupos de filtro cubren el enum real sin solapamientos.
 * Devuelve la lista de problemas encontrados (vacía = OK).
 * Usado por tests y como verificación de integridad en desarrollo.
 */
export function validarCoberturaGrupos(): string[] {
  const problemas: string[] = [];
  const vistos = new Map<string, string>();
  for (const grupo of GRUPOS_FILTRO_MOVIMIENTO) {
    for (const tipo of grupo.tipos) {
      if (vistos.has(tipo)) {
        problemas.push(`Tipo «${tipo}» duplicado en «${vistos.get(tipo)}» y «${grupo.id}»`);
      } else {
        vistos.set(tipo, grupo.id);
      }
    }
  }
  const faltantes = TIPOS_MOVIMIENTO_REALES.filter(t => !vistos.has(t));
  for (const f of faltantes) problemas.push(`Tipo real «${f}» sin grupo de filtro`);
  const extra = [...vistos.keys()].filter(t => !TIPOS_MOVIMIENTO_REALES.includes(t));
  for (const e of extra) problemas.push(`Grupo filtra tipo inexistente en enum: «${e}»`);
  return problemas;
}

/** Fallback seguro para tipos desconocidos: nunca exponer el enum crudo. */
const UNKNOWN_PRESENTATION: MovementPresentation = {
  label: 'Otro',
  kind: 'neutro',
  color: 'text-muted-foreground',
  badge: 'text-muted-foreground bg-muted/30 border-border',
};

/** Etiqueta profesional en español para un tipo de movimiento interno. */
export function obtenerEtiquetaMovimiento(tipo: string | null | undefined): string {
  if (!tipo) return '—';
  return MOVEMENT_PRESENTATION[tipo]?.label ?? UNKNOWN_PRESENTATION.label;
}

/** Presentación completa (etiqueta + kind + colores) de un tipo de movimiento. */
export function obtenerPresentacionMovimiento(tipo: string | null | undefined): MovementPresentation {
  if (!tipo) return UNKNOWN_PRESENTATION;
  return MOVEMENT_PRESENTATION[tipo] ?? UNKNOWN_PRESENTATION;
}

/** Clases de color del texto para un tipo de movimiento. */
export function obtenerClaseMovimiento(tipo: string | null | undefined): string {
  if (!tipo) return UNKNOWN_PRESENTATION.color;
  return MOVEMENT_PRESENTATION[tipo]?.color ?? UNKNOWN_PRESENTATION.color;
}

/** Clases de badge (texto + fondo + borde) para un tipo de movimiento. */
export function obtenerClaseBadgeMovimiento(tipo: string | null | undefined): string {
  if (!tipo) return UNKNOWN_PRESENTATION.badge;
  return MOVEMENT_PRESENTATION[tipo]?.badge ?? UNKNOWN_PRESENTATION.badge;
}

/** Icono semántico para un tipo de movimiento (según su efecto en el stock). */
export function obtenerIconoMovimiento(tipo: string | null | undefined): LucideIcon {
  const kind = obtenerPresentacionMovimiento(tipo).kind;
  switch (kind) {
    case 'entrada':
      return ArrowDownRight; // entra stock (convención existente en Trazabilidad)
    case 'salida':
      return ArrowUpRight; // sale stock
    case 'reverso':
      return RotateCcw;
    case 'anulacion':
      return Ban;
    case 'ajuste':
      return Wrench;
    default: {
      // neutro: transferencias / producción / inicial
      if (tipo === 'initial') return PackagePlus;
      if (tipo === 'transfer' || tipo === 'transfer_in' || tipo === 'transfer_out') return Repeat;
      if (tipo === 'production' || tipo === 'production_in' || tipo === 'production_out') return Package;
      return ArrowUpDown;
    }
  }
}
