/**
 * CP-OPERATIONAL-CLASS-001 (2026-11-08) — Clasificación operativa del catálogo.
 *
 * ÚNICA fuente de verdad en el frontend para las cuatro opciones (enum PG
 * `product_operational_class`, migración 20261108150000): etiquetas, textos
 * auxiliares, iconos y normalización de celdas de importación.
 *
 * Naturaleza INFORMATIVA: la clasificación no altera contabilización,
 * valoración, impuestos, ventas, costeo ni movimientos. Es independiente de
 * `is_service` (físico/servicio) y de la categoría comercial (category).
 * `null`/`undefined` = «Sin clasificar»: los registros históricos quedan
 * pendientes y JAMÁS se reclasifican automáticamente.
 */

import type { LucideIcon } from 'lucide-react';
import { ShoppingBag, Boxes, Building2, Hammer } from 'lucide-react';
import type { ProductOperationalClass } from '@/types';

export const UNCLASSIFIED_LABEL = 'Sin clasificar';

export interface OperationalClassOption {
  value: ProductOperationalClass;
  label: string;
  helper: string;
  icon: LucideIcon;
}

/** Las cuatro opciones del enum de BD, en su orden canónico. */
export const OPERATIONAL_CLASS_OPTIONS: readonly OperationalClassOption[] = [
  {
    value: 'venta',
    label: 'Venta',
    helper: 'Se vende al cliente en el POS',
    icon: ShoppingBag,
  },
  {
    value: 'insumo',
    label: 'Insumo',
    helper: 'Se consume en las operaciones',
    icon: Boxes,
  },
  {
    value: 'activo_fijo',
    label: 'Activo Fijo',
    helper: 'Equipos y bienes duraderos',
    icon: Building2,
  },
  {
    value: 'util_herramienta',
    label: 'Útil/Herramienta',
    helper: 'Herramientas de trabajo',
    icon: Hammer,
  },
] as const;

export const OPERATIONAL_CLASS_LABELS: Record<ProductOperationalClass, string> = {
  venta: 'Venta',
  insumo: 'Insumo',
  activo_fijo: 'Activo Fijo',
  util_herramienta: 'Útil/Herramienta',
};

/** Etiqueta segura para mostrar (incluye el estado «Sin clasificar»). */
export function operationalClassLabel(
  value: ProductOperationalClass | null | undefined,
): string {
  return value ? OPERATIONAL_CLASS_LABELS[value] : UNCLASSIFIED_LABEL;
}

/**
 * Normaliza el texto de una celda «Clasificación operativa» (Excel/CSV).
 *  · Celda vacía → `{ value: null }` = Sin clasificar (NO se inventa valor).
 *  · Valor reconocido → el valor canónico del enum.
 *  · Cualquier otro texto → error de fila (fail-closed, coherente con el
 *    resto de la importación): no se adivinan clasificaciones.
 */
export function parseOperationalClassCell(
  raw: unknown,
): { value: ProductOperationalClass | null; error?: undefined } | { value: null; error: string } {
  if (raw === null || raw === undefined) return { value: null };
  const s = String(raw).trim().toLowerCase();
  if (s === '') return { value: null };
  const normalized = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes: «Útil» → «util»
    .replace(/[\s_-]+/g, ' ')
    .trim();
  const matches: Record<string, ProductOperationalClass> = {
    venta: 'venta',
    ventas: 'venta',
    sale: 'venta',
    insumo: 'insumo',
    insumos: 'insumo',
    consumible: 'insumo',
    suministro: 'insumo',
    'activo fijo': 'activo_fijo',
    activofijo: 'activo_fijo',
    activo: 'activo_fijo',
    'util herramienta': 'util_herramienta',
    'util/herramienta': 'util_herramienta',
    util: 'util_herramienta',
    herramienta: 'util_herramienta',
    herramientas: 'util_herramienta',
  };
  const value = matches[normalized];
  if (value) return { value };
  return {
    value: null,
    error: `Clasificación operativa no reconocida: «${String(raw).trim()}». Valores válidos: Venta, Insumo, Activo Fijo, Útil/Herramienta (o vacío = Sin clasificar).`,
  };
}
