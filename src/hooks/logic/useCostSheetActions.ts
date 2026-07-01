'use client';

import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useAuthStore, useUIStore, ViewType } from '@/store';
import { CostSheetData, CalculatedRowValue } from '@/types/cost-sheet';
import { ExportOptions } from '@/components/views/terminal/views/cost_sheet/CostSheetExportModal';
import {
  ArrowLeft,
  Eye,
  Edit,
  Activity,
  FileText,
  Upload,
  Save,
  FileSpreadsheet,
  Download,
  Calculator,
  MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { usageService } from '@/services/usage-service';
import { exportToCSV } from '@/services/export-service';
import { generateCostSheetPDF } from '@/lib/export/pdf-generator';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalculationResult, AuditEntry } from '@/lib/cost-engine/types';
import { ValidationResult } from '@/lib/cost-engine/validations';
import { CostSheetViewMode } from '@/components/views/terminal/views/cost_sheet/CostSheetModeDropdown';

interface UseCostSheetActionsProps {
  data: CostSheetData | null;
  calculatedValues: { [key: string]: CalculatedRowValue };
  calculatedHeader: any | null;
  calculatedAnnexes: any[];
  calculationResult: CalculationResult | null;
  isBlocked: boolean;
  activeSection: string;
  /** setViewMode from useCostSheetViewState — needed so sidebar-driven
   *  activeCostSection changes can switch the internal viewMode. */
  setViewMode?: (mode: CostSheetViewMode) => void;
}

