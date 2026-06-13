'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitCompareArrows, ArrowRight, Download, CheckCircle2, XCircle,
  AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronDown,
  BarChart3, PieChart as PieIcon, Target, Shield, Zap, Info,
  FileText, Layers, DollarSign, Users, Package, Activity,
  Trophy, ArrowUpRight, ArrowDownRight, Scale, Award, Printer,
  Search, Filter, LayoutGrid, List
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, Legend, ComposedChart, Area, ReferenceLine
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useUIStore } from '@/store';


import { toast } from 'sonner';
import type { CostSheetData, CostSheetHeader, CostSheetSection, CostSheetRow, CostSheetAnnex } from '@/types/cost-sheet';
import { buildEngineFicha, calculateAnnexesPure } from '@/lib/cost-engine/build-ficha';
import { calculateFicha } from '@/lib/cost-engine';
import { createSharedParser } from '@/lib/cost-engine/shared-mapping';
import type { CalculatedRowValue } from '@/types/cost-sheet';

// ── System Templates ──
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import exampleTemplate from '@/lib/data/costpro-ejemplo';
import juiceTemplate from '@/lib/data/template-juice';
import pizzaTemplate from '@/lib/data/template-pizza';
import pastryTemplate from '@/lib/data/template-pastry';
import furnitureTemplate from '@/lib/data/template-furniture';
import industrialTemplate from '@/lib/data/template-industrial';
import consultancyTemplate from '@/lib/data/template-consultancy';
import icecreamTemplate from '@/lib/data/template-icecream';
import repairTemplate from '@/lib/data/template-repair';
import shoesTemplate from '@/lib/data/template-shoes';
import logisticsTemplate from '@/lib/data/template-logistics';
import lavarTemplate from "@/lib/data/template-lavar";

// ── Types ──
interface TemplateOption {
  id: string;
  name: string;
  description: string;
  category: string;
  data: CostSheetData;
  totalCost?: number;
  isSystem?: boolean;
}

interface SectionComparison {
  label: string;
  id: string;
  valA: number;
  valB: number;
  deviation: number;
  deviationPct: number;
  winner: 'A' | 'B' | 'tie';
}

interface KPIComparison {
  label: string;
  key: string;
  valA: number;
  valB: number;
  deviation: number;
  deviationPct: number;
  icon: any;
  interpretation: string;
}

interface AnnexComparison {
  id: string;
  title: string;
  rowsA: number;
  rowsB: number;
  totalA: number;
  totalB: number;
  deviationPct: number;
}

// ── System template catalog ──
const SYSTEM_TEMPLATES: TemplateOption[] = [
  { id: 'sys-juice', name: 'Jugo Natural (1L)', description: 'Baja complejidad', category: 'Bebidas', data: juiceTemplate },
  { id: 'sys-pizza', name: 'Pizza Margarita', description: 'Baja-Media complejidad', category: 'Gastronomia', data: pizzaTemplate },
  { id: 'sys-pastry', name: 'Croissant Artesanal', description: 'Media complejidad', category: 'Reposteria', data: pastryTemplate },
  { id: 'sys-furniture', name: 'Mueble de Roble', description: 'Media-Alta complejidad', category: 'Carpinteria', data: furnitureTemplate },
  { id: 'sys-industrial', name: 'Pintura Industrial', description: 'Alta complejidad', category: 'Industrial', data: industrialTemplate },
  { id: 'sys-consultancy', name: 'Consultoria Estrategica', description: 'Servicios profesionales', category: 'Servicios', data: consultancyTemplate },
  { id: 'sys-icecream', name: 'Helado Chocolate (10L)', description: 'Alimentos con frio', category: 'Alimentos', data: icecreamTemplate },
  { id: 'sys-repair', name: 'Reparacion Tecnica', description: 'Soporte de hardware', category: 'Servicios', data: repairTemplate },
  { id: 'sys-shoes', name: 'Zapatos de Cuero', description: 'Manufactura ligera', category: 'Manufactura', data: shoesTemplate },
  { id: 'sys-logistics', name: 'Flete de Carga', description: 'Transporte nacional', category: 'Logistica', data: logisticsTemplate },
  { id: 'sys-ejemplo', name: 'Pan (Ejemplo)', description: 'Produccion de pan', category: 'Alimentos', data: exampleTemplate },
  { id: 'sys-lavar', name: 'Lavar', description: 'Servicio de lavado', category: 'Servicios', data: lavarTemplate },
];

// ── Color palette ──
const C = {
  teamA: '#6366f1',
  teamB: '#8b5cf6',
  teamALight: 'rgba(99,102,241,0.1)',
  teamBLight: 'rgba(139,92,246,0.1)',
  positive: '#10b981',
  negative: '#ef4444',
  neutral: '#f59e0b',
  accent: '#8b5cf6',
};

const SECTION_LABELS: Record<string, string> = {
  '1': 'Gasto Material Directo',
  '2': 'Salario Directo',
  '3': 'Otros Gastos Directos',
  '4': 'Gastos de Asociacion',
  '5': 'COSTO TOTAL',
  '6': 'Gastos Generales y Admon.',
  '7': 'Gastos Distribucion y Venta',
  '8': 'Gastos Financieros',
  '9': 'Gastos Financieros OSDE',
  '10': 'Gastos Tributarios',
  '11': 'TOTAL GASTOS',
  '12': 'COSTO + GASTO',
  '13.1': 'Utilidad',
  '14.1': 'Precio de Venta',
  '15.1': 'Costo Unitario',
  '16.1': 'Precio Unitario Venta',
};

