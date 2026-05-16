'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import {
  ChevronLeft, ChevronRight, CheckCircle2, Package, Users, Wrench, Truck,
  Calculator, DollarSign, FileCheck, Building2, ArrowRight, Lightbulb, Sparkles,
  Factory, Warehouse, Cog, Receipt, Percent, TrendingUp, PenLine, Loader2,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { CostSheetData, CalculatedRowValue, CostSheetHeader } from '@/types/cost-sheet';

interface CostSheetWizardProps {
  data: CostSheetData;
  calculatedValues: Record<string, CalculatedRowValue>;
  calculatedHeader?: Partial<CostSheetHeader>;
  onFinish?: () => void;
}

// ── Educational step definitions aligned with international cost standards ──
// Based on: ISO 9001 cost tracking, Cuban Res 148/2023, COGEY (Cost Accounting)
// The flow mirrors a real production process: Inputs → Transformation → Overheads → Profit → Output

interface WizardStep {
  id: string;
  phase: 'input' | 'process' | 'overhead' | 'finance' | 'output';
  label: string;
  shortLabel: string;
  description: string;
  educationalTip: string;
  icon: any;
  color: string;
  borderColor: string;
  bgColor: string;
  annexId?: string;       // If this step edits an annex
  isSection?: boolean;    // If this step shows the main sections
  isSignature?: boolean;
  isHeader?: boolean;
}

const STEPS: WizardStep[] = [
  {
    id: 'header',
    phase: 'input',
    label: 'Identificar el Producto',
    shortLabel: 'Producto',
    description: 'Defina qué producto o servicio va a costear: nombre, código, cantidad, moneda.',
    educationalTip: 'Toda ficha de costo comienza identificando claramente el OBJETO de costing. Según la norma cubana Res 148/2023 y estándares internacionales ISO, sin una definición precisa del producto, los costos no son comparables ni auditables.',
    icon: Building2,
    color: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/5',
    isHeader: true,
  },
  {
    id: 'annex-I',
    phase: 'input',
    label: 'Almacén de Insumos',
    shortLabel: 'Anexo I',
    description: 'Registre las materias primas, materiales y suministros directos consumidos.',
    educationalTip: 'Los COSTOS DE MATERIA PRIMA representan típicamente 40-60% del costo total en manufactura. Aquí se registran todos los insumos físicos que se transforman en el producto. La fórmula: Total = Norma de Consumo × Precio Unitario.',
    icon: Warehouse,
    color: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/5',
    annexId: 'I',
  },
  {
    id: 'annex-II',
    phase: 'input',
    label: 'Fuerza de Trabajo Directo',
    shortLabel: 'Anexo II',
    description: 'Registre los salarios de los obreros que participan directamente en la producción.',
    educationalTip: 'La MANO DE OBRA DIRECTA es el segundo costo primario fundamental. Se calcula como: Total = Horas × Tarifa por Hora × Cantidad de Obreros. Estos costos son "directamente rastreables" al producto, a diferencia de los indirectos.',
    icon: Users,
    color: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-500/30',
    bgColor: 'bg-violet-500/5',
    annexId: 'II',
  },
  {
    id: 'annex-III',
    phase: 'input',
    label: 'Equipos y Maquinaria',
    shortLabel: 'Anexo III',
    description: 'Registre la depreciación de los activos fijos utilizados en producción.',
    educationalTip: 'La DEPRECIACIÓN distribuye el costo de un activo a lo largo de su vida útil. Fórmula: (Valor de Compra × % Depreciación) / Tiempo de Explotación. Según principios contables, esto refleja el "desgaste" del equipo por su uso productivo.',
    icon: Wrench,
    color: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/5',
    annexId: 'III',
  },
  {
    id: 'annex-IV-V',
    phase: 'input',
    label: 'Otros Gastos del Proceso',
    shortLabel: 'Anexos IV-V',
    description: 'Registre otros gastos directos (envases, dietas, transportes internos).',
    educationalTip: 'Existen GASTOS DIRECTOS que no son ni materiales ni mano de obra: dietas de trabajadores en misiones, embalajes especiales, transportes internos. Son rastreables al producto pero de naturaleza diversa.',
    icon: Truck,
    color: 'text-orange-600 dark:text-orange-400',
    borderColor: 'border-orange-500/30',
    bgColor: 'bg-orange-500/5',
    annexId: 'IV',
  },
  {
    id: 'main',
    phase: 'overhead',
    label: 'Cálculo de Costos',
    shortLabel: 'Costos',
    description: 'El motor de cálculo consolida todo: costos directos + indirectos + gastos financieros.',
    educationalTip: 'Aquí ocurre la "magia" del costing. El sistema PRORRATEA los gastos indirectos (administración, distribución, financieros) proporcionalmente usando la MP como base. Este método es estándar según COGEY y la Res 148/2023.',
    icon: Calculator,
    color: 'text-rose-600 dark:text-rose-400',
    borderColor: 'border-rose-500/30',
    bgColor: 'bg-rose-500/5',
    isSection: true,
  },
  {
    id: 'review',
    phase: 'finance',
    label: 'Utilidad y Precio',
    shortLabel: 'Precio',
    description: 'Revise el margen de utilidad, impuestos y el precio/tarifa final de venta.',
    educationalTip: 'La UTILIDAD es el margen de ganancia sobre el costo total. En Cuba se aplica un porcentaje estándar. El PRECIO FINAL incluye: Costo + Utilidad + Impuesto (ITSS 11%, Contribución 5%). El objetivo: cubrir TODOS los costos y generar un excedente.',
    icon: DollarSign,
    color: 'text-cyan-600 dark:text-cyan-400',
    borderColor: 'border-cyan-500/30',
    bgColor: 'bg-cyan-500/5',
    isSection: true,
  },
  {
    id: 'signature',
    phase: 'output',
    label: 'Aprobación Final',
    shortLabel: 'Firma',
    description: 'Elabore, revise y apruebe la ficha de costo.',
    educationalTip: 'La firma de la ficha es un acto de RESPONSABILIDAD. El elaborador certifica los datos, el revisor valida la metodología, y el aprobador autoriza el precio. Este flujo de 3 firmas es un control interno estándar para prevenir errores y fraudes.',
    icon: FileCheck,
    color: 'text-slate-600 dark:text-slate-400',
    borderColor: 'border-slate-500/30',
    bgColor: 'bg-slate-500/5',
    isSignature: true,
  },
];

