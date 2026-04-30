'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
    ListFilter
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
import CostSheetNarrative from './CostSheetNarrative';
import { CostSheetProblemsPanel } from './CostSheetProblemsPanel';
import { CostSheetComparisonTable } from './CostSheetComparisonTable';
import { CostSheetBanner } from './CostSheetBanner';
import { SteelStructureCalculator } from './SteelStructureCalculator';

import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/ui/BaseModal';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LazyRender } from '@/components/ui/LazyRender';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

const DarianEditor = dynamic(() => import('./DarianEditor') , { ssr: false });

const CostSheetView = () => {
  const isMobile = useIsMobile();
  const { activeCostSection: activeSection } = useUIStore();

  // ── Data & Calculations ─────────────────────────────────────────────
  const { data } = useCostSheetStore();
  const calc = useCostSheetCalculator(data as any);

  const {
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    audits,
    validations,
    calculationResult,
    isBlocked,
    deepValidationErrors
  } = calc;

  const calcV1 = (calc as any).calcV1;
  const calcV2 = (calc as any).calcV2;
  const calcV3 = (calc as any).calcV3;

  // ── Extracted Hooks ─────────────────────────────────────────────────
  const viewState = useCostSheetViewState(data as any, activeSection);
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
    data: data as any,
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
    expandedSections,
    toggleSection,
    setHelpContext,
    isComparisonMode,
    toggleComparisonMode,
    getSectionCompletion,
    updateRowValue,
    handleScenarioAction,
    groupedSections
  } = viewState as any;

  const { versions, restoreVersion, lastSavedAt, isSaving } = useAutoSave(isEditing && viewMode === 'expert');

  const isAnnexActive = useMemo(() => {
    return (data?.annexes || []).some(a => a.id === activeSection) || activeSection === 'all-annexes';
  }, [data?.annexes, activeSection]);

  useEffect(() => {
      if (activeSection === 'expert-content' || activeSection === 'all-content') {
        handleSetActiveSection('main');
      }
  }, [activeSection, handleSetActiveSection]);

  if (!data) return null;

  return (
    <div className="relative min-h-screen pb-32">
      <CostSheetBanner
        viewMode={viewMode}
        setViewMode={handleSetViewMode}
      />

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">
          {viewMode !== 'expert' && (
              <div className="flex flex-col sm:flex-row justify-between items-center bg-background dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-[1.5rem] mb-6 shadow-sm gap-4">
                  <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-primary/10 rounded-xl">
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
                    onClick={() => handleSetViewMode('expert')}
                    className="w-full sm:w-auto rounded-xl border-primary/20 hover:bg-primary/10 text-primary font-bold uppercase tracking-widest text-xs h-10 px-6 active:scale-95 transition-all"
                  >
                      <Table2 className="w-3.5 h-3.5 mr-2" />
                      Volver a Modo Todo
                  </Button>
              </div>
          )}

          {viewMode === 'expert' && (
            <>
                <div className="mb-6 -mx-4 px-4 z-30">
                    <CostSheetNav
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
                            {/* Barra de herramientas modo experto */}
                            {viewMode === 'expert' && (
                                <div className="flex items-center justify-between px-2 mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                        Modo Experto
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {lastSavedAt && (
                                            <span className="text-[10px] text-muted-foreground">
                                                Guardado {formatDistanceToNow(lastSavedAt, { addSuffix: true, locale: es })}
                                            </span>
                                        )}
                                        <Button
                                            variant={isComparisonMode ? 'default' : 'outline'}
                                            size="sm"
                                            className="rounded-xl gap-2 h-8 text-[10px]"
                                            onClick={() => {
                                                toggleComparisonMode();
                                                handleSetActiveSection('main');
                                            }}
                                        >
                                            <GitCompare className="w-3.5 h-3.5" />
                                            {isComparisonMode ? 'Individual' : 'Comparar'}
                                        </Button>
                                        {versions.length > 0 && (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-8 text-[10px]">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        {versions.length} versión{versions.length !== 1 ? 'es' : ''}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent align="end" className="w-72 p-2 rounded-2xl">
                                                    <p className="text-[10px] font-black uppercase tracking-widest px-2 py-1 text-muted-foreground">
                                                        Historial de versiones
                                                    </p>
                                                    <div className="max-h-56 overflow-y-auto space-y-1">
                                                        {versions.map((v: any, i: number) => (
                                                            <div key={i} className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 group">
                                                                <div>
                                                                    <p className="text-xs font-bold">{v.label || 'Autosave'}</p>
                                                                    <p className="text-[10px] text-muted-foreground">
                                                                        {formatDistanceToNow(v.timestamp, { addSuffix: true, locale: es })}
                                                                    </p>
                                                                </div>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    onClick={() => restoreVersion(v)}
                                                                >
                                                                    Restaurar
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="px-8 py-10 mb-6 bg-card rounded-[2.5rem] border border-border shadow-sm">
                                <h2 className="text-3xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
                                    <ZapIcon className="w-8 h-8" />
                                    Ficha: Vista Consolidada
                                </h2>
                                <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground mt-2 pl-1">Exploración Progresiva Asistida</p>
                            </div>

                            <div className="space-y-4">
                                <div className="px-2 flex items-center gap-2">
                                    <Edit3 className="w-3 h-3 text-muted-foreground" />
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Datos Generales</h3>
                                </div>
                                <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
                            </div>

                            <div className="space-y-4">
                                <div className="px-2 flex items-center gap-2">
                                    <ListFilter className="w-3 h-3 text-muted-foreground" />
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Estructura de Costos</h3>
                                </div>
                                {isComparisonMode ? (
                                    <CostSheetComparisonTable
                                        sections={data.sections}
                                        scenarios={data.scenarios || []}
                                        scenarioConfig={data.scenarioConfig}
                                        calcV1={calcV1}
                                        calcV2={calcV2}
                                        calcV3={calcV3}
                                        onUpdateRowValue={updateRowValue}
                                        onScenarioAction={handleScenarioAction}
                                    />
                                ) : (
                                    (data?.sections || []).map((section: any) => (
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
                                                    sections={[section]}
                                                    calculatedValues={calculatedValues}
                                                    annexes={data?.annexes || []}
                                                    activeSubSectionId="all"
                                                    setActiveSubSectionId={() => {}}
                                                    hideHeader={true}
                                                />
                                            ) : (
                                                <CostSheetInteractiveTable
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

                            <div className="space-y-4">
                                <div className="px-2 flex items-center gap-2">
                                    <BookOpen className="w-3 h-3 text-muted-foreground" />
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
                                    {(data?.annexes || []).map((annex: any) => (
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

                            <div className="space-y-4">
                                <div className="px-2 flex items-center gap-2">
                                    <Eye className="w-3 h-3 text-muted-foreground" />
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
                                (data?.annexes || []).map((annex: any) => (
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
                                data={data as any}
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
                                <DarianEditor sheetData={data as any} isFullView={true} onSectionChange={handleSetActiveSection} />
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
                data={data as any}
                calculatedValues={calculatedValues}
                calculatedHeader={calculatedHeader}
              />
          )}

          {viewMode === 'reading' && (
               <CostSheetNarrative
                 data={data as any}
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
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Vista de Previsualización</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setIsEditing(true); setViewMode('expert'); handleSetViewMode('expert'); }}
                    className="w-full sm:w-auto text-primary hover:bg-primary/10 font-bold uppercase tracking-widest text-xs h-9 px-4 rounded-xl"
                >
                    <Edit className="w-3.5 h-3.5 mr-2" />
                    Ir al Editor (Modo Todo)
                </Button>
            </div>
            <div className="w-full flex justify-center">
                <div className="w-full max-w-6xl">
                    <CostSheetPreview
                        data={data as any}
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
              onClick={() => setConfirmation({ ...confirmation, isOpen: false })}
              className="flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button
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
        problems={deepValidationErrors.map((e: any) => ({
            ...e,
            sectionLabel: (data.sections as any[]).find(s =>
                s.rows.some((r: any) =>
                    r.id === e.rowId ||
                    (r.children && r.children.some((c: any) => c.id === e.rowId))
                )
            )?.label
        }))}
        onGoTo={(rowId: string) => {
            handleSetActiveSection('main');
            const section: any = (data.sections as any[]).find(s =>
                s.rows.some((r: any) =>
                    r.id === rowId ||
                    (r.children && r.children.some((c: any) => c.id === rowId))
                )
            );
            if (section && !expandedSections.includes(section.id)) toggleSection(section.id);
            setTimeout(() => {
                const el = document.getElementById(rowId);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
        }}
        alwaysVisible={viewMode === 'expert' && isEditing}
      />
    </div>
  );
};

export default CostSheetView;
