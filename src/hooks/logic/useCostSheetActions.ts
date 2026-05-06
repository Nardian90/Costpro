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
}

export const useCostSheetActions = ({
  data,
  calculatedValues,
  calculatedHeader,
  calculatedAnnexes,
  calculationResult,
  isBlocked,
  activeSection
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

  // FIX-RCT-140: handleSetViewMode now only handles section navigation logic.
  // viewMode/isEditing state is managed by useCostSheetViewState, not here.
  // This prevents the cascade: data change → callback identity change → useEffect re-run.
  const handleSetViewMode = useCallback(
    (mode: CostSheetViewMode) => {
      if (mode === 'audit') { handleSetActiveSection('audit'); }
      else if (mode === 'kpis') { handleSetActiveSection('kpis'); }
      else if (mode === 'expert') { handleSetActiveSection('main'); }
    },
    [handleSetActiveSection]
  );

  // FIX-RCT-140: Use refs for unstable data dependencies so callbacks remain stable.
  // This prevents the useEffect at the bottom from re-running on every data/calc change.
  const dataRef = useRef(data);
  const calcValuesRef = useRef(calculatedValues);
  const calcHeaderRef = useRef(calculatedHeader);
  useEffect(() => { dataRef.current = data; });
  useEffect(() => { calcValuesRef.current = calculatedValues; });
  useEffect(() => { calcHeaderRef.current = calculatedHeader; });

  const handleExportPDF = useCallback(  
    async (options: ExportOptions) => {
      const toastId = toast.loading('Generando PDF...');

      const downloadPDF = async (opts: ExportOptions, filename: string) => {
        try {
          const response = await fetch('/api/cost-sheets/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataRef.current, options: opts, calculatedValues: calcValuesRef.current, calculatedHeader: calcHeaderRef.current, calculationResult: calculationResult })
          });
          if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            return true;
          }
          const errorMsg = await response.text();
          console.error('PDF export API error:', errorMsg);
          return false;
        } catch (fetchError: any) {
          console.error('PDF export fetch error:', fetchError);
          return false;
        }
      };

      try {
        if (!calculationResult) {
          toast.error('No hay datos de cálculo disponibles para exportar.', { id: toastId });
          return;
        }

        const h = calculationResult.metadata?.header || dataRef.current?.header || {};
        const evalCode = h.code || 'export';
        const evalName = h.name || 'ficha';
        const safeBaseName = `${evalCode}-${evalName}`.replace(/[\\/?%*:|"<>]/g, '-');

        if (options.consolidated) {
          const success = await downloadPDF(options, `ficha-consolidada-${safeBaseName}.pdf`);
          if (success) {
            toast.success('PDF consolidado generado con éxito', { id: toastId });
            if (user) await usageService.trackUsage(user.id, 'fc_export', user.plan, user.role);
          } else {
            throw new Error('El servidor no pudo generar el PDF.');
          }
        } else {
          toast.success('PDF generado con éxito', { id: toastId });
        }
      } catch (error: any) {
        toast.error(`Error al generar el PDF: ${error.message}`, { id: toastId });
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
    exportToCSV(currentData as any, calcValuesRef.current, fileName);
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
    if (activeSection === 'view-kpis') { handleSetViewMode('kpis'); }
    else if (activeSection === 'view-expert') { handleSetViewMode('expert'); }
    else if (activeSection === 'view-assisted') { handleSetViewMode('assisted'); }
    else if (activeSection === 'view-reading') { handleSetViewMode('reading'); }
    else if (activeSection === 'gen-quick') { handleSetViewMode('quick'); }
    else if (activeSection === 'gen-expert') { setIsQuickModeGenerating(true); }
    else if (activeSection === 'tool-import') { handleImportJSON(); handleSetActiveSection('main'); }
    else if (activeSection === 'tool-save') { handleExportJSON(); handleSetActiveSection('main'); }
    else if (activeSection === 'tool-export-excel') { handleExportExcel(); handleSetActiveSection('main'); }
    else if (activeSection === 'tool-export-pdf') { setIsExportModalOpen(true); handleSetActiveSection('main'); }
    else if (activeSection === 'res-help') { setIsHelpPanelOpen(true); handleSetActiveSection('main'); }
    else if (activeSection === 'res-system-help') { setCurrentView('help'); handleSetActiveSection('main'); }
    else if (activeSection === 'res-academy') { setCurrentView('academy'); handleSetActiveSection('main'); }
    else if (activeSection === 'open-sections') { setIsSectionsSidebarOpen(true); handleSetActiveSection('main'); }
    else if (activeSection === 'open-annexes') { setIsAnnexesSidebarOpen(true); handleSetActiveSection('main'); }
  }, [activeSection, handleSetViewMode, handleSetActiveSection, handleImportJSON, handleExportJSON, handleExportExcel, setCurrentView]);

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
