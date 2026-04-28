'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Eye, Edit, ArrowLeft, ArrowRight, Save, Download, FileText,
  Plus, Settings2, Trash2, LayoutGrid, Columns, GitCompare,
  HelpCircle, ChevronRight, Calculator, FileSpreadsheet,
  Activity, Star, Clock, Upload, Sparkles, LogOut, CheckCircle2,
  AlertCircle,
  ListFilter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useScenarioStore } from '@/store/scenario-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { useScenarioCalculator } from '@/hooks/logic/useScenarioCalculator';
import { useCostSheetActions } from '@/hooks/logic/useCostSheetActions';
import { useExpertModeState } from '@/hooks/ui/useExpertModeState';
import { useExpertModeKeyboard } from '@/hooks/ui/useExpertModeKeyboard';
import { useAutoSave } from '@/hooks/logic/useAutoSave';
import { useCostSheetViewState } from '@/hooks/logic/useCostSheetViewState';
import { ExpertModeAccordion } from './ExpertModeAccordion';
import { CostSheetComparisonTable } from './CostSheetComparisonTable';
import { CostSheetProblemsPanel } from './CostSheetProblemsPanel';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetNav from './CostSheetNav';
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import { CostSheetAuditView } from './CostSheetAuditView';
import CostSheetPreview from './CostSheetPreview';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import CostSheetCardView from './CostSheetCardView';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import { DarianEditor } from './DarianEditor';
import { CostSheetTemplateExplorer } from './CostSheetTemplateExplorer';
import { CostSheetMassiveGenerator } from './CostSheetMassiveGenerator';
import SteelStructureCalculator from './SteelStructureCalculator';
import CostSheetWizard from './CostSheetWizard';
import CostSheetNarrative from './CostSheetNarrative';
import { CostSheetQuickMode } from './CostSheetQuickMode';
import { CostSheetExportModal } from './CostSheetExportModal';
import { BaseModal } from '@/components/ui/BaseModal';
import { LazyRender } from '@/components/ui/LazyRender';

