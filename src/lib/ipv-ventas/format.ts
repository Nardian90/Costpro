/**
 * IPV — Ingresos por Ventas: formato numérico compartido por pantalla y PDF.
 *
 * MISIÓN §8 (precisión):
 *  · Cantidades: hasta 4 decimales (precisión del ledger), SIN redondeo a entero (65.5, 65.25, 0.5,
 *    1.75, 10.125 se muestran fieles); el separador decimal es el nativo es.
 *  · Importes: 2 decimales (precisión monetaria CUP/USD de COSTPRO).
 *  · Cero legible como guion "—" SOLO en pantalla/PDF; en Excel el cero es
 *    numérico real (misma ejecución del informe, representación nativa).
 *  · "N/D" = información no disponible (nunca se sustituye por cero, §5.1/§8).
 */

const QTY_FMT = new Intl.NumberFormat('es', { maximumFractionDigits: 4 });
const MONEY_FMT = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const IPV_DASH = '—';
export const IPV_ND = 'N/D';

/** Cantidad legible: guion si es cero exacto; hasta 3 decimales. */
/** Cantidad legible: guion si es cero exacto; hasta 4 decimales (precisión ledger). */
export function formatIpvQty(n: number | null | undefined): string {
  if (n === null || n === undefined) return IPV_ND;
  if (Math.abs(n) < 1e-9) return IPV_DASH;
  return QTY_FMT.format(n);
}

/** Importe monetario legible: 2 decimales; guion si es cero exacto. */
export function formatIpvMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return IPV_ND;
  if (Math.abs(n) < 0.005) return IPV_DASH;
  return MONEY_FMT.format(n);
}

/**
 * FIX DESFASE DE FECHAS (2026-11-06) — etiqueta de día del período del IPV.
 *
 * CAUSA RAÍZ del desfase «seleccioné 2026-11-06 y el PDF mostraba 05/11/2026»:
 * la etiqueta del PDF parseaba el date-only `YYYY-MM-DD` con `new Date(iso)`.
 * Por spec, `new Date('2026-11-06')` se interpreta como medianoche **UTC**;
 * al renderizar con `toLocaleDateString` en la TZ local del navegador
 * (America/Havana, UTC−5) el instante cae el día anterior (05/11 19:00) y el
 * encabezado del PDF retrocedía un día. Los DATOS del informe eran correctos —
 * solo el rótulo se desfazaba.
 *
 * SOLUCIÓN DE RAÍZ (no ±1 día): un date-only NO es un instante — se formatea
 * por PARTES, sin objetos Date ni zonas horarias. Unica interpretación del
 * período en todo el flujo: el día que el usuario eligió es el que se imprime.
 * Acepta también ISO completo (usa su parte de fecha) y cae a `formatDate`
 * estándar para entradas no reconocidas.
 */
const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatDayLabel(value: string): string {
  if (!value) return '';
  const m = DAY_ONLY.exec(value.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`; // dd/mm/yyyy — exactamente el día elegido
  // Fallback: ISO con hora u otro formato — sin conversión de TZ adicional.
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return value;
}

/** Etiquetas de columna canónicas (pantalla, PDF y Excel comparten orden). */
export const IPV_COLUMN_LABELS = {
  sku: 'Código',
  name: 'Descripción',
  existenciaInicial: 'Existencia inicial',
  cantidadesVendidas: 'Cantidades vendidas',
  valesSalidas: 'Vales salidas',
  entradas: 'Entradas',
  devoluciones: 'Devoluciones',
  ajustes: 'Ajustes',
  transferencias: 'Transferencias',
  existenciaFinal: 'Existencia final',
  ventasImporteCup: 'Ventas en importe (CUP)',
  ventasImporteUsd: 'Ventas USD',
} as const;

/** Orden canónico de columnas numéricas del IPV (compartido por los 3 renderers). */
export const IPV_NUMERIC_COLUMNS = [
  'existenciaInicial',
  'cantidadesVendidas',
  'valesSalidas',
  'entradas',
  'devoluciones',
  'ajustes',
  'transferencias',
  'existenciaFinal',
  'ventasImporteCup',
  'ventasImporteUsd',
] as const;
