'use client';
import { LazyRender } from '@/components/ui/LazyRender';

import React, { useState, useRef } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import CostSheetNav from './CostSheetNav';
import CostSheetCardView from './CostSheetCardView';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import { CospiChat } from "./CospiChat";
import CostSheetPreview from './CostSheetPreview';
import CostSheetNarrative from './CostSheetNarrative';
import CostSheetWizard from './CostSheetWizard';
import CostSheetSummary from './CostSheetSummary';
import { CostSheetFormulaGuide } from './CostSheetFormulaGuide';
import { CostSheetBanner } from './CostSheetBanner';
import { CostSheetModeSwitcher } from './CostSheetModeSwitcher';
import { CostSheetAuditView } from './CostSheetAuditView';
import { CostSheetActionsPanel } from './CostSheetActionsPanel';
import { CostSheetHelpPanel } from './CostSheetHelpPanel';
import { CostSheetTemplateExplorer } from "./CostSheetTemplateExplorer";
import { FolderOpen, Bot } from "lucide-react";
import { CostSheetSidePanel } from './CostSheetSidePanel';
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import { CostSheetBottomNav } from './CostSheetBottomNav';
import { useUIStore } from '@/store';
import { CostSheetMassiveGenerator } from './CostSheetMassiveGenerator';
import { CostSheetExportModal, ExportOptions } from './CostSheetExportModal';
import { CostSheetQuickMode } from './CostSheetQuickMode';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Layout, Eye, Edit, FileText, Trash2, Download, FileSpreadsheet, Upload, Save, BarChart3, ClipboardList, Activity, MoreVertical, AlertTriangle, ArrowLeft, Table2, Wand2, BookOpen, Zap as ZapIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { exportToPDF, exportToCSV } from '@/services/export-service';
import { useIsMobile } from '@/hooks/ui/useMobile';

