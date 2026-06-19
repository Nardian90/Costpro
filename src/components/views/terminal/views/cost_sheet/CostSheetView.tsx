'use client';

import React, { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import {
    Zap as ZapIcon,
    ArrowLeft,
    Edit,
    Eye,
    FileText,
    Save,
    ChevronRight,
} from 'lucide-react';
import { useUIStore } from '@/store';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { useCostSheetActions } from '@/hooks/logic/useCostSheetActions';
import { useCostSheetViewState } from '@/hooks/logic/useCostSheetViewState';
import { useExpertModeState } from '@/hooks/ui/useExpertModeState';
import { useAutoSave } from '@/hooks/logic/useAutoSave';
import { useIsMobile } from '@/hooks/ui/useMobile';

import CostSheetNav from './CostSheetNav';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import { ExpertModeAccordion } from './ExpertModeAccordion';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetCardView from './CostSheetCardView';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import CostSheetAuditView from './CostSheetAuditView';
import CostSheetSummary from './CostSheetSummary';
import CostSheetTemplateExplorer from './CostSheetTemplateExplorer';
import CostSheetMassiveGenerator from './CostSheetMassiveGenerator';
import CostSheetQuickMode from './CostSheetQuickMode';
import CostSheetPreview from './CostSheetPreview';
import CostSheetWizard from './CostSheetWizard';
import CostSheetFlatTable from './CostSheetFlatTable';
import { SteelStructureCalculator } from './SteelStructureCalculator';

import { CostSheetProblemsPanel } from './CostSheetProblemsPanel';
import { CostSheetExportModal } from './CostSheetExportModal';
import { PdfExportOverlay } from '@/components/ui/PdfExportOverlay';
import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BaseModal } from '@/components/ui/BaseModal';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { LazyRender } from '@/components/ui/LazyRender';
import dynamic from 'next/dynamic';
import { cn, formatCurrency } from '@/lib/utils';
import { useExpertModeKeyboard } from '@/hooks/ui/useExpertModeKeyboard';
import { useScenarioStore } from '@/store/scenario-store';
import type { CostSheetSection, CostSheetAnnex, CostSheetRow } from '@/types/cost-sheet';
import type { ValidationError as EngineValidationError } from '@/lib/cost-engine/types';

const DarianEditor = dynamic(() => import('./DarianEditor').then(m => ({ default: m.DarianEditor })), { ssr: false });

const CostSheetNarrative = dynamic(() => import('./CostSheetNarrative'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-muted rounded h-64" />,
});

const ArenaFC = dynamic(() => import('./ArenaFC'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-muted rounded h-64" />,
});

// ── All-Content Consolidated View ──────────────────────────────────
// Section divider colors (matching FlatTable pattern)
const SECTION_BG = ['bg-primary/5', 'bg-violet-500/5', 'bg-warning/5', 'bg-success/5', 'bg-rose-500/5', 'bg-cyan-500/5'];
const SECTION_BORDER = ['border-l-primary/40', 'border-l-violet-500/40', 'border-l-warning/40', 'border-l-success/40', 'border-l-rose-500/40', 'border-l-cyan-500/40'];

function SectionDivider({ label, sectionColorIdx, rowCount, isCollapsed, onToggle, annexTotal, annexPercent }: {
  label: string;
  sectionColorIdx: number;
  rowCount?: number;
  isCollapsed: boolean;
  onToggle: () => void;
  annexTotal?: number;
  annexPercent?: number;
}) {
  return (
    <div
      className={cn(
        'h-8 border-y border-border/30 flex items-center gap-2 px-3 cursor-pointer hover:bg-primary/5 transition-colors',
        SECTION_BG[sectionColorIdx % SECTION_BG.length]
      )}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
    >
      <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform duration-200', !isCollapsed && 'rotate-90')} />
      <div className={cn('w-0.5 h-4 rounded-full border-l-2', SECTION_BORDER[sectionColorIdx % SECTION_BORDER.length])} />
      <span className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">{label}</span>
      {rowCount !== undefined && <span className="text-[9px] text-muted-foreground/60 font-mono ml-2">({rowCount} filas)</span>}
      {annexTotal !== undefined && annexTotal > 0 && (
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/50 font-mono">Total: <span className="text-primary font-black">{formatCurrency(annexTotal)}</span></span>
          {annexPercent !== undefined && annexPercent > 0 && (
            <span className="text-[8px] font-black text-primary/60 bg-primary/10 px-1.5 py-0 rounded font-mono">{annexPercent.toFixed(1)}%</span>
          )}
        </span>
      )}
    </div>
  );
};

