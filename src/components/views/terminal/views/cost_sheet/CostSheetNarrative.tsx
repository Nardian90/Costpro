'use client';

import React, { useMemo, useCallback } from 'react';
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType,
  TableLayoutType, VerticalAlign
} from 'docx';
import {
  FileText, TrendingUp, Download, PieChart as PieIcon, BarChart3,
  Activity, Target, Shield, AlertTriangle, CheckCircle2, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus, Lightbulb, Building2, Package,
  Users, Wrench, Calculator, DollarSign, FileCheck, Layers,
  Sparkles
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { SafePieChart } from "@/components/ui/SafePieChart";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { CostSheetData, CostSheetSection, CostSheetHeader, CalculatedRowValue, CostSheetRow, CostSheetAnnex } from '@/types/cost-sheet';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell, ComposedChart, Line, ReferenceLine, Area, AreaChart
} from 'recharts';
import { cn } from '@/lib/utils';

const ThemedTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-popover/95 backdrop-blur-xl p-3 shadow-xl">
      {label && <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name || entry.dataKey}:</span>
          <span className="font-bold text-foreground">{typeof entry.value === 'number' ? entry.value.toLocaleString('es-CU', { minimumFractionDigits: 2 }) : entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Types ──
interface CostSheetNarrativeProps {
  data: CostSheetData;
  calculatedValues?: Record<string, CalculatedRowValue>;
  calculatedHeader?: Partial<CostSheetHeader>;
}

interface SectionAnalysis {
  id: string;
  label: string;
  total: number;
  percentOfCosto: number;
  rows: number;
  status: 'empty' | 'partial' | 'complete';
}

// ── Helper: Extract numeric value from calculated row ──
function getVal(cv: Record<string, CalculatedRowValue> | undefined, rowId: string): number {
  if (!cv) return 0;
  const entry = cv[rowId];
  if (!entry) return 0;
  return Number(entry.total) || 0;
}

// ── Helper: Scan rows recursively to find first data row value ──
function getFirstDataRowValue(cv: Record<string, CalculatedRowValue> | undefined, rows: CostSheetRow[]): number {
  for (const row of rows) {
    if (row.children?.length) {
      const childVal = getFirstDataRowValue(cv, row.children);
      if (childVal > 0) return childVal;
    } else {
      const v = getVal(cv, row.id);
      if (v > 0) return v;
    }
  }
  return 0;
}

// ── Res 148/2023 Compliance checks ──
interface ComplianceItem {
  rule: string;
  description: string;
  status: 'pass' | 'fail' | 'warning' | 'na';
  detail: string;
}

// ── Color palette ──
const COLORS = {
  primary: '#6366f1',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#ef4444',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  slate: '#64748b',
  orange: '#f97316',
  pink: '#ec4899',
  teal: '#14b8a6',
};

const SECTION_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#64748b', '#84cc16'];

// ────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────
function CostSheetNarrative({ data, calculatedValues = {}, calculatedHeader = {} }: CostSheetNarrativeProps) {
  const header = data?.header || {};
  const sections: CostSheetSection[] = data?.sections || [];
  const annexes: CostSheetAnnex[] = data?.annexes || [];

  const fmt = (val: number) => formatCurrency(val);
  const pct = (val: number, total: number) => total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';

  // ── Key financial metrics from calculated values ──
  // R1.4: Use calculatedHeader as primary source, fallback to calculatedValues by ID
  const metrics = useMemo(() => {
    const cv = calculatedValues;
    const ch = calculatedHeader as Record<string, unknown> | undefined;

    // Helper: try calculatedHeader first, then specific row IDs
    const pick = (headerField: string, ...rowIds: string[]): number => {
      if (ch) {
        const hVal = ch[headerField];
        if (typeof hVal === 'number' && hVal > 0) return hVal;
      }
      for (const id of rowIds) {
        const v = getVal(cv, id);
        if (v > 0) return v;
      }
      return 0;
    };

    const s1 = pick('costoMaterial', '1', 's1', '1.1');
    const s2 = pick('salarioDirecto', '2', 's2', '2.1');
    const s3 = pick('otrosDirectos', '3', 's3', '3.1');
    const s4 = pick('gastosAsociados', '4', 's4', '4.1');
    const s5 = pick('totalCost', 'costoTotal', 'total_cost', '5', 's5');
    const s6 = pick('gastosAdmon', '6', 's6');
    const s7 = pick('gastosDistribucion', '7', 's7');
    const s8 = pick('gastosFinancieros', '8', 's8');
    const s9 = pick('gastosOsde', '9', 's9');
    const s10 = pick('gastosTributarios', '10', 's10');
    const s11 = pick('totalGastos', '11', 's11');
    const s12 = pick('costoYGasto', '12', '12.1', 's12');
    const s13_utility = pick('utilidad', '13.1', 's13');
    const s13_precio_antes_imp = pick('precioAntesImpuesto', '13.2');
    const s13_imp = pick('impuestoVentas', '13.3');
    const s14_precio = pick('precioVenta', 'precio_venta', 'sale_price', '14.1', 's14');
    const s15_unit_cost = pick('costoUnitario', '15.1', 's15');
    const s16_unit_sale = pick('precioUnitario', '16.1', 's16');

    const costoTotal = s5 || 0;
    const gastosTotal = s11 || 0;
    const costoYGasto = s12 || (costoTotal + gastosTotal);
    const margen = s13_utility || 0;
    const precioFinal = s14_precio || 0;
    const precioUnitario = s16_unit_sale || 0;
    const costoUnitario = s15_unit_cost || 0;
    const margenPct = costoYGasto > 0 ? (margen / costoYGasto * 100) : 0;

    return {
      s1, s2, s3, s4, s5: costoTotal, s6, s7, s8, s9, s10,
      s11: gastosTotal, s12: costoYGasto,
      utilidad: margen, precioFinal, precioUnitario, costoUnitario, margenPct,
      css: getVal(calculatedValues, '10.1'),
      impFuerzaTrabajo: getVal(calculatedValues, '10.2'),
    };
  }, [calculatedValues]);

  // ── Section analysis ──
  const sectionAnalysis: SectionAnalysis[] = useMemo(() => {
    return sections.map((sec, idx) => {
      // FIX: Try multiple routes to find section total — sec.id, rows[0].id, then recursive scan
      const secTotal =
        getVal(calculatedValues, sec.id) ||
        getVal(calculatedValues, sec.rows?.[0]?.id || '') ||
        getFirstDataRowValue(calculatedValues, sec.rows || []);
      const hasData = secTotal > 0;
      const childCount = sec.rows?.length || 0;

      // R2.1 — Compute partial status: count filled rows
      let status: 'empty' | 'partial' | 'complete' = 'empty';
      if (hasData) {
        const filledRows = (sec.rows || []).filter(r => getVal(calculatedValues, r.id) > 0).length;
        status = filledRows >= childCount * 0.8 ? 'complete' : 'partial';
      }

      return {
        id: sec.id,
        label: sec.label?.replace(/^Sección\s*\d+:\s*/i, '') || sec.label || `S${idx + 1}`,
        total: secTotal,
        percentOfCosto: metrics.s5 > 0 ? (secTotal / metrics.s5 * 100) : 0,
        rows: childCount,
        status,
      };
    });
  }, [sections, calculatedValues, metrics.s5]);

  // ── Cost breakdown for charts ──
  const costBreakdown = useMemo(() => [
    { name: 'Material (S1)', value: metrics.s1, color: COLORS.primary },
    { name: 'Salario Directo (S2)', value: metrics.s2, color: COLORS.emerald },
    { name: 'Otros Directos (S3)', value: metrics.s3, color: COLORS.amber },
    { name: 'Gastos Asoc. (S4)', value: metrics.s4, color: COLORS.rose },
  ].filter(d => d.value > 0), [metrics]);

  const expensesBreakdown = useMemo(() => [
    { name: 'Gral. y Admon. (S6)', value: metrics.s6, color: COLORS.blue },
    { name: 'Dist. y Venta (S7)', value: metrics.s7, color: COLORS.violet },
    { name: 'Financieros (S8)', value: metrics.s8, color: COLORS.cyan },
    { name: 'Financ. OSDE (S9)', value: metrics.s9, color: COLORS.orange },
    { name: 'Tributarios (S10)', value: metrics.s10, color: COLORS.pink },
  ].filter(d => d.value > 0), [metrics]);

  // ── Waterfall data: cost accumulation ──
  const waterfallData = useMemo(() => {
    const items: { name: string; valor: number; acumulado: number }[] = [];
    let acc = 0;
    const costItems = [
      { name: 'Gasto Material', val: metrics.s1 },
      { name: 'Salario Directo', val: metrics.s2 },
      { name: 'Otros Directos', val: metrics.s3 },
      { name: 'Gastos Asoc.', val: metrics.s4 },
    ];
    for (const item of costItems) {
      if (item.val > 0) {
        acc += item.val;
        items.push({ name: item.name, valor: item.val, acumulado: acc });
      }
    }
    if (metrics.s5 > 0) items.push({ name: 'COSTO TOTAL', valor: metrics.s5, acumulado: metrics.s5 });

    acc = metrics.s5;
    const expenseItems = [
      { name: 'Gral. y Admon.', val: metrics.s6 },
      { name: 'Dist. y Venta', val: metrics.s7 },
      { name: 'Financieros', val: metrics.s8 },
      { name: 'Tributarios', val: metrics.s10 },
    ];
    for (const item of expenseItems) {
      if (item.val > 0) {
        acc += item.val;
        items.push({ name: item.name, valor: item.val, acumulado: acc });
      }
    }
    if (metrics.s12 > 0) items.push({ name: 'TOTAL C+G', valor: metrics.s12, acumulado: metrics.s12 });
    if (metrics.utilidad > 0) items.push({ name: 'Utilidad', valor: metrics.utilidad, acumulado: metrics.s12 + metrics.utilidad });
    if (metrics.precioFinal > 0) items.push({ name: 'PRECIO', valor: metrics.precioFinal, acumulado: metrics.precioFinal });
    return items;
  }, [metrics]);

  // ── Annex status ──
  const annexStatus = useMemo(() => {
    return annexes.map(a => {
      const rowCount = a.data?.length || 0;
      const titleParts = a.title?.split(' - ') || [];
      const shortTitle = titleParts.length > 1 ? titleParts[1].trim() : a.title || `Anexo ${a.id}`;
      return {
        id: a.id,
        title: shortTitle,
        rowCount,
        hasData: rowCount > 0,
        columns: a.columns?.length || 0,
      };
    });
  }, [annexes]);

  // ── Res 148/2023 Compliance ──
  const compliance: ComplianceItem[] = useMemo(() => {
    const checks: ComplianceItem[] = [];
    const productName = header.name || '';
    const hasResolution = !!header.resolution;

    checks.push({
      rule: 'RES-001',
      description: 'Identificacion del producto/servicio',
      status: productName.length > 2 ? 'pass' : 'fail',
      detail: productName.length > 2 ? `Producto definido: "${productName}"` : 'No se ha identificado el objeto de costing',
    });

    checks.push({
      rule: 'RES-002',
      description: 'Resolucion de referencia (Res 148/2023)',
      status: hasResolution ? 'pass' : 'warning',
      detail: hasResolution ? `Resolucion: ${header.resolution}` : 'No se ha especificado la resolucion aplicable',
    });

    checks.push({
      rule: 'RES-003',
      description: 'Anexo I - Desglose de Materias Primas',
      status: annexStatus.find(a => a.id === 'I')?.hasData ? 'pass' : 'fail',
      detail: annexStatus.find(a => a.id === 'I')?.hasData
        ? `Completado con ${annexStatus.find(a => a.id === 'I')?.rowCount} registros`
        : 'Anexo I sin datos. Las materias primas son la base del costo',
    });

    checks.push({
      rule: 'RES-004',
      description: 'Anexo II - Desglose de Salarios',
      status: annexStatus.find(a => a.id === 'II')?.hasData ? 'pass' : metrics.s2 > 0 ? 'warning' : 'fail',
      detail: metrics.s2 > 0
        ? 'Salario directo registrado pero sin desglose en Anexo II'
        : 'Anexo II sin datos y salario directo en cero',
    });

    checks.push({
      rule: 'RES-005',
      description: 'Anexo III - Depreciacion de Equipos',
      status: annexStatus.find(a => a.id === 'III')?.hasData ? 'pass' : metrics.s3 > 0 ? 'warning' : 'na',
      detail: metrics.s3 > 0
        ? 'Otros gastos directos registrados pero sin detalle de depreciacion'
        : 'No aplica si no hay activos fijos',
    });

    checks.push({
      rule: 'RES-006',
      description: 'Secciones 1-5: Estructura de Costos completa',
      status: metrics.s5 > 0 ? 'pass' : 'fail',
      detail: metrics.s5 > 0 ? `Costo total calculado: ${fmt(metrics.s5)}` : 'El costo total (S5) no se ha calculado',
    });

    checks.push({
      rule: 'RES-007',
      description: 'Secciones 6-10: Gastos operacionales',
      status: metrics.s11 > 0 ? 'pass' : 'warning',
      detail: metrics.s11 > 0
        ? `Total de gastos: ${fmt(metrics.s11)}`
        : 'Los gastos operacionales no han sido determinados',
    });

    checks.push({
      rule: 'RES-008',
      description: 'Seccion 10: Contribucion a la Seguridad Social (14%)',
      status: metrics.css > 0 ? 'pass' : 'fail',
      detail: metrics.css > 0
        ? `CSS calculada: ${fmt(metrics.css)} (14% sobre salarios)`
        : 'La contribucion a la Seguridad Social no esta calculada',
    });

    checks.push({
      rule: 'RES-009',
      description: 'Seccion 10: Impuesto sobre la Fuerza de Trabajo (5%)',
      status: metrics.impFuerzaTrabajo > 0 ? 'pass' : 'fail',
      detail: metrics.impFuerzaTrabajo > 0
        ? `Impuesto calculado: ${fmt(metrics.impFuerzaTrabajo)} (5% sobre salarios)`
        : 'El impuesto sobre la fuerza de trabajo no esta calculado',
    });

    checks.push({
      rule: 'RES-010',
      description: 'Seccion 13-14: Utilidad y Precio de Venta',
      status: metrics.precioFinal > 0 ? 'pass' : 'fail',
      detail: metrics.precioFinal > 0
        ? `Precio final: ${fmt(metrics.precioFinal)} (margen ${metrics.margenPct.toFixed(1)}%)`
        : 'El precio de venta no ha sido determinado',
    });

    checks.push({
      rule: 'RES-011',
      description: 'Firma de elaborador, revisor y aprobador',
      status: data?.signature ? 'pass' : 'warning',
      detail: data?.signature
        ? 'Seccion de firma habilitada'
        : 'No se ha completado el pie de firma de la ficha',
    });

    return checks;
  }, [header, metrics, annexStatus, data?.signature]);

  const complianceScore = compliance.filter(c => c.status === 'pass').length;
  const complianceTotal = compliance.filter(c => c.status !== 'na').length;
  const compliancePct = complianceTotal > 0 ? Math.round((complianceScore / complianceTotal) * 100) : 0;

  // ── Insights generation ──
  const insights = useMemo(() => {
    const items: { icon: any; text: string; type: 'info' | 'warning' | 'success' | 'danger' }[] = [];

    if (metrics.s1 > 0 && metrics.s5 > 0) {
      const materialPct = (metrics.s1 / metrics.s5 * 100).toFixed(1);
      items.push({
        icon: Package,
        text: `El gasto material representa el ${materialPct}% del costo total.${Number(materialPct) > 60 ? ' Este porcentaje es elevado y podria indicar dependencia excesiva de insumos importados.' : ' El rango optimo segun estandares industriales es 40-60%.'}`,
        type: Number(materialPct) > 60 ? 'warning' : 'info',
      });
    }

    if (metrics.s2 > 0 && metrics.s5 > 0) {
      const laborPct = (metrics.s2 / metrics.s5 * 100).toFixed(1);
      items.push({
        icon: Users,
        text: `La fuerza de trabajo directa representa el ${laborPct}% del costo total.${Number(laborPct) < 15 ? ' Es un porcentaje bajo que podria indicar alta automatizacion o subcontratacion.' : ''}`,
        type: 'info',
      });
    }

    if (metrics.s11 > 0 && metrics.s5 > 0) {
      const overheadRatio = (metrics.s11 / metrics.s5 * 100).toFixed(1);
      items.push({
        icon: Calculator,
        text: `La relacion gastos/costo es de ${overheadRatio}%.${Number(overheadRatio) > 80 ? ' Esta proporcion es alta y sugiere revisar la eficiencia operativa.' : ' Los benchmarks del sector sugieren mantener esta relacion por debajo del 80%.'}`,
        type: Number(overheadRatio) > 80 ? 'warning' : 'success',
      });
    }

    if (metrics.margenPct > 0) {
      items.push({
        icon: TrendingUp,
        text: `El margen de utilidad es del ${metrics.margenPct.toFixed(1)}%.${metrics.margenPct >= 30 ? ' Supera el benchmark del 30% establecido por la Res 148/2023.' : metrics.margenPct >= 15 ? ' Es positivo pero podria mejorarse para garantizar sostenibilidad.' : ' El margen es insuficiente y requiere revision urgente de la estructura de costos.'}`,
        type: metrics.margenPct >= 30 ? 'success' : metrics.margenPct >= 15 ? 'warning' : 'danger',
      });
    }

    if (metrics.precioFinal > 0 && metrics.costoUnitario > 0) {
      const markup = ((metrics.precioUnitario / metrics.costoUnitario - 1) * 100).toFixed(1);
      items.push({
        icon: DollarSign,
        text: `El markup sobre costo unitario es del ${markup}%. Esto significa que por cada ${fmt(1)} de costo, se genera ${fmt(metrics.precioUnitario - metrics.costoUnitario)} de margen bruto por unidad.`,
        type: 'info',
      });
    }

    if (compliancePct < 100) {
      items.push({
        icon: Shield,
        text: `Cumplimiento Res 148/2023: ${compliancePct}%. Quedan ${complianceTotal - complianceScore} requisitos pendientes por completar antes de la aprobacion final.`,
        type: compliancePct >= 70 ? 'warning' : 'danger',
      });
    }

    return items;
  }, [metrics, compliancePct, complianceScore, complianceTotal]);

  // ── Helper: resolve header value (prefer calculated over raw formula) ──
  const hdr = (field: keyof CostSheetHeader, fallback: string = '—') => {
    const raw = calculatedHeader?.[field];
    if (raw !== undefined && raw !== null && raw !== '') {
      // If calculated header has a non-formula value, use it
      const strVal = String(raw);
      if (!strVal.startsWith('=')) return strVal;
    }
    const orig = (header as Record<string, unknown>)[field];
    if (orig !== undefined && orig !== null && orig !== '') {
      const strOrig = String(orig);
      if (!strOrig.startsWith('=')) return strOrig;
    }
    return fallback;
  };

  // ── Word Export — R1.3: Real .docx using docx library ──
  const exportToWord = useCallback(async () => {
    try {
      const productName = hdr('name', 'Ficha de Costo');
      const productCode = hdr('code', 'S/C');
      const resolution = hdr('resolution', 'No especificada');
      const date = hdr('date', new Date().toISOString().split('T')[0]);
      const quantity = hdr('quantity', '1');
      const currency = hdr('currency', 'CUP');
      const unit = hdr('unit', 'unidad');

      const statusLabel = (s: string) => {
        if (s === 'pass') return 'OK';
        if (s === 'warning') return 'PARCIAL';
        if (s === 'fail') return 'NO';
        return 'N/A';
      };

      const headerCell = (text: string, width: number, shading?: string) => new TableCell({
        width: { size: width, type: WidthType.PERCENTAGE },
        shading: shading ? { type: ShadingType.SOLID, color: shading } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, font: 'Calibri', size: 18, color: 'FFFFFF' })] })],
      });

      const dataCell = (text: string, opts?: { bold?: boolean; color?: string; shading?: string }) => new TableCell({
        verticalAlign: VerticalAlign.CENTER,
        shading: opts?.shading ? { type: ShadingType.SOLID, color: opts?.shading } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text, font: 'Calibri', size: 20, bold: opts?.bold, color: opts?.color })] })],
      });

      const doc = new Document({
        sections: [{
          properties: {
            page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
          },
          children: [
            // Title
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 100 },
              children: [new TextRun({ text: 'INFORME DE COSTO', bold: true, font: 'Calibri', size: 40, color: '4F46E5' })],
            }),
            new Paragraph({
              spacing: { after: 300 },
              children: [new TextRun({ text: `Analisis Integral  |  ${resolution}  |  Generado: ${new Date().toLocaleDateString('es-CU')}`, font: 'Calibri', size: 18, color: '64748B', italics: true })],
            }),

            // Product info
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: 'DATOS DEL PRODUCTO', bold: true, font: 'Calibri', size: 28, color: '334155' })] }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [dataCell('Producto', { bold: true, shading: 'F1F5F9' }), dataCell(productName, { bold: true })] }),
                new TableRow({ children: [dataCell('Codigo', { bold: true, shading: 'F1F5F9' }), dataCell(productCode)] }),
                new TableRow({ children: [dataCell('Cantidad', { bold: true, shading: 'F1F5F9' }), dataCell(`${quantity} ${unit}`)] }),
                new TableRow({ children: [dataCell('Moneda', { bold: true, shading: 'F1F5F9' }), dataCell(currency)] }),
                new TableRow({ children: [dataCell('Fecha', { bold: true, shading: 'F1F5F9' }), dataCell(date)] }),
              ],
            }),

            // KPI Summary
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 100 }, children: [new TextRun({ text: 'RESUMEN EJECUTIVO', bold: true, font: 'Calibri', size: 28, color: '334155' })] }),
            new Paragraph({
              spacing: { after: 200 },
              children: [new TextRun({ text: `Costo Total: ${fmt(metrics.s5)}  |  Gastos: ${fmt(metrics.s11)}  |  C+G: ${fmt(metrics.s12)}  |  Precio: ${fmt(metrics.precioFinal)}  |  Utilidad: ${metrics.margenPct.toFixed(1)}%`, font: 'Calibri', size: 22, bold: true, color: '4F46E5' })],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [new TextRun({ text: `Este informe presenta el analisis integral de la ficha de costo para ${productName}. El costo total asciende a ${fmt(metrics.s5)}, con gastos de ${fmt(metrics.s11)}, para un costo y gasto de ${fmt(metrics.s12)}. La utilidad es del ${metrics.margenPct.toFixed(1)}%, resultando en un precio de venta de ${fmt(metrics.precioFinal)}.`, font: 'Calibri', size: 22 })],
            }),

            // Section breakdown
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 100 }, children: [new TextRun({ text: 'DESGLOSE POR SECCIONES', bold: true, font: 'Calibri', size: 28, color: '334155' })] }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [headerCell('Seccion', 10, '4F46E5'), headerCell('Total', 30, '4F46E5'), headerCell('% del Costo', 15, '4F46E5'), headerCell('Estado', 15, '4F46E5')] }),
                ...sectionAnalysis.map((s, i) => new TableRow({
                  children: [
                    dataCell(`${i + 1}. ${s.label}`),
                    dataCell(fmt(s.total), { bold: true }),
                    dataCell(`${s.percentOfCosto.toFixed(1)}%`),
                    dataCell(statusLabel(s.status), { color: s.status === 'complete' ? '059669' : s.status === 'partial' ? 'D97706' : 'DC2626' }),
                  ],
                })),
              ],
            }),

            // Annex status
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 100 }, children: [new TextRun({ text: 'ESTADO DE ANEXOS', bold: true, font: 'Calibri', size: 28, color: '334155' })] }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [headerCell('Anexo', 15, '4F46E5'), headerCell('Descripcion', 40, '4F46E5'), headerCell('Registros', 15, '4F46E5'), headerCell('Estado', 15, '4F46E5')] }),
                ...annexStatus.map(a => new TableRow({
                  children: [
                    dataCell(`Anexo ${a.id}`, { bold: true }),
                    dataCell(a.title),
                    dataCell(String(a.rowCount)),
                    dataCell(a.hasData ? 'Completo' : 'Sin datos', { color: a.hasData ? '059669' : 'DC2626' }),
                  ],
                })),
              ],
            }),

            // Compliance
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 100 }, children: [new TextRun({ text: 'CUMPLIMIENTO RES 148/2023', bold: true, font: 'Calibri', size: 28, color: '334155' })] }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [headerCell('Codigo', 15, '4F46E5'), headerCell('Requisito', 35, '4F46E5'), headerCell('Estado', 15, '4F46E5'), headerCell('Detalle', 35, '4F46E5')] }),
                ...compliance.map(c => new TableRow({
                  children: [
                    dataCell(c.rule, { bold: true }),
                    dataCell(c.description),
                    dataCell(statusLabel(c.status), { color: c.status === 'pass' ? '059669' : c.status === 'warning' ? 'D97706' : 'DC2626' }),
                    dataCell(c.detail, { color: '64748B' }),
                  ],
                })),
              ],
            }),
            new Paragraph({
              spacing: { before: 100, after: 200 },
              children: [new TextRun({ text: `Puntaje de cumplimiento: ${compliancePct}% (${complianceScore}/${complianceTotal})`, bold: true, font: 'Calibri', size: 22 })],
            }),

            // Pricing
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 100 }, children: [new TextRun({ text: 'ANALISIS DE RENTABILIDAD', bold: true, font: 'Calibri', size: 28, color: '334155' })] }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                ...[
                  ['Costo Unitario', fmt(metrics.costoUnitario)],
                  ['Precio Venta Unitario', fmt(metrics.precioUnitario)],
                  ['Margen Bruto', fmt(metrics.precioUnitario - metrics.costoUnitario)],
                  ['% Margen', `${metrics.margenPct.toFixed(1)}%`],
                  ['CSS (14%)', fmt(metrics.css)],
                  ['Imp. Fuerza Trabajo (5%)', fmt(metrics.impFuerzaTrabajo)],
                ].map(([label, value]) => new TableRow({
                  children: [dataCell(label as string, { bold: true, shading: 'F8FAFC' }), dataCell(value as string)],
                })),
              ],
            }),

            // Insights
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 100 }, children: [new TextRun({ text: 'HALLAZGOS Y RECOMENDACIONES', bold: true, font: 'Calibri', size: 28, color: '334155' })] }),
            ...insights.map(ins => new Paragraph({
              spacing: { after: 80 },
              bullet: { level: 0 },
              children: [new TextRun({ text: ins.text, font: 'Calibri', size: 22 })],
            })),

            // Footer
            new Paragraph({
              spacing: { before: 400 },
              children: [new TextRun({ text: `Informe generado automaticamente por CostPro  |  ${new Date().toLocaleString('es-CU')}  |  Basado en la Resolucion 148/2023`, font: 'Calibri', size: 16, color: '94A3B8', italics: true })],
            }),
          ],
        }],
      });

      const buffer = await Packer.toBuffer(doc);
      const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Informe_Costo_${productName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '_')}_${date}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Informe exportado a Word (.docx)');
    } catch (e) {
      console.error('[Narrative] Export error:', e);
      toast.error('Error al exportar el informe');
    }
  }, [header, calculatedHeader, hdr, metrics, sectionAnalysis, annexStatus, compliance, insights, compliancePct, complianceScore, complianceTotal]);

  // ── Render helpers ──
  const StatusBadge = ({ status, label }: { status: string; label: string }) => {
    const cls = status === 'pass' ? 'bg-primary/10 text-blue-700 dark:text-blue-400 border-primary/20'
      : status === 'warning' ? 'bg-warning/10 text-amber-700 dark:text-amber-400 border-warning/20'
      : status === 'fail' ? 'bg-destructive/10 text-destructive dark:text-red-400 border-destructive/20'
      : 'bg-muted/10 text-muted-foreground border-muted/20';
    const Icon = status === 'pass' ? CheckCircle2 : status === 'warning' ? AlertTriangle : status === 'fail' ? AlertTriangle : Minus;
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", cls)}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  const InsightCard = ({ icon: Icon, text, type }: { icon: any; text: string; type: string }) => {
    const colorMap: Record<string, string> = {
      info: 'border-primary/20 bg-primary/5 text-blue-900 dark:text-blue-200',
      warning: 'border-warning/20 bg-warning/5 text-amber-900 dark:text-amber-200',
      success: 'border-primary/20 bg-primary/5 text-blue-900 dark:text-blue-200',
      danger: 'border-destructive/20 bg-destructive/5 text-red-900 dark:text-red-200',
    };
    return (
      <div className={cn("flex items-start gap-3 p-3 rounded-xl border text-xs leading-relaxed", colorMap[type] || colorMap.info)}>
        <Icon className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{text}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Header Bar ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight text-foreground">Informe de Costo</h2>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-[0.2em]">
                Analisis Integral &bull; {hdr('resolution', 'Res 148/2023')} &bull; {hdr('name', 'Sin producto')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={exportToWord}
              className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar Word (.docx)</span>
            </Button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-border/20">
          {[
            { label: 'Costo Total', value: fmt(metrics.s5), color: 'text-primary' },
            { label: 'Total Gastos', value: fmt(metrics.s11), color: 'text-primary dark:text-blue-400' },
            { label: 'Costo + Gastos', value: fmt(metrics.s12), color: 'text-foreground' },
            { label: 'Utilidad', value: `${metrics.margenPct.toFixed(1)}%`, color: 'text-foreground' },
            { label: 'Precio Final', value: fmt(metrics.precioFinal), color: 'text-violet-600 dark:text-violet-400' },
            { label: 'Cumplimiento', value: `${compliancePct}%`, color: compliancePct >= 80 ? 'text-primary dark:text-blue-400' : 'text-warning dark:text-amber-400' },
          ].map(kpi => (
            <div key={kpi.label} className="px-4 py-3 text-center">
              <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">{kpi.label}</div>
              <div className={cn("text-xs font-black font-mono", kpi.color)}>{kpi.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Product Identification Card ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
        <div className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-muted/5 border-b border-border/20">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">Datos del Producto</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-border/10">
          {[
            { l: 'Producto', v: hdr('name', '—') },
            { l: 'Codigo', v: hdr('code', '—') },
            { l: 'Cantidad', v: `${hdr('quantity', '1')} ${hdr('unit', 'u')}` },
            { l: 'Moneda', v: hdr('currency', 'CUP') },
            { l: 'Resolucion', v: hdr('resolution', '—') },
            { l: 'Fecha', v: hdr('date', '—') },
          ].map(item => (
            <div key={item.l} className="px-4 py-2.5">
              <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">{item.l}</div>
              <div className="text-[11px] font-bold text-foreground truncate">{item.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Grid: Cost Structure + Waterfall ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Structure Pie */}
        <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
          <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-border/20">
            <PieIcon className="w-4 h-4 text-primary" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Estructura de Costos Directos</h3>
          </div>
          <div className="p-4">
            {costBreakdown.length > 0 ? (
              <>
                <SafePieChart data={costBreakdown} colors={costBreakdown.map(d => d.color)} height={200} innerRadius={45} outerRadius={75} />
                <div className="space-y-2 mt-4">
                  {costBreakdown.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-bold text-muted-foreground">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black font-mono">{fmt(item.value)}</span>
                        <span className="text-muted-foreground/60 w-12 text-right">{pct(item.value, metrics.s5)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-xs">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                Sin datos de costo directo
              </div>
            )}
          </div>
        </div>

        {/* Cost Accumulation Waterfall */}
        <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
          <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-border/20">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Acumulacion de Costos y Gastos</h3>
          </div>
          <div className="p-4">
            {waterfallData.length > 1 ? (
              <>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={waterfallData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 'bold' }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 9, fontWeight: 'bold' }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)', stroke: 'hsl(var(--border))' }} />
                      <Bar dataKey="acumulado" fill={COLORS.primary} fillOpacity={0.15} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="acumulado" stroke={COLORS.primary} strokeWidth={2} dot={{ fill: COLORS.primary, r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-muted-foreground italic mt-3 leading-relaxed">
                  La curva muestra como se acumulan los costos desde la materia prima hasta el precio final de venta.
                  {metrics.utilidad > 0 && ` La utilidad de ${fmt(metrics.utilidad)} representa el ${metrics.margenPct.toFixed(1)}% sobre el costo total.`}
                </p>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-xs">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
                Complete los datos para generar el grafico de acumulacion
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section-by-Section Breakdown ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
        <div className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-violet-500/5 border-b border-border/20">
          <Layers className="w-4 h-4 text-violet-500" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Analisis por Secciones</h3>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Header */}
            <div className="grid grid-cols-12 gap-0 px-4 py-2 bg-muted/50 text-[8px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/20">
              <div className="col-span-1 text-center">No.</div>
              <div className="col-span-4">Seccion</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-2">Peso (%)</div>
              <div className="col-span-1 text-center">Filas</div>
              <div className="col-span-2 text-center">Estado</div>
            </div>
            {/* Rows */}
            {sectionAnalysis.map((sec, idx) => {
              const barWidth = metrics.s5 > 0 && sec.total > 0 ? Math.min((sec.total / metrics.s5 * 100), 100) : 0;
              return (
                <div key={sec.id} className={cn(
                  "grid grid-cols-12 gap-0 px-4 py-2.5 items-center border-b border-border/10 hover:bg-primary/3 transition-colors",
                  idx % 2 === 0 && "bg-muted/20"
                )}>
                  <div className="col-span-1 text-center text-[11px] font-black text-muted-foreground/50">{idx + 1}</div>
                  <div className="col-span-4 text-[11px] font-bold text-foreground truncate">{sec.label}</div>
                  <div className="col-span-2 text-right text-[11px] font-black font-mono text-foreground">{fmt(sec.total)}</div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${barWidth}%`, backgroundColor: SECTION_COLORS[idx % SECTION_COLORS.length] }} />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground w-10 text-right">{sec.percentOfCosto.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="col-span-1 text-center text-[10px] text-muted-foreground font-mono">{sec.rows}</div>
                  <div className="col-span-2 flex justify-center">
                    <StatusBadge status={sec.status} label={sec.status === 'complete' ? 'OK' : sec.status === 'partial' ? 'Parcial' : 'Vacio'} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Direct vs Indirect + Expenses Chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Direct vs Indirect */}
        <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
          <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-border/20">
            <Activity className="w-4 h-4 text-warning" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Costos Directos vs Gastos</h3>
          </div>
          <div className="p-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Costo Total\n(Secciones 1-5)', valor: metrics.s5, fill: COLORS.primary },
                  { name: 'Gastos\n(Secciones 6-10)', valor: metrics.s11, fill: COLORS.amber },
                  { name: 'Total C+G\n(Seccion 12)', valor: metrics.s12, fill: COLORS.emerald },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 'bold' }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)', stroke: 'hsl(var(--border))' }} />
                  <Bar dataKey="valor" radius={[8, 8, 0, 0]} barSize={50}>
                    {[
                      { fill: COLORS.primary },
                      { fill: COLORS.amber },
                      { fill: COLORS.emerald },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} {...entry} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-3 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-indigo-500" />
                <span className="font-bold text-muted-foreground">Costo Directo</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-warning" />
                <span className="font-bold text-muted-foreground">Gastos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-primary" />
                <span className="font-bold text-muted-foreground">Total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Expenses Breakdown */}
        <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
          <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-border/20">
            <Target className="w-4 h-4 text-rose-500" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Desglose de Gastos (S6-S10)</h3>
          </div>
          <div className="p-4">
            {expensesBreakdown.length > 0 ? (
              <>
                <SafePieChart data={expensesBreakdown} colors={expensesBreakdown.map(d => d.color)} height={180} innerRadius={40} outerRadius={70} />
                <div className="grid grid-cols-1 gap-1.5 mt-3">
                  {expensesBreakdown.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[10px] px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-bold text-muted-foreground truncate">{item.name}</span>
                      </div>
                      <span className="font-black font-mono shrink-0">{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-xs">
                <Calculator className="w-8 h-8 mx-auto mb-2 opacity-20" />
                Sin gastos operacionales registrados
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Annex Status ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
        <div className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-cyan-500/5 border-b border-border/20">
          <Package className="w-4 h-4 text-cyan-500" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Estado de Anexos</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border/20">
          {annexStatus.map((annex, idx) => (
            <div key={annex.id} className="px-4 py-3 text-center">
              <div className={cn(
                "w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center",
                annex.hasData ? "bg-success/10" : "bg-destructive/10"
              )}>
                {annex.hasData
                  ? <CheckCircle2 className="w-5 h-5 text-success" />
                  : <AlertTriangle className="w-5 h-5 text-destructive" />}
              </div>
              <div className="text-[11px] font-black text-foreground">Anexo {annex.id}</div>
              <div className="text-[9px] text-muted-foreground truncate mt-0.5">{annex.title}</div>
              <div className="text-[10px] font-bold mt-1">
                {annex.hasData
                  ? <span className="text-foreground">{annex.rowCount} registros</span>
                  : <span className="text-destructive">Sin datos</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Res 148/2023 Compliance ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-primary/5 border-b border-border/20">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Comprobacion Res 148/2023</h3>
          </div>
          <div className={cn(
            "px-3 py-1 rounded-full text-[10px] font-black",
            compliancePct >= 80 ? "bg-success/10 text-emerald-700 dark:text-emerald-400"
              : compliancePct >= 50 ? "bg-warning/10 text-amber-700 dark:text-amber-400"
              : "bg-destructive/10 text-destructive dark:text-red-400"
          )}>
            {compliancePct}% cumplimiento
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {compliance.map((item, idx) => (
              <div key={item.rule} className={cn(
                "grid grid-cols-12 gap-0 px-4 py-2.5 items-start border-b border-border/10 hover:bg-primary/3 transition-colors",
                idx % 2 === 0 && "bg-muted/20"
              )}>
                <div className="col-span-2">
                  <span className="text-[9px] font-mono font-bold text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">{item.rule}</span>
                </div>
                <div className="col-span-4 text-[11px] font-bold text-foreground">{item.description}</div>
                <div className="col-span-2 flex justify-center pt-0.5">
                  <StatusBadge
                    status={item.status}
                    label={item.status === 'pass' ? 'OK' : item.status === 'warning' ? 'Parcial' : item.status === 'fail' ? 'No' : 'N/A'}
                  />
                </div>
                <div className="col-span-4 text-[10px] text-muted-foreground leading-relaxed">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Compliance bar */}
        <div className="px-4 py-3 bg-muted/30 border-t border-border/20">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  compliancePct >= 80 ? "bg-primary" : compliancePct >= 50 ? "bg-warning" : "bg-destructive"
                )}
                style={{ width: `${compliancePct}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-muted-foreground">{complianceScore}/{complianceTotal} requisitos</span>
          </div>
        </div>
      </div>

      {/* ── Pricing & Margin Analysis ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
        <div className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-primary/5 border-b border-border/20">
          <DollarSign className="w-4 h-4 text-primary" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Analisis de Precio y Margen</h3>
        </div>
        <div className="p-4">
          {/* Price decomposition chart */}
          <div className="h-[180px] mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'Costo + Gastos', valor: metrics.s12, fill: COLORS.primary },
                  { name: 'Utilidad', valor: metrics.utilidad, fill: COLORS.emerald },
                  { name: 'Impuesto', valor: getVal(calculatedValues, '13.3'), fill: COLORS.amber },
                ]}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 9, fontWeight: 'bold' }} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} width={100} />
                <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)', stroke: 'hsl(var(--border))' }} />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]} barSize={24} stackId="a">
                  {[
                    { fill: COLORS.primary },
                    { fill: COLORS.emerald },
                    { fill: COLORS.amber },
                  ].map((entry, index) => (
                    <Cell key={`cell-${index}`} {...entry} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pricing metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Costo Unitario', value: fmt(metrics.costoUnitario), icon: Calculator, color: 'text-primary' },
              { label: 'Precio Unitario', value: fmt(metrics.precioUnitario), icon: DollarSign, color: 'text-foreground' },
              { label: 'Margen Bruto', value: fmt(metrics.precioUnitario - metrics.costoUnitario), icon: TrendingUp, color: metrics.precioUnitario > metrics.costoUnitario ? 'text-foreground' : 'text-destructive dark:text-red-400' },
              { label: '% Utilidad', value: `${metrics.margenPct.toFixed(1)}%`, icon: Target, color: metrics.margenPct >= 30 ? 'text-foreground' : 'text-warning dark:text-amber-400' },
            ].map(m => (
              <div key={m.label} className="p-3 rounded-xl bg-muted/30 border border-border/20">
                <div className="flex items-center gap-1.5 mb-1">
                  <m.icon className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60">{m.label}</span>
                </div>
                <div className={cn("text-sm font-black font-mono", m.color)}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Insights & Recommendations ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card">
        <div className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-warning/5 border-b border-border/20">
          <Lightbulb className="w-4 h-4 text-warning" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Hallazgos y Recomendaciones</h3>
        </div>
        <div className="p-4 space-y-2">
          {insights.length > 0 ? insights.map((ins, idx) => (
            <InsightCard key={idx} icon={ins.icon} text={ins.text} type={ins.type} />
          )) : (
            <div className="text-center py-8 text-muted-foreground text-xs">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-20" />
              Complete los datos de la ficha para generar hallazgos automaticos
            </div>
          )}
        </div>
      </div>

      {/* ── Executive Conclusion ── */}
      <div className={cn(
        "border rounded-2xl p-6 shadow-sm relative overflow-hidden",
        compliancePct >= 80
          ? "bg-primary/5 border-primary/20"
          : compliancePct >= 50
            ? "bg-warning/5 border-warning/20"
            : "bg-destructive/5 border-destructive/20"
      )}>
        <div className={cn(
          "absolute top-0 right-0 p-4 opacity-10",
          compliancePct >= 80 ? "text-primary" : "text-warning"
        )}>
          <FileCheck className="w-20 h-20" />
        </div>
        <div className="relative z-10 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Conclusion del Informe
          </h4>
          <p className="text-sm leading-relaxed text-foreground font-medium">
            {metrics.precioFinal > 0
              ? `La ficha de costo para "${header.name || 'el producto'}" presenta un costo total de ${fmt(metrics.s5)} con gastos operacionales de ${fmt(metrics.s11)}, alcanzando un costo y gasto total de ${fmt(metrics.s12)}. El precio de venta propuesto es de ${fmt(metrics.precioFinal)}, con un margen de utilidad del ${metrics.margenPct.toFixed(1)}%. ${compliancePct >= 80 ? 'La ficha cumple con la mayoria de los requisitos de la Res 148/2023 y se encuentra en condiciones de ser sometida a aprobacion.' : 'Se requieren ajustes para alcanzar el nivel de cumplimiento exigido por la Res 148/2023 antes de su aprobacion.'}`
              : `La ficha de costo se encuentra en fase de elaboracion. Los datos actuales muestran un costo total de ${fmt(metrics.s5)}. Se recomienda completar los anexos requeridos y las secciones de gastos para obtener un analisis integral completo.`}
          </p>
          <div className="flex items-center gap-6 pt-2">
            <div>
              <div className="text-[10px] font-black uppercase text-muted-foreground/60">Cumplimiento</div>
              <div className={cn("text-xl font-black", compliancePct >= 80 ? "text-foreground" : "text-warning")}>{compliancePct}%</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase text-muted-foreground/60">Precio Final</div>
              <div className="text-xl font-black">{fmt(metrics.precioFinal)}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase text-muted-foreground/60">Margen</div>
              <div className={cn("text-xl font-black", metrics.margenPct >= 30 ? "text-foreground" : "text-warning")}>{metrics.margenPct.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CostSheetNarrative;