const CostSheetView: React.FC = () => {
  const { data, reset } = useCostSheetStore();
  const { isCalculatorOpen, setIsCalculatorOpen } = useUIStore();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState('kpis');
  const [activeSubSectionId, setActiveSubSectionId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<'calculator' | 'ai' | 'both'>('ai');
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = useState(false);
  const [isActionsPanelOpen, setIsActionsPanelOpen] = useState(false);
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'expert' | 'assisted' | 'reading' | 'quick'>('expert');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');

  const { calculatedValues, calculatedAnnexes, calculatedHeader, healthPercent, audits, validations } = useCostSheetCalculator(data);

  const handleSetActiveSection = (id: string) => {
    setActiveSection(id);
    if (id !== 'main' && id !== 'all-content' && !id.startsWith('annex-')) {
        setActiveSubSectionId(null);
    }
  };

  const onOpenAnnexes = () => {
    handleSetActiveSection('all-annexes');
  };

  const onOpenSections = () => {
    setIsSectionsSidebarOpen(true);
  };

  const handleQuickGenerate = (generatedData: any) => {
    useCostSheetStore.getState().setSheet(generatedData);
    setViewMode('expert');
    setActiveSection('kpis');
    toast.success('Ficha generada exitosamente');
  };

  const quickModeProducts = React.useMemo(() => {
    if (!data?.header?.description) return null;
    return [{
        name: data.header.product_name || 'Producto',
        description: data.header.description,
        quantity: 1
    }];
  }, [data?.header]);

  const allActions: Action[] = React.useMemo(() => [
    {
        id: 'export-pdf',
        label: 'Exportar PDF',
        icon: Download,
        onClick: () => setIsExportModalOpen(true),
        variant: 'primary'
    },
    {
        id: 'export-csv',
        label: 'Exportar CSV',
        icon: FileSpreadsheet,
        onClick: async () => {
            exportToCSV(data, calculatedValues, `cost-sheet-${data?.header?.product_name || "export"}`);
        }
    },
    {
        id: 'save-template',
        label: 'Guardar Plantilla',
        icon: Save,
        onClick: () => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `template-${data?.header?.product_name || 'cost-sheet'}.json`;
            a.click();
            toast.success('Plantilla descargada');
        }
    },
    {
        id: 'reset',
        label: 'Reiniciar Ficha',
        icon: Trash2,
        onClick: () => {
            if (confirm('¿Estás seguro de que deseas reiniciar la ficha? Todos los cambios se perderán.')) {
                reset();
                toast.success('Ficha reiniciada');
            }
        },
        variant: 'danger'
    }
  ], [data, calculatedValues, calculatedHeader, reset]);

  const secondaryActions = React.useMemo(() => allActions, [allActions]);

  const navItems = React.useMemo(() => [
    { id: "kpis", label: "Tablero", icon: BarChart3 },
    { id: "templates", label: "Plantillas", icon: FolderOpen },

    { id: "header", label: "Encabezado", icon: Layout },
    { id: "massive-gen", label: "Gen. Masiva", icon: FileText },
    { id: "ai-chat", label: "IA Cospi", icon: Bot }
  ], []);

  const groupedSections = React.useMemo(() => {
    if (!data?.sections) return [];
    const groups = [];
    for (let i = 0; i < data.sections.length; i += 3) {
      const slice = data.sections.slice(i, i + 3);
      const labels = slice.map((s: any) => s.id).join(', ');
      groups.push({
        id: `group-${i}`,
        label: `Secciones ${labels}`,
        sectionIds: slice.map((s: any) => s.id)
      });
    }
    return groups;
  }, [data?.sections]);

  const subSectionActions = React.useMemo(() => {
    return groupedSections.map(group => ({
        id: group.id,
        label: group.label.split(':')[0], // Short label like "SECCIONES 1-3"
        tooltip: group.label,
        icon: Layout,
        onClick: () => {
            setActiveSubSectionId(group.id);
            handleSetActiveSection('main');
        },
        active: activeSubSectionId === group.id && activeSection === 'main'
    }));
  }, [groupedSections, activeSubSectionId, activeSection]);

  const isAnnexActive = activeSection === 'all-annexes' || activeSection === 'all-content' || activeSection.startsWith('annex-');

  const handleBottomAction = (action: string) => {
    if (action === 'calculator') setIsCalculatorOpen(!isCalculatorOpen);
    if (action === 'ai') {
        setActiveSection('ai-chat');
    }
    if (action === 'sections') setIsSectionsSidebarOpen(true);
  };

  return (
    <div className="relative min-h-screen pb-24">
        <CostSheetBanner />

      {isEditing ? (
        <div className="px-4 py-2">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto no-scrollbar py-1">
                <CostSheetModeSwitcher viewMode={viewMode} setViewMode={setViewMode} />
                <div className="h-8 w-px bg-border/40 mx-2" />
                <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                    className="flex-1 sm:flex-none h-10 px-4 rounded-xl border-primary/20 text-primary hover:bg-primary/5 font-bold uppercase tracking-widest text-[10px]"
                >
                    <Eye className="w-3.5 h-3.5 mr-2" />
                    Vista Lectura
                </Button>
                <div className="hidden sm:block">
                     <ActionMenu actions={allActions} />
                </div>
            </div>
          </div>

          {viewMode === 'expert' && (
            <>
                <div className="sticky top-[48px] z-30 py-1 bg-background/60 backdrop-blur-md border-b border-border/5 -mx-4 px-4 overflow-hidden">
                    <CostSheetNav
                        navItems={navItems}
                        annexes={data?.annexes || []}
                        activeSection={activeSection}
                        setActiveSection={handleSetActiveSection}
                        onOpenActions={() => setIsActionsPanelOpen(true)}
                        onOpenHelp={() => setIsHelpPanelOpen(true)}
                        onOpenAnnexes={onOpenAnnexes}
                        onOpenSections={onOpenSections}
                        isEditing={isEditing}
                        onToggleEditing={() => setIsEditing(!isEditing)}
                    />
                </div>

                <div className="mt-4 w-full flex justify-center">
                    <div className="w-full max-w-6xl">
                    {activeSection === 'kpis' && (
                         <div className="animate-in zoom-in-95 duration-500 py-8">
                            <CostSheetSummary
                                totalPrice={calculatedValues['14']?.total || 0}
                                utility={calculatedValues['13']?.total || 0}
                                totalCost={calculatedValues['12']?.total || 0}
                                telemetry={calculatedValues}
                                header={calculatedHeader}
                                healthPercent={healthPercent}
                            />
                        </div>
                    )}
                    {activeSection === 'header' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
                        </div>
                    )}
                    {(activeSection === 'main' || activeSection === 'all-content') && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
                            {activeSection === 'all-content' && (
                                <div className="px-4 py-6 mb-8 bg-primary/5 rounded-[2rem] border border-primary/10">
                                    <h2 className="text-2xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
                                        <ZapIcon className="w-8 h-8" />
                                        Modo Experto: Vista Consolidada
                                    </h2>
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Todas las Secciones y Anexos</p>
                                </div>
                            )}

                            <LazyRender>
                                {(layoutMode === "grid") ? (
                                    <CostSheetCardView
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={activeSection === 'all-content' ? 'all' : (activeSubSectionId || '')}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                ) : (
                                    <CostSheetInteractiveTable
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={activeSection === 'all-content' ? 'all' : (activeSubSectionId || '')}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                )}
                            </LazyRender>
                        </div>
                    )}
                    {isAnnexActive && (
                        <div className="space-y-12">
                            {(activeSection === 'all-annexes' || activeSection === 'all-content') ? (
                                (data?.annexes || []).map((annex: any) => (
                                    <LazyRender key={annex.id}>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 px-4">
                                                <div className="w-2 h-8 bg-primary rounded-full" />
                                                <h3 className="text-xl font-black uppercase tracking-tighter italic">Anexo {annex.id}: {annex.title}</h3>
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
                            />
                        </div>
                    )}
                    {activeSection === "templates" && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CostSheetTemplateExplorer />
                        </div>
                    )}
                    {activeSection === 'massive-gen' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <CostSheetMassiveGenerator isSection={true} initialProducts={quickModeProducts || undefined} />
                        </div>
                    )}
                    {activeSection === "ai-chat" && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-[70vh] border border-primary/10 rounded-[2.5rem] overflow-hidden">
                             <CospiChat sheetData={data} />
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

          {viewMode === 'quick' && (
              <CostSheetQuickMode onGenerate={handleQuickGenerate} />
          )}
        </div>
      ) : (
        <div className="animate-in zoom-in-95 duration-500">
            <div className="max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row justify-between items-center bg-slate-100 dark:bg-slate-800/40 p-3 rounded-2xl gap-3">
                <div className="flex items-center gap-3 px-2">
                    <Eye className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Vista de Previsualización</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setIsEditing(true); setViewMode('expert'); }}
                    className="w-full sm:w-auto text-primary hover:bg-primary/10 font-bold uppercase tracking-widest text-xs h-9 px-4 rounded-xl"
                >
                    <Edit className="w-3.5 h-3.5 mr-2" />
                    Ir al Editor (Modo Experto)
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
      <CostSheetBottomNav
        activeTab={activeSection}
        onTabChange={handleSetActiveSection}
        onAction={handleBottomAction}
      />

      <CostSheetSidePanel
        isOpen={isSidePanelOpen}
        onOpen={(mode) => { setSidePanelMode(mode); setIsSidePanelOpen(true); }}
        onClose={() => setIsSidePanelOpen(false)}
        mode={sidePanelMode}
        sheetData={data}
        onAIClick={() => handleSetActiveSection('ai-chat')}
      />

      <CostSheetActionsPanel
        isOpen={isActionsPanelOpen}
        onClose={() => setIsActionsPanelOpen(false)}
        actions={secondaryActions as any}
        viewMode={viewMode}
        setViewMode={setViewMode}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
      />

      <CostSheetHelpPanel
        isOpen={isHelpPanelOpen}
        onClose={() => setIsHelpPanelOpen(false)}
      />

      <CostSheetSidebarNav
        isOpen={isSectionsSidebarOpen}
        onClose={() => setIsSectionsSidebarOpen(false)}
        title="Secciones"
        items={subSectionActions}
        activeId={activeSubSectionId || ''}
        onSelect={(id) => {
            setActiveSubSectionId(id);
            handleSetActiveSection('main');
        }}
        type="sections"
      />

      <CostSheetExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        annexes={data?.annexes || []}
        onExport={async (options) => {
            const response = await fetch('/api/cost-sheets/export-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data,
                    calculatedValues,
                    calculatedHeader,
                    exportOptions: options
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${data?.header?.product_name || 'ficha'}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast.success('PDF exportado exitosamente');
            } else {
                toast.error('Error al generar PDF');
            }
            setIsExportModalOpen(false);
        }}
      />
    </div>
  );
};

export default CostSheetView;