// ── Pure calculation for a template (no React hook needed) ──
function calculateTemplate(data: CostSheetData): {
  values: Record<string, CalculatedRowValue>;
  header: CostSheetHeader;
} {
  try {
    const parser = createSharedParser();
    const calcAnnexes = calculateAnnexesPure(data, parser);
    const ficha = buildEngineFicha({ ...data, header: data.header || {} });
    const result = calculateFicha(ficha, { actor: 'arena-fc' });
    const values: Record<string, CalculatedRowValue> = {};
    for (const r of result.rows) {
      values[r.id] = { total: r.total, valorHistorico: r.valorHistorico || 0 } as CalculatedRowValue;
    }
    return { values, header: data.header || {} };
  } catch {
    return { values: {}, header: data.header || {} };
  }
}

function getVal(cv: Record<string, CalculatedRowValue>, id: string): number {
  if (!cv) return 0;
  const e = cv[id];
  return e ? (Number(e.total) || 0) : 0;
}

// ── Resolve header field (skip formula strings) ──
function resolveHeader(header: CostSheetHeader, field: keyof CostSheetHeader, fallback = '--', allData?: CostSheetData): string {
  const val = header[field];
  if (val !== undefined && val !== null && val !== '') {
    const s = String(val);
    if (!s.startsWith('=')) return s;

    // Attempt basic resolution if allData is provided
    if (allData && s.startsWith('=')) {
      try {
        const formula = s.substring(1).trim();
        const match = formula.match(/GET_ANEXO_FILA_DATO\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\s*\)/i);
        if (match) {
          const [_, annexId, rowIdx, fieldName] = match;
          const annex = allData.annexes?.find(a => a.id === annexId);
          const row = annex?.data?.[parseInt(rowIdx) - 1];
          if (row) {
             const val = row[fieldName] || row[fieldName.toLowerCase()] || row[fieldName.toUpperCase()];
             if (val !== undefined) return String(val);
          }
        }
      } catch (e) {
        return s;
      }
    }
  }
  return fallback;
}

