'use client';

import React, { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import {
    Wand2,
    BookOpen,
    Zap as ZapIcon,
    Table2,
    Clock,
    ArrowLeft,
    Edit,
    Eye,
    Calculator,
    MoreVertical,
    FileText,
    Upload,
    Save,
    FileSpreadsheet,
    Download,
    Activity,
    Edit3,
    ListFilter,
    LayoutGrid,
    TableProperties,
    ChevronRight,
    ClipboardList
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

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

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BaseModal } from '@/components/ui/BaseModal';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { LazyRender } from '@/components/ui/LazyRender';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
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
const SECTION_BG = ['bg-primary/5', 'bg-violet-500/5', 'bg-amber-500/5', 'bg-emerald-500/5', 'bg-rose-500/5', 'bg-cyan-500/5'];
const SECTION_BORDER = ['border-l-primary/40', 'border-l-violet-500/40', 'border-l-amber-500/40', 'border-l-emerald-500/40', 'border-l-rose-500/40', 'border-l-cyan-500/40'];

function SectionDivider({ label, sectionColorIdx, rowCount, isCollapsed, onToggle }: {
  label: string;
  sectionColorIdx: number;
  rowCount?: number;
  isCollapsed: boolean;
  onToggle: () => void;
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
  annexToSectionsMap = {}
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
          />
          {!collapsed['consolidated-annexes'] && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              {annexes.map((annex, idx) => (
                <div key={annex.id}>
                  <SectionDivider
                    label={`ANEXO ${annex.id}: ${annex.title}`}
                    sectionColorIdx={2 + idx}
                    rowCount={annex.data?.length || 0}
                    isCollapsed={collapsed[`consolidated-annex-${annex.id}`]}
                    onToggle={() => toggle(`consolidated-annex-${annex.id}`)}
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

  if (!data || !data.header || !data.annexes || !data.sections) {
    return (
      <div className="w-full max-w-none px-2 pb-32 pt-0">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 px-2">
          <div className="flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-2xl" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-12 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-32">
      {/* ── Diagnostic Banner (visible when calculation has issues) ── */}
      {(isCalcEmpty || calcError) && totalRows > 0 && (
        <div className={cn(
          "mx-2 mt-2 px-3 py-2 rounded-xl border text-xs font-mono space-y-0.5",
          calcError
            ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300"
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

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">
          {viewMode !== 'expert' && (
              <div className="flex flex-col sm:flex-row justify-between items-center bg-background dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-[1.5rem] mb-6 shadow-sm gap-4" role="group" aria-label="Seleccionar modo de visualización de la ficha">
                  <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-primary/10 rounded-xl" aria-hidden="true">
                          {viewMode === 'assisted' && <Wand2 className="w-5 h-5 text-primary" />}
                          {viewMode === 'reading' && <ClipboardList className="w-5 h-5 text-primary" />}
                          {viewMode === 'quick' && <ZapIcon className="w-5 h-5 text-primary" />}
                      </div>
                      <div>
                          <h3 className="text-sm font-bold uppercase tracking-tight">
                              {viewMode === 'assisted' ? 'Modo Asistido' : viewMode === 'reading' ? 'Informe' : 'Modo Rápido'}
                          </h3>
                          <p className="text-xs text-muted-foreground uppercase font-black tracking-[0.2em]">Vista Simplificada Activa</p>
                      </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => handleSetViewMode('expert')}
                    aria-label={viewMode === 'assisted' ? 'Volver a Modo Experto desde Modo Asistido' : viewMode === 'reading' ? 'Volver a Modo Experto desde Informe' : 'Volver a Modo Experto desde Modo Rápido'}
                    className="w-full sm:w-auto rounded-xl border-primary/20 hover:bg-primary/10 text-primary font-bold uppercase tracking-widest text-xs h-10 px-6 active:scale-95 transition-all"
                  >
                      <Table2 className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                      Volver a Modo Todo
                  </Button>
              </div>
          )}

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
        onGoTo={(rowId: string) => { handleSetActiveSection('main'); const section: CostSheetSection | undefined = (data.sections as CostSheetSection[]).find(s => s.rows.some((r: CostSheetRow) => r.id === rowId || (r.children && r.children.some((c: CostSheetRow) => c.id === rowId)))); if (section && !expertState.expandedSections.includes(section.id)) expertState.toggleSection(section.id); setTimeout(() => { const el = document.getElementById(rowId); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 500); }}
      />
    </div>
  );
};

export default CostSheetView;