// ── Phase labels for the factory SVG ──
const PHASE_LABELS = [
  { id: 'input', label: 'ENTRADAS', sublabel: 'Datos Primarios', color: '#10b981' },
  { id: 'process', label: 'PROCESO', sublabel: 'Transformación', color: '#f59e0b' },
  { id: 'overhead', label: 'COSTOS', sublabel: 'Motor de Cálculo', color: '#ef4444' },
  { id: 'finance', label: 'FINANZAS', sublabel: 'Precio Final', color: '#06b6d4' },
  { id: 'output', label: 'OUTPUT', sublabel: 'Documento Aprobado', color: '#6b7280' },
];

// ── Step completion checker ──
function getStepCompletion(stepId: string, data: CostSheetData | undefined): boolean {
  if (!data) return false;

  switch (stepId) {
    case 'header':
      return !!data.header?.name && data.header.name.trim().length > 0;
    case 'annex-I':
      return (data.annexes || []).some((a: any) => a.id === 'I' && a.data && a.data.length > 0);
    case 'annex-II':
      return (data.annexes || []).some((a: any) => a.id === 'II' && a.data && a.data.length > 0);
    case 'annex-III':
      return (data.annexes || []).some((a: any) => a.id === 'III' && a.data && a.data.length > 0);
    case 'annex-IV-V':
      return (data.annexes || []).some((a: any) => a.id === 'IV' && a.data && a.data.length > 0);
    case 'main':
    case 'review':
    case 'signature':
    default:
      return false;
  }
}

