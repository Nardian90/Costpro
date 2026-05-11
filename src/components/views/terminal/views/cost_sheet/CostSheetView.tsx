'use client';

import React, { useMemo } from 'react';
import {
    Calculator,
    LayoutGrid,
} from 'lucide-react';

import { useUIStore } from '@/store';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { useCostSheetActions } from '@/hooks/logic/useCostSheetActions';
import { useCostSheetViewState } from '@/hooks/logic/useCostSheetViewState';
import { useExpertModeState } from '@/hooks/ui/useExpertModeState';

import CostSheetNav from './CostSheetNav';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import { ExpertModeAccordion } from './ExpertModeAccordion';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import CostSheetAuditView from './CostSheetAuditView';
import CostSheetTemplateExplorer from './CostSheetTemplateExplorer';
import CostSheetMassiveGenerator from './CostSheetMassiveGenerator';
import { CostSheetBanner } from './CostSheetBanner';
import { CostSheetProblemsPanel } from './CostSheetProblemsPanel';

import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/ui/BaseModal';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import type { CostSheetSection, CostSheetAnnex, CostSheetRow } from '@/types/cost-sheet';
import type { ValidationError as EngineValidationError } from '@/lib/cost-engine/types';

const DarianEditor = dynamic(() => import('./DarianEditor').then(m => ({ default: m.DarianEditor })), { ssr: false });

const CostSheetView = () => {
  const { activeCostSection: activeSection } = useUIStore();

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

  const viewState = useCostSheetViewState(data, activeSection);
  const expertState = useExpertModeState();

  const {
    confirmation,
    setConfirmation,
    handleSetActiveSection,
    handleExportExcel,
    handleImportJSON,
    quickModeMapping,
    quickModeProducts,
    isExportModalOpen,
    setIsExportModalOpen,
    isUpgradeModalOpen,
    setIsUpgradeModalOpen,
  } = useCostSheetActions({
    data,
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    calculationResult,
    isBlocked,
    activeSection
  });

  const isAnnexActive = useMemo(() => {
    return (data?.annexes || []).some(a => a.id === activeSection) || activeSection === 'all-annexes';
  }, [data?.annexes, activeSection]);

  if (!data || !data.header || !data.annexes || !data.sections) {
    return <div className="p-8 text-center">Cargando plantilla...</div>;
  }

  return (
    <div className="relative w-full min-h-screen bg-background text-foreground pb-20">
      <CostSheetBanner
        activeSection={activeSection}
        onAction={(action) => {
            if (action === 'templates') handleSetActiveSection('templates');
        }}
      />

      <div className="w-full max-w-none px-2 sm:px-4 lg:px-6 mx-auto animate-in fade-in duration-700">
          <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40 mb-6 py-3">
              <CostSheetNav
                  activeSection={activeSection}
                  setActiveSection={handleSetActiveSection}
                  onImport={handleImportJSON}
                  onSave={() => toast.success("Ficha guardada localmente")}
                  onExportExcel={handleExportExcel}
                  onExportPdf={() => setIsExportModalOpen(true)}
              />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-12 space-y-8">
                  {(activeSection === 'main' || activeSection === 'expert-content' || activeSection === 'all-content') && (
                  <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
                      <div className="space-y-4">
                          <div className="px-2 flex items-center gap-2">
                              <LayoutGrid className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Encabezado de Ficha</h3>
                          </div>
                          <CostSheetHeaderEditor />
                      </div>

                      <div className="space-y-4">
                          <div className="px-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                  <Calculator className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                                  <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Desglose de Costos</h3>
                              </div>
                          </div>

                          <div className="space-y-3">
                              {(data?.sections || []).map((section: CostSheetSection) => (
                                  <ExpertModeAccordion
                                      key={section.id}
                                      id={section.id}
                                      title={section.label || `Sección ${section.id}`}
                                      isExpanded={expertState.expandedSections.includes(section.id)}
                                      onToggle={() => expertState.toggleSection(section.id)}
                                      hasErrors={deepValidationErrors.some((e: EngineValidationError) => e.rowId.startsWith(section.id + '.') || e.rowId === section.id)}
                                      onHelp={() => expertState.setHelpContext(section.id)}
                                  >
                                      <CostSheetInteractiveTable
                                          sections={[section]}
                                          calculatedValues={calculatedValues}
                                          annexes={data?.annexes || []}
                                          activeSubSectionId="all"
                                          setActiveSubSectionId={() => {}}
                                          hideHeader={true}
                                      />
                                  </ExpertModeAccordion>
                              ))}
                          </div>
                      </div>

                      <CostSheetSignatureEditor />
                  </div>
              )}

              {isAnnexActive && (activeSection !== 'all-content' && activeSection !== 'expert-content' && activeSection !== 'main') && (
                  <div className="space-y-12">
                      {activeSection === 'all-annexes' ? (
                          (data?.annexes || []).map((annex: CostSheetAnnex) => (
                              <div key={annex.id} className="space-y-6">
                                  <div className="flex items-center gap-4 px-6 py-4 bg-card rounded-2xl border border-border shadow-sm border-l-4 border-l-primary">
                                      <h3 className="text-xl font-black uppercase tracking-tighter italic text-foreground">Anexo {annex.id}: {annex.title}</h3>
                                  </div>
                                  <CostSheetAnnexEditor
                                      activeAnnexId={annex.id}
                                      layoutMode="table"
                                      calculatedAnnexes={calculatedAnnexes}
                                  />
                              </div>
                          ))
                      ) : (
                          <CostSheetAnnexEditor
                              activeAnnexId={activeSection}
                              layoutMode="table"
                              calculatedAnnexes={calculatedAnnexes}
                          />
                      )}
                  </div>
              )}

              {activeSection === 'audit' && (
                  <CostSheetAuditView
                      data={data}
                      calculatedValues={calculatedValues}
                      calculatedHeader={calculatedHeader}
                      audits={audits}
                      validations={validations}
                      deepValidationErrors={deepValidationErrors}
                  />
              )}
              {activeSection === "ai-chat" && (
                  <div className="min-h-[600px] flex flex-col">
                      <DarianEditor sheetData={data} isFullView={true} onSectionChange={handleSetActiveSection} />
                  </div>
              )}
              {activeSection === "templates" && <CostSheetTemplateExplorer />}
              {activeSection === 'massive-gen' && (
                  <CostSheetMassiveGenerator
                      isSection={true}
                      initialProducts={quickModeProducts || undefined}
                      initialMapping={quickModeMapping}
                  />
              )}
              </div>
          </div>
      </div>

      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} action="exportar" />

      <BaseModal
        open={confirmation.isOpen}
        onOpenChange={(open) => setConfirmation({ ...confirmation, isOpen: open })}
        title={confirmation.title}
        footer={
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => setConfirmation({ ...confirmation, isOpen: false })}>Cancelar</Button>
            <Button onClick={() => { confirmation.onConfirm(); setConfirmation({ ...confirmation, isOpen: false }); }}>Confirmar</Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{confirmation.message}</p>
      </BaseModal>

      <CostSheetProblemsPanel
        problems={deepValidationErrors.map((e: EngineValidationError) => ({ ...e, sectionLabel: (data.sections as CostSheetSection[]).find(s => s.rows.some((r: CostSheetRow) => r.id === e.rowId || (r.children && r.children.some((c: CostSheetRow) => c.id === e.rowId))))?.label }))}
        onGoTo={(rowId: string) => {
            handleSetActiveSection('main');
            setTimeout(() => { const el = document.getElementById(rowId); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 500);
        }}
      />
    </div>
  );
};

export default CostSheetView;
