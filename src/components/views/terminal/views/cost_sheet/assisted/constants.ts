import type { CostMapNode, WorkflowPhase, NodeValidationResult } from './types';

// ── Color palette (hex values for SVG + Tailwind classes for HTML) ──
const COLORS = {
  blue: {
    hex: '#3b82f6',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/5',
  },
  emerald: {
    hex: '#10b981',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
  },
  violet: {
    hex: '#8b5cf6',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/5',
  },
  amber: {
    hex: '#f59e0b',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
  },
  orange: {
    hex: '#f97316',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/5',
  },
  cyan: {
    hex: '#06b6d4',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-500/5',
  },
  rose: {
    hex: '#f43f5e',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/5',
  },
  slate: {
    hex: '#64748b',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/30',
    bg: 'bg-slate-500/5',
  },
  teal: {
    hex: '#14b8a6',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-500/30',
    bg: 'bg-teal-500/5',
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// PRODUCCIÓN MODE NODES (Res 148/2023 - Producción de bienes)
// ═══════════════════════════════════════════════════════════════
const PROD_NODES: CostMapNode[] = [
  {
    id: 'prod-header',
    mode: 'prod',
    phase: 'input',
    label: 'Identificar Producto',
    shortLabel: 'Producto',
    description: 'Defina qué producto va a costear: nombre, código, cantidad, moneda.',
    icon: 'Building2',
    color: COLORS.blue.hex,
    tailwindColor: COLORS.blue.text,
    borderColor: COLORS.blue.border,
    bgColor: COLORS.blue.bg,
    textColor: COLORS.blue.text,
    isHeader: true,
    regulatoryTip: 'Toda ficha de costo comienza identificando el OBJETO de costing. Según la norma cubana Res 148/2023, sin una definición precisa del producto, los costos no son comparables ni auditables.',
    articleRef: 'Art. 3-4, Res 148/2023',
  },
  {
    id: 'prod-insumos',
    mode: 'prod',
    phase: 'input',
    label: 'Almacén Materias Primas / Anexo I',
    shortLabel: 'Anexo I',
    description: 'Registre las materias primas, materiales y suministros directos consumidos.',
    icon: 'Warehouse',
    color: COLORS.emerald.hex,
    tailwindColor: COLORS.emerald.text,
    borderColor: COLORS.emerald.border,
    bgColor: COLORS.emerald.bg,
    textColor: COLORS.emerald.text,
    annexId: 'I',
    regulatoryTip: 'Los COSTOS DE MATERIA PRIMA representan típicamente 40-60% del costo total en manufactura. Fórmula: Total = Norma de Consumo × Precio Unitario. Desagregación obligatoria según Art.5.',
    articleRef: 'Art.5, Anexo I',
  },
  {
    id: 'prod-salario',
    mode: 'prod',
    phase: 'input',
    label: 'Fuerza de Trabajo Directa / Anexo II',
    shortLabel: 'Anexo II',
    description: 'Registre los salarios de los obreros que participan directamente en la producción.',
    icon: 'Users',
    color: COLORS.violet.hex,
    tailwindColor: COLORS.violet.text,
    borderColor: COLORS.violet.border,
    bgColor: COLORS.violet.bg,
    textColor: COLORS.violet.text,
    annexId: 'II',
    regulatoryTip: 'La MANO DE OBRA DIRECTA es el segundo costo primario. Total = Horas × Tarifa por Hora × Cantidad. Los precios NO se pueden incrementar por Decreto 53.',
    articleRef: 'Art.5, Fila 2',
  },
  {
    id: 'prod-equipos',
    mode: 'prod',
    phase: 'input',
    label: 'Equipos y Maquinaria / Anexo III',
    shortLabel: 'Anexo III',
    description: 'Registre la depreciación de los activos fijos utilizados en producción.',
    icon: 'Wrench',
    color: COLORS.amber.hex,
    tailwindColor: COLORS.amber.text,
    borderColor: COLORS.amber.border,
    bgColor: COLORS.amber.bg,
    textColor: COLORS.amber.text,
    annexId: 'III',
    regulatoryTip: 'DEPRECIACIÓN: (Valor de Compra × % Depreciación) / Tiempo de Explotación. Debe desglosarse obligatoriamente dentro de Otros Gastos Directos.',
    articleRef: 'Fila 3, Anexo I',
  },
  {
    id: 'prod-otros',
    mode: 'prod',
    phase: 'input',
    label: 'Otros Gastos Directos / Anexos IV-V',
    shortLabel: 'Anexos IV-V',
    description: 'Registre otros gastos directos: envases, dietas, transportes internos.',
    icon: 'Truck',
    color: COLORS.orange.hex,
    tailwindColor: COLORS.orange.text,
    borderColor: COLORS.orange.border,
    bgColor: COLORS.orange.bg,
    textColor: COLORS.orange.text,
    annexId: 'IV',
    regulatoryTip: 'GASTOS DIRECTOS no materiales ni mano de obra: dietas, embalajes especiales, transportes internos. Son rastreables al producto pero de naturaleza diversa.',
    articleRef: 'Fila 3, Anexo I',
  },
  // ── Section nodes: direct costs + individual cost sections ──
  {
    id: 'prod-directos',
    mode: 'prod',
    phase: 'process',
    label: 'Costos Directos (Sec. 1-3)',
    shortLabel: 'Directos',
    description: 'Gasto Material, Salario Directo y Otros Gastos Directos.',
    icon: 'Factory',
    color: COLORS.teal.hex,
    tailwindColor: COLORS.teal.text,
    borderColor: COLORS.teal.border,
    bgColor: COLORS.teal.bg,
    textColor: COLORS.teal.text,
    isSection: true,
    rowId: 'main',
    regulatoryTip: 'Secciones 1-3: Materias primas + Fuerza laboral directa + Depreciación y otros.',
    articleRef: 'Filas 1-3',
  },
  {
    id: 'prod-asociados',
    mode: 'prod',
    phase: 'process',
    label: 'Gastos Asociados (Sección 4)',
    shortLabel: 'Asociados',
    description: 'Gastos indirectos de producción: salarios indirectos, depreciación de taller.',
    icon: 'Factory',
    color: COLORS.cyan.hex,
    tailwindColor: COLORS.cyan.text,
    borderColor: COLORS.cyan.border,
    bgColor: COLORS.cyan.bg,
    textColor: COLORS.cyan.text,
    isSection: true,
    rowId: 'direct-4',
    regulatoryTip: 'Sección 4: Gastos asociados a la producción pero no rastreables al producto.',
    articleRef: 'Fila 4',
  },
  {
    id: 'prod-costo-total',
    mode: 'prod',
    phase: 'process',
    label: 'Costo Total de Producción (F5)',
    shortLabel: 'Costo Total',
    description: 'Consolidación: costos directos + gastos asociados a la producción.',
    icon: 'Factory',
    color: COLORS.cyan.hex,
    tailwindColor: COLORS.cyan.text,
    borderColor: COLORS.cyan.border,
    bgColor: COLORS.cyan.bg,
    textColor: COLORS.cyan.text,
    isSection: true,
    rowId: 'main',
    regulatoryTip: 'F5 = F1 + F2 + F3 + F4. Coeficiente GI máximo: 1.5x sobre salario directo (Art.9).',
    articleRef: 'Art.9, Filas 4-5',
  },
  // ── Overhead section nodes ──
  {
    id: 'prod-gi-grales',
    mode: 'prod',
    phase: 'overhead',
    label: 'Gastos Grales. y Admón. + Distribución (Sec. 6-7)',
    shortLabel: 'Gral.+Dist.',
    description: 'Gastos generales, administrativos y de distribución/venta.',
    icon: 'AlertTriangle',
    color: COLORS.rose.hex,
    tailwindColor: COLORS.rose.text,
    borderColor: COLORS.rose.border,
    bgColor: COLORS.rose.bg,
    textColor: COLORS.rose.text,
    isSection: true,
    rowId: 'gi-6-7',
    regulatoryTip: 'Sección 6: Gastos generales y administración. Sección 7: Distribución y venta.',
    articleRef: 'Filas 6-7',
  },
  {
    id: 'prod-financiero',
    mode: 'prod',
    phase: 'overhead',
    label: 'Gastos Financieros, OSDE y Tributarios (Sec. 8-10)',
    shortLabel: 'Fin.+Trib.',
    description: 'Gastos financieros, gasto financiero OSDE y tributos.',
    icon: 'AlertTriangle',
    color: COLORS.rose.hex,
    tailwindColor: COLORS.rose.text,
    borderColor: COLORS.rose.border,
    bgColor: COLORS.rose.bg,
    textColor: COLORS.rose.text,
    isSection: true,
    rowId: 'financiero',
    regulatoryTip: 'Sección 8: Financieros. Sección 9: OSDE. Sección 10: Tributarios.',
    articleRef: 'Filas 8-10',
  },
  {
    id: 'prod-gi',
    mode: 'prod',
    phase: 'overhead',
    label: 'Total Gastos Indirectos (F11)',
    shortLabel: 'Total Gastos',
    description: 'Consolidación de todos los gastos indirectos y tributarios.',
    icon: 'AlertTriangle',
    color: COLORS.rose.hex,
    tailwindColor: COLORS.rose.text,
    borderColor: COLORS.rose.border,
    bgColor: COLORS.rose.bg,
    textColor: COLORS.rose.text,
    isSection: true,
    rowId: 'overhead',
    regulatoryTip: 'F11 = F6+F7+F8+F9+F10. Solo intereses, comisiones y primas de seguro como gastos financieros.',
    articleRef: 'Art.9, Filas 6-11',
  },
  {
    id: 'prod-precio',
    mode: 'prod',
    phase: 'finance',
    label: 'Utilidad y Precio de Venta (F12-F16)',
    shortLabel: 'Precio',
    description: 'Revise el margen de utilidad, impuestos y el precio/tarifa final de venta.',
    icon: 'DollarSign',
    color: COLORS.emerald.hex,
    tailwindColor: COLORS.emerald.text,
    borderColor: COLORS.emerald.border,
    bgColor: COLORS.emerald.bg,
    textColor: COLORS.emerald.text,
    isSection: true,
    rowId: 'finance',
    regulatoryTip: 'UTILIDAD máx: 25% producción, 15% servicios, 30% alta tecnología. Base: costos y gastos descontando consumo material, grales, financieros, tributarios y OSDE. F14 = F12 + F13.',
    articleRef: 'Art.9-11, Anexo II',
  },
  {
    id: 'prod-firma',
    mode: 'prod',
    phase: 'output',
    label: 'Aprobación Final',
    shortLabel: 'Firma',
    description: 'Elabore, revise y apruebe la ficha de costo.',
    icon: 'FileCheck',
    color: COLORS.slate.hex,
    tailwindColor: COLORS.slate.text,
    borderColor: COLORS.slate.border,
    bgColor: COLORS.slate.bg,
    textColor: COLORS.slate.text,
    isSignature: true,
    regulatoryTip: 'La firma es un acto de RESPONSABILIDAD. El elaborador certifica datos, el revisor valida metodología, el aprobador autoriza el precio. Flujo de 3 firmas: control interno estándar.',
    articleRef: 'Anexo III, Modelo',
  },
];

// ═══════════════════════════════════════════════════════════════
// SERVICIOS MODE NODES (Res 148/2023 - Prestación de servicios)
// ═══════════════════════════════════════════════════════════════
const SERV_NODES: CostMapNode[] = [
  {
    id: 'serv-header',
    mode: 'serv',
    phase: 'input',
    label: 'Identificar Servicio',
    shortLabel: 'Servicio',
    description: 'Defina qué servicio va a costear: nombre, código, tipo de prestación.',
    icon: 'Building2',
    color: COLORS.blue.hex,
    tailwindColor: COLORS.blue.text,
    borderColor: COLORS.blue.border,
    bgColor: COLORS.blue.bg,
    textColor: COLORS.blue.text,
    isHeader: true,
    regulatoryTip: 'Para servicios: no se incluyen partes, piezas y accesorios cobrados independientemente al precio del inventario.',
    articleRef: 'Art.3-5, Res 148/2023',
  },
  {
    id: 'serv-insumos',
    mode: 'serv',
    phase: 'input',
    label: 'Recursos para la Prestación / Anexo I',
    shortLabel: 'Anexo I',
    description: 'Solo insumos consumidos en la prestación del servicio.',
    icon: 'Warehouse',
    color: COLORS.emerald.hex,
    tailwindColor: COLORS.emerald.text,
    borderColor: COLORS.emerald.border,
    bgColor: COLORS.emerald.bg,
    textColor: COLORS.emerald.text,
    annexId: 'I',
    regulatoryTip: 'En servicios NO se incluyen partes, piezas y accesorios que se cobran independientemente. Solo materiales consumidos directamente.',
    articleRef: 'Art.5, Fila 1',
  },
  {
    id: 'serv-salario',
    mode: 'serv',
    phase: 'input',
    label: 'Personal del Servicio / Anexo II',
    shortLabel: 'Anexo II',
    description: 'Salario + vacaciones del personal que interviene directamente en la prestación.',
    icon: 'Users',
    color: COLORS.violet.hex,
    tailwindColor: COLORS.violet.text,
    borderColor: COLORS.violet.border,
    bgColor: COLORS.violet.bg,
    textColor: COLORS.violet.text,
    annexId: 'II',
    regulatoryTip: 'Coeficiente GI en servicios: ≤1.0x sobre F2 (más estricto que producción 1.5x). Desagregación obligatoria excepto cuando retribución no es salario.',
    articleRef: 'Art.5, Art.9',
  },
  {
    id: 'serv-equipos',
    mode: 'serv',
    phase: 'input',
    label: 'Equipos y Herramientas / Anexo III',
    shortLabel: 'Anexo III',
    description: 'Depreciación de equipos, herramientas y mantenimiento identificable.',
    icon: 'Wrench',
    color: COLORS.amber.hex,
    tailwindColor: COLORS.amber.text,
    borderColor: COLORS.amber.border,
    bgColor: COLORS.amber.bg,
    textColor: COLORS.amber.text,
    annexId: 'III',
    regulatoryTip: 'Depreciación de AFT que intervienen directamente en la prestación. Debe desglosarse obligatoriamente.',
    articleRef: 'Fila 3, Anexo I',
  },
  {
    id: 'serv-ejecucion',
    mode: 'serv',
    phase: 'process',
    label: 'Ejecución del Servicio / Costo Total',
    shortLabel: 'Costos',
    description: 'Consolidación: costos directos del servicio + gastos asociados.',
    icon: 'Factory',
    color: COLORS.cyan.hex,
    tailwindColor: COLORS.cyan.text,
    borderColor: COLORS.cyan.border,
    bgColor: COLORS.cyan.bg,
    textColor: COLORS.cyan.text,
    isSection: true,
    rowId: 'main',
    regulatoryTip: 'F5 = F1 + F2 + F3 + F4. Costo total de prestación antes de gastos generales y financieros.',
    articleRef: 'Filas 4-5',
  },
  {
    id: 'serv-gi',
    mode: 'serv',
    phase: 'overhead',
    label: 'Gastos Indirectos',
    shortLabel: 'Gastos',
    description: 'Gastos generales, distribución, financieros, OSDE y tributos del servicio.',
    icon: 'AlertTriangle',
    color: COLORS.rose.hex,
    tailwindColor: COLORS.rose.text,
    borderColor: COLORS.rose.border,
    bgColor: COLORS.rose.bg,
    textColor: COLORS.rose.text,
    isSection: true,
    rowId: 'overhead',
    regulatoryTip: 'F11 = F6+F7+F8+F9+F10. Base para tarifa del servicio: F12 = F5 + F11.',
    articleRef: 'Art.9-10, Filas 6-10',
  },
  {
    id: 'serv-precio',
    mode: 'serv',
    phase: 'finance',
    label: 'Tarifa Final del Servicio',
    shortLabel: 'Tarifa',
    description: 'Utilidad máx 15% servicios, concertación local, tarifa igualitaria.',
    icon: 'DollarSign',
    color: COLORS.emerald.hex,
    tailwindColor: COLORS.emerald.text,
    borderColor: COLORS.emerald.border,
    bgColor: COLORS.emerald.bg,
    textColor: COLORS.emerald.text,
    isSection: true,
    rowId: 'finance',
    regulatoryTip: 'Utilidad máx servicios: 15% (30% alta tecnología). Res.328/2020: tratamiento igualitario cubanos y extranjeros. Concertación local Art.17.',
    articleRef: 'Art.9-10-16-17',
  },
  {
    id: 'serv-firma',
    mode: 'serv',
    phase: 'output',
    label: 'Aprobación Final',
    shortLabel: 'Firma',
    description: 'Elabore, revise y apruebe la ficha de costo del servicio.',
    icon: 'FileCheck',
    color: COLORS.slate.hex,
    tailwindColor: COLORS.slate.text,
    borderColor: COLORS.slate.border,
    bgColor: COLORS.slate.bg,
    textColor: COLORS.slate.text,
    isSignature: true,
    regulatoryTip: 'Flujo de 3 firmas: elaborador, revisor y aprobador. Control interno estándar para prevenir errores y fraudes.',
    articleRef: 'Anexo III',
  },
];

// ═══════════════════════════════════════════════════════════════
// COMERCIALIZACIÓN MODE NODES (Res 148/2023 - Actividad comercial)
// ═══════════════════════════════════════════════════════════════
const COM_NODES: CostMapNode[] = [
  {
    id: 'com-header',
    mode: 'com',
    phase: 'input',
    label: 'Identificar Producto a Comercializar',
    shortLabel: 'Producto',
    description: 'Defina el bien o producto que será comercializado.',
    icon: 'Building2',
    color: COLORS.blue.hex,
    tailwindColor: COLORS.blue.text,
    borderColor: COLORS.blue.border,
    bgColor: COLORS.blue.bg,
    textColor: COLORS.blue.text,
    isHeader: true,
    regulatoryTip: 'Precios mayoristas: se forman por correlación con exportación, importación o sustitutos del mercado interno según calidades equivalentes (Art.8).',
    articleRef: 'Art.8, Res 148/2023',
  },
  {
    id: 'com-adquisicion',
    mode: 'com',
    phase: 'input',
    label: 'Costo de Adquisición / Anexo I',
    shortLabel: 'Anexo I',
    description: 'Precio del proveedor, importación CIF/FOB, gastos hasta almacén.',
    icon: 'Warehouse',
    color: COLORS.emerald.hex,
    tailwindColor: COLORS.emerald.text,
    borderColor: COLORS.emerald.border,
    bgColor: COLORS.emerald.bg,
    textColor: COLORS.emerald.text,
    annexId: 'I',
    regulatoryTip: 'Monto pagado al suministrador (costo + margen comercial) o precio de importación. Incluye gastos hasta dar entrada en almacén.',
    articleRef: 'Art.8, Fila 1',
  },
  {
    id: 'com-logistica',
    mode: 'com',
    phase: 'input',
    label: 'Logística y Distribución / Anexo II',
    shortLabel: 'Anexo II',
    description: 'Costos de transporte, almacenamiento y distribución.',
    icon: 'Truck',
    color: COLORS.violet.hex,
    tailwindColor: COLORS.violet.text,
    borderColor: COLORS.violet.border,
    bgColor: COLORS.violet.bg,
    textColor: COLORS.violet.text,
    annexId: 'II',
    regulatoryTip: 'Gastos de transporte, almacenamiento, manipulación y distribución del bien hasta el punto de venta.',
    articleRef: 'Fila 2, Anexo I',
  },
  {
    id: 'com-equipos',
    mode: 'com',
    phase: 'input',
    label: 'Equipos y Gastos de Venta / Anexo III',
    shortLabel: 'Anexo III',
    description: 'Depreciación de equipos de tienda, mostrador, punto de venta.',
    icon: 'Wrench',
    color: COLORS.amber.hex,
    tailwindColor: COLORS.amber.text,
    borderColor: COLORS.amber.border,
    bgColor: COLORS.amber.bg,
    textColor: COLORS.amber.text,
    annexId: 'III',
    regulatoryTip: 'Depreciación de AFT utilizados en la comercialización: equipos de frío, mostradores, sistemas de punto de venta.',
    articleRef: 'Fila 3, Anexo I',
  },
  {
    id: 'com-proceso',
    mode: 'com',
    phase: 'process',
    label: 'Centro de Distribución / Costo Total',
    shortLabel: 'Costos',
    description: 'Consolidación de costos de la actividad comercializadora.',
    icon: 'Factory',
    color: COLORS.cyan.hex,
    tailwindColor: COLORS.cyan.text,
    borderColor: COLORS.cyan.border,
    bgColor: COLORS.cyan.bg,
    textColor: COLORS.cyan.text,
    isSection: true,
    rowId: 'main',
    regulatoryTip: 'F5 = F1 + F2 + F3 + F4. Costo total de la actividad comercializadora antes de gastos generales e indirectos.',
    articleRef: 'Filas 4-5',
  },
  {
    id: 'com-gi',
    mode: 'com',
    phase: 'overhead',
    label: 'Gastos Indirectos de Comercialización',
    shortLabel: 'Gastos',
    description: 'Administración, distribución, financieros, OSDE y tributos.',
    icon: 'AlertTriangle',
    color: COLORS.rose.hex,
    tailwindColor: COLORS.rose.text,
    borderColor: COLORS.rose.border,
    bgColor: COLORS.rose.bg,
    textColor: COLORS.rose.text,
    isSection: true,
    rowId: 'overhead',
    regulatoryTip: 'F11 = F6+F7+F8+F9+F10. Los precios mayoristas tienen criterio de máximos (Art.11).',
    articleRef: 'Art.9-11, Filas 6-10',
  },
  {
    id: 'com-precio',
    mode: 'com',
    phase: 'finance',
    label: 'Precio Mayorista',
    shortLabel: 'Precio',
    description: 'Utilidad máx 15%, precio de correlación, referencia de mercado.',
    icon: 'DollarSign',
    color: COLORS.emerald.hex,
    tailwindColor: COLORS.emerald.text,
    borderColor: COLORS.emerald.border,
    bgColor: COLORS.emerald.bg,
    textColor: COLORS.emerald.text,
    isSection: true,
    rowId: 'finance',
    regulatoryTip: 'Comercialización: utilidad máx 15% sobre base reducida. Precio por correlación o método de gastos. Criterio de máximos.',
    articleRef: 'Art.8-11, Anexo II',
  },
  {
    id: 'com-firma',
    mode: 'com',
    phase: 'output',
    label: 'Aprobación Final',
    shortLabel: 'Firma',
    description: 'Elabore, revise y apruebe la ficha de comercialización.',
    icon: 'FileCheck',
    color: COLORS.slate.hex,
    tailwindColor: COLORS.slate.text,
    borderColor: COLORS.slate.border,
    bgColor: COLORS.slate.bg,
    textColor: COLORS.slate.text,
    isSignature: true,
    regulatoryTip: 'Flujo de 3 firmas para comercialización: elaborador, revisor y aprobador. Los precios mayoristas tienen criterio de máximos.',
    articleRef: 'Anexo III',
  },
];

// ── Workflow Phases ──
export const WORKFLOW_PHASES: WorkflowPhase[] = [
  { id: 'input', label: 'ENTRADAS', sublabel: 'Datos Primarios', color: '#10b981', nodes: [] },
  { id: 'process', label: 'PROCESO', sublabel: 'Transformación', color: '#06b6d4', nodes: [] },
  { id: 'overhead', label: 'GASTOS', sublabel: 'Motor de Cálculo', color: '#f43f5e', nodes: [] },
  { id: 'finance', label: 'FINANZAS', sublabel: 'Precio Final', color: '#10b981', nodes: [] },
  { id: 'output', label: 'SALIDA', sublabel: 'Documento Aprobado', color: '#64748b', nodes: [] },
];

// ── All nodes indexed by mode ──
export const ALL_NODES: Record<string, CostMapNode[]> = {
  prod: PROD_NODES,
  serv: SERV_NODES,
  com: COM_NODES,
};

// ── Phase lookup ──
export function getNodesForMode(mode: string): CostMapNode[] {
  return ALL_NODES[mode] || PROD_NODES;
}

// ── Phase node IDs per mode (populated dynamically) ──
export function getPhasesForMode(mode: string): WorkflowPhase[] {
  const nodes = getNodesForMode(mode);
  return WORKFLOW_PHASES.map(phase => ({
    ...phase,
    nodes: nodes.filter(n => n.phase === phase.id).map(n => n.id),
  }));
}

// ── Node completion checker ──
export function getNodeCompletion(nodeId: string, data: any): boolean {
  if (!data) return false;

  // Header: complete when product name is filled
  if (nodeId.endsWith('-header')) {
    return !!data.header?.name && data.header.name.trim().length > 0;
  }

  const node = [...PROD_NODES, ...SERV_NODES, ...COM_NODES].find(n => n.id === nodeId);
  if (!node) return false;

  // Annex nodes: complete when annex has at least one row
  if (node.annexId) {
    return (data.annexes || []).some(
      (a: any) => a.id === node.annexId && a.data && a.data.length > 0
    );
  }

  // Section nodes (main, overhead, finance): complete when all input annexes are filled
  // AND the corresponding calculated rows have non-zero values
  if (node.isSection) {
    const mode = node.mode;
    const modeNodes = ALL_NODES[mode] || PROD_NODES;
    const inputNodes = modeNodes.filter(n => n.phase === 'input');

    // Check all input annexes have data
    const allInputsComplete = inputNodes.every(n => {
      if (n.annexId) {
        return (data.annexes || []).some(
          (a: any) => a.id === n.annexId && a.data && a.data.length > 0
        );
      }
      return true; // header already checked separately
    });

    if (!allInputsComplete) return false;

    // Check that calculated values exist for the relevant section
    const calculated = data.calculatedValues || {};
    if (node.rowId === 'main') {
      // Costos consolidados: F5 should have a value
      return !!calculated['5.1']?.total && calculated['5.1'].total > 0;
    }
    if (node.rowId === 'overhead') {
      // Gastos indirectos: F11 should have a value
      return !!calculated['11.1']?.total && calculated['11.1'].total > 0;
    }
    if (node.rowId === 'finance') {
      // Precio: F14 should have a value
      return !!calculated['14.1']?.total && calculated['14.1'].total > 0;
    }

    return false;
  }

  // Signature nodes: complete when header + all annexes are filled + price exists
  if (node.isSignature) {
    const mode = node.mode;
    const modeNodes = ALL_NODES[mode] || PROD_NODES;

    // All nodes except signature must be complete
    const allOtherComplete = modeNodes
      .filter(n => !n.isSignature)
      .every(n => getNodeCompletion(n.id, data));

    return allOtherComplete;
  }

  return false;
}

// ── Step validation (same logic as original wizard) ──
export function getNodeValidation(
  nodeId: string,
  data: any,
): { canProceed: boolean; reason: string | null } {
  if (!data) return { canProceed: false, reason: 'No hay datos cargados' };

  if (nodeId.endsWith('-header')) {
    if (!data.header?.name || data.header.name.trim().length === 0) {
      return { canProceed: false, reason: 'Debe ingresar el nombre del producto' };
    }
    return { canProceed: true, reason: null };
  }

  const node = [...PROD_NODES, ...SERV_NODES, ...COM_NODES].find(n => n.id === nodeId);
  if (!node) return { canProceed: true, reason: null };

  if (node.annexId) {
    const hasRows = (data.annexes || []).some(
      (a: any) => a.id === node.annexId && a.data && a.data.length > 0
    );
    if (!hasRows) {
      return {
        canProceed: false,
        reason: `Debe agregar al menos una fila en el Anexo ${node.annexId}`,
      };
    }
  }

  return { canProceed: true, reason: null };
}

// ── Mode labels ──
export const MODE_LABELS: Record<string, { label: string; sublabel: string }> = {
  prod: { label: 'PRODUCCIÓN', sublabel: 'Bienes' },
  serv: { label: 'SERVICIOS', sublabel: 'Prestaciones' },
  com: { label: 'COMERCIALIZACIÓN', sublabel: 'Actividad comercial' },
};

// ═══════════════════════════════════════════════════════════════
// SIMULATION VALIDATION — enriched checks per node type
// Used by useSimulation to audit each node during Play
// ═══════════════════════════════════════════════════════════════

function _annexRowTotal(row: Record<string, any>): number {
  const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe]
    .find((v) => v !== undefined && v !== null);
  return typeof val === 'number' ? val : parseFloat(String(val ?? 0)) || 0;
}

export function validateSimulationNode(
  node: CostMapNode,
  data: any,
  calculatedValues?: Record<string, any>,
  calculatedAnnexes?: any[] | null,
): NodeValidationResult {
  if (!data) return { valid: false, reason: 'No hay datos cargados' };

  if (node.isHeader) {
    if (!data.header?.name?.trim()) {
      return { valid: false, reason: 'El nombre del producto es obligatorio' };
    }
    return { valid: true, reason: null };
  }

  if (node.annexId) {
    // Prefer calculatedAnnexes (with coefficients applied) over raw data.annexes
    const annex =
      (calculatedAnnexes || []).find((a: any) => a.id === node.annexId) ||
      (data.annexes || []).find((a: any) => a.id === node.annexId);
    if (!annex?.data || annex.data.length === 0) {
      return { valid: false, reason: `Anexo ${node.annexId}: sin filas de datos` };
    }
    // Only validate that rows exist — zero values are NOT errors
    return { valid: true, reason: null };
  }

  if (node.isSection) {
    const cv = calculatedValues || {};
    if (node.rowId === 'main') {
      // F5 total not computed yet (null/undefined) → error; zero is acceptable
      if (cv['5.1']?.total === undefined || cv['5.1']?.total === null) {
        return { valid: false, reason: 'Costo total (F5) sin valor' };
      }
      return { valid: true, reason: null };
    }
    if (node.rowId === 'overhead') {
      // F11 not computed → error; zero is acceptable
      if (cv['11.1']?.total === undefined || cv['11.1']?.total === null) {
        return { valid: false, reason: 'Gastos indirectos (F11) sin valor' };
      }
      return { valid: true, reason: null };
    }
    if (node.rowId === 'finance') {
      // F14 selling price not computed → error; zero is acceptable
      if (cv['14.1']?.total === undefined || cv['14.1']?.total === null) {
        return { valid: false, reason: 'Precio de venta (F14) sin valor' };
      }
      const cost = cv['12.1']?.total;
      const utility = cv['13.1']?.total;
      if (cost && utility && cost > 0) {
        const pct = (utility / cost) * 100;
        const maxUtil = node.mode === 'com' ? 15 : node.mode === 'serv' ? 15 : 25;
        if (pct > maxUtil) {
          return { valid: false, reason: `Utilidad ${pct.toFixed(1)}% excede max (${maxUtil}%)` };
        }
      }
      return { valid: true, reason: null };
    }
  }

  if (node.isSignature) {
    return { valid: true, reason: null };
  }

  return { valid: true, reason: null };
}

export function validateAllNodes(
  nodes: CostMapNode[],
  data: any,
  calculatedValues?: Record<string, any>,
  calculatedAnnexes?: any[] | null,
): Record<string, NodeValidationResult> {
  const results: Record<string, NodeValidationResult> = {};
  for (const node of nodes) {
    results[node.id] = validateSimulationNode(node, data, calculatedValues, calculatedAnnexes);
  }
  return results;
}