// ── Step validation ──
function getStepValidation(
  stepId: string,
  data: CostSheetData | undefined,
): { canProceed: boolean; reason: string | null } {
  if (!data) return { canProceed: false, reason: 'No hay datos cargados' };

  switch (stepId) {
    case 'header': {
      if (!data.header?.name || data.header.name.trim().length === 0) {
        return { canProceed: false, reason: 'Debe ingresar el nombre del producto' };
      }
      return { canProceed: true, reason: null };
    }
    case 'annex-I': {
      const hasRows = (data.annexes || []).some((a: any) => a.id === 'I' && a.data && a.data.length > 0);
      if (!hasRows) {
        return { canProceed: false, reason: 'Debe agregar al menos una fila en el Anexo I (Insumos)' };
      }
      return { canProceed: true, reason: null };
    }
    case 'annex-II': {
      const hasRows = (data.annexes || []).some((a: any) => a.id === 'II' && a.data && a.data.length > 0);
      if (!hasRows) {
        return { canProceed: false, reason: 'Debe agregar al menos una fila en el Anexo II (Mano de Obra)' };
      }
      return { canProceed: true, reason: null };
    }
    case 'annex-III': {
      const hasRows = (data.annexes || []).some((a: any) => a.id === 'III' && a.data && a.data.length > 0);
      if (!hasRows) {
        return { canProceed: false, reason: 'Debe agregar al menos una fila en el Anexo III (Equipos)' };
      }
      return { canProceed: true, reason: null };
    }
    case 'annex-IV-V': {
      const hasRows = (data.annexes || []).some((a: any) => a.id === 'IV' && a.data && a.data.length > 0);
      if (!hasRows) {
        return { canProceed: false, reason: 'Debe agregar al menos una fila en el Anexo IV (Otros Gastos)' };
      }
      return { canProceed: true, reason: null };
    }
    case 'main':
    case 'review':
    case 'signature':
    default:
      return { canProceed: true, reason: null };
  }
}

// ── SVG Factory Diagram Component (extracted to avoid re-creation on each render) ──
interface FactoryDiagramProps {
  currentStep: number;
  progress: number;
  setCurrentStep: (i: number) => void;
}

