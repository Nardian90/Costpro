'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import {
    Wand2,
    BookOpen,
    Zap as ZapIcon,
    Table2,
    GitCompare,
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
    TableProperties
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
import CostSheetParallelExpert from './CostSheetParallelExpert';
import CostSheetFlatTable from './CostSheetFlatTable';
import { CostSheetBanner } from './CostSheetBanner';
import { SteelStructureCalculator } from './SteelStructureCalculator';

import { CostSheetProblemsPanel } from './CostSheetProblemsPanel';
import { CostSheetComparisonTable } from './CostSheetComparisonTable';

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
import { useScenarioCalculator } from '@/hooks/logic/useScenarioCalculator';
import type { CostSheetSection, CostSheetAnnex, CostSheetRow, ScenarioId } from '@/types/cost-sheet';
import type { ValidationError as EngineValidationError } from '@/lib/cost-engine/types';

const DarianEditor = dynamic(() => import('./DarianEditor').then(m => ({ default: m.DarianEditor })), { ssr: false });

const CostSheetNarrative = dynamic(() => import('./CostSheetNarrative'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-muted rounded h-64" />,
});

const CostSheetView = () => {
  const isMobile = useIsMobile();
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
    deepValidationErrors
  } = useCostSheetCalculator(data);

  // ── Extracted Hooks ─────────────────────────────────────────────────
  const viewState = useCostSheetViewState(data, activeSection);
  const expertState = useExpertModeState();

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
    activeSection
  });

  const {
    viewMode,
    setViewMode,
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

  // ── Scenario Store ──────────────────────────────────────────────────
  // FIX-RCT-140: Use selectors to only re-render when specific fields change.
  // Previously, useScenarioStore() without selector subscribed to ALL state changes,
  // causing excessive re-renders when any scenario store field changed.
  const isFlatMode = useScenarioStore((s) => s.isFlatMode);
  const isComparisonMode = useScenarioStore((s) => s.isComparisonMode);
  const isParallelMode = useScenarioStore((s) => s.isParallelMode);
  const initializeScenarios = useScenarioStore((s) => s.initializeScenarios);
  const toggleComparisonMode = useScenarioStore((s) => s.toggleComparisonMode);
  const toggleParallelMode = useScenarioStore((s) => s.toggleParallelMode);
  const setFlatMode = useScenarioStore((s) => s.setFlatMode);
  const scenarioUpdateRowValue = useScenarioStore((s) => s.updateRowValue);
  const setPrimaryScenario = useScenarioStore((s) => s.setPrimaryScenario);
  const createScenarioFromStore = useScenarioStore((s) => s.createScenario);
  const deleteScenario = useScenarioStore((s) => s.deleteScenario);

  // ── Scenario Calculator ─────────────────────────────────────────────
  const { calcV1, calcV2, calcV3 } = useScenarioCalculator();

  const handleScenarioAction = (action: string, scenarioId: ScenarioId) => {
    switch (action) {
      case 'setPrimary': setPrimaryScenario(scenarioId); break;
      case 'duplicate': createScenarioFromStore(scenarioId, 'Copia'); break;
      case 'delete': deleteScenario(scenarioId); break;
      case 'exportPdf': handleExportPDF({} as any); break;
    }
  };

  const adapterUpdateRowValue = (scenarioId: ScenarioId, rowId: string, field: string, value: number) => {
    scenarioUpdateRowValue(scenarioId, rowId, field as any, value);
  };

  const isAnnexActive = useMemo(() => {
    return (data?.annexes || []).some(a => a.id === activeSection) || activeSection === 'all-annexes';
  }, [data?.annexes, activeSection]);

  // FIX-RCT-140: Prevent initializeScenarios cascade — only run once per data.id.
  // Removed viewMode and initializeScenarios from deps to prevent re-triggering
  // when unrelated state changes. Uses refs for stable access.
  const initializedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (isEditing && data && data?.id && initializedRef.current !== data?.id) {
      initializedRef.current = data?.id;
      // Delay to let persist rehydration settle before modifying store
      const timer = setTimeout(() => {
        const currentData = useCostSheetStore.getState().data;
        if (!currentData?.scenarios || currentData.scenarios.length === 0) {
          useScenarioStore.getState().initializeScenarios();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isEditing, data?.id]);

  const { expandAllSections, toggleProblems } = expertState;

  useExpertModeKeyboard({
    toggleAllSections: () => expandAllSections(data.sections.map((s: CostSheetSection) => s.id)),
    toggleHelp: () => expertState.setHelpContext('general'),
    toggleProblems: () => toggleProblems(),
    toggleComparison: () => toggleComparisonMode(),
    expandSection: (n: number) => data.sections[n-1] && expertState.toggleSection(data.sections[n-1].id),
    save: handleExportJSON,
    closePanels: () => {},
    showShortcuts: () => {
      toast.info('Atajos de Teclado', {
        description: (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
            <span>Alt+E</span><span>Expandir Todo</span>
            <span>Alt+C</span><span>Comparar</span>
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
      <CostSheetBanner
        viewMode={viewMode}
        setViewMode={handleSetViewMode}
      />

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">
          {viewMode !== 'expert' && (
              <div className="flex flex-col sm:flex-row justify-between items-center bg-background dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-[1.5rem] mb-6 shadow-sm gap-4" role="group" aria-label="Seleccionar modo de visualización de la ficha">
                  <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-primary/10 rounded-xl" aria-hidden="true">
                          {viewMode === 'assisted' && <Wand2 className="w-5 h-5 text-primary" />}
                          {viewMode === 'reading' && <BookOpen className="w-5 h-5 text-primary" />}
                          {viewMode === 'quick' && <ZapIcon className="w-5 h-5 text-primary" />}
                      </div>
                      <div>
                          <h3 className="text-sm font-bold uppercase tracking-tight">
                              {viewMode === 'assisted' ? 'Modo Asistido' : viewMode === 'reading' ? 'Modo Lectura' : 'Modo Rápido'}
                          </h3>
                          <p className="text-xs text-muted-foreground uppercase font-black tracking-[0.2em]">Vista Simplificada Activa</p>
                      </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => handleSetViewMode('expert')}
                    aria-label={viewMode === 'assisted' ? 'Volver a Modo Experto desde Modo Asistido' : viewMode === 'reading' ? 'Volver a Modo Experto desde Modo Lectura' : 'Volver a Modo Experto desde Modo Rápido'}
                    className="w-full sm:w-auto rounded-xl border-primary/20 hover:bg-primary/10 text-primary font-bold uppercase tracking-widest text-xs h-10 px-6 active:scale-95 transition-all"
                  >
                      <Table2 className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                      Volver a Modo Todo
                  </Button>
              </div>
          )}

          {viewMode === 'expert' && (
            <>
                <div className="mb-6 -mx-4 px-4 z-30">
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
                </div>

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
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="px-8 py-10 mb-6 bg-card rounded-[2.5rem] border border-border shadow-sm">
                                <h2 className="text-3xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
                                    <ZapIcon className="w-8 h-8" aria-hidden="true" />
                                    Ficha: Vista Consolidada
                                </h2>
                                <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground mt-2 pl-1">Exploración Progresiva Asistida</p>
                            </div>

                            {/* Header Section (Always Visible in Consolidada) */}
                            <div className="space-y-4">
                                <div className="px-2 flex items-center gap-2">
                                    <Edit3 className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Datos Generales</h3>
                                </div>
                                <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
                            </div>

                            {/* Body Sections (Individual Accordions or Flat Table) */}
                            <div className="space-y-4">
                                <div className="px-2 flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <ListFilter className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                                        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Estructura de Costos</h3>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {/* Axis 1: Format toggle */}
                                        <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/40">
                                            <button
                                                type="button"
                                                onClick={() => setFlatMode(false)}
                                                className={cn(
                                                    "flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                                                    !isFlatMode
                                                        ? "bg-card text-foreground shadow-sm border border-border/60"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                                aria-label="Vista por secciones"
                                                aria-pressed={!isFlatMode}
                                            >
                                                <ListFilter className="w-3 h-3" />
                                                <span className="hidden sm:inline">Secciones</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFlatMode(true)}
                                                className={cn(
                                                    "flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                                                    isFlatMode
                                                        ? "bg-card text-foreground shadow-sm border border-border/60"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                                aria-label="Vista hoja de cálculo"
                                                aria-pressed={isFlatMode}
                                            >
                                                <TableProperties className="w-3 h-3" />
                                                <span className="hidden sm:inline">Hoja</span>
                                            </button>
                                        </div>

                                        {/* Axis 2: Scenario toggle (only when not flat) */}
                                        {!isFlatMode && (
                                            <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/40">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (isParallelMode) toggleParallelMode(false);
                                                        toggleComparisonMode();
                                                    }}
                                                    className={cn(
                                                        "flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                                                        isComparisonMode && !isParallelMode
                                                            ? "bg-primary text-primary-foreground shadow-sm"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                    aria-label="Modo comparación"
                                                    aria-pressed={isComparisonMode && !isParallelMode}
                                                >
                                                    <GitCompare className="w-3 h-3" />
                                                    <span className="hidden sm:inline">Comparar</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleParallelMode()}
                                                    className={cn(
                                                        "flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                                                        isParallelMode
                                                            ? "bg-primary text-primary-foreground shadow-sm"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                    aria-label="Modo paralelo"
                                                    aria-pressed={isParallelMode}
                                                >
                                                    <LayoutGrid className="w-3 h-3" />
                                                    <span className="hidden sm:inline">Paralelo</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── View Router ──────────────────────────────────── */}
                                {isFlatMode ? (
                                    <CostSheetFlatTable
                                        sections={data.sections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                    />
                                ) : isParallelMode ? (
                                    <CostSheetParallelExpert
                                        sections={data.sections}
                                        scenarios={data.scenarios || []}
                                        scenarioConfig={data.scenarioConfig}
                                        calcV1={calcV1 ?? undefined}
                                        calcV2={calcV2 ?? undefined}
                                        calcV3={calcV3 ?? undefined}
                                        onUpdateRowValue={adapterUpdateRowValue}
                                        onScenarioAction={handleScenarioAction}
                                    />
                                ) : isComparisonMode ? (
                                    <CostSheetComparisonTable
                                        sections={data.sections}
                                        scenarios={data.scenarios || []}
                                        scenarioConfig={data.scenarioConfig}
                                        calcV1={calcV1 ?? undefined}
                                        calcV2={calcV2 ?? undefined}
                                        calcV3={calcV3 ?? undefined}
                                        onUpdateRowValue={adapterUpdateRowValue}
                                        onScenarioAction={handleScenarioAction}
                                    />
                                ) : (
                                    (data?.sections || []).map((section: CostSheetSection, realSectionIndex: number) => (
                                        <ExpertModeAccordion
                                            key={section.id}
                                            id={section.id}
                                            title={section.label || `Sección ${section.id}`}
                                            isExpanded={expertState.expandedSections.includes(section.id)}
                                            onToggle={() => expertState.toggleSection(section.id)}
                                            onHelp={() => expertState.setHelpContext(section.id)}
                                        >
                                            <LazyRender>
                                            {effectiveLayoutMode === "grid" ? (
                                                <CostSheetCardView
                                                    sectionIndexOffset={realSectionIndex}
                                                    sections={[section]}
                                                    calculatedValues={calculatedValues}
                                                    annexes={data?.annexes || []}
                                                    activeSubSectionId="all"
                                                    setActiveSubSectionId={() => {}}
                                                    hideHeader={true}
                                                />
                                            ) : (
                                                <CostSheetInteractiveTable
                                                    sectionIndexOffset={realSectionIndex}
                                                    sections={[section]}
                                                    calculatedValues={calculatedValues}
                                                    annexes={data?.annexes || []}
                                                    activeSubSectionId="all"
                                                    setActiveSubSectionId={() => {}}
                                                    hideHeader={true}
                                                />
                                            )}
                                            </LazyRender>
                                        </ExpertModeAccordion>
                                    ))
                                )}
                            </div>

                            {/* Annexes Container */}
                            <div className="space-y-4">
                                <div className="px-2 flex items-center gap-2">
                                    <BookOpen className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Anexos y Documentación</h3>
                                </div>
                                <ExpertModeAccordion
                                    id="annexes-root"
                                    title="Anexos de la Ficha"
                                    isExpanded={expertState.isAnnexesRootExpanded}
                                    onToggle={() => expertState.toggleAnnexesRoot()}
                                    onHelp={() => expertState.setHelpContext('annexes-root')}
                                    icon={<BookOpen className={cn("w-5 h-5 transition-transform duration-300", expertState.isAnnexesRootExpanded && "rotate-90")} />}
                                    className="border-primary/20 bg-primary/5"
                                >
                                    <div className="space-y-4 pt-4">
                                    {(data?.annexes || []).map((annex: CostSheetAnnex) => (
                                        <ExpertModeAccordion
                                        key={annex.id}
                                        id={annex.id}
                                        title={`Anexo ${annex.id}: ${annex.title}`}
                                        isExpanded={expertState.activeAnnexId === annex.id}
                                        onToggle={() => expertState.setActiveAnnex(annex.id)}
                                        onHelp={() => expertState.setHelpContext(annex.id)}
                                        className="bg-background"
                                        >
                                        <CostSheetAnnexEditor
                                            activeAnnexId={annex.id}
                                            layoutMode={layoutMode}
                                            calculatedAnnexes={calculatedAnnexes}
                                            hideBorder={true}
                                        />
                                        </ExpertModeAccordion>
                                    ))}
                                    </div>
                                </ExpertModeAccordion>
                            </div>

                            {/* Signatures at the end */}
                            <div className="space-y-4">
                                <div className="px-2 flex items-center gap-2">
                                    <Eye className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Pie de Firma</h3>
                                </div>
                                <div className="animate-in fade-in duration-700">
                                    <CostSheetSignatureEditor />
                                </div>
                            </div>
                        </div>
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
                                            />
                                        </div>
                                    </LazyRender>
                                ))
                            ) : (
                                <CostSheetAnnexEditor
                                    activeAnnexId={activeSection}
                                    layoutMode={layoutMode}
                                    calculatedAnnexes={calculatedAnnexes}
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
