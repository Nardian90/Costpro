'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useInventory } from '@/hooks/api/useInventory';
import { useAuthStore } from '@/store';
import { calculateFicha } from '@/lib/cost-engine';
import { FichaJSON, CostRow, RowSemanticType, FormaCalculo, BaseRef } from '@/lib/cost-engine/types';
import { toast } from 'sonner';
import { Play, Pause, RotateCcw, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Upload, X as XIcon } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ExportOptions } from './CostSheetExportModal';
import JSZip from 'jszip';
import { exportToExcel } from '@/services/export-service';
import { exportMassiveTemplate, importMassiveProducts } from '@/services/excel-service';

interface MassiveResult {
  um?: string;
  quantity?: number;
  sku: string;
  name: string;
  cost: number;
  salePrice: number;
  utility: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

interface CostSheetMassiveGeneratorProps {
  isOpen?: boolean;
  onClose?: () => void;
  isSection?: boolean;
  initialProducts?: any[];
  initialMapping?: { targetColumn: 'sale_price' | 'total_cost', modificationRow: string };
  autoStart?: boolean;
  isQuickAction?: boolean;
}

export const CostSheetMassiveGenerator: React.FC<CostSheetMassiveGeneratorProps> = ({
  isOpen = false,
  onClose = () => {},
  isSection = false,
  initialProducts,
  initialMapping,
  autoStart = false,
  isQuickAction = false
}) => {
  const { data: currentSheet } = useCostSheetStore();
  const { user } = useAuthStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = React.useRef(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<MassiveResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [mappingConfig, setMappingConfig] = useState<{
      targetColumn: 'price' | 'cost' | 'none' | 'sale_price' | 'total_cost';
      modificationRow: string;
  }>({
      targetColumn: initialMapping ? (initialMapping.targetColumn as any) : 'none',
      modificationRow: initialMapping ? initialMapping.modificationRow : '13.1'
  });
  const [showMapping, setShowMapping] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [importedProducts, setImportedProducts] = useState<any[]>([]);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeFC: true,
    includeAudit: false,
    includeAnnexes: currentSheet?.annexes?.map(a => a.id) || [],
    consolidated: true,
    skipZeros: true,
    includeFinancialSummary: true,
    includeUtilityNote: true,
    showDateTime: true,
    alwaysZip: false,
    pdfFormat: "standard"
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setImportedProducts(initialProducts);

      const initialResults: MassiveResult[] = initialProducts.map((p, idx) => ({
        sku: p.sku || `IMP-${idx}`,
        name: p.name,
        um: p.unit_of_measure,
        quantity: p.quantity,
        cost: p.price || 0,
        salePrice: p.sale_price || 0,
        utility: 0,
        status: 'pending'
      }));
      setResults(initialResults);
      setSelectedIds(new Set(initialResults.map(r => r.sku)));
      if (autoStart) {
          // Delayed start to ensure everything is initialized
          setTimeout(() => {
            runMassiveGeneration();
          }, 500);
      }
      setShowMapping(true);
    }
  }, [initialProducts]);

  // We fetch a large number of products for massive generation
  // In a real scenario, we might want to fetch all pages sequentially
  const { data: inventoryData, isLoading: isLoadingInventory } = useInventory(
    user?.activeStoreId,
    '',
    '',
    1000 // High limit for massive generation
  );

  const products = useMemo(() => {
    if (importedProducts.length > 0) return importedProducts;
    return inventoryData?.pages.flatMap(page => page.products) || [];
  }, [inventoryData, importedProducts]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const imported = await importMassiveProducts(file);
        setImportedProducts(imported);

        const initialResults: MassiveResult[] = imported.map((p, idx) => ({
          sku: p.sku || `IMP-${idx}`,
          name: p.name,
          um: p.um,
          quantity: p.quantity,
          cost: p.cost || 0,
          salePrice: p.price || 0,
          utility: 0,
          status: 'pending'
        }));
        setResults(initialResults);
        setSelectedIds(new Set(initialResults.map(r => r.sku)));

        setShowMapping(true);
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = '';
  };

    const prepareFichaForProduct = useCallback((baseSheet: any, product: any): FichaJSON => {
    // 1. Map UI state to Engine-compatible JSON
    const engineRows: CostRow[] = [];

    // Helper for VH sums (from useCostSheetCalculator)
    const vhSums: Record<string, number> = {};
    const calculateVH = (rows: any[]) => {
        (rows || []).forEach(r => {
            if (r.children && r.children.length > 0) {
                calculateVH(r.children);
                vhSums[r.id] = r.children.reduce((sum: number, child: any) => {
                    const val = vhSums[child.id] ?? child.valorHistorico ?? child.value ?? 0;
                    return sum + val;
                }, 0);
            } else {
                vhSums[r.id] = r.valorHistorico ?? r.value ?? 0;
            }
        });
    };
    (baseSheet?.sections || []).forEach((s: any) => calculateVH(s?.rows));

    const flatten = (uiRows: any[], parentId?: string) => {
      (uiRows || []).forEach(r => {
        let type: RowSemanticType = 'COST';
        if (['13', '13.1'].includes(r.id)) type = 'MARGIN';
        if (r.id === '13.2') type = 'TAX';
        if (['14', '12', '5', '11'].includes(r.id)) type = 'TOTAL';

        let formula = r.formula || r.totalFormula;
        const hasChildren = r.children && r.children.length > 0;
        const isPercent = r.isPercent ?? r.is_percent;

        if (!formula && hasChildren && r.calculationMethod !== 'ValorFijo') {
            formula = '=sum(children)';
        }

        let formaCalculo: FormaCalculo = 'FIJO';
        if (r.calculationMethod === 'Prorrateo') formaCalculo = 'PRORRATEO';
        if (isPercent) formaCalculo = 'COEFICIENTE';
        if (formula) formaCalculo = 'FORMULA';

        let baseCalculo: BaseRef | null = null;
        const baseRefId = r.baseDeCalculoRef || r.base_ref;
        if (baseRefId) {
            const isAnnex = (baseSheet?.annexes || []).some((a: any) => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
            if (isAnnex) {
                baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
                if (r.calculationMethod !== 'Prorrateo' && !r.formula && !r.totalFormula) {
                    formaCalculo = 'IMPORTAR_ANEXO';
                }
            } else {
                baseCalculo = { type: 'FILA', classification: baseRefId };
            }
        }

        // Standardize formula for engine
        let finalFormula = formula;
        if (finalFormula?.trim() === '=sum(children)' && r.children) {
            const childRefs = r.children.map((c: any) => `ref('${c.id}')`).join(', ');
            finalFormula = `sum(${childRefs})`;
        }

        engineRows.push({
          id: r.id,
          parentId,
          classification: r.id,
          label: r.label,
          type,
          formaCalculo,
          valorHistorico: vhSums[r.id] ?? r.valorHistorico ?? r.value ?? 0,
          baseCalculo,
          coeficiente: isPercent ? (r.value ?? r.valorHistorico ?? 0) : (r.coeficiente ?? 0),
          formula: finalFormula,
        });

        if (hasChildren) flatten(r.children, r.id);
      });
    };
    (baseSheet?.sections || []).forEach((s: any) => flatten(s?.rows));

    // 2. Prepare Anexo I for this product
    const annexes = (baseSheet?.annexes || []).map((a: any) => {
        if (a.id === 'I' || a.id === '1') {
            const existingRows = (a.data || []).map((d: any) => ({
                ...d,
                classification: String(d.classification || d.label || '').split(' - ')[0].trim(),
                importe: d.total || d.amount || d.depreciation_cost || d.price_total || 0
            }));

            // Use product.cost as the base price for the main item in Annex I
            const basePrice = product.cost || product.price || 0;

            return {
                ...a,
                rows: [
                    ...existingRows,
                    {
                        classification: "1.1",
                        code: product.sku,
                        description: product.name,
                        um: product.um || product.unit_of_measure || "u",
                        consumption_norm: product.quantity || 1,
                        price: basePrice,
                        importe: basePrice * (product.quantity || 1),
                        total: basePrice * (product.quantity || 1)
                    }
                ]
            };
        }

        return {
            ...a,
            rows: (a.data || []).map((d: any) => ({
                classification: String(d.classification || d.label || '').split(' - ')[0].trim(),
                importe: d.total || d.amount || d.depreciation_cost || d.price_total || 0
            }))
        };
    });

    return {
      meta: {
        ...baseSheet?.header,
        id: product.sku || 'export',
        name: `Ficha: ${product.name}`,
        currency: baseSheet?.header?.currency || 'CUP',
        decimals: 2,
        quantity: 1, // Mass export is always for 1 unit
        settings: { allowFormulas: true }
      },
      anexos: annexes.map((a: any) => ({
          id: a.id,
          name: a.title,
          rows: a.rows
      })),
      rows: engineRows
    };
  }, []);

  const runMassiveGeneration = async () => {
    // Force standard options for quick action
    if (isQuickAction) {
        setExportOptions(prev => ({
            ...prev,
            pdfFormat: 'standard',
            includeAudit: false,
            includeFC: true,
            alwaysZip: false
        }));
    }

    if (products.length === 0) {
      toast.error("No hay productos cargados para procesar.");
      return;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;
    const initialResults: MassiveResult[] = products.map(p => ({
      sku: p.sku || 'N/A',
      name: p.name,
      cost: 0,
      salePrice: 0,
      utility: 0,
      status: 'pending'
    }));
    setResults(initialResults);

    const zip = new JSZip();
    const blobs: { name: string, blob: Blob }[] = [];

    const itemsToProcess = products.filter(p => selectedIds.has(p.sku));
    for (let i = 0; i < itemsToProcess.length; i++) {
      if (!isProcessingRef.current) {
        toast.info("Proceso cancelado por el usuario");
        break;
      }

      setCurrentIndex(i);
      const product = itemsToProcess[i];

      try {
        setResults(prev => prev.map(r => r.sku === product.sku ? { ...r, status: 'processing' } : r));

        // 1. Prepare
        const ficha = prepareFichaForProduct(currentSheet, product);

                // 2. Calculate
        let result = calculateFicha(ficha);

        // 3. Smart Adjustment if Target Price is set
        const targetPrice = product.salePrice || product.sale_price;
        if ((mappingConfig.targetColumn === 'price' || mappingConfig.targetColumn === 'sale_price') && targetPrice > 0) {
            const modRowId = mappingConfig.modificationRow || '13.1';

            // Initial price
            let currentPrice = result.summary.grandTotal;

            if (Math.abs(currentPrice - targetPrice) > 0.01) {
                // Find the row to modify
                const rowIndex = ficha.rows.findIndex(r => r.id === modRowId || r.classification === modRowId);
                if (rowIndex !== -1) {
                    // Try to find sensitivity
                    const originalVal = ficha.rows[rowIndex].valorHistorico;
                    ficha.rows[rowIndex].valorHistorico = (originalVal || 0) + 10; // Add 10 to see effect
                    const result2 = calculateFicha(ficha);
                    const price2 = result2.summary.grandTotal;

                    const sensitivity = (price2 - currentPrice) / 10;

                    if (Math.abs(sensitivity) > 0.0001) {
                        const adjustment = (targetPrice - currentPrice) / sensitivity;
                        ficha.rows[rowIndex].valorHistorico = (originalVal || 0) + adjustment;

                        // Final calculation
                        result = calculateFicha(ficha);
                    } else {
                        // If sensitivity is 0, maybe it's a coefficient?
                        const originalCoef = ficha.rows[rowIndex].coeficiente;
                        ficha.rows[rowIndex].coeficiente = (originalCoef || 0) + 0.1;
                        const result3 = calculateFicha(ficha);
                        const price3 = result3.summary.grandTotal;
                        const sensitivityCoef = (price3 - currentPrice) / 0.1;

                        if (Math.abs(sensitivityCoef) > 0.0001) {
                            const adjustment = (targetPrice - currentPrice) / sensitivityCoef;
                            ficha.rows[rowIndex].coeficiente = (originalCoef || 0) + adjustment;
                            result = calculateFicha(ficha);
                        }
                    }
                }
            }
        }

        // Sanity check: if grandTotal is NaN or 0, maybe there's an engine issue
        const isInvalid = isNaN(result.summary.grandTotal) || result.summary.grandTotal === 0;
        if (isInvalid && result.validationErrors && result.validationErrors.length > 0) {
            throw new Error(`Error de cálculo: ${result.validationErrors[0]}`);
        }

        // 3. Export PDF
        const response = await fetch('/api/cost-sheets/export-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization':  `Bearer ${useAuthStore.getState().token}` },
          body: JSON.stringify({
            ...result,
            sections: currentSheet?.sections,
            exportOptions: isQuickAction ? {
                ...exportOptions,
                pdfFormat: 'standard',
                includeAudit: false,
                includeFC: true,
                alwaysZip: false
            } : exportOptions
          })
        });

        if (response.ok) {
          const blob = await response.blob();
          const fileName = `${product.sku || product.name || 'ficha'}.pdf`;
          blobs.push({ name: fileName, blob });

          // If only 1 or 2 products, we can download immediately or wait
          // But user wants a zip if more than 2. Let's always collect and decide at the end.
        } else {
            throw new Error("Failed to generate PDF");
        }

        // 4. Update Result
        setResults(prev => prev.map(r => r.sku === product.sku ? {
          ...r,
          status: 'completed',
          cost: result.summary.totalCost,
          salePrice: result.summary.grandTotal,
          utility: result.summary.totalMargin
        } : r));

      } catch (error: any) {
        console.error(`Error processing ${product.name}:`, error);
        setResults(prev => prev.map(r => r.sku === product.sku ? { ...r, status: 'error', error: error.message } : r));
      }

      setProgress(((i + 1) / itemsToProcess.length) * 100);

      // Small delay to prevent blocking the UI thread and allow browser to breathe
      await new Promise(resolve => setTimeout(resolve, 500));
    }

        // Process Downloads
    const shouldZip = (isQuickAction ? true : exportOptions.alwaysZip) || blobs.length > 2;

    if (shouldZip && blobs.length > 0) {
        toast.info("Comprimiendo fichas en un archivo ZIP...");
        blobs.forEach(item => {
            zip.file(item.name, item.blob);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Fichas_Costo_Masivas_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Archivo ZIP descargado con éxito");
    } else {
        // Individual downloads
        blobs.forEach(item => {
            const url = window.URL.createObjectURL(item.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = item.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        });
    }

    setIsProcessing(false);
    isProcessingRef.current = false;
    toast.success("Generación masiva finalizada");
  };

  const handleCancel = () => {
      isProcessingRef.current = false;
      setIsProcessing(false);
  };

  const handleExportResults = () => {
    const columns = ['sku', 'name', 'cost', 'salePrice', 'utility', 'status'];
    const labels = {
        sku: 'SKU',
        name: 'Producto',
        cost: 'Costo Total',
        salePrice: 'Precio Venta',
        utility: 'Utilidad',
        status: 'Estado'
    };
    exportToExcel(results, columns, labels, `Resultados-Masivos-${new Date().toISOString().split('T')[0]}`);
  };

  const reset = () => {
      setResults([]);
      setProgress(0);
      setCurrentIndex(-1);
      setIsProcessing(false);
  };

  const isQuickProcessing = isQuickAction && isProcessing;

  const content = (
    <>
    {isQuickProcessing ? (
      <div className="flex flex-col items-center justify-center h-[500px] bg-card/50 backdrop-blur-xl rounded-[2.5rem] border-2 border-primary/20 animate-in zoom-in-95 duration-500 shadow-2xl">
        <CostProLoader size={160} text="PROCESANDO" subtext="Generando fichas masivas..." />
        <div className="w-64 mt-8 space-y-2">
            <Progress value={progress} className="h-2 bg-primary/10" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-center text-primary/60">Ficha {currentIndex + 1} de {selectedIds.size}</p>
        </div>
      </div>
    ) : (
      <div className={cn(
        "flex flex-col overflow-hidden",
        isSection ? "w-full bg-card rounded-3xl border border-border shadow-sm" : "max-w-4xl max-h-[90vh] bg-sidebar/95 backdrop-blur-2xl border-sidebar-border shadow-2xl rounded-3xl"
    )}>
      <div className="p-6 border-b border-sidebar-border/50">
          <div className="flex items-center gap-4">
             <div className="p-3 rounded-2xl bg-primary/10">
                <FileSpreadsheet className="w-6 h-6 text-primary" />
             </div>
             <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">
                    Generación Masiva de Fichas
                </h3>
                <p className="text-muted-foreground font-medium text-sm">
                    Crea fichas de costo para todos los productos del catálogo usando la configuración actual.
                </p>
             </div>
          </div>
      </div>

      <div className={cn("flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar", isSection ? "min-h-[600px]" : "")}>
            {/* Source Selection */}
            <div className="space-y-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 mb-2 px-1">
                    Selección de Catálogo (Origen de Datos)
                </div>

                <Tabs
                    defaultValue={importedProducts.length > 0 ? "imported" : "system"}
                    value={importedProducts.length > 0 ? "imported" : "system"}
                    onValueChange={(v) => {
                        if (v === "system") {
                            setImportedProducts([]);
                            reset();
                        }
                    }}
                    className="w-full"
                >
                    <TabsList className="grid grid-cols-2 h-14 bg-sidebar/40 p-1 rounded-2xl border border-sidebar-border/50">
                        <TabsTrigger
                            value="system"
                            className="rounded-xl font-black uppercase tracking-widest text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-none transition-all"
                        >
                            Catálogo del Sistema
                        </TabsTrigger>
                        <TabsTrigger
                            value="imported"
                            className="rounded-xl font-black uppercase tracking-widest text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-none transition-all"
                        >
                            Listado Importado (Excel)
                        </TabsTrigger>
                    </TabsList>

                    <div className="mt-4">
                        {importedProducts.length === 0 ? (
                            <div className="p-6 rounded-2xl border border-dashed border-primary/20 bg-primary/5 flex flex-col items-center justify-center text-center gap-3">
                                <div className="p-3 rounded-full bg-primary/10">
                                    <FileSpreadsheet className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Usando Catálogo del Sistema</p>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                                        Se procesarán los productos activos de la tienda actual.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleImportClick}
                                    className="mt-2 rounded-xl text-xs font-black uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/10"
                                >
                                    <Upload className="w-3 h-3 mr-2" />
                                    ¿Prefieres importar un Excel?
                                </Button>

                                <div className="mt-4 pt-4 border-t border-primary/10 w-full flex justify-center">
                                    <Button
                                        onClick={runMassiveGeneration}
                                        disabled={isProcessing || products.length === 0}
                                        className="rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest px-12 h-12 shadow-lg shadow-primary/20 scale-110"
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        Comenzar Procesamiento
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 rounded-2xl border border-success/20 bg-success/5 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-full bg-success/10">
                                        <CheckCircle2 className="w-6 h-6 text-success" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-success">Listado Importado Exitosamente</p>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                                            Se han cargado {importedProducts.length} productos {initialProducts && initialProducts.length > 0 ? 'desde el Modo Rápido' : 'desde el archivo'}.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleImportClick}
                                        className="h-10 rounded-xl text-xs font-black uppercase tracking-widest"
                                    >
                                        <RotateCcw className="w-3 h-3 mr-2" />
                                        Cambiar
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => { setImportedProducts([]); reset(); }}
                                        className="h-10 rounded-xl text-xs font-black uppercase tracking-widest text-danger hover:bg-danger/10"
                                    >
                                        <XIcon className="w-3 h-3 mr-2" />
                                        Quitar
                                    </Button>
                                </div>
                                <div className="ml-4 pl-4 border-l border-success/20">
                                    <Button
                                        onClick={runMassiveGeneration}
                                        disabled={isProcessing || products.length === 0}
                                        className="rounded-2xl bg-success hover:bg-success/90 text-success-foreground font-black uppercase tracking-widest px-8 h-12 shadow-lg shadow-success/20"
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        Procesar Importados
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </Tabs>

                {importedProducts.length === 0 && (
                    <div className="flex justify-end px-1">
                        <Button
                            variant="link"
                            size="sm"
                            onClick={exportMassiveTemplate}
                            className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary h-auto p-0"
                        >
                            <Download className="w-3 h-3 mr-2" />
                            Descargar Plantilla de Importación
                        </Button>
                    </div>
                )}
            </div>

            {/* Export Options */}
            <div className="p-4 rounded-2xl bg-sidebar/40 border border-sidebar-border/50 space-y-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 px-1">
                    Opciones de Exportación (PDF)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="m-includeFC"
                            checked={exportOptions.includeFC}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, includeFC: !!c }))}
                        />
                        <Label htmlFor="m-includeFC" className="text-xs font-bold uppercase cursor-pointer">Ficha (FC)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="m-includeAudit"
                            checked={exportOptions.includeAudit}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, includeAudit: !!c }))}
                        />
                        <Label htmlFor="m-includeAudit" className="text-xs font-bold uppercase cursor-pointer">Auditoría</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="m-skipZeros"
                            checked={exportOptions.skipZeros}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, skipZeros: c }))}
                        />
                        <Label htmlFor="m-skipZeros" className="text-xs font-bold uppercase cursor-pointer">Omitir Ceros</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="m-consolidated"
                            checked={exportOptions.consolidated}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, consolidated: c }))}
                        />
                        <Label htmlFor="m-consolidated" className="text-xs font-bold uppercase cursor-pointer">Consolidar</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="m-includeUtilityNote"
                            checked={exportOptions.includeUtilityNote}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, includeUtilityNote: c }))}
                        />
                        <Label htmlFor="m-includeUtilityNote" className="text-xs font-bold uppercase cursor-pointer">Nota Util.</Label>
                    </div>
                                        <div className="flex items-center gap-2">
                        <Switch
                            id="m-alwaysZip"
                            checked={exportOptions.alwaysZip}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, alwaysZip: c }))}
                        />
                        <Label htmlFor="m-alwaysZip" className="text-xs font-bold uppercase cursor-pointer">ZIP</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="m-showDateTime"
                            checked={exportOptions.showDateTime}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, showDateTime: c }))}
                        />
                        <Label htmlFor="m-showDateTime" className="text-xs font-bold uppercase cursor-pointer">Fecha/Hora</Label>
                    </div>
                </div>

                {currentSheet?.annexes && currentSheet.annexes.length > 0 && (
                    <div className="pt-2 border-t border-sidebar-border/30">
                        <div className="text-xs font-bold uppercase text-muted-foreground mb-2">Anexos a incluir:</div>
                        <div className="flex flex-wrap gap-3">
                            {currentSheet.annexes.map(a => (
                                <div key={a.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`m-annex-${a.id}`}
                                        checked={exportOptions.includeAnnexes?.includes(a.id)}
                                        onCheckedChange={(checked) => {
                                            setExportOptions(prev => ({
                                                ...prev,
                                                includeAnnexes: checked
                                                    ? [...(prev.includeAnnexes || []), a.id]
                                                    : prev.includeAnnexes?.filter(id => id !== a.id)
                                            }));
                                        }}
                                    />
                                    <Label htmlFor={`m-annex-${a.id}`} className="text-xs font-medium cursor-pointer">{a.id}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

                        {/* Mapping Configuration */}
            {showMapping && results.length > 0 && (
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-black uppercase tracking-wider text-primary">Configuración de Procesamiento</div>
                        <Button variant="ghost" size="sm" onClick={() => setShowMapping(false)}><XIcon className="w-4 h-4" /></Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase">Columna Objetivo</Label>
                            <select
                                className="w-full h-10 rounded-xl bg-background border border-input px-3 text-sm"
                                value={mappingConfig.targetColumn}
                                onChange={(e) => setMappingConfig(prev => ({ ...prev, targetColumn: e.target.value as any }))}
                            >
                                <option value="none">Ninguna (Usar fórmulas actuales)</option>
                                <option value="price">Precio de Venta</option>
                                <option value="cost">Precio de Costo</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase">Fila a Ajustar (ID)</Label>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 h-10 rounded-xl bg-background border border-input px-3 text-sm"
                                    placeholder="Ej: 13.1"
                                    value={mappingConfig.modificationRow}
                                    onChange={(e) => setMappingConfig(prev => ({ ...prev, modificationRow: e.target.value }))}
                                />
                                <div className="flex items-center text-[10px] text-muted-foreground uppercase font-black bg-sidebar/50 px-2 rounded-lg">
                                    Default: 13.1 (Utilidad)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats / Progress */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <div className="text-xs font-black text-primary/70 tracking-[0.2em] uppercase mb-1">Total Productos</div>
                    <div className="text-2xl font-black text-foreground">{products.length}</div>
                </div>
                <div className="p-4 rounded-2xl bg-success/5 border border-success/10">
                    <div className="text-xs font-black text-success/70 tracking-[0.2em] uppercase mb-1">Procesados</div>
                    <div className="text-2xl font-black text-foreground">
                        {results.filter(r => r.status === 'completed').length}
                    </div>
                </div>
                <div className="p-4 rounded-2xl bg-danger/5 border border-danger/10">
                    <div className="text-xs font-black text-danger/70 tracking-[0.2em] uppercase mb-1">Errores</div>
                    <div className="text-2xl font-black text-foreground">
                        {results.filter(r => r.status === 'error').length}
                    </div>
                </div>
            </div>

            {isProcessing && (
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-muted-foreground px-1">
                        <span>Progreso General</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-3 rounded-full bg-primary/10" />
                </div>
            )}

            {/* Results Table */}
            <div className="rounded-2xl border border-sidebar-border/50 overflow-hidden bg-background/50 backdrop-blur-md">
                <Table>
                                        <TableHeader className="bg-sidebar/30">
                        <TableRow className="border-sidebar-border/50 hover:bg-transparent">
                            <TableHead className="w-10">
                                <Checkbox
                                    checked={selectedIds.size === results.length && results.length > 0}
                                    onCheckedChange={(checked) => {
                                        if (checked) setSelectedIds(new Set(results.map(r => r.sku)));
                                        else setSelectedIds(new Set());
                                    }}
                                />
                            </TableHead>
                            <TableHead className="text-xs font-black uppercase tracking-widest h-10">SKU</TableHead>
                            <TableHead className="text-xs font-black uppercase tracking-widest h-10">Producto</TableHead>
                            <TableHead className="text-xs font-black uppercase tracking-widest h-10 text-right">Costo</TableHead>
                            <TableHead className="text-xs font-black uppercase tracking-widest h-10 text-right">Venta</TableHead>
                            <TableHead className="text-xs font-black uppercase tracking-widest h-10 text-right">Utilidad</TableHead>
                            <TableHead className="text-xs font-black uppercase tracking-widest h-10 text-center">Estado</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {results.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-bold uppercase tracking-widest text-xs">
                                    {isLoadingInventory ? (
                                        <div className="flex flex-col items-center py-4">
                                            <CostProLoader size={120} text="CARGANDO" subtext="Obteniendo catálogo..." />
                                        </div>
                                    ) : (
                                        "No se ha iniciado el proceso"
                                    )}
                                </TableCell>
                            </TableRow>
                        ) : (
                                                        results.map((result, idx) => (
                                <TableRow key={idx} className={cn(
                                    "border-sidebar-border/50 transition-colors",
                                    idx === currentIndex ? "bg-primary/5" : "hover:bg-sidebar/20",
                                    !selectedIds.has(result.sku) && "opacity-60"
                                )}>
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedIds.has(result.sku)}
                                            onCheckedChange={(checked) => {
                                                const newSelected = new Set(selectedIds);
                                                if (checked) newSelected.add(result.sku);
                                                else newSelected.delete(result.sku);
                                                setSelectedIds(newSelected);
                                            }}
                                            disabled={isProcessing}
                                        />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                        <input
                                            className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 w-full"
                                            value={result.sku}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setResults(prev => prev.map((r, i) => i === idx ? { ...r, sku: val } : r));
                                            }}
                                            disabled={isProcessing}
                                        />
                                    </TableCell>
                                    <TableCell className="font-bold text-xs">
                                         <input
                                            className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 w-full"
                                            value={result.name}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setResults(prev => prev.map((r, i) => i === idx ? { ...r, name: val } : r));
                                            }}
                                            disabled={isProcessing}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <input
                                            type="number"
                                            className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 w-20 text-right text-xs font-bold"
                                            value={result.cost}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setResults(prev => prev.map((r, i) => i === idx ? { ...r, cost: val } : r));
                                            }}
                                            disabled={isProcessing}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <input
                                            type="number"
                                            className="bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 w-20 text-right text-xs font-bold text-success"
                                            value={result.salePrice}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setResults(prev => prev.map((r, i) => i === idx ? { ...r, salePrice: val } : r));
                                            }}
                                            disabled={isProcessing}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-xs text-primary">${result.utility.toLocaleString()}</TableCell>
                                    <TableCell className="text-center">
                                        {result.status === 'processing' && <CostProLoader size={24} showText={false} showSubtext={false} className="mx-auto" />}
                                        {result.status === 'completed' && <CheckCircle2 className="w-4 h-4 mx-auto text-success" />}
                                        {result.status === 'error' && (
                                            <div title={result.error}>
                                                <AlertCircle className="w-4 h-4 mx-auto text-danger" />
                                            </div>
                                        )}
                                        {result.status === 'pending' && <div className="w-2 h-2 rounded-full bg-muted-foreground/30 mx-auto" />}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>

        <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5 flex flex-col sm:flex-row gap-4 sm:justify-between items-center">
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    onClick={reset}
                    disabled={isProcessing || results.length === 0}
                    className="rounded-2xl border-sidebar-border hover:bg-sidebar/50"
                >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reiniciar
                </Button>
                <Button
                    variant="outline"
                    onClick={handleExportResults}
                    disabled={isProcessing || results.length === 0}
                    className="rounded-2xl border-sidebar-border hover:bg-sidebar/50"
                >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Exportar Tabla
                </Button>
            </div>

            <div className="flex gap-2">
                {isProcessing ? (
                    <Button
                        variant="destructive"
                        onClick={handleCancel}
                        className="rounded-2xl font-black uppercase tracking-widest px-8"
                    >
                        <Pause className="w-4 h-4 mr-2" />
                        Detener
                    </Button>
                ) : (
                    <>
                        {onClose && (
                            <Button
                                variant="outline"
                                onClick={onClose}
                                disabled={isProcessing}
                                className="rounded-2xl border-sidebar-border hover:bg-sidebar/50"
                            >
                                {isSection ? "Volver" : "Cerrar"}
                            </Button>
                        )}
                        <Button
                            onClick={runMassiveGeneration}
                            disabled={isProcessing || products.length === 0}
                            className="rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest px-8"
                        >
                            <Play className="w-4 h-4 mr-2" />
                            Iniciar Generación
                        </Button>
                    </>
                )}
            </div>
        </div>
    </div>
    )}
    </>
  );

  if (isSection) {
      return (
        <div className="w-full">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls"
                className="hidden"
            />
            {content}
        </div>
      );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isProcessing && !open && onClose()}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls"
        className="hidden"
      />
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none bg-transparent">
        {content}
      </DialogContent>
    </Dialog>
  );
};