const FactoryDiagram: React.FC<FactoryDiagramProps> = ({ currentStep, progress, setCurrentStep }) => (
  <div className="w-full overflow-x-auto">
    <svg viewBox="0 0 960 280" className="w-full max-w-4xl mx-auto" style={{ minWidth: 640 }}>
      <defs>
        <linearGradient id="beltGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
          <stop offset="25%" stopColor="#f59e0b" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#ef4444" stopOpacity="0.6" />
          <stop offset="75%" stopColor="#06b6d4" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#6b7280" stopOpacity="0.6" />
        </linearGradient>
        <filter id="shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
        </filter>
        <linearGradient id="factoryBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.05" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Factory building outline */}
      <rect x="20" y="20" width="920" height="240" rx="16" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="2" strokeDasharray="8 4" />
      <rect x="20" y="20" width="920" height="36" rx="16" fill="currentColor" fillOpacity="0.03" />

      {/* Phase sections */}
      {PHASE_LABELS.map((phase, i) => {
        const x = 30 + i * 185;
        return (
          <g key={phase.id}>
            <rect x={x} y="22" width="175" height="32" rx="8" fill={phase.color} fillOpacity="0.08" />
            <text x={x + 87} y="43" textAnchor="middle" fill={phase.color} fontSize="11" fontWeight="900" letterSpacing="0.15em">{phase.label}</text>
          </g>
        );
      })}

      {/* Conveyor belt */}
      <rect x="40" y="140" width="880" height="6" rx="3" fill="url(#beltGrad)" />
      {/* Belt animation marks */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
        <line key={i} x1={80 + i * 88} y1="140" x2={80 + i * 88} y2="146" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
      ))}

      {/* Step stations on the belt */}
      {STEPS.map((s, i) => {
        const x = 70 + i * 108;
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;
        const IconComp = s.icon;
        return (
          <g key={s.id} filter={isActive ? 'url(#shadow)' : undefined}>
            {/* Connection line to belt */}
            {i % 2 === 0 ? (
              <line x1={x + 30} y1="105" x2={x + 30} y2="140" stroke={isCompleted ? '#10b981' : isActive ? s.color.replace('text-', '#') : 'currentColor'} strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="4 3" />
            ) : (
              <line x1={x + 30} y1="146" x2={x + 30} y2="175" stroke={isCompleted ? '#10b981' : isActive ? s.color.replace('text-', '#') : 'currentColor'} strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="4 3" />
            )}

            {/* Station node */}
            <g
              onClick={() => setCurrentStep(i)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Ir al paso: ${s.label}`}
            >
              <rect
                x={x}
                y={i % 2 === 0 ? 68 : 148}
                width="60"
                height="38"
                rx="10"
                fill={isCompleted ? '#10b981' : isActive ? s.color.replace('text-', '#') : 'white'}
                fillOpacity={isCompleted ? 0.15 : isActive ? 0.12 : 0.6}
                stroke={isCompleted ? '#10b981' : isActive ? s.color.replace('text-', '#') : 'currentColor'}
                strokeOpacity={isActive ? 1 : 0.2}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              {/* Step number */}
              <text x={x + 30} y={i % 2 === 0 ? 84 : 164} textAnchor="middle" fill={isCompleted ? '#10b981' : isActive ? s.color.replace('text-', '#') : 'currentColor'} fontSize="9" fontWeight="900">
                {i + 1}
              </text>
              {/* Step label */}
              <text x={x + 30} y={i % 2 === 0 ? 98 : 178} textAnchor="middle" fill={isCompleted ? '#10b981' : 'currentColor'} fontSize="7" fontWeight="700" opacity={0.8}>
                {s.shortLabel}
              </text>
              {/* Completion checkmark */}
              {isCompleted && (
                <circle cx={x + 54} cy={i % 2 === 0 ? 72 : 152} r="6" fill="#10b981" />
              )}
            </g>
          </g>
        );
      })}

      {/* Factory smokestacks (decorative) */}
      <g opacity="0.12">
        <rect x="870" y="35" width="12" height="30" rx="2" fill="currentColor" />
        <rect x="885" y="25" width="12" height="40" rx="2" fill="currentColor" />
        <circle cx="876" cy="32" r="6" fill="currentColor" />
        <circle cx="891" cy="22" r="5" fill="currentColor" />
      </g>

      {/* Bottom flow arrows */}
      <text x="480" y="225" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="700" opacity="0.25" letterSpacing="0.3em">
        INSUMOS → TRANSFORMACIÓN → COSTOS → PRECIO → APROBACIÓN
      </text>

      {/* Progress indicator on belt */}
      <rect x={40} y="148" width={Math.min((progress / 100) * 880, 880)} height="2" rx="1" fill="#10b981" fillOpacity="0.5" />
    </svg>
  </div>
);

const CostSheetWizard: React.FC<CostSheetWizardProps> = ({ data, calculatedValues, calculatedHeader, onFinish }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [activeSubSectionId, setActiveSubSectionId] = useState('');
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = useState(false);
  const [showTip, setShowTip] = useState(true);
  // R2.4 — Mobile auto-collapse: detect viewport width on mount
  const [showOverview, setShowOverview] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 640;
  });

  // R1.3 — CTA finalization states
  const [finishState, setFinishState] = useState<'idle' | 'saving' | 'success'>('idle');

  const step = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  // ── Dynamic finance section lookup (replaces hard-coded 's13') ──
  const financeSectionId = useMemo(() => {
    const sec = data?.sections?.find((s: any) =>
      s.id === 's13' || /utilidad|precio/i.test(s.label || '')
    );
    return sec?.id || 'all';
  }, [data?.sections]);

  // Auto-select first section when wizard reaches the main step
  React.useEffect(() => {
    if (data?.sections && data.sections.length > 0 && !activeSubSectionId) {
      const firstId = data.sections[0]?.id;
      if (firstId) setActiveSubSectionId(firstId);
    }
  }, [data?.sections, activeSubSectionId]);

  // ── R1.1 — Step validation ──
  const validation = useMemo(() => {
    return getStepValidation(step.id, data);
  }, [step.id, data]);

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1 && validation.canProceed) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setShowTip(true);
    }
  }, [currentStep, validation.canProceed]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setShowTip(true);
    }
  }, [currentStep]);

  // ── R1.3 — CTA Finalization handler ──
  const handleFinish = useCallback(async () => {
    setFinishState('saving');
    try {
      await onFinish?.();
      setFinishState('success');
    } catch {
      setFinishState('idle');
    }
  }, [onFinish]);

  // Reset finish state when navigating away from the signature step
  useEffect(() => {
    if (step.id !== 'signature') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived UI state on navigation context change
      setFinishState('idle');
    }
  }, [step.id]);

  // ── R1.2 — KPI strip using calculatedValues instead of calculatedHeader ──
  const metrics = useMemo(() => {
    const row12 = calculatedValues['12.1'];
    const row13 = calculatedValues['13.1'];
    const row14 = calculatedValues['14.1'];

    const totalCost = row12?.total;     // number or undefined
    const utility = row13?.total;       // number or undefined
    const salePrice = row14?.total;     // number or undefined

    const utilityPercent = (totalCost && totalCost > 0 && utility != null)
      ? Number(((utility / totalCost) * 100).toFixed(1))
      : null;

    return {
      productName: data?.header?.name || '',
      totalCost,        // number | undefined (undefined = "calculating")
      salePrice,        // number | undefined
      utilityPercent,   // number | null
      filledAnnexes: (data?.annexes || []).filter((a: any) => a.data && a.data.length > 0).length,
    };
  }, [data, calculatedValues]);

  // ── Step Content Renderer ──
  const renderStepContent = () => {
    // Step 0: Header / Product Identification
    if (step.isHeader) {
      return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
        </div>
      );
    }

    // Steps 1-4: Annexes (I, II, III, IV/V)
    if (step.annexId) {
      return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Show the specific annex */}
          <CostSheetAnnexEditor activeAnnexId={step.annexId} />
          {/* For step IV-V, also show annex V if it exists */}
          {step.annexId === 'IV' && (data?.annexes || []).some((a: any) => a.id === 'V') && (
            <div className="pt-4 border-t border-border/40">
              <CostSheetAnnexEditor activeAnnexId="V" />
            </div>
          )}
        </div>
      );
    }

    // Step 5-6: Main calculation sections
    if (step.isSection) {
      return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* For "review" step, jump to the finance sections */}
          <CostSheetInteractiveTable
            sections={data?.sections || []}
            calculatedValues={calculatedValues}
            annexes={data?.annexes || []}
            activeSubSectionId={step.id === 'review' ? financeSectionId : 'all'}
            setActiveSubSectionId={setActiveSubSectionId}
            onOpenSections={() => setIsSectionsSidebarOpen(true)}
            hideHeader={step.id === 'main'}
          />
          <CostSheetSidebarNav
            isOpen={isSectionsSidebarOpen}
            onClose={() => setIsSectionsSidebarOpen(false)}
            title="Secciones de la Ficha"
            type="sections"
            items={data?.sections || []}
            activeId={activeSubSectionId}
            onSelect={setActiveSubSectionId}
          />
        </div>
      );
    }

    // Step 7: Signature
    if (step.isSignature) {
      return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CostSheetSignatureEditor />
        </div>
      );
    }

    return null;
  };

  // ── R1.3 — Success banner after finalization ──
  const renderSuccessBanner = () => {
    if (finishState !== 'success') return null;
    return (
      <div className="animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-primary">Ficha completada</p>
            <p className="text-xs text-primary/70">La ficha de costo ha sido guardada y finalizada exitosamente.</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-0 animate-in fade-in duration-500">
      {/* ── Factory Overview Section ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card mb-6">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Factory className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight text-foreground">Modo Asistido</h2>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-[0.2em]">Proceso de Costeo por Fases</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOverview(!showOverview)}
              className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              {showOverview ? 'Ocultar' : 'Ver'} Diagrama
            </Button>
          </div>
        </div>

        {/* Factory SVG Diagram */}
        {showOverview && (
          <div className="px-2 sm:px-4 py-4 border-b border-border/20">
            <FactoryDiagram currentStep={currentStep} progress={progress} setCurrentStep={setCurrentStep} />
          </div>
        )}

        {/* Quick stats bar — R1.2: KPI strip with skeleton loaders */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border/20 border-b border-border/20">
          <div className="px-4 py-3 text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Producto</div>
            <div className="text-xs font-bold text-foreground truncate">
              {metrics.productName || <span className="inline-block w-16 h-4 bg-muted rounded animate-pulse" />}
            </div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Costo Total</div>
            {metrics.totalCost === undefined
              ? <span className="inline-block w-16 h-4 bg-muted rounded animate-pulse" />
              : <span className="text-xs font-black font-mono text-primary">{formatCurrency(metrics.totalCost)}</span>
            }
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Precio Venta</div>
            {metrics.salePrice === undefined
              ? <span className="inline-block w-16 h-4 bg-muted rounded animate-pulse" />
              : <span className="text-xs font-black font-mono text-foreground">{formatCurrency(metrics.salePrice)}</span>
            }
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Utilidad</div>
            {metrics.utilityPercent === null
              ? <span className="inline-block w-10 h-4 bg-muted rounded animate-pulse" />
              : <span className="text-xs font-black font-mono text-amber-600 dark:text-amber-400">{metrics.utilityPercent}%</span>
            }
          </div>
        </div>

        {/* Step indicators row — R2.2: Completion indicator per step */}
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto no-scrollbar bg-muted/20">
          {STEPS.map((s, i) => {
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;
            const isStepDone = getStepCompletion(s.id, data);
            const IconComp = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStep(i)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all shrink-0",
                  isActive && `${s.bgColor} ${s.borderColor} border text-foreground shadow-sm`,
                  isCompleted && "bg-primary/10 text-primary dark:text-primary",
                  !isActive && !isCompleted && "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
                )}
              >
                <IconComp className="w-3 h-3" />
                <span className="hidden sm:inline">{s.shortLabel}</span>
                <span className="sm:hidden">{i + 1}</span>
                {/* R2.3: CheckCircle2 uses text-primary instead of text-emerald-500 */}
                {isCompleted && <CheckCircle2 className="w-2.5 h-2.5 text-primary" />}
                {/* R2.2: Green dot for completed steps that are NOT passed yet */}
                {!isCompleted && !isActive && isStepDone && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="px-4 py-1.5">
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>

      {/* ── Active Step Content ── */}
      <div className="space-y-4">
        {/* Success banner (shown after finalization) */}
        {renderSuccessBanner()}

        {/* Step header with educational tip */}
        <div className={cn(
          "border rounded-2xl overflow-hidden shadow-sm bg-card",
          step.borderColor
        )}>
          <div className={cn("flex items-start gap-4 p-4 sm:p-5", step.bgColor)}>
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", step.bgColor, step.color)}>
              <step.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full",
                  step.bgColor, step.color
                )}>
                  Fase {currentStep + 1} de {STEPS.length}
                </span>
                {step.phase && (
                  <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    {PHASE_LABELS.find(p => p.id === step.phase)?.label}
                  </span>
                )}
              </div>
              <h3 className="text-base font-black text-foreground mb-1">{step.label}</h3>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
            <button
              onClick={() => setShowTip(!showTip)}
              className="p-2 rounded-lg hover:bg-background/80 transition-colors shrink-0"
              aria-label={showTip ? 'Ocultar consejo educativo' : 'Mostrar consejo educativo'}
            >
              <Lightbulb className={cn("w-4 h-4", showTip ? "text-amber-500" : "text-muted-foreground/40")} />
            </button>
          </div>

          {/* Educational tip (collapsible) */}
          {showTip && (
            <div className="px-4 sm:px-5 pb-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 dark:text-amber-200/80 leading-relaxed font-medium">
                  {step.educationalTip}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Step content area */}
        <div className="min-h-[400px]">
          {renderStepContent()}
        </div>
      </div>

      {/* ── Bottom Navigation ── */}
      <div className="flex justify-between items-center py-6 mt-6 border-t border-border/30">
        <Button
          variant="ghost"
          onClick={handlePrev}
          disabled={currentStep === 0}
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {currentStep > 0 ? STEPS[currentStep - 1].shortLabel : '...'}
        </Button>

        {/* Completion indicator + validation reason */}
        <div className="flex flex-col items-center gap-1">
          {currentStep === STEPS.length - 1 && finishState === 'success' && (
            <div className="flex items-center gap-1.5 text-primary dark:text-primary">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Completada</span>
            </div>
          )}
          {/* R1.1: Show validation reason when step is blocked */}
          {!validation.canProceed && validation.reason && (
            <span className="text-[10px] text-destructive font-medium text-center max-w-[200px]">
              {validation.reason}
            </span>
          )}
        </div>

        {/* R1.1 + R1.3: Next button with validation & finalization CTA */}
        {currentStep === STEPS.length - 1 ? (
          /* Last step — Finalization CTA */
          finishState === 'success' ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest">Guardada</span>
            </div>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={finishState === 'saving'}
              className="text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 px-6 h-9 gap-2"
            >
              {finishState === 'saving' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  Guardar y Finalizar
                  <CheckCircle2 className="w-4 h-4" />
                </>
              )}
            </Button>
          )
        ) : (
          /* Not last step — Standard next with validation */
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={handleNext}
              disabled={!validation.canProceed}
              className="text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 px-6 h-9 gap-2"
            >
              {STEPS[currentStep + 1].shortLabel}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CostSheetWizard;
