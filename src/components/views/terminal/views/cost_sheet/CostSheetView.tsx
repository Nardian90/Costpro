'use client';
import { DarianEditor } from './DarianEditor';
import { LazyRender } from '@/components/ui/LazyRender';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import CostSheetNav from './CostSheetNav';
import CostSheetCardView from './CostSheetCardView';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import CostSheetPreview from './CostSheetPreview';
import CostSheetNarrative from './CostSheetNarrative';
import CostSheetWizard from './CostSheetWizard';
import CostSheetSummary from './CostSheetSummary';
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import { CostSheetExportModal } from './CostSheetExportModal';
import { CostSheetQuickMode } from './CostSheetQuickMode';
import { UpgradeModal } from '@/components/modals/UpgradeModal';

import { CostSheetAuditView } from './CostSheetAuditView';
import { BaseModal } from "@/components/ui/BaseModal";
import { SteelStructureCalculator } from './SteelStructureCalculator';
import { CostSheetActionsPanel } from './CostSheetActionsPanel';
import { CostSheetHelpPanel } from './CostSheetHelpPanel';
import { CostSheetTemplateExplorer } from "./CostSheetTemplateExplorer";
import { useUIStore } from '@/store';
import { CostSheetMassiveGenerator } from './CostSheetMassiveGenerator';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Eye, Edit, AlertTriangle, ArrowLeft, Table2,
  Wand2, BookOpen, Zap as ZapIcon, HelpCircle
} from 'lucide-react';

import { useCostSheetViewState } from '@/hooks/logic/useCostSheetViewState';
import { useCostSheetActions } from '@/hooks/logic/useCostSheetActions';
import { useExpertModeState } from '@/hooks/ui/useExpertModeState';
import { ExpertModeAccordion } from './ExpertModeAccordion';
import { cn } from '@/lib/utils';

const CostSheetView = () => {
  const isMobile = useIsMobile();
  const { activeCostSection: activeSection } = useUIStore();

  // ── Data & Calculations ─────────────────────────────────────────────
  const { data } = useCostSheetStore();
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
    deepValidationErrors,
    viewState
  });

  // Destructure view state for JSX
  const {
    activeSubSectionId,
    setActiveSubSectionId,
    isEditing,
    setIsEditing,
    viewMode,
    setViewMode,
    layoutMode,
    setLayoutMode,
    effectiveLayoutMode,
    groupedSections,
    isAnnexActive,
    navItems
  } = viewState;

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
    <div className="w-full max-w-none px-0 pb-32 pt-0">
      <CostSheetHelpPanel
        isOpen={isHelpPanelOpen || expertState.isHelpOpen}
        onClose={() => { setIsHelpPanelOpen(false); expertState.closeHelp(); }}
        contextId={expertState.helpContext}
      />
      <CostSheetActionsPanel
        isOpen={isActionsPanelOpen}
        onClose={() => setIsActionsPanelOpen(false)}
        actions={secondaryActions}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        activeSection={activeSection}
        setActiveSection={handleSetActiveSection}
        viewMode={viewMode}
        setViewMode={handleSetViewMode}
        onOpenSections={onOpenSections}
        onOpenAnnexes={onOpenAnnexes}
        onOpenHelp={() => setIsHelpPanelOpen(true)}
                        onOpenSystemHelp={() => setCurrentView("help")}
                        onOpenAcademy={() => setCurrentView("academy")}
        onQuickGenerate={() => setViewMode('quick')}
        onExpertGenerate={() => { setIsQuickModeGenerating(true); setViewMode('expert'); }}
      />

      <CostSheetSidebarNav
        isOpen={isSectionsSidebarOpen}
        onClose={() => setIsSectionsSidebarOpen(false)}
        title="Secciones de la Ficha"
        type="sections"
        items={groupedSections}
        activeId={activeSubSectionId}
        onSelect={(id) => {
            setActiveSubSectionId(id);
            handleSetActiveSection('main');
        }}
      />

      <CostSheetSidebarNav
        isOpen={isAnnexesSidebarOpen}
        onClose={() => setIsAnnexesSidebarOpen(false)}
        title="Anexos de la Ficha"
        type="annexes"
        items={data?.annexes || []}
        activeId={activeSection}
        onSelect={handleSetActiveSection}
      />

      {isBlocked && (
          <div className="mb-6 animate-in slide-in-from-top duration-500">
              <button
                  onClick={() => { handleSetActiveSection('audit'); setViewMode('expert'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="w-full text-left bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-4 shadow-sm hover:bg-destructive/15 hover:border-destructive/30 transition-all cursor-pointer group"
              >
                  <div className="bg-destructive text-foreground p-2 rounded-xl">
                      <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                      <h4 className="text-destructive font-black uppercase tracking-tight text-sm">Ficha con Errores</h4>
                      <p className="text-destructive/80 text-xs font-medium">
                          Se han detectado {deepValidationErrors.filter(e => e.type === 'CRITICAL').length} errores críticos. La exportación está disponible pero puede contener datos inconsistentes. Por favor, revise las filas marcadas con ❌.
                      </p>
                  </div>
                  <div className="text-destructive/40 group-hover:text-destructive transition-colors shrink-0 self-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
              </button>
          </div>
      )}

      <CostSheetExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportPDF}
        annexes={data?.annexes || []}
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
                    onClick={() => setViewMode('expert')}
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
                        navItems={navItems}
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

                    {(activeSection === 'all-content' || activeSection === 'expert-content') && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="px-8 py-10 mb-6 bg-card rounded-[2.5rem] border border-border shadow-sm">
                                <h2 className="text-3xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
                                    <ZapIcon className="w-8 h-8" />
                                    Ficha: Vista Consolidada
                                </h2>
                                <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground mt-2 pl-1">Exploración Progresiva Asistida</p>
                            </div>

                            {/* Header Section (Always Visible) */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Datos Generales</h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 rounded-xl text-primary hover:bg-primary/10 font-bold uppercase tracking-widest text-[10px]"
                                        onClick={() => expertState.setHelpContext('header')}
                                    >
                                        <HelpCircle className="w-3.5 h-3.5 mr-2" />
                                        Ayuda Contextual
                                    </Button>
                                </div>
                                <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
                            </div>

                            {/* Body Sections (Individual Accordions) */}
                            <div className="space-y-4">
                                {(data?.sections || []).map((section: any) => (
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
                                ))}
                            </div>

                            {/* Annexes Container */}
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
                                    />
                                    </ExpertModeAccordion>
                                ))}
                                </div>
                            </ExpertModeAccordion>

                            <div className="mt-12 pt-12 border-t border-border/50 animate-in fade-in duration-700">
                                <CostSheetSignatureEditor />
                            </div>
                        </div>
                    )}

                    {activeSection === 'main' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
                            <LazyRender>
                                {(effectiveLayoutMode === "grid") ? (
                                    <CostSheetCardView
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={activeSubSectionId}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                ) : (
                                    <CostSheetInteractiveTable
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={activeSubSectionId}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                )}
                            </LazyRender>
                        </div>
                    )}

                    {isAnnexActive && (activeSection !== 'all-content' && activeSection !== 'expert-content') && (
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
    </div>
  );
};

export default CostSheetView;
