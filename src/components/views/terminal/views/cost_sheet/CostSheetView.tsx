'use client';
import { DarianEditor } from './DarianEditor';
import { LazyRender } from '@/components/ui/LazyRender';

import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { CostSheetFormulaGuide } from './CostSheetFormulaGuide';

import { CostSheetAuditView } from './CostSheetAuditView';
import { BaseModal } from "@/components/ui/BaseModal";
import { SteelStructureCalculator } from './SteelStructureCalculator';
import { CostSheetActionsPanel } from './CostSheetActionsPanel';
import { CostSheetHelpPanel } from './CostSheetHelpPanel';
import { CostSheetTemplateExplorer } from "./CostSheetTemplateExplorer";
import { FolderOpen } from "lucide-react";
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import { useUIStore } from '@/store';
import { CostSheetMassiveGenerator } from './CostSheetMassiveGenerator';
import { CostSheetExportModal, ExportOptions } from './CostSheetExportModal';
import { CostSheetQuickMode } from './CostSheetQuickMode';
import { CostSheetViewMode } from './CostSheetModeDropdown';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import ActionMenu from '@/components/ui/ActionMenu';
import { cn, formatDate, formatCurrency } from '@/lib/utils';
import {
  Layout, Eye, Edit, FileText, Trash2, Download, FileSpreadsheet,
  Upload, Save, BarChart3, ClipboardList, Activity, MoreVertical,
  AlertTriangle, ArrowLeft, Table2, Wand2, BookOpen, Zap as ZapIcon,
  Sparkles, Calculator, Tag, TrendingUp, PenTool, ListFilter,
  Bot, Settings, Scale, LifeBuoy, GraduationCap, Zap
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { usageService } from '@/services/usage-service';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import { useAuthStore } from '@/store';
import { exportToPDF, exportToCSV } from '@/services/export-service';
import { useIsMobile } from '@/hooks/ui/useMobile';

const CostSheetView = () => {
  const isMobile = useIsMobile();
  const { user } = useAuthStore();
  const { costSheetActiveSection: activeSection, setCostSheetActiveSection: setActiveSection, setCurrentView } = useUIStore();

  const [confirmation, setConfirmation] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; variant?: 'default' | 'destructive' }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmation({ isOpen: true, title, message, onConfirm, variant });
  };
  const [activeSubSectionId, setActiveSubSectionId] = useState('group-1-3');
  const [quickModeMapping, setQuickModeMapping] = useState({
    targetColumn: 'sale_price' as 'sale_price' | 'total_cost',
    modificationRow: '13.1'
  });
  const [quickModeProducts, setQuickModeProducts] = React.useState<any[] | null>(null);
  const [isQuickModeGenerating, setIsQuickModeGenerating] = React.useState(false);

  const handleSetActiveSection = (id: string) => {
    setActiveSection(id);
    if (id === 'main' && !activeSubSectionId) {
        const group13 = groupedSections.find(g => g.id === 'group-1-3');
        if (group13) {
            setActiveSubSectionId('group-1-3');
        }
    }
  };

  const { data, loadExample, reset, setSheet } = useCostSheetStore();
  const {
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    audits,
    validations,
    healthPercent,
    calculationResult,
    isBlocked,
    deepValidationErrors
  } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<CostSheetViewMode>('expert');
  const [layoutMode, setLayoutMode] = useState<ViewMode>('grid');

  const handleSetViewMode = (mode: CostSheetViewMode) => {
    if (mode === 'preview') {
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
    if (mode === 'audit') { setActiveSection('audit'); setViewMode('expert'); } else if (mode === 'kpis') { setActiveSection('kpis'); setViewMode('expert'); } else if (mode === 'expert') { setActiveSection('expert-content'); setViewMode('expert'); } else { setViewMode(mode); }
  };

  const handleQuickGenerate = async (products: any[]) => {
    setQuickModeProducts(products);
    setIsQuickModeGenerating(true);
  };

  React.useEffect(() => {
    setLayoutMode(isMobile ? 'grid' : 'table');
  }, [isMobile]);

  useEffect(() => {
    if (activeSection === 'all') {
        setIsSectionsSidebarOpen(true);
    } else if (activeSection === 'all-annexes') {
        setIsAnnexesSidebarOpen(true);
    }
  }, [activeSection]);

  const onOpenSections = () => setIsSectionsSidebarOpen(true);
  const onOpenAnnexes = () => setIsAnnexesSidebarOpen(true);

  const allActions = useMemo(() => [
    { id: 'kpis', label: 'Tablero', icon: BarChart3, onClick: () => setActiveSection('kpis'), variant: 'outline' as const },
    { id: 'header', label: 'Encabezado', icon: Layout, onClick: () => setActiveSection('header'), variant: 'outline' as const },
    { id: 'open-sections', label: 'Secciones', icon: ListFilter, onClick: () => onOpenSections(), variant: 'outline' as const },
    { id: 'open-annexes', label: 'Anexo', icon: FileSpreadsheet, onClick: () => onOpenAnnexes(), variant: 'outline' as const },
    { id: 'signature', label: 'Firmas', icon: PenTool, onClick: () => setActiveSection('signature'), variant: 'outline' as const },
    { id: 'ai-chat', label: 'Darian AI', icon: Bot, onClick: () => setActiveSection('ai-chat'), variant: 'primary' as const },
    { id: 'quick-gen', label: 'Generar Rápida', icon: Sparkles, onClick: () => setViewMode('quick'), variant: 'outline' as const },
    { id: 'expert-gen', label: 'Generar Experta', icon: Zap, onClick: () => { setIsQuickModeGenerating(true); setViewMode('expert'); }, variant: 'outline' as const },
    { id: 'massive-gen', label: 'Generación Masiva', icon: FileText, onClick: () => setActiveSection('massive-gen'), variant: 'outline' as const },
    { id: 'templates', label: 'Explorar Plantillas', icon: FolderOpen, onClick: () => setActiveSection('templates'), variant: 'outline' as const },
    { id: 'load-example', label: 'Cargar Ejemplo', icon: FileText, onClick: () => askConfirmation('Cargar Ejemplo', '¿Deseas cargar la ficha de ejemplo? Esto reemplazará tus datos actuales.', loadExample), variant: 'outline' as const },
    { id: 'export-json', label: 'Guardar (JSON)', icon: Save, onClick: () => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ficha-costo-${data.header.name.replace(/\s+/g, '-').toLowerCase()}.json`;
        a.click();
        toast.success('Ficha guardada localmente');
    }, variant: 'outline' as const },
    { id: 'import-json', label: 'Importar JSON', icon: Upload, onClick: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const json = JSON.parse(e.target?.result as string);
                        setSheet(json);
                        toast.success('Ficha importada con éxito');
                    } catch (err) {
                        toast.error('Error al importar el archivo JSON');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }, variant: 'outline' as const },
    { id: 'export-excel', label: 'Exportar Excel', icon: FileSpreadsheet, onClick: () => {
        exportToCSV(data, calculatedValues, `Ficha_Costo_${data.header.name.replace(/\s+/g, '_')}.csv`);
        toast.success('Excel generado con éxito');
    }, variant: 'primary' as const },
    { id: 'export-pdf', label: 'Exportar PDF', icon: Download, onClick: () => setIsExportModalOpen(true), variant: 'success' as const },
    { id: 'calculator', label: 'Calculadora Pro', icon: Calculator, onClick: () => {}, variant: 'outline' as const },
    { id: 'steel-calculator', label: 'Calculadora Estructura', icon: Scale, onClick: () => setActiveSection('steel-calculator'), variant: 'outline' as const }
  ], [data, calculatedValues, loadExample, setSheet, setActiveSection, setViewMode]);

  const groupedSections = React.useMemo(() => {
    if (!data?.sections) return [];
    const predefinedBlocks = [
        { start: 1, end: 3 },
        { start: 4, end: 5 },
        { start: 6, end: 7 },
        { start: 8, end: 10 },
        { start: 11, end: 16 }
    ];
    const getSectionNumber = (id: string) => {
        const num = id.replace('s', '');
        return parseInt(num, 10);
    };
    const getSectionName = (label: string) => {
        const match = label.match(/Sección\s+\d+:\s*(.*)/i);
        return match ? match[1].trim() : label.trim();
    };
    const groups: { id: string, label: string, sectionIds: string[] }[] = [];
    predefinedBlocks.forEach((block) => {
        const blockSections = data.sections.filter(s => {
            const n = getSectionNumber(s.id);
            return n >= block.start && n <= block.end;
        });
        if (blockSections.length > 0) {
            const first = blockSections[0];
            const last = blockSections[blockSections.length - 1];
            let label = "";
            if (blockSections.length === 1) {
                label = first.label;
            } else {
                const startNum = getSectionNumber(first.id);
                const endNum = getSectionNumber(last.id);
                const firstName = getSectionName(first.label);
                const lastName = getSectionName(last.label);
                label = `SECCIONES ${startNum} - ${endNum}: ${firstName} ... ${lastName}`;
            }
            groups.push({ id: `group-${block.start}-${block.end}`, label, sectionIds: blockSections.map(s => s.id) });
        }
    });
    data.sections.forEach(s => {
        const n = getSectionNumber(s.id);
        const isInBlock = predefinedBlocks.some(b => n >= b.start && n <= b.end);
        if (!isInBlock) {
            groups.push({ id: s.id, label: s.label, sectionIds: [s.id] });
        }
    });
    return groups;
  }, [data?.sections]);

  const [isActionsPanelOpen, setIsActionsPanelOpen] = useState(false);
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = useState(false);
  const [isAnnexesSidebarOpen, setIsAnnexesSidebarOpen] = useState(false);
  const [isMassiveGeneratorOpen, setIsMassiveGeneratorOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const isAnnexActive = React.useMemo(() => (data?.annexes || []).some((a: any) => a.id === activeSection) || activeSection === 'all-annexes' || activeSection === 'all-content' || activeSection === 'expert-content', [data?.annexes, activeSection]);

  const handleExportPDF = React.useCallback(async (options: ExportOptions) => {
    if (user) {
        const { allowed } = await usageService.checkQuota(user.id, 'fc_export', user.plan, user.role);
        if (!allowed) {
            setIsUpgradeModalOpen(true);
            return;
        }
    }
    setIsExportModalOpen(false);
    if (isBlocked) {
        toast.warning("Exportando con advertencias: La ficha contiene errores críticos de validación.");
    }
    const toastId = toast.loading("Generando PDF profesional... por favor espere.");
    const downloadPDF = async (opts: ExportOptions, filename: string) => {
        if (!calculationResult) return false;
        try {
            const element = document.getElementById('cost-sheet-content');
            if (element) {
                await exportToPDF(element, filename);
                return true;
            }
            return false;
        } catch (e) {
            console.error(e);
            return false;
        }
    };
    const success = await downloadPDF(options, `Ficha_Costo_${data.header.name.replace(/\s+/g, '_')}_${formatDate(new Date())}.pdf`);
    if (success) { toast.success("PDF generado con éxito", { id: toastId }); } else { toast.error("Error al generar el PDF", { id: toastId }); }
  }, [data, calculationResult, isBlocked, user]);

  if (!data) return <Skeleton className="w-full h-[600px] rounded-3xl" />;

  return (
    <div className="w-full max-w-none px-0 pb-32 pt-0" id="cost-sheet-content">
      <CostSheetHelpPanel isOpen={isHelpPanelOpen} onClose={() => setIsHelpPanelOpen(false)} />
      <CostSheetActionsPanel
        isOpen={isActionsPanelOpen}
        onClose={() => setIsActionsPanelOpen(false)}
        actions={allActions}
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
        items={groupedSections}
        activeId={activeSubSectionId}
        onSelect={setActiveSubSectionId}
        type="sections"
      />
      <CostSheetSidebarNav
        isOpen={isAnnexesSidebarOpen}
        onClose={() => setIsAnnexesSidebarOpen(false)}
        title="Anexos Disponibles"
        items={data?.annexes || []}
        activeId={activeSection}
        onSelect={handleSetActiveSection}
        type="annexes"
      />
      <CostSheetExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportPDF}
        annexes={data?.annexes || []}
      />
      <CostSheetSummary
        totalPrice={calculatedValues['14.1']?.total || 0}
        utility={calculatedValues['13.1']?.total || 0}
        totalCost={calculatedValues['12']?.total || 0}
        telemetry={calculatedValues}
        header={calculatedHeader}
        healthPercent={healthPercent}
      />
      {isEditing ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
          {viewMode === 'expert' && (
            <>
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                    <div className="xl:col-span-3 sticky top-24 space-y-6 hidden xl:block">
                         <CostSheetNav
                            navItems={data?.sections || []}
                            annexes={data?.annexes || []}
                            activeSection={activeSection}
                            setActiveSection={handleSetActiveSection}
                            viewMode={viewMode}
                            setViewMode={handleSetViewMode}
                            onOpenSections={onOpenSections}
                            onOpenAnnexes={onOpenAnnexes}
                         />
                         <CostSheetFormulaGuide />
                    </div>
                    <div className="xl:col-span-9 space-y-12">
                    {!isAnnexActive && activeSection !== 'signature' && activeSection !== 'audit' && activeSection !== 'ai-chat' && activeSection !== 'templates' && activeSection !== 'massive-gen' && activeSection !== 'steel-calculator' && (
                        <div className="space-y-12">
                            {activeSection === 'header' && <CostSheetHeaderEditor header={data.header} calculatedHeader={calculatedHeader} />}
                            {activeSection === 'kpis' && (
                                <>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in-95 duration-500">
                                        <div className="bg-card p-8 rounded-3xl border border-border shadow-sm">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-6">Desglose de Costos</h4>
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center p-4 bg-muted/30 rounded-2xl">
                                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Materiales Directos</span>
                                                    <span className="text-sm font-black italic">{formatCurrency(calculatedValues['1.4']?.total || 0)}</span>
                                                </div>
                                                <div className="flex justify-between items-center p-4 bg-muted/30 rounded-2xl">
                                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Mano de Obra</span>
                                                    <span className="text-sm font-black italic">{formatCurrency(calculatedValues['5.1']?.total || 0)}</span>
                                                </div>
                                                <div className="flex justify-between items-center p-4 bg-muted/30 rounded-2xl border-t-2 border-primary/20">
                                                    <span className="text-xs font-black uppercase tracking-widest text-primary">Costo Total</span>
                                                    <span className="text-lg font-black italic text-primary">{formatCurrency(calculatedValues['12']?.total || 0)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-card p-8 rounded-3xl border border-border shadow-sm flex flex-col justify-center items-center text-center">
                                             <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                                <TrendingUp className="w-10 h-10 text-primary" />
                                             </div>
                                             <h4 className="text-xs font-black uppercase tracking-[0.2em] mb-2">Rentabilidad Sugerida</h4>
                                             <div className="text-4xl font-black italic text-foreground tracking-tighter mb-2">
                                                {(( (calculatedValues['14.1']?.total || 0) / (calculatedValues['12']?.total || 1) - 1) * 100).toFixed(1)}%
                                             </div>
                                             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">Basado en el precio de venta actual y costos operativos totales.</p>
                                        </div>
                                     </div>
                                </>
                            )}
                            <LazyRender>
                                {(layoutMode === "grid") ? (
                                    <CostSheetCardView
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={(activeSection === 'all-content' || activeSection === 'expert-content') ? 'all' : activeSubSectionId}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                ) : (
                                    <CostSheetInteractiveTable
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={(activeSection === 'all-content' || activeSection === 'expert-content') ? 'all' : activeSubSectionId}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                )}
                            </LazyRender>
                        </div>
                    )}
                    {isAnnexActive && (
                        <div className="space-y-12">
                            {(activeSection === 'all-annexes' || activeSection === 'all-content' || activeSection === 'expert-content') ? (
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
                            {(activeSection === 'all-content' || activeSection === 'expert-content') && (
                                <div className="mt-12 pt-12 border-t border-border/50 animate-in fade-in duration-700">
                                    <CostSheetSignatureEditor />
                                </div>
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