const ThemedTooltip = ({ active, payload, label, unit = "" }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover/95 backdrop-blur-xl p-3 shadow-xl">
      {label && <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name || entry.dataKey}:</span>
          <span className="font-bold text-foreground">{typeof entry.value === 'number' ? entry.value.toLocaleString('es-CU', { minimumFractionDigits: 2 }) + unit : entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════
export default function ArenaFC() {
  // Helper to resolve formulas in names
  const resolveFormulaicString = (str: string, data: CostSheetData) => {
    if (!str || !str.startsWith('=')) return str;
    try {
      const formula = str.substring(1).trim();
      // Improved regex with optional spaces
      const match = formula.match(/GET_ANEXO_FILA_DATO\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\s*\)/i);
      if (match) {
        const [_, annexId, rowIdx, field] = match;
        const annex = data.annexes?.find(a => a.id === annexId);
        const row = annex?.data?.[parseInt(rowIdx) - 1];
        if (row) {
          // Try exact match then case-insensitive
          const val = row[field] || row[field.toLowerCase()] || row[field.toUpperCase()];
          if (val !== undefined) return String(val);
        }
      }
      return str;
    } catch (e) {
      return str;
    }
  };

  const printStyles = `
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; color: black !important; }
      .print-container { padding: 0 !important; margin: 0 !important; }
      .border { border-color: #eee !important; }
    }
  `;

  const [selectedA, setSelectedA] = useState<string>('');
  const [selectedB, setSelectedB] = useState<string>('');
  const [showResults, setShowResults] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [userSheets, setUserSheets] = useState<TemplateOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    async function loadUserSheets() {
      const { data, error } = await supabase
        .from('cost_sheets')
        .select('id, name, category, data, updated_at')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        const latestByName = new Map<string, any>();

        data.forEach((d: any) => {
          const sheetData = d.data as unknown as CostSheetData;
          let resolvedName = d.name || sheetData?.header?.name || 'Sin nombre';
          resolvedName = resolveFormulaicString(resolvedName, sheetData);

          // Use name as key for deduplication to keep only the latest version of each named sheet
          if (!latestByName.has(resolvedName) || new Date(d.updated_at) > new Date(latestByName.get(resolvedName).updated_at)) {
            latestByName.set(resolvedName, d);
          }
        });

        setUserSheets(Array.from(latestByName.values()).map((d: any) => {
          const sheetData = d.data as unknown as CostSheetData;
          let resolvedName = d.name || sheetData?.header?.name || 'Sin nombre';
          resolvedName = resolveFormulaicString(resolvedName, sheetData);

          const dateStr = new Date(d.updated_at).toLocaleDateString('es-CU', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
          });

          const calc = calculateTemplate(sheetData);

          return {
            id: d.id,
            name: resolvedName,
            description: `Actualizada el ${dateStr}`,
            category: d.category || 'Mis Fichas',
            data: sheetData,
            totalCost: calc.values['5']?.total || 0,
            isSystem: false
          };
        }));
      }
    }
    loadUserSheets();
  }, []);

  const allOptions = useMemo(() => {
    const sys = SYSTEM_TEMPLATES.map(t => ({
      ...t,
      isSystem: true,
      totalCost: calculateTemplate(t.data).values['5']?.total || 0
    }));

    // Deduplicate: If a user sheet has the same name as a system sheet,
    // it usually means they modified a system template.
    // In "Arena", we want to show both or just the latest?
    // The user image shows many "PLANTILLA DE REINICIO" which are likely auto-saves.
    // Our loadUserSheets already deduplicates user sheets by name.
    // Now we filter out system templates if the user has a sheet with the same name.

    const filteredSys = sys.filter(s => !userSheets.some(u => u.name.toLowerCase() === s.name.toLowerCase()));

    return [...userSheets, ...filteredSys];
  }, [userSheets]);

  const categories = useMemo(() => {
    const cats = new Set(allOptions.map(t => t.category));
    return ['all', ...Array.from(cats)];
  }, [allOptions]);

  const filteredOptions = useMemo(() => {
    return allOptions.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           t.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [allOptions, searchQuery, selectedCategory]);

  const handleSelect = (id: string) => {
    if (selectedA === id) {
      setSelectedA('');
    } else if (selectedB === id) {
      setSelectedB('');
    } else if (!selectedA) {
      setSelectedA(id);
    } else if (!selectedB) {
      setSelectedB(id);
    } else {
      setSelectedB(id);
    }
  };

  // ── Calculate both sheets ──
  const { calcA, calcB } = useMemo(() => {
    if (!selectedA || !selectedB) return { calcA: null, calcB: null };
    const tmplA = allOptions.find((t: any) => t.id === selectedA);
    const tmplB = allOptions.find((t: any) => t.id === selectedB);
    if (!tmplA || !tmplB) return { calcA: null, calcB: null };
    return {
      calcA: { ...calculateTemplate(tmplA.data), template: tmplA },
      calcB: { ...calculateTemplate(tmplB.data), template: tmplB },
    };
  }, [selectedA, selectedB, allOptions]);

  // ── Comparison data ──
  const comparison = useMemo(() => {
    if (!calcA || !calcB) return null;
    const vA = calcA.values;
    const vB = calcB.values;

    // Section comparison
    const sectionIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12.1'];
    const sections: SectionComparison[] = sectionIds.map(id => {
      const valA = getVal(vA, id);
      const valB = getVal(vB, id);
      const deviation = valB - valA;
      const deviationPct = valA > 0 ? (deviation / valA * 100) : (valB > 0 ? 100 : 0);
      return {
        label: SECTION_LABELS[id] || `Seccion ${id}`,
        id,
        valA,
        valB,
        deviation,
        deviationPct,
        winner: deviation > 0 ? 'B' : deviation < 0 ? 'A' : 'tie',
      };
    });

    // KPI comparison
    const kpiKeys: { key: string; label: string; icon: any; lowerIsBetter: boolean }[] = [
      { key: '5', label: 'Costo Total', icon: DollarSign, lowerIsBetter: true },
      { key: '12.1', label: 'Costo + Gasto', icon: Layers, lowerIsBetter: true },
      { key: '11', label: 'Total Gastos', icon: Activity, lowerIsBetter: true },
      { key: '1', label: 'Gasto Material', icon: Package, lowerIsBetter: true },
      { key: '2', label: 'Salario Directo', icon: Users, lowerIsBetter: true },
      { key: '10', label: 'Gastos Tributarios', icon: Shield, lowerIsBetter: true },
      { key: '13.1', label: 'Utilidad', icon: TrendingUp, lowerIsBetter: false },
      { key: '14.1', label: 'Precio de Venta', icon: Target, lowerIsBetter: false },
      { key: '15.1', label: 'Costo Unitario', icon: DollarSign, lowerIsBetter: true },
      { key: '16.1', label: 'Precio Unitario', icon: Award, lowerIsBetter: false },
    ];
    const kpis: KPIComparison[] = kpiKeys.map(k => {
      const valA = getVal(vA, k.key);
      const valB = getVal(vB, k.key);
      const deviation = valB - valA;
      const deviationPct = valA > 0 ? (deviation / valA * 100) : 0;
      const advantage = k.lowerIsBetter ? (deviation < 0 ? 'A' : deviation > 0 ? 'B' : 'tie') : (deviation > 0 ? 'A' : deviation < 0 ? 'B' : 'tie');
      return {
        label: k.label,
        key: k.key,
        valA,
        valB,
        deviation,
        deviationPct,
        icon: k.icon,
        interpretation: advantage === 'A'
          ? `${calcA.template.name} es mas eficiente`
          : advantage === 'B'
          ? `${calcB.template.name} es mas eficiente`
          : 'Ambas fichas son equivalentes',
      };
    });

    // Annex comparison
    const annexesA = calcA.template.data.annexes || [];
    const annexesB = calcB.template.data.annexes || [];
    const allAnnexIds = [...new Set([...annexesA.map((a: any) => a.id), ...annexesB.map((a: any) => a.id)])];
    const annexComparison: AnnexComparison[] = allAnnexIds.map(id => {
      const aA = annexesA.find((a: any) => a.id === id);
      const aB = annexesB.find((a: any) => a.id === id);
      const totalA = getVal(vA, `anexo-${id}`) || getVal(vA, id) || (aA?.data || []).reduce((s: number, r: any) => s + (Number(r.total) || Number(r.amount) || Number(r.importe) || 0), 0);
      const totalB = getVal(vB, `anexo-${id}`) || getVal(vB, id) || (aB?.data || []).reduce((s: number, r: any) => s + (Number(r.total) || Number(r.amount) || Number(r.importe) || 0), 0);
      return {
        id,
        title: aA?.title?.split(' - ')[1]?.trim() || aB?.title?.split(' - ')[1]?.trim() || `Anexo ${id}`,
        rowsA: aA?.data?.length || 0,
        rowsB: aB?.data?.length || 0,
        totalA,
        totalB,
        deviationPct: totalA > 0 ? ((totalB - totalA) / totalA * 100) : (totalB > 0 ? 100 : 0),
      };
    });

    // Winner score
    let scoreA = 0, scoreB = 0;
    for (const s of sections) {
      if (s.id === '5' || s.id === '12.1' || s.id === '11') {
        if (s.valA < s.valB && s.valA > 0) scoreA += 2;
        else if (s.valB < s.valA && s.valB > 0) scoreB += 2;
      }
    }
    // Bonus for higher utility
    const utilA = getVal(vA, '13.1');
    const utilB = getVal(vB, '13.1');
    if (utilA > utilB) scoreA += 3;
    else if (utilB > utilA) scoreB += 3;

    const costoA = getVal(vA, '5');
    const costoB = getVal(vB, '5');
    const margenA = costoA > 0 && utilA > 0 ? (utilA / (costoA + getVal(vA, '11')) * 100) : 0;
    const margenB = costoB > 0 && utilB > 0 ? (utilB / (costoB + getVal(vB, '11')) * 100) : 0;

    // Radar chart data (Normalized to % of total cost)
    const radarData = [
      { metric: 'Material', A: costoA > 0 ? (getVal(vA, '1') / costoA * 100) : 0, B: costoB > 0 ? (getVal(vB, '1') / costoB * 100) : 0 },
      { metric: 'Salario', A: costoA > 0 ? (getVal(vA, '2') / costoA * 100) : 0, B: costoB > 0 ? (getVal(vB, '2') / costoB * 100) : 0 },
      { metric: 'Otros Dir.', A: costoA > 0 ? (getVal(vA, '3') / costoA * 100) : 0, B: costoB > 0 ? (getVal(vB, '3') / costoB * 100) : 0 },
      { metric: 'Gastos Asoc.', A: costoA > 0 ? (getVal(vA, '4') / costoA * 100) : 0, B: costoB > 0 ? (getVal(vB, '4') / costoB * 100) : 0 },
      { metric: 'Gral. Admon.', A: costoA > 0 ? (getVal(vA, '6') / costoA * 100) : 0, B: costoB > 0 ? (getVal(vB, '6') / costoB * 100) : 0 },
      { metric: 'Tributarios', A: costoA > 0 ? (getVal(vA, '10') / costoA * 100) : 0, B: costoB > 0 ? (getVal(vB, '10') / costoB * 100) : 0 },
    ];

    // Cost structure comparison (stacked)
    const structureData = [
      { name: calcA.template.name, Material: getVal(vA, '1'), Salario: getVal(vA, '2'), Otros: getVal(vA, '3') + getVal(vA, '4'), Gastos: getVal(vA, '11'), Utilidad: utilA },
      { name: calcB.template.name, Material: getVal(vB, '1'), Salario: getVal(vB, '2'), Otros: getVal(vB, '3') + getVal(vB, '4'), Gastos: getVal(vB, '11'), Utilidad: utilB },
    ];

    // Deviation waterfall
    const deviationData = sections.filter(s => s.deviation !== 0).map(s => ({
      name: s.label.length > 12 ? s.label.substring(0, 12) + '..' : s.label,
      desviacion: Math.round(s.deviation * 100) / 100,
      fill: s.deviation > 0 ? C.negative : s.deviation < 0 ? C.positive : '#94a3b8',
    }));

    return {
      sections, kpis, annexes: annexComparison,
      scoreA, scoreB, margenA, margenB,
      radarData, structureData, deviationData,
      nameA: calcA.template.name,
      nameB: calcB.template.name,
      categoryA: calcA.template.category,
      categoryB: calcB.template.category,
    };
  }, [calcA, calcB]);

  const handleCompare = useCallback(() => {
    if (!selectedA || !selectedB) {
      toast.error('Selecciona dos fichas de costo para comparar');
      return;
    }
    if (selectedA === selectedB) {
      toast.error('Selecciona fichas diferentes para la comparacion');
      return;
    }
    setIsCalculating(true);
    setTimeout(() => {
      setShowResults(true);
      setIsCalculating(false);
    }, 600);
  }, [selectedA, selectedB, allOptions]);

  const handleReset = useCallback(() => {
    setSelectedA('');
    setSelectedB('');
    setShowResults(false);
  }, []);

  const fmt = (v: number) => formatCurrency(v);

  const templateA = allOptions.find((t: any) => t.id === selectedA);
  const templateB = allOptions.find((t: any) => t.id === selectedB);

  // ── Word Export for comparison ──
  const exportComparisonWord = useCallback(() => {
    if (!comparison) return;
    const statusIcon = (w: string) => w === 'A' ? '[A]' : w === 'B' ? '[B]' : '[=]';

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>
      body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1e293b;line-height:1.6;margin:2cm}
      h1{font-size:18pt;color:#6366f1;margin-bottom:4pt;text-transform:uppercase;letter-spacing:2px}
      h2{font-size:13pt;color:#334155;border-bottom:2px solid #6366f1;padding-bottom:4pt;margin-top:20pt}
      table{border-collapse:collapse;width:100%;margin:8pt 0}
      th{background:#6366f1;color:#fff;padding:6pt 10pt;text-align:left;font-size:9pt;text-transform:uppercase}
      td{border:1px solid #e2e8f0;padding:5pt 10pt;font-size:10pt}
      tr:nth-child(even){background:#f8fafc}
      .pos{color:#10b981;font-weight:bold} .neg{color:#ef4444;font-weight:bold} .tie{color:#f59e0b}
      .team-a{color:#6366f1;font-weight:bold} .team-b{color:#10b981;font-weight:bold}
      .kpi{display:inline-block;width:30%;padding:8pt;margin:3pt;background:#f1f5f9;border-radius:6pt;text-align:center}
      .kpi-val{font-size:14pt;font-weight:bold} .kpi-label{font-size:8pt;color:#64748b;text-transform:uppercase}
      .footer{margin-top:20pt;border-top:1px solid #e2e8f0;font-size:8pt;color:#94a3b8}
    </style></head><body>
      <h1>Arena FC — Comparacion de Fichas de Costo</h1>
      <p style="color:#64748b;font-size:9pt;margin-bottom:12pt">Analisis comparativo basado en Res 148/2023 &bull; Generado: ${new Date().toLocaleDateString('es-CU')}</p>

      <table><tr><th style="border:none;width:50%;text-align:center"><span class="team-a">${comparison.nameA}</span><br/><span style="font-size:8pt;color:#64748b">${comparison.categoryA}</span></th><th style="border:none;width:50%;text-align:center"><span class="team-b">${comparison.nameB}</span><br/><span style="font-size:8pt;color:#64748b">${comparison.categoryB}</span></th></tr></table>

      <h2>Resumen Ejecutivo</h2>
      <div style="text-align:center;margin:8pt 0">
        <div class="kpi"><div class="kpi-val team-a">${fmt(comparison.kpis.find(k=>k.key==='5')?.valA||0)}</div><div class="kpi-label">${comparison.nameA} - Costo</div></div>
        <div class="kpi"><div class="kpi-val team-b">${fmt(comparison.kpis.find(k=>k.key==='5')?.valB||0)}</div><div class="kpi-label">${comparison.nameB} - Costo</div></div>
      </div>
      <div style="text-align:center;margin:8pt 0">
        <div class="kpi"><div class="kpi-val team-a">${comparison.margenA.toFixed(1)}%</div><div class="kpi-label">Margen A</div></div>
        <div class="kpi"><div class="kpi-val team-b">${comparison.margenB.toFixed(1)}%</div><div class="kpi-label">Margen B</div></div>
        <div class="kpi"><div class="kpi-val">${comparison.scoreA} vs ${comparison.scoreB}</div><div class="kpi-label">Puntuacion Final</div></div>
      </div>
      <div style="text-align:center;margin:8pt 0">
        <div class="kpi"><div class="kpi-val team-a">${comparison.margenA.toFixed(1)}%</div><div class="kpi-label">Margen A</div></div>
        <div class="kpi"><div class="kpi-val team-b">${comparison.margenB.toFixed(1)}%</div><div class="kpi-label">Margen B</div></div>
        <div class="kpi"><div class="kpi-val">${comparison.scoreA} vs ${comparison.scoreB}</div><div class="kpi-label">Puntuacion Final</div></div>
      </div>
      <div style="text-align:center;margin:8pt 0">
        <div class="kpi"><div class="kpi-val team-a">${fmt(comparison.kpis.find(k=>k.key==='5')?.valA||0)}</div><div class="kpi-label">${comparison.nameA} - Costo</div></div>
        <div class="kpi"><div class="kpi-val team-b">${fmt(comparison.kpis.find(k=>k.key==='5')?.valB||0)}</div><div class="kpi-label">${comparison.nameB} - Costo</div></div>
        <div class="kpi"><div class="kpi-val" style="color:${comparison.scoreA>comparison.scoreB?'#6366f1':'#10b981'}">${comparison.scoreA} vs ${comparison.scoreB}</div><div class="kpi-label">Puntuacion</div></div>
      </div>

      <h2>Comparacion por Secciones</h2>
      <table>
        <tr><th>Seccion</th><th class="team-a">${comparison.nameA}</th><th class="team-b">${comparison.nameB}</th><th>Desviacion</th><th>%</th><th>Ventaja</th></tr>
        ${comparison.sections.map(s => `<tr>
          <td>${s.label}</td>
          <td style="text-align:right">${fmt(s.valA)}</td>
          <td style="text-align:right">${fmt(s.valB)}</td>
          <td style="text-align:right" class="${s.deviation>0?'neg':s.deviation<0?'pos':'tie'}">${s.deviation>0?'+':''}${fmt(s.deviation)}</td>
          <td style="text-align:right">${s.deviationPct.toFixed(1)}%</td>
          <td style="text-align:center">${statusIcon(s.winner)}</td>
        </tr>`).join('')}
      </table>

      <h2>KPIs Clave</h2>
      <table>
        <tr><th>Indicador</th><th class="team-a">${comparison.nameA}</th><th class="team-b">${comparison.nameB}</th><th>Desviacion %</th></tr>
        ${comparison.kpis.map(k => `<tr>
          <td><strong>${k.label}</strong></td>
          <td style="text-align:right">${fmt(k.valA)}</td>
          <td style="text-align:right">${fmt(k.valB)}</td>
          <td style="text-align:right" class="${k.deviationPct>5?'neg':k.deviationPct<-5?'pos':'tie'}">${k.deviationPct>0?'+':''}${k.deviationPct.toFixed(1)}%</td>
        </tr>`).join('')}
      </table>

      <h2>Comparacion de Anexos</h2>
      <table>
        <tr><th>Anexo</th><th>Registros A</th><th>Registros B</th><th>Total A</th><th>Total B</th><th>Desv. %</th></tr>
        ${comparison.annexes.map(a => `<tr>
          <td><strong>${a.id}</strong> - ${a.title}</td>
          <td style="text-align:center">${a.rowsA}</td>
          <td style="text-align:center">${a.rowsB}</td>
          <td style="text-align:right">${fmt(a.totalA)}</td>
          <td style="text-align:right">${fmt(a.totalB)}</td>
          <td style="text-align:right">${a.deviationPct.toFixed(1)}%</td>
        </tr>`).join('')}
      </table>

      <div class="footer"><p>Informe generado por CostPro Arena FC &bull; ${new Date().toLocaleString('es-CU')}</p></div>
    </body></html>`;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ArenaFC_${comparison.nameA.replace(/[^a-zA-Z0-9]/g,'_')}_vs_${comparison.nameB.replace(/[^a-zA-Z0-9]/g,'_')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Comparacion exportada a Word');
  }, [comparison]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4 print-container">
      <style>{printStyles}</style>
      {/* ── Header ── */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="p-3 rounded-2xl bg-primary/10">
            <GitCompareArrows className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter italic text-primary">
            Arena FC
          </h1>
          <div className="p-3 rounded-2xl bg-violet-500/10">
            <Scale className="w-7 h-7 text-blue-500" />
          </div>
        </div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest max-w-xl mx-auto">
          Compara dos Fichas de Costo lado a lado con analisis de desviaciones, porcentajes y graficos — estandar internacional
        </p>
      </div>

      {/* ── Selection Arena ── */}
      {!showResults && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-center gap-4 bg-card/50 backdrop-blur-md p-4 rounded-3xl border border-border/40 shadow-sm">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar ficha de costo..." aria-label="Buscar ficha de costo"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-11 pr-4 bg-muted/20 border-none rounded-2xl text-sm font-bold placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
              {categories.map(cat => {
                const count = allOptions.filter(o => cat === 'all' || o.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-4 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border flex items-center gap-2",
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                        : "bg-muted/30 text-muted-foreground border-transparent hover:border-border/60"
                    )}
                  >
                    {cat === 'all' ? 'Todos' : cat}
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-md text-[8px] font-bold",
                      selectedCategory === cat ? "bg-white/20 text-white" : "bg-muted-foreground/20 text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            {(searchQuery || selectedCategory !== 'all') && (
              <Button
                variant="ghost"
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                className="h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Limpiar Filtros
              </Button>
            )}
          </div>

          {/* Catalog Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-32">
            <AnimatePresence mode='popLayout'>
              {filteredOptions.map((t) => {
                const isA = selectedA === t.id;
                const isB = selectedB === t.id;
                const isSelected = isA || isB;

                return (
                  <motion.div
                    layout
                    key={t.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    whileHover={{ y: -5, transition: { duration: 0.2 } }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelect(t.id)}
                    className={cn(
                      "group relative p-5 rounded-[2rem] border-2 cursor-pointer transition-colors duration-300 flex flex-col h-full",
                      isA ? "border-primary bg-primary/10 shadow-2xl shadow-primary/20 scale-[1.02]" :
                      isB ? "border-violet-500 bg-violet-500/10 shadow-2xl shadow-violet-500/20 scale-[1.02]" :
                      "border-border/40 bg-card hover:border-primary/50 hover:bg-primary/[0.02]"
                    )}
                  >
                    {/* Selection Badges */}
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0, rotate: -20 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, rotate: 20 }}
                          className={cn(
                            "absolute -top-3 -right-3 w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black italic text-lg shadow-2xl z-10",
                            isA ? "bg-primary" : "bg-violet-500"
                          )}
                        >
                          {isA ? 'A' : 'B'}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-start justify-between mb-4">
                      <div className={cn(
                        "p-3 rounded-2xl transition-colors",
                        isSelected ? (isA ? "bg-primary/20 text-primary" : "bg-violet-500/20 text-violet-500") : "bg-muted/40 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                      )}>
                        <FileText className="w-6 h-6" />
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-muted/50 text-muted-foreground">
                        {t.category}
                      </span>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={cn(
                          "text-sm font-black uppercase tracking-tighter italic transition-colors",
                          isSelected ? (isA ? "text-primary" : "text-violet-500") : "text-foreground group-hover:text-primary"
                        )}>
                          {t.name}
                        </h3>
                        {isSelected && (
                          <span className={cn(
                            "text-[8px] font-black px-2 py-0.5 rounded-full border",
                            isA ? "bg-primary/10 border-primary/20 text-primary" : "bg-violet-500/10 border-violet-500/20 text-violet-500"
                          )}>
                            SELECCIONADO
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium line-clamp-2">
                        {t.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/10">
                      <div className="flex items-center gap-1.5">
                        {t.isSystem ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 text-[8px] font-black uppercase tracking-tighter">Sistema</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase tracking-tighter">Usuario</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="block text-[8px] font-black text-muted-foreground uppercase tracking-widest">Costo Total</span>
                        <span className="text-[11px] font-mono font-black text-primary">
                          ${t.totalCost?.toLocaleString('es-CU', { minimumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Sticky Selection Feedback Bar */}
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4 no-print"
          >
            <div className="bg-popover/80 backdrop-blur-2xl border border-border/60 rounded-[2.5rem] p-4 shadow-2xl shadow-black/20 flex flex-col sm:flex-row items-center gap-6">
              <div className="flex flex-1 items-center justify-center sm:justify-start gap-4">
                {/* Team A Preview */}
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-black italic",
                    templateA ? "bg-primary text-white" : "bg-muted/30 text-muted-foreground border-2 border-dashed border-border/40"
                  )}>
                    {templateA ? 'A' : '?'}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-widest text-primary">Competidor A</span>
                    <span className="text-[11px] font-bold truncate max-w-[120px]">{templateA?.name || 'Seleccionar...'}</span>
                  </div>
                </div>

                <div className="text-muted-foreground font-black italic text-xl px-2">VS</div>

                {/* Team B Preview */}
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-black italic",
                    templateB ? "bg-violet-500 text-white" : "bg-muted/30 text-muted-foreground border-2 border-dashed border-border/40"
                  )}>
                    {templateB ? 'B' : '?'}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-widest text-violet-500">Competidor B</span>
                    <span className="text-[11px] font-bold truncate max-w-[120px]">{templateB?.name || 'Seleccionar...'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  onClick={handleReset}
                  variant="ghost"
                  className="rounded-2xl px-6 font-black uppercase tracking-widest text-[9px] text-muted-foreground hover:text-foreground"
                >
                  Limpiar
                </Button>
                <Button
                  onClick={handleCompare}
                  disabled={!selectedA || !selectedB || isCalculating}
                  className="flex-1 sm:flex-none h-14 px-10 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 gap-3 text-xs"
                >
                  {isCalculating ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                      <Zap className="w-4 h-4" />
                    </motion.div>
                  ) : (
                    <>
                      <GitCompareArrows className="w-4 h-4" />
                      Iniciar Comparacion
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Results ── */}
      {showResults && comparison && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Winner Banner */}
            <div className={cn(
              "border-2 rounded-3xl p-6 text-center",
              comparison.scoreA > comparison.scoreB
                ? "border-primary/30 bg-primary/5"
                : comparison.scoreB > comparison.scoreA
                ? "border-violet-500/30 bg-violet-500/5"
                : "border-amber-500/30 bg-amber-500/5"
            )}>
              <div className="flex items-center justify-center gap-3 mb-2">
                <Trophy className={cn("w-8 h-8",
                  comparison.scoreA > comparison.scoreB ? "text-primary" : comparison.scoreB > comparison.scoreA ? "text-violet-500" : "text-amber-500"
                )} />
                <h2 className="text-xl font-black uppercase tracking-tighter italic">
                  {comparison.scoreA > comparison.scoreB
                    ? `${comparison.nameA} Domina`
                    : comparison.scoreB > comparison.scoreA
                    ? `${comparison.nameB} Domina`
                    : 'Empate Tecnico'}
                </h2>
                <Trophy className={cn("w-8 h-8",
                  comparison.scoreA > comparison.scoreB ? "text-primary" : comparison.scoreB > comparison.scoreA ? "text-violet-500" : "text-amber-500"
                )} />
              </div>
              <div className="flex items-center justify-center gap-6 text-xs">
                <span className="px-4 py-2 rounded-xl bg-primary/10 text-primary font-black">{comparison.nameA}: {comparison.scoreA} pts</span>
                <span className="text-muted-foreground font-bold">—</span>
                <span className="px-4 py-2 rounded-xl bg-violet-500/10 text-violet-500 font-black">{comparison.nameB}: {comparison.scoreB} pts</span>
              </div>
              <div className="flex items-center justify-center gap-8 mt-3 text-[10px]">
                <span className="text-primary font-black uppercase tracking-widest">
                  Margen A: {comparison.margenA.toFixed(1)}%
                </span>
                <span className="text-violet-500 font-black uppercase tracking-widest">
                  Margen B: {comparison.margenB.toFixed(1)}%
                </span>
              </div>
              <details className="text-[9px] text-muted-foreground mt-4 cursor-pointer hover:text-foreground transition-colors border-t border-border/10 pt-2">
                <summary className="font-bold uppercase tracking-widest list-none flex items-center justify-center gap-1">
                  <Activity className="w-2.5 h-2.5" /> ¿Como se calcula el score?
                </summary>
                <p className="mt-2 text-center max-w-sm mx-auto opacity-70 leading-relaxed">
                  +2 pts por menor Costo Total (S5), C+G (S12.1) y Total Gastos (S11).
                  <br />
                  +3 pts por mayor Utilidad (S13.1). Score maximo: 9 pts.
                </p>
              </details>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-5 gap-3">
              {comparison.kpis.slice(0, 5).map(k => {
                const Icon = k.icon;
                return (
                  <div key={k.key} className="border border-border/60 rounded-2xl p-3 bg-card">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">{k.label}</span>
                    </div>
                    <div className="text-[11px] font-black font-mono text-primary">{fmt(k.valA)}</div>
                    <div className="text-[9px] text-muted-foreground font-bold mb-1">{comparison.nameA}</div>
                    <div className="text-[11px] font-black font-mono text-violet-500">{fmt(k.valB)}</div>
                    <div className="text-[9px] text-muted-foreground font-bold">{comparison.nameB}</div>
                    <div className={cn("text-[10px] font-black mt-1.5 pt-1.5 border-t border-border/30",
                      k.deviationPct > 5 ? "text-red-500" : k.deviationPct < -5 ? "text-emerald-500" : "text-amber-500"
                    )}>
                      {k.deviationPct > 0 ? '+' : ''}{k.deviationPct.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Radar Chart */}
              <div className="border border-border/60 rounded-2xl overflow-hidden bg-card">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/20">
                  <Target className="w-4 h-4 text-violet-500" />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Perfil de Estructura</h3>
                </div>
                <div className="p-4">
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={comparison.radarData}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fontWeight: 'bold', fill: 'hsl(var(--muted-foreground))' }} />
                        <Radar name={comparison.nameA} dataKey="A" stroke={C.teamA} fill={C.teamA} fillOpacity={0.2} strokeWidth={2} />
                        <Radar name={comparison.nameB} dataKey="B" stroke={C.teamB} fill={C.teamB} fillOpacity={0.2} strokeWidth={2} />
                        <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                        <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)', stroke: 'hsl(var(--border))' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Cost Structure Comparison */}
              <div className="border border-border/60 rounded-2xl overflow-hidden bg-card">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/20">
                  <BarChart3 className="w-4 h-4 text-amber-500" />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Estructura de Costos</h3>
                </div>
                <div className="p-4">
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparison.structureData} margin={{ bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 'bold', fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)', stroke: 'hsl(var(--border))' }} />
                        <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                        <Bar dataKey="Material" stackId="a" fill="#6366f1" radius={[0,0,0,0]} />
                        <Bar dataKey="Salario" stackId="a" fill="#10b981" />
                        <Bar dataKey="Otros" stackId="a" fill="#f59e0b" />
                        <Bar dataKey="Gastos" stackId="a" fill="#ef4444" />
                        <Bar dataKey="Utilidad" stackId="a" fill="#8b5cf6" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Deviation Chart */}
            {comparison.deviationData.length > 0 && (
              <div className="border border-border/60 rounded-2xl overflow-hidden bg-card">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/20">
                  <Activity className="w-4 h-4 text-rose-500" />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Mapa de Desviaciones</h3>
                </div>
                <div className="p-4">
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparison.deviationData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 'bold', fill: 'hsl(var(--muted-foreground))' }} angle={-20} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: number) => `${v>0?'+':''}${(v/1000).toFixed(1)}k`} />
                        <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)', stroke: 'hsl(var(--border))' }} />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={2} />
                        <Bar dataKey="desviacion" radius={[4,4,0,0]}>
                          {comparison.deviationData.map((d, i) => (
                            <Cell key={i} fill={d.desviacion > 0 ? C.negative : C.positive} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Section Comparison Table */}
            <div className="border border-border/60 rounded-2xl overflow-hidden bg-card">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/20">
                <Layers className="w-4 h-4 text-primary" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Desglose por Secciones</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">Seccion</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-primary">{comparison.nameA}</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-violet-500">{comparison.nameB}</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">Desviacion</th>
                      <th className="text-center px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">%</th>
                      <th className="text-center px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground w-20">Ventaja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.sections.map((s, idx) => (
                      <tr key={s.id} className={cn("border-t border-border/10 hover:bg-primary/3 transition-colors", idx % 2 === 0 && "bg-muted/20")}>
                        <td className="px-4 py-2.5 font-bold text-foreground">{s.label}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-black">{fmt(s.valA)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-black">{fmt(s.valB)}</td>
                        <td className={cn("px-4 py-2.5 text-right font-mono font-bold", s.deviation > 0 ? "text-red-500" : s.deviation < 0 ? "text-emerald-500" : "text-muted-foreground")}>
                          {s.deviation > 0 ? '+' : ''}{fmt(s.deviation)}
                        </td>
                        <td className={cn("px-4 py-2.5 text-center font-mono font-bold", Math.abs(s.deviationPct) > 20 ? "text-red-500" : Math.abs(s.deviationPct) > 5 ? "text-amber-500" : "text-emerald-500")}>
                          {s.deviationPct > 0 ? '+' : ''}{s.deviationPct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {s.winner === 'A' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black">
                              <ArrowUpRight className="w-2.5 h-2.5" /> A
                            </span>
                          ) : s.winner === 'B' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 text-[9px] font-black">
                              <ArrowUpRight className="w-2.5 h-2.5" /> B
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[9px] font-black">
                              <Minus className="w-2.5 h-2.5" /> =
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Full KPI Table */}
            <div className="border border-border/60 rounded-2xl overflow-hidden bg-card">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/20">
                <BarChart3 className="w-4 h-4 text-violet-500" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Indicadores Clave de Rendimiento</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">Indicador</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-primary">{comparison.nameA}</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-violet-500">{comparison.nameB}</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">Desviacion</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">%</th>
                      <th className="text-left px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">Interpretacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.kpis.map((k, idx) => {
                      const Icon = k.icon;
                      return (
                        <tr key={k.key} className={cn("border-t border-border/10", idx % 2 === 0 && "bg-muted/20")}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="font-bold">{k.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-primary">{fmt(k.valA)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-violet-500">{fmt(k.valB)}</td>
                          <td className={cn("px-4 py-2.5 text-right font-mono font-bold", k.deviation > 0 ? "text-red-500" : k.deviation < 0 ? "text-emerald-500" : "text-muted-foreground")}>
                            {k.deviation > 0 ? '+' : ''}{fmt(k.deviation)}
                          </td>
                          <td className={cn("px-4 py-2.5 text-right font-mono font-bold", Math.abs(k.deviationPct) > 20 ? "text-red-500" : "text-muted-foreground")}>
                            {k.deviationPct > 0 ? '+' : ''}{k.deviationPct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-2.5 text-[10px] text-muted-foreground">{k.interpretation}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Annex Comparison */}
            <div className="border border-border/60 rounded-2xl overflow-hidden bg-card">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/20">
                <FileText className="w-4 h-4 text-cyan-500" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">Comparacion de Anexos</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">Anexo</th>
                      <th className="text-center px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-primary">Reg. A</th>
                      <th className="text-center px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-violet-500">Reg. B</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-primary">Total A</th>
                      <th className="text-right px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-violet-500">Total B</th>
                      <th className="text-center px-4 py-2.5 font-black uppercase text-[9px] tracking-widest text-muted-foreground">Desv. %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.annexes.map((a, idx) => (
                      <tr key={a.id} className={cn("border-t border-border/10", idx % 2 === 0 && "bg-muted/20")}>
                        <td className="px-4 py-2.5 font-bold"><span className="font-mono text-primary">{a.id}</span> — {a.title}</td>
                        <td className="px-4 py-2.5 text-center font-mono">{a.rowsA}</td>
                        <td className="px-4 py-2.5 text-center font-mono">{a.rowsB}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-primary">{fmt(a.totalA)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-violet-500">{fmt(a.totalB)}</td>
                        <td className={cn("px-4 py-2.5 text-center font-mono font-bold", Math.abs(a.deviationPct) > 30 ? "text-red-500" : "text-muted-foreground")}>
                          {a.deviationPct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 pb-8">
              <Button
                onClick={handleReset}
                variant="outline"
                className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-xs gap-2"
              >
                <GitCompareArrows className="w-4 h-4" />
                Nueva Comparacion
              </Button>
              <Button
                onClick={exportComparisonWord}
                className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Download className="w-4 h-4" />
                Exportar Word
              </Button>
              <Button
                onClick={() => window.print()}
                variant="ghost"
                className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-xs gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 no-print"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