const CostSheetView: React.FC = () => {
  const { data, setSheet, loadExample } = useCostSheetStore();
  const {
    isComparisonMode,
    toggleComparisonMode,
    createScenario,
    setPrimaryScenario,
    updateRowValue
  } = useScenarioStore();

  const expertState = useExpertModeState();
  const {
    expandedSections,
    toggleSection,
    expandAllSections,
    setHelpContext,
    toggleProblems,
  } = expertState;

  const calc = useCostSheetCalculator(data);
  const {
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    audits,
    validations,
    deepValidationErrors,
    isBlocked,
    calculationResult
  } = calc;

  const [activeSectionId, setActiveSectionId] = useState<string>('header');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const viewState = useCostSheetViewState(data, activeSectionId);
  const { viewMode, isEditing, layoutMode, setLayoutMode } = viewState;

  const actions = useCostSheetActions({
    data,
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    calculationResult,
    isBlocked,
    deepValidationErrors,
    viewState
  });

  const {
    handleSetViewMode,
    handleSetActiveSection,
    isExportModalOpen,
    setIsExportModalOpen,
    isUpgradeModalOpen,
    setIsUpgradeModalOpen,
    confirmation,
    setConfirmation,
    handleExportPDF,
    handleExportJSON
  } = actions;

  // Sync activeSectionId
  useEffect(() => {
    if ((actions as any).activeSection) {
      setActiveSectionId((actions as any).activeSection);
    }
  }, [(actions as any).activeSection]);

  const { calcV1, calcV2, calcV3 } = useScenarioCalculator();

  const { versions, restoreVersion, lastSavedAt, isSaving } = useAutoSave(isEditing);

  useExpertModeKeyboard({
    toggleAllSections: () => expandAllSections(data.sections.map((s: any) => s.id)),
    toggleHelp: () => setHelpContext('general'),
    toggleProblems: toggleProblems,
    toggleComparison: () => toggleComparisonMode(),
    expandSection: (n: number) => data.sections[n-1] && toggleSection(data.sections[n-1].id),
    save: handleExportJSON,
    closePanels: () => {}
  }, viewMode === 'expert' && isEditing);

  const isAnnexActive = activeSectionId !== 'main' && activeSectionId !== 'header' && activeSectionId !== 'signature' && activeSectionId !== 'audit' && activeSectionId !== 'ai-chat' && activeSectionId !== 'templates' && activeSectionId !== 'massive-gen' && activeSectionId !== 'steel-calculator';

  const getSectionCompletion = useCallback((section: any) => {
    const rows = section.rows.flatMap((r: any) => [r, ...(r.children || [])]);
    const filled = rows.filter((r: any) => calculatedValues[r.id]?.total !== 0);
    return rows.length ? Math.round((filled.length / rows.length) * 100) : 0;
  }, [calculatedValues]);

  const getSectionErrors = useCallback((section: any) => {
    const rowIds = section.rows.flatMap((r: any) => [r.id, ...(r.children?.map((c: any) => c.id) || [])]);
    return deepValidationErrors.some((e: any) => rowIds.includes(e.rowId));
  }, [deepValidationErrors]);

  const handleScenarioAction = (action: string, id: any) => {
    switch (action) {
      case 'setPrimary':
        setPrimaryScenario(id);
        break;
      case 'duplicate':
        createScenario(id, `Copia de ${id}`);
        break;
      case 'exportPdf':
        handleExportPDF({ includeFC: true, includeAnnexes: [], includeAudit: true, scenarioId: id } as any);
        break;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <CostSheetNav
        activeSection={activeSectionId}
        setActiveSection={handleSetActiveSection}
        viewMode={viewMode}
        onSetViewMode={handleSetViewMode}
        isEditing={isEditing}
        lastSavedAt={lastSavedAt}
        isSaving={isSaving}
        versions={versions as any}
        onRestoreVersion={restoreVersion}
        onSave={handleExportJSON}
        onExportPdf={() => setIsExportModalOpen(true)}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
      />

      {isEditing ? (
        <div className="container mx-auto px-4 py-8">
          {viewMode === 'expert' && (
            <div className="flex flex-col gap-8">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-2"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  <ListFilter className="w-4 h-4" />
                  Navegación
                </Button>

                <Button
                  variant={isComparisonMode ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl gap-2"
                  onClick={() => toggleComparisonMode()}
                >
                  <GitCompare className="w-4 h-4" />
                  {isComparisonMode ? "Modo Individual" : "Comparar Escenarios"}
                </Button>
              </div>

              <div className="flex-1 space-y-8">
                {activeSectionId === 'header' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <CostSheetHeaderEditor header={data.header} calculatedHeader={calculatedHeader} />
                  </div>
                )}

                {activeSectionId === 'main' && (
                  <div className="space-y-6">
                    {isComparisonMode ? (
                      <CostSheetComparisonTable
                        sections={data.sections as any}
                        scenarios={data.scenarios || []}
                        scenarioConfig={data.scenarioConfig}
                        calcV1={calcV1}
                        calcV2={calcV2}
                        calcV3={calcV3}
                        onUpdateRowValue={updateRowValue}
                        onScenarioAction={handleScenarioAction}
                      />
                    ) : (
                      <div className="space-y-4">
                        {data.sections.map((section) => (
                          <ExpertModeAccordion
                            key={section.id}
                            id={section.id}
                            title={section.label || 'Sin Título'}
                            isExpanded={expandedSections.includes(section.id)}
                            onToggle={() => toggleSection(section.id)}
                            onHelp={() => setHelpContext(section.id)}
                            completionPercent={getSectionCompletion(section)}
                            hasErrors={getSectionErrors(section)}
                          >
                            <CostSheetInteractiveTable
                              sections={[section] as any}
                              calculatedValues={calculatedValues}
                              annexes={data.annexes as any}
                              hideHeader={true}
                              activeSubSectionId="all"
                              setActiveSubSectionId={() => {}}
                            />
                          </ExpertModeAccordion>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isAnnexActive && (
                   <CostSheetAnnexEditor
                      activeAnnexId={activeSectionId}
                      layoutMode={layoutMode}
                      calculatedAnnexes={calculatedAnnexes}
                   />
                )}

                {activeSectionId === 'signature' && <CostSheetSignatureEditor />}
                {activeSectionId === 'audit' && (
                  <CostSheetAuditView
                    data={data as any}
                    calculatedValues={calculatedValues}
                    calculatedHeader={calculatedHeader}
                    audits={audits}
                    validations={validations}
                    deepValidationErrors={deepValidationErrors}
                  />
                )}

                {activeSectionId === 'ai-chat' && (
                  <div className="min-h-[600px] flex flex-col">
                     <DarianEditor sheetData={data as any} isFullView={true} onSectionChange={handleSetActiveSection} />
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === 'assisted' && <CostSheetWizard data={data as any} calculatedValues={calculatedValues} calculatedHeader={calculatedHeader} />}
          {viewMode === 'reading' && <CostSheetNarrative data={data as any} calculatedValues={calculatedValues} calculatedHeader={calculatedHeader} />}
        </div>
      ) : (
        <div className="container mx-auto px-4 py-8">
           <CostSheetPreview data={data as any} calculatedValues={calculatedValues} calculatedAnnexes={calculatedAnnexes} calculatedHeader={calculatedHeader} />
        </div>
      )}

      {/* Sidebar Navigation Sheet */}
      <CostSheetSidebarNav
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        title="Navegación de Ficha"
        items={data.sections as any}
        activeId={activeSectionId}
        onSelect={(id) => {
          handleSetActiveSection(id);
          setIsSidebarOpen(false);
        }}
        type="sections"
      />

      <CostSheetProblemsPanel
        problems={deepValidationErrors.map((e: any) => ({
          message: e.message,
          type: e.type,
          rowId: e.rowId,
          sectionLabel: (data.sections as any[]).find(s => s.rows.some((r: any) => r.id === e.rowId))?.label
        }))}
        onGoTo={(rowId) => {
          handleSetActiveSection('main');
          const section = (data.sections as any[]).find(s => s.rows.some((r: any) => r.id === rowId));
          if (section && !expandedSections.includes(section.id)) {
            toggleSection(section.id);
          }
          setTimeout(() => {
            const el = document.getElementById(rowId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 500);
        }}
      />

      <BaseModal
        open={confirmation.isOpen}
        onOpenChange={(open: boolean) => setConfirmation({ ...confirmation, isOpen: open })}
        title={confirmation.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{confirmation.message}</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}>
              Cancelar
            </Button>
            <Button
              variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'}
              onClick={() => {
                confirmation.onConfirm();
                setConfirmation(prev => ({ ...prev, isOpen: false }));
              }}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </BaseModal>

      <CostSheetExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportPDF}
        annexes={data.annexes as any}
      />

      {isUpgradeModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-card p-6 rounded-2xl max-w-md border border-border shadow-2xl">
                <h3 className="text-lg font-bold mb-4">Mejora tu plan</h3>
                <p className="text-sm text-muted-foreground mb-6">Has alcanzado el límite de exportaciones para tu plan actual. Mejora a Pro para seguir exportando sin límites.</p>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsUpgradeModalOpen(false)}>Cerrar</Button>
                    <Button onClick={() => window.location.href = '/billing'}>Ver Planes</Button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default CostSheetView;