export const useCostSheetActions = ({
  data,
  calculatedValues,
  calculatedHeader,
  calculatedAnnexes,
  calculationResult,
  isBlocked,
  activeSection,
  setViewMode: externalSetViewMode
}: UseCostSheetActionsProps) => {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setCurrentView, setActiveCostSection } = useUIStore();
  const { setSheet, loadExample } = useCostSheetStore();

  // FIX-RCT-140: Removed duplicate viewMode/isEditing state. These were never used
  // for rendering (CostSheetView uses viewState's viewMode/isEditing instead).
  // Keeping only UI-only state here.
  const [isActionsPanelOpen, setIsActionsPanelOpen] = useState(false);
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = useState(false);
  const [isAnnexesSidebarOpen, setIsAnnexesSidebarOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isQuickModeGenerating, setIsQuickModeGenerating] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [quickModeProducts, setQuickModeProducts] = useState<any[] | null>(null);
  const [quickModeMapping, setQuickModeMapping] = useState<any>({});

  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'default' | 'destructive';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  });

  const askConfirmation = useCallback((title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmation({ isOpen: true, title, message, onConfirm, variant });
  }, []);

  const handleSetActiveSection = useCallback((section: string) => {
    setActiveCostSection(section);
  }, [setActiveCostSection]);

  // handleSetViewMode bridges sidebar-driven activeCostSection changes
  // to the actual viewMode managed by useCostSheetViewState.
  // It handles both mode switching AND section navigation.
  // B2-FIX: Acepta optionalSectionOverride para evitar race conditions con activeSectionRef.
  const handleSetViewMode = useCallback(
    (mode: CostSheetViewMode, optionalSectionOverride?: string) => {
      // Ensure editing is active when switching to any editable mode
      if (externalSetViewMode) {
        externalSetViewMode(mode);
      }
      // Map mode → appropriate activeCostSection for section-based rendering
      if (mode === 'audit') { handleSetActiveSection('audit'); }
      else if (mode === 'kpis') { handleSetActiveSection('kpis'); }
      else if (mode === 'expert') {
        // Don't override section if user navigated to a specific section like 'templates'.
        // B2-FIX: Se agregaron 'gen-easy', 'arena-fc', 'massive-gen', 'steel-calculator',
        // 'ai-chat', 'audit' a la lista de excepciones. Sin esto, handleSetViewMode('expert')
        // sobreescribe 'gen-easy' con 'main', haciendo que GenEasyView nunca cargue.
        const sec = optionalSectionOverride ?? activeSectionRef.current;
        const preservedSections = [
          'templates', 'header', 'signature',
          'gen-easy', 'arena-fc', 'massive-gen', 'steel-calculator', 'ai-chat', 'audit',
        ];
        if (!preservedSections.includes(sec)) {
          handleSetActiveSection('main');
        }
      }
      // assisted, reading, quick modes render via viewMode, not activeSection,
      // but we reset to a valid section so the expert consolidated view
      // shows correctly when switching back.
      else if (mode === 'assisted') { /* viewMode handles rendering */ }
      else if (mode === 'reading') { /* viewMode handles rendering */ }
      else if (mode === 'quick') { /* viewMode handles rendering */ }
    },
    [handleSetActiveSection, externalSetViewMode]
  );

  // FIX-RCT-140: Use refs for unstable data dependencies so callbacks remain stable.
  // This prevents the useEffect at the bottom from re-running on every data/calc change.
  const dataRef = useRef(data);
  const calcValuesRef = useRef(calculatedValues);
  const calcHeaderRef = useRef(calculatedHeader);
  const calcAnnexesRef = useRef(calculatedAnnexes);
  const activeSectionRef = useRef(activeSection);
  useEffect(() => { dataRef.current = data; });
  useEffect(() => { calcValuesRef.current = calculatedValues; });
  useEffect(() => { calcHeaderRef.current = calculatedHeader; });
  useEffect(() => { calcAnnexesRef.current = calculatedAnnexes; });
  useEffect(() => { activeSectionRef.current = activeSection; });

  const handleExportPDF = useCallback(
    async (options: ExportOptions) => {
      setIsPdfGenerating(true);
      const toastId = toast.loading('Generando PDF...');

      try {
        if (!calculationResult) {
          toast.error('No hay datos de cálculo disponibles para exportar.', { id: toastId });
          setIsPdfGenerating(false);
          return;
        }

        // Small delay so the overlay renders before heavy work blocks the main thread
        await new Promise(r => setTimeout(r, 100));

        const h = (calculationResult.metadata?.header || dataRef.current?.header || {}) as Record<string, unknown>;
        const evalCode = h.code || 'export';
        const evalName = h.name || 'ficha';
        const safeBaseName = `${evalCode}-${evalName}`.replace(/[\\/?%*:|"<>]/g, '-');

        const doc = await generateCostSheetPDF({
          data: dataRef.current,
          options,
          calculatedValues: calcValuesRef.current,
          calculatedHeader: calcHeaderRef.current,
          calculatedAnnexes: calcAnnexesRef.current,
          calculationResult: calculationResult
        });

        const filename = options.consolidated
          ? `ficha-consolidada-${safeBaseName}.pdf`
          : `ficha-costo-${safeBaseName}.pdf`;

        doc.save(filename);

        toast.success('PDF generado con éxito', { id: toastId });
        if (user) await usageService.trackUsage(user.id, 'fc_export', user.plan, user.role);
      } catch (error: unknown) {
        console.error('PDF export error:', error);
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Error al generar el PDF: ${message}`, { id: toastId });
      } finally {
        setIsPdfGenerating(false);
      }
    },
    [calculationResult, user]
  );

  const handleExportExcel = useCallback(() => {
    if (isBlocked) {
      toast.warning('Exportando con advertencias: La ficha contiene errores críticos.');
    }
    const currentData = dataRef.current;
    const fileName = currentData?.header?.name
      ? `Ficha de Costo - ${currentData.header.name}`
      : 'Ficha de Costo';
    exportToCSV(currentData as any, calcValuesRef.current, fileName, calcAnnexesRef.current);
  }, [isBlocked]);

  const handleImportJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          setSheet(json);
          toast.success('Ficha cargada correctamente');
        } catch (err) {
          toast.error('Error al cargar el archivo JSON');
        }
      }
    };
    input.click();
  }, [setSheet]);

  const handleExportJSON = useCallback(() => {
    const currentData = dataRef.current;
    const currentCalcHeader = calcHeaderRef.current;
    const exportData = {
      ...currentData,
      metadata: {
        exportedAt: new Date().toISOString(),
        calculationSnapshot: {
          header: currentCalcHeader,
          values: calcValuesRef.current
        }
      }
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `ficha-${currentCalcHeader?.code || currentData?.header?.code || 'export'}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success('JSON exportado correctamente');
  }, []);

  // FIX-RCT-140: This useEffect is now stable because all callbacks use refs
  // for unstable data deps, preventing re-runs on every data/calculation change.
  useEffect(() => {
    if (activeSection === 'main') { handleSetViewMode('expert', activeSection); }
    else if (activeSection === 'view-kpis') { handleSetViewMode('kpis'); }
    else if (activeSection === 'view-expert') { handleSetViewMode('expert', activeSection); }
    else if (activeSection === 'view-assisted') { handleSetViewMode('assisted'); }
    else if (activeSection === 'view-reading') { handleSetViewMode('reading'); }
    else if (activeSection === 'gen-quick') { handleSetViewMode('quick'); }
    else if (activeSection === 'gen-expert') { handleSetViewMode('quick'); setIsQuickModeGenerating(true); }
    // B4: 'gen-easy' reemplaza a gen-quick + gen-expert — abre GenEasyView
    // con 2 tabs internos (Rápida / Experta). El componente maneja su propio state.
    // B2-FIX: Pasamos activeSection explícitamente para evitar race condition con activeSectionRef.
    else if (activeSection === 'gen-easy') { handleSetViewMode('expert', activeSection); }
    else if (activeSection === 'tool-import') { handleImportJSON(); handleSetActiveSection('main'); }
    else if (activeSection === 'tool-save') { handleExportJSON(); handleSetActiveSection('main'); }
    else if (activeSection === 'tool-export-excel') { handleExportExcel(); handleSetActiveSection('main'); }
    else if (activeSection === 'tool-export-pdf') { setIsExportModalOpen(true); handleSetActiveSection('main'); }
    else if (activeSection === 'templates') { handleSetViewMode('expert', activeSection); }
    else if (activeSection === 'res-help') { setIsHelpPanelOpen(true); handleSetActiveSection('main'); }
    else if (activeSection === 'res-system-help') { setCurrentView('help'); handleSetActiveSection('main'); }
    else if (activeSection === 'res-academy') { setCurrentView('academy'); handleSetActiveSection('main'); }
    else if (activeSection === 'open-sections') { setIsSectionsSidebarOpen(true); handleSetActiveSection('main'); }
    else if (activeSection === 'open-annexes') { setIsAnnexesSidebarOpen(true); handleSetActiveSection('main'); }
  }, [activeSection, handleSetViewMode, handleSetActiveSection, handleImportJSON, handleExportJSON, handleExportExcel, setCurrentView, setIsQuickModeGenerating, setIsExportModalOpen, setIsHelpPanelOpen, setIsSectionsSidebarOpen, setIsAnnexesSidebarOpen]);

  const handleQuickGenerate = useCallback(async (rows: any[]) => {
    setQuickModeProducts(rows.map(r => ({
      name: r.product,
      sku: `QM-${r.id}`,
      unit_of_measure: r.um,
      price: r.cost,
      quantity: r.quantity,
      sale_price: r.sale_price
    })));
    setIsQuickModeGenerating(true);
  }, []);

  const onOpenAnnexes = useCallback(() => setIsAnnexesSidebarOpen(true), []);
  const onOpenSections = useCallback(() => setIsSectionsSidebarOpen(true), []);

  const allActions = useMemo(() => [], []);
  const mainActions = useMemo(() => [], []);
  const secondaryActions = useMemo(() => [], []);

  return {
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
    setQuickModeProducts,
    isQuickModeGenerating,
    setIsQuickModeGenerating,
    isPdfGenerating,
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
  };
};