interface AllContentProps {
  data: any;
  calculatedHeader?: any;
  calculatedValues?: any;
  calculatedAnnexes?: any;
  layoutMode?: any;
  effectiveLayoutMode?: any;
  groupedSections?: any;
  activeSubSectionId?: string;
  setActiveSubSectionId?: (id: string) => void;
  onNavigateToAnnex?: (annexId: string) => void;
  onNavigateToSection?: (rowId: string) => void;
  annexToSectionsMap?: Record<string, { sectionLabel: string; sectionId: string; rowId: string; rowLabel: string }[]>;
  deepValidationErrors?: { rowId: string; message: string; type: string; code: string }[];
}

function AllContentConsolidated({
  data,
  calculatedHeader,
  calculatedValues,
  calculatedAnnexes,
  layoutMode,
  effectiveLayoutMode,
  groupedSections,
  activeSubSectionId,
  setActiveSubSectionId,
  onNavigateToAnnex,
  onNavigateToSection,
  annexToSectionsMap = {},
  deepValidationErrors = []
}: AllContentProps) {
  const annexes: CostSheetAnnex[] = data?.annexes || [];

  // Build initial collapsed state — Estructura de Costos expanded, rest collapsed
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {
      'consolidated-header': true,
      'consolidated-data': false, // Estructura de Costos starts expanded
      'consolidated-annexes': true, // Anexos container starts collapsed
      'consolidated-signature': true,
    };
    annexes.forEach((a) => {
      initial[`consolidated-annex-${a.id}`] = true; // Individual annexes start collapsed
    });
    return initial;
  });

  // Calculate annex totals and percentages
  const annexTotals = useMemo(() => {
    if (!calculatedAnnexes || calculatedAnnexes.length === 0) return {};

    const totals: Record<string, number> = {};
    let grandTotal = 0;

    // Calculate individual annex totals
    calculatedAnnexes.forEach((annex: CostSheetAnnex) => {
      const total = annex.data?.reduce((sum: number, row: Record<string, string | number | boolean | undefined>) => {
        const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe].find(v => v !== undefined && v !== null);
        return sum + (parseFloat(String(val ?? 0)) || 0);
      }, 0) || 0;
      totals[annex.id] = total;
      grandTotal += total;
    });

    // Calculate percentages
    const percentages: Record<string, number> = {};
    Object.entries(totals).forEach(([id, total]) => {
      percentages[id] = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
    });

    // Total rows across all annexes
    const totalRows = annexes.reduce((acc: number, a: CostSheetAnnex) => acc + (a.data?.length || 0), 0);

    return { totals, percentages, grandTotal, totalRows };
  }, [calculatedAnnexes, annexes]);

  const toggle = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Compact Title Bar (matching section divider style) */}
      <div className="h-8 border-y border-border/30 flex items-center gap-2 px-3 bg-primary/5 rounded-xl">
        <ZapIcon className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">Ficha: Vista Consolidada</span>
        <span className="text-[9px] text-muted-foreground/60 font-mono ml-1">Exploración Progresiva Asistida</span>
      </div>

      {/* Unified section list with collapsible dividers */}
      <div className="space-y-3">
        {/* DATOS GENERALES */}
        <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card">
          <SectionDivider
            label="DATOS GENERALES"
            sectionColorIdx={0}
            isCollapsed={collapsed['consolidated-header']}
            onToggle={() => toggle('consolidated-header')}
          />
          {!collapsed['consolidated-header'] && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
            </div>
          )}
        </div>

        {/* ESTRUCTURA DE COSTOS */}
        <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card">
          <SectionDivider
            label="ESTRUCTURA DE COSTOS"
            sectionColorIdx={1}
            isCollapsed={collapsed['consolidated-data']}
            onToggle={() => toggle('consolidated-data')}
          />
          {!collapsed['consolidated-data'] && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              {effectiveLayoutMode === 'grid' ? (
                <CostSheetCardView
                  sections={data.sections}
                  groupedSections={groupedSections}
                  calculatedValues={calculatedValues}
                  annexes={data?.annexes || []}
                  activeSubSectionId={activeSubSectionId || 'all'}
                  setActiveSubSectionId={setActiveSubSectionId || (() => {})}
                  hideHeader={true}
                />
              ) : (
                <CostSheetFlatTable
                  sections={data.sections}
                  calculatedValues={calculatedValues}
                  annexes={data?.annexes || []}
                  deepValidationErrors={deepValidationErrors}
                  onNavigateToAnnex={onNavigateToAnnex}
                />
              )}
            </div>
          )}
        </div>

        {/* ANEXOS — grouped inside a single collapsible container */}
        <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card">
          <SectionDivider
            label={`ANEXOS`}
            sectionColorIdx={2}
            rowCount={annexes.length}
            isCollapsed={collapsed['consolidated-annexes']}
            onToggle={() => toggle('consolidated-annexes')}
            annexTotal={annexTotals.grandTotal}
          />
          {!collapsed['consolidated-annexes'] && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between px-3 py-1 bg-muted/20 border-b border-border/10">
                <span className="text-[9px] text-muted-foreground/50 font-mono">{annexTotals.totalRows} filas en total</span>
                <span className="text-[9px] text-muted-foreground/50 font-mono">Total General: <span className="text-primary font-black">{formatCurrency(annexTotals.grandTotal ?? 0)}</span></span>
              </div>
              {annexes.map((annex, idx) => (
                <div key={annex.id}>
                  <SectionDivider
                    label={`ANEXO ${annex.id}: ${annex.title}`}
                    sectionColorIdx={2 + idx}
                    rowCount={annex.data?.length || 0}
                    isCollapsed={collapsed[`consolidated-annex-${annex.id}`]}
                    onToggle={() => toggle(`consolidated-annex-${annex.id}`)}
                    annexTotal={annexTotals.totals?.[annex.id]}
                    annexPercent={annexTotals.percentages?.[annex.id]}
                  />
                  {!collapsed[`consolidated-annex-${annex.id}`] && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <LazyRender>
                        <CostSheetAnnexEditor
                          activeAnnexId={annex.id}
                          layoutMode={layoutMode}
                          calculatedAnnexes={calculatedAnnexes}
                          hideBorder={true}
                          onNavigateToSection={onNavigateToSection}
                          referencingSections={annexToSectionsMap[annex.id] || []}
                        />
                      </LazyRender>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FIRMA */}
        <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card">
          <SectionDivider
            label="PIE DE FIRMA"
            sectionColorIdx={2 + annexes.length}
            isCollapsed={collapsed['consolidated-signature']}
            onToggle={() => toggle('consolidated-signature')}
          />
          {!collapsed['consolidated-signature'] && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <CostSheetSignatureEditor />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CostSheetView = () => {
  const isMobile = useIsMobile();
  const hasHydrated = useCostSheetStore((s) => s._hasHydrated);
  const { activeCostSection: activeSection } = useUIStore();

  // Track previous section for "back" navigation from audit
  const [previousSection, setPreviousSection] = React.useState<string>('main');
  React.useEffect(() => {
    if (activeSection !== 'audit') {
      setPreviousSection(activeSection);
    }
  }, [activeSection]);

  // ── Data & Calculations ─────────────────────────────────────────────
  // FIX-RCT-140: Use selector to only re-render when data actually changes
  const data = useCostSheetStore((s) => s.data);
  const {
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    audits,
    validations,
    calculationResult,
    isBlocked,
    deepValidationErrors,
    healthPercent,
    error: calcError
  } = useCostSheetCalculator(data);

  // ── Diagnostic state ────────────────────────────────────────────────
  const calcRowCount = Object.keys(calculatedValues).length;
  const isCalcEmpty = calcRowCount === 0;
  const totalSections = data?.sections?.length || 0;
  const totalRows = data?.sections?.reduce((acc: number, s: any) => acc + (s?.rows?.length || 0), 0);

  // ── Extracted Hooks ─────────────────────────────────────────────────
  const viewState = useCostSheetViewState(data, activeSection);
  const expertState = useExpertModeState();

  // Destructure setViewMode early so it can be passed to useCostSheetActions
  // (which needs it to bridge sidebar-driven section changes to viewMode).
  const { setViewMode } = viewState;

  const {
    confirmation,
    setConfirmation,
    askConfirmation,
    handleSetActiveSection,
    handleSetViewMode,
    handleExportPDF,
    handleExportExcel,
    handleImportJSON,
    handleExportJSON,
    handleQuickGenerate,
    quickModeMapping,
    setQuickModeMapping,
    quickModeProducts,
    isQuickModeGenerating,
    setIsQuickModeGenerating,
    isActionsPanelOpen,
    setIsActionsPanelOpen,
    isHelpPanelOpen,
    setIsHelpPanelOpen,
    isSectionsSidebarOpen,
    setIsSectionsSidebarOpen,
    isAnnexesSidebarOpen,
    setIsAnnexesSidebarOpen,
    isExportModalOpen,
    setIsExportModalOpen,
    isUpgradeModalOpen,
    setIsUpgradeModalOpen,
    isPdfGenerating,
    onOpenAnnexes,
    onOpenSections,
    allActions,
    mainActions,
    secondaryActions,
    setCurrentView
  } = useCostSheetActions({
    data,
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    calculationResult,
    isBlocked,
    activeSection,
    setViewMode
  });

  const {
    viewMode,
    isEditing,
    setIsEditing,
    layoutMode,
    setLayoutMode,
    effectiveLayoutMode,
    activeSubSectionId,
    setActiveSubSectionId,
    groupedSections
  } = viewState;

  const { versions, restoreVersion, lastSavedAt, isSaving } = useAutoSave(isEditing && viewMode === 'expert');

  // ── Scenario Store (flat mode only) ───────────────────────────────────
  const isFlatMode = useScenarioStore((s) => s.isFlatMode);

  const isAnnexActive = useMemo(() => {
    return (data?.annexes || []).some(a => a.id === activeSection) || activeSection === 'all-annexes';
  }, [data?.annexes, activeSection]);

  // ── Build annex → section reference map for bidirectional navigation ──
  const annexToSectionsMap = useMemo(() => {
    const map: Record<string, { sectionLabel: string; sectionId: string; rowId: string; rowLabel: string }[]> = {};
    (data?.sections || []).forEach((section: CostSheetSection) => {
      const scanRows = (rows: CostSheetRow[]) => {
        rows.forEach((row: CostSheetRow) => {
          const raw = (row.totalFormula || row.formula || row.vhFormula || '').replace(/^=\s*/, '').trim();
          const m = raw.match(/^(Total)?[Aa]nexo([IVXLC]+)$/i);
          if (m && m[2]) {
            if (!map[m[2]]) map[m[2]] = [];
            map[m[2]].push({ sectionLabel: section.label || '', sectionId: section.id, rowId: row.id, rowLabel: row.label || '' });
          }
          if (row.calculationMethod === 'ANEXO' || row.calculationMethod === 'ANEXO_REF') {
            const ref = row.baseDeCalculoRef || '';
            const rm = ref.match(/^(Total)?[Aa]nexo([IVXLC]+)$/i);
            if (rm && rm[2]) {
              if (!map[rm[2]]) map[rm[2]] = [];
              map[rm[2]].push({ sectionLabel: section.label || '', sectionId: section.id, rowId: row.id, rowLabel: row.label || '' });
            }
          }
          if (row.children?.length) scanRows(row.children);
        });
      };
      scanRows(section.rows || []);
    });
    return map;
  }, [data?.sections]);

  const handleNavigateToAnnex = useCallback((annexId: string) => {
    handleSetActiveSection(annexId);
  }, [handleSetActiveSection]);

  const handleNavigateToSection = useCallback((rowId: string) => {
    handleSetActiveSection('main');
    const section: CostSheetSection | undefined = (data?.sections || []).find((s: CostSheetSection) =>
      s.rows?.some((r: CostSheetRow) => r.id === rowId || r.children?.some((c: CostSheetRow) => c.id === rowId))
    );
    if (section && !expertState.expandedSections.includes(section.id)) {
      expertState.toggleSection(section.id);
    }
    setTimeout(() => {
      const el = document.getElementById(rowId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 500);
  }, [handleSetActiveSection, data?.sections, expertState]);

  // Back from audit → return to previous section
  const handleGoBackFromAudit = React.useCallback(() => {
    handleSetActiveSection(previousSection || 'main');
  }, [previousSection, handleSetActiveSection]);

  const { expandAllSections, toggleProblems } = expertState;

  useExpertModeKeyboard({
    toggleAllSections: () => expandAllSections(data.sections.map((s: CostSheetSection) => s.id)),
    toggleHelp: () => expertState.setHelpContext('general'),
    toggleProblems: () => toggleProblems(),
    toggleComparison: () => {},
    expandSection: (n: number) => data.sections[n-1] && expertState.toggleSection(data.sections[n-1].id),
    save: handleExportJSON,
    closePanels: () => {},
    showShortcuts: () => {
      toast.info('Atajos de Teclado', {
        description: (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
            <span>Alt+E</span><span>Expandir Todo</span>
            <span>Alt+P</span><span>Problemas</span>
            <span>Alt+H</span><span>Ayuda</span>
            <span>Alt+1-9</span><span>Ir a Sección</span>
            <span>Cmd+S</span><span>Guardar</span>
          </div>
        ),
        duration: 5000,
      });
    }
  }, viewMode === 'expert' && isEditing);

  // ── Loading Skeleton ────────────────────────────────────────────────
  // Show loading while Zustand persist rehydrates from localStorage.
  // Without this check, the view renders with the reinicioTemplate default
  // during hydration, showing a blank/wrong state before the real data loads.

  if (!hasHydrated || !data || !data.header || !data.annexes || !data.sections) {
    return <ViewLoadingSplash label="Tablero Principal" showTips />;
  }

  return (
    <div className="relative min-h-screen pb-40">
      {/* ── Diagnostic Banner (visible when calculation has issues) ── */}
      {(isCalcEmpty || calcError) && totalRows > 0 && (
        <div className={cn(
          "mx-2 mt-2 px-3 py-2 rounded-xl border text-xs font-mono space-y-0.5",
          calcError
            ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-destructive dark:text-red-300"
            : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300"
        )}>
          <div className="font-bold uppercase tracking-widest text-[10px]">
            {calcError ? "Error de Cálculo" : "Cálculo Pendiente"}
          </div>
          <div>Store: hydrated={String(hasHydrated)} | Secciones={totalSections} | Filas={totalRows}</div>
          <div>calculatedValues: {calcRowCount} filas{calcError ? ` | Error: ${calcError.message}` : ''}</div>
          <div className="opacity-60">Si persiste, haz clic en el menú lateral → "Reinicio"</div>
        </div>
      )}

      {/* Horizontal cost menu — only shown on main Tablero (expert + main section) */}
      {viewMode === 'expert' && (activeSection === 'main' || activeSection === 'all-content' || activeSection === 'expert-content') && (
        <CostSheetNav
            navItems={[]}
            annexes={data?.annexes || []}
            activeSection={activeSection}
            setActiveSection={handleSetActiveSection}
            viewMode={viewMode}
            setViewMode={handleSetViewMode}
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            onOpenActions={() => setIsActionsPanelOpen(true)}
            onImport={handleImportJSON}
            onSave={handleExportJSON}
            onExportExcel={handleExportExcel}
            onExportPdf={() => setIsExportModalOpen(true)}
            lastSavedAt={lastSavedAt}
            isSaving={isSaving}
            versions={versions}
            onRestoreVersion={restoreVersion}
        />
      )}

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">

          {viewMode === 'expert' && (
            <>
                <div className="mt-4 w-full flex justify-center">
                    <div className="w-full max-w-6xl">
                    {activeSection === 'kpis' && (
                         <div className="animate-in zoom-in-95 duration-500 py-8">
                            <CostSheetSummary />
                        </div>
                    )}

                    {activeSection === 'header' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
                        </div>
                    )}

                    {(activeSection === 'all-content' || activeSection === 'expert-content' || activeSection === 'main') && (
                        <AllContentConsolidated
                            data={data}
                            calculatedHeader={calculatedHeader}
                            calculatedValues={calculatedValues}
                            calculatedAnnexes={calculatedAnnexes}
                            layoutMode={layoutMode}
                            effectiveLayoutMode={effectiveLayoutMode}
                            groupedSections={groupedSections}
                            activeSubSectionId={activeSubSectionId}
                            setActiveSubSectionId={setActiveSubSectionId}
                            onNavigateToAnnex={handleNavigateToAnnex}
                            onNavigateToSection={handleNavigateToSection}
                            annexToSectionsMap={annexToSectionsMap}
                            deepValidationErrors={deepValidationErrors}
                        />
                    )}

                    {isAnnexActive && (activeSection !== 'all-content' && activeSection !== 'expert-content' && activeSection !== 'main') && (
                        <div className="space-y-12">
                            {activeSection === 'all-annexes' ? (
                                (data?.annexes || []).map((annex: CostSheetAnnex) => (
                                    <LazyRender key={annex.id}>
                                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="flex items-center gap-4 px-6 py-4 bg-card rounded-2xl border border-border shadow-sm border-l-4 border-l-primary">
                                                <h3 className="text-xl font-black uppercase tracking-tighter italic text-foreground">Anexo {annex.id}: {annex.title}</h3>
                                            </div>
                                            <CostSheetAnnexEditor
                                                activeAnnexId={annex.id}
                                                layoutMode={layoutMode}
                                                calculatedAnnexes={calculatedAnnexes}
                                                onNavigateToSection={handleNavigateToSection}
                                                referencingSections={annexToSectionsMap[annex.id] || []}
                                            />
                                        </div>
                                    </LazyRender>
                                ))
                            ) : (
                                <CostSheetAnnexEditor
                                    activeAnnexId={activeSection}
                                    layoutMode={layoutMode}
                                    calculatedAnnexes={calculatedAnnexes}
                                    onNavigateToSection={handleNavigateToSection}
                                    referencingSections={annexToSectionsMap[activeSection] || []}
                                />
                            )}
                        </div>
                    )}

                    {activeSection === 'signature' && <CostSheetSignatureEditor />}
                    {activeSection === 'audit' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CostSheetAuditView
                                data={data}
                                calculatedValues={calculatedValues}
                                calculatedHeader={calculatedHeader}
                                audits={audits}
                                validations={validations}
                                deepValidationErrors={deepValidationErrors}
                            />
                        </div>
                    )}
                    {activeSection === "ai-chat" && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[600px] flex flex-col">
                             <div className="flex-1">
                                <DarianEditor sheetData={data} isFullView={true} onSectionChange={handleSetActiveSection} />
                             </div>
                        </div>
                    )}
                    {activeSection === "templates" && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CostSheetTemplateExplorer />
                        </div>
                    )}
                    {activeSection === "arena-fc" && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <ArenaFC />
                        </div>
                    )}
                    {activeSection === 'massive-gen' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <CostSheetMassiveGenerator isSection={true} initialProducts={quickModeProducts || undefined} initialMapping={quickModeMapping} />
                        </div>
                    )}
                    {activeSection === 'steel-calculator' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SteelStructureCalculator />
                        </div>
                    )}
                    </div>
                </div>
            </>
          )}

          {viewMode === 'assisted' && (
              <CostSheetWizard
                data={data}
                calculatedValues={calculatedValues}
                calculatedHeader={calculatedHeader}
                calculatedAnnexes={calculatedAnnexes}
                validations={validations}
                deepValidationErrors={deepValidationErrors}
                healthPercent={healthPercent}
              />
          )}

          {viewMode === 'reading' && (
               <CostSheetNarrative
                 data={data}
                 calculatedValues={calculatedValues}
                 calculatedHeader={calculatedHeader}
               />
          )}

          {viewMode === 'quick' && ( isQuickModeGenerating ? ( <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto"> <div className="mb-4 flex justify-start"> <Button variant="ghost" size="sm" onClick={() => setIsQuickModeGenerating(false)} className="rounded-xl font-bold uppercase tracking-widest text-[10px] text-muted-foreground hover:text-primary"> <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Volver a Lista </Button> </div> <CostSheetMassiveGenerator isSection={true} initialProducts={quickModeProducts || undefined} initialMapping={quickModeMapping} onClose={() => setIsQuickModeGenerating(false)} autoStart={true} isQuickAction={true} /> </div> ) : (
              <CostSheetQuickMode onGenerate={handleQuickGenerate} mapping={quickModeMapping} onMappingChange={setQuickModeMapping} /> )
          )}
        </div>
      ) : (
        <div className="animate-in zoom-in-95 duration-500">
            <div className="max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row justify-between items-center bg-muted/30 p-3 rounded-2xl gap-3">
                <div className="flex items-center gap-3 px-2">
                    <Eye className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Vista de Previsualización</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => { setIsEditing(true); setViewMode('expert'); handleSetViewMode('expert'); }}
                    aria-label="Ir al Editor de ficha en Modo Experto"
                    className="w-full sm:w-auto text-primary hover:bg-primary/10 font-bold uppercase tracking-widest text-xs h-9 px-4 rounded-xl"
                >
                    <Edit className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                    Ir al Editor (Modo Todo)
                </Button>
            </div>
            <div className="w-full flex justify-center">
                <div className="w-full max-w-6xl">
                    <CostSheetPreview
                        data={data}
                        calculatedValues={calculatedValues}
                        calculatedAnnexes={calculatedAnnexes}
                        calculatedHeader={calculatedHeader}
                    />
                </div>
            </div>
        </div>
      )}

      <CostSheetExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportPDF}
        annexes={(data?.annexes || []).map((a: CostSheetAnnex) => ({ id: a.id, title: a.title }))}
      />
      <PdfExportOverlay isVisible={isPdfGenerating} />
      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} action="exportar" />
      <BaseModal
        open={confirmation.isOpen}
        onOpenChange={(open) => setConfirmation({ ...confirmation, isOpen: open })}
        title={confirmation.title}
        footer={
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              type="button"
              onClick={() => setConfirmation({ ...confirmation, isOpen: false })}
              className="flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'}
              onClick={() => {
                confirmation.onConfirm();
                setConfirmation({ ...confirmation, isOpen: false });
              }}
              className="flex-1 sm:flex-none"
            >
              Confirmar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{confirmation.message}</p>
      </BaseModal>

      <CostSheetProblemsPanel
        problems={deepValidationErrors.map((e: EngineValidationError) => ({ ...e, sectionLabel: (data.sections as CostSheetSection[]).find(s => s.rows.some((r: CostSheetRow) => r.id === e.rowId || (r.children && r.children.some((c: CostSheetRow) => c.id === e.rowId))))?.label }))}
        calculatedValues={calculatedValues}
        isAuditView={activeSection === 'audit'}
        onGoTo={(rowId: string) => { handleSetActiveSection('main'); const section: CostSheetSection | undefined = (data.sections as CostSheetSection[]).find(s => s.rows.some((r: CostSheetRow) => r.id === rowId || (r.children && r.children.some((c: CostSheetRow) => c.id === rowId)))); if (section && !expertState.expandedSections.includes(section.id)) expertState.toggleSection(section.id); setTimeout(() => { const el = document.getElementById(rowId); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 500); }}
        onGoToAudit={() => handleSetActiveSection('audit')}
        onGoBack={handleGoBackFromAudit}
      />
    </div>
  );
};

export default CostSheetView;
