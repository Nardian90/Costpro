'use client';

import React, { useState, useCallback, useMemo } from 'react';
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
  sku: string;
  name: string;
  cost: number;
  salePrice: number;
  utility: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

interface CostSheetMassiveGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CostSheetMassiveGenerator: React.FC<CostSheetMassiveGeneratorProps> = ({
  isOpen, // Still used for compatibility but we will make it a section
  onClose
}) => {
  const { data: currentSheet } = useCostSheetStore();
  const { user } = useAuthStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = React.useRef(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<MassiveResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [importedProducts, setImportedProducts] = useState<any[]>([]);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeFC: true,
    includeAudit: false,
    includeAnnexes: currentSheet?.annexes?.map(a => a.id) || [],
    consolidated: true,
    skipZeros: true,
    includeFinancialSummary: true
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // We fetch a large number of products for massive generation
  // In a real scenario, we might want to fetch all pages sequentially
  const { data: inventoryData, isLoading: isLoadingInventory } = useInventory(
    user?.activeStoreId,
    '',
    '',
    1000 // High limit for massive generation
  );

  const allAvailableProducts = useMemo(() => {
    if (importedProducts.length > 0) return importedProducts;
    return inventoryData?.pages.flatMap(page => page.products) || [];
  }, [inventoryData, importedProducts]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return allAvailableProducts;
    return allAvailableProducts.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [allAvailableProducts, searchTerm]);

  const selectedProducts = useMemo(() => {
    return allAvailableProducts.filter(p => selectedSkus.has(p.sku || p.id));
  }, [allAvailableProducts, selectedSkus]);

  const toggleSelectAll = () => {
    if (selectedSkus.size === filteredProducts.length) {
      setSelectedSkus(new Set());
    } else {
      setSelectedSkus(new Set(filteredProducts.map(p => p.sku || p.id)));
    }
  };

  const toggleSelect = (sku: string) => {
    const newSelected = new Set(selectedSkus);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedSkus(newSelected);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const imported = await importMassiveProducts(file);
        setImportedProducts(imported);
        reset();
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

    const flatten = (uiRows: any[]) => {
      (uiRows || []).forEach(r => {
        let type: RowSemanticType = 'COST';
        if (['13', '13.1'].includes(r.id)) type = 'MARGIN';
        if (r.id === '13.2') type = 'TAX';
        if (['14', '12', '5'].includes(r.id)) type = 'TOTAL';

        let formula = r.formula || r.totalFormula;
        if (!formula && r.children && r.children.length > 0 && r.calculationMethod !== 'ValorFijo') {
            formula = '=sum(children)';
        }

        let formaCalculo: FormaCalculo = 'FIJO';
        if (r.calculationMethod === 'Prorrateo') formaCalculo = 'PRORRATEO';
        if (r.is_percent) formaCalculo = 'COEFICIENTE';
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

        if (formula?.trim() === '=sum(children)' && r.children) {
            const childRefs = r.children.map((c: any) => `ref('${c.id}')`).join(', ');
            formula = `sum(${childRefs})`;
        }

        engineRows.push({
          id: r.id,
          classification: r.id,
          label: r.label,
          type,
          formaCalculo,
          valorHistorico: vhSums[r.id] ?? r.valorHistorico ?? r.value,
          baseCalculo,
          coeficiente: r.is_percent ? (r.value ?? r.valorHistorico) : r.coeficiente,
          formula: formula,
        });

        if (r.children) flatten(r.children);
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

            return {
                ...a,
                rows: [
                    ...existingRows,
                    {
                        classification: "1.1", // Standard for raw material
                        code: product.sku || product.id,
                        description: product.name,
                        um: product.unit_of_measure || "u",
                        consumption_norm: 1,
                        price: product.price || 0,
                        importe: product.price || 0,
                        total: product.price || 0
                    }
                ]
            };
        }
        const costPrice = product.cost_price ?? product.cost ?? 0;
        if (costPrice > 0 && (a.id === 'IV' || a.id === '4')) {
            const existingRows = (a.data || []).map((d: any) => ({
                ...d,
                classification: String(d.classification || d.label || '').split(' - ')[0].trim(),
                importe: d.total || d.amount || d.depreciation_cost || d.price_total || 0
            }));

            return {
                ...a,
                rows: [
                    ...existingRows,
                    {
                        classification: "3.1.3", // Contracted services/Other
                        code: "FIXED_COST",
                        description: `Costo Fijo Importado: ${product.name}`,
                        amount: costPrice,
                        importe: costPrice
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
    const toProcess = selectedSkus.size > 0 ? selectedProducts : allAvailableProducts;

    if (toProcess.length === 0) {
      toast.error("No hay productos seleccionados para procesar.");
      return;
    }

    setIsProcessing(true);
    isProcessingRef.current = true;
    const initialResults: MassiveResult[] = toProcess.map(p => ({
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

    for (let i = 0; i < toProcess.length; i++) {
      if (!isProcessingRef.current) {
        toast.info("Proceso cancelado por el usuario");
        break;
      }

      setCurrentIndex(i);
      const product = toProcess[i];

      try {
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'processing' } : r));

        // 1. Prepare
        const ficha = prepareFichaForProduct(currentSheet, product);

        // 2. Calculate
        const result = calculateFicha(ficha);

        // 3. Export PDF
        const response = await fetch('/api/cost-sheets/export-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...result,
            exportOptions
          })
        });

        if (response.ok) {
          const blob = await response.blob();
          const fichaCode = result.metadata?.header?.code || product.sku || product.id || 'ficha';
          const fileName = `${fichaCode}/${fichaCode}.pdf`;
          blobs.push({ name: fileName, blob });
        } else {
            throw new Error("Failed to generate PDF");
        }

        // 4. Update Result
        setResults(prev => prev.map((r, idx) => idx === i ? {
          ...r,
          status: 'completed',
          cost: result.summary.totalCost,
          salePrice: result.summary.grandTotal,
          utility: result.summary.totalMargin
        } : r));

      } catch (error: any) {
        console.error(`Error processing ${product.name}:`, error);
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: error.message } : r));
      }

      setProgress(((i + 1) / toProcess.length) * 100);

      // Small delay to prevent blocking the UI thread and allow browser to breathe
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Process Downloads
    if (blobs.length > 2) {
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
        // Individual downloads for 1 or 2 files
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

  const content = (
    <div className="flex flex-col h-full bg-sidebar/50 backdrop-blur-xl border border-sidebar-border/50 shadow-2xl rounded-3xl overflow-hidden animate-in fade-in duration-500">
        <div className="p-6 border-b border-sidebar-border/50 flex items-center justify-between bg-sidebar/30">
          <div className="flex items-center gap-4">
             <div className="p-3 rounded-2xl bg-primary/10">
                <FileSpreadsheet className="w-6 h-6 text-primary" />
             </div>
             <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-foreground">
                    Generación Masiva de Fichas
                </h2>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
                    Crea fichas de costo automatizadas para tu catálogo
                </p>
             </div>
          </div>
          {!isOpen && (
              <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl h-10 font-black uppercase tracking-widest text-[10px]" onClick={onClose}>
                      Cerrar Vista
                  </Button>
              </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
            {/* Source Selection */}
            <div className="space-y-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 mb-2 px-1">
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
                            className="rounded-xl font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-none transition-all"
                        >
                            Catálogo del Sistema
                        </TabsTrigger>
                        <TabsTrigger
                            value="imported"
                            className="rounded-xl font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-none transition-all"
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
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                                        Se procesarán los productos activos de la tienda actual.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleImportClick}
                                    className="mt-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/10"
                                >
                                    <Upload className="w-3 h-3 mr-2" />
                                    ¿Prefieres importar un Excel?
                                </Button>

                                <div className="mt-4 pt-4 border-t border-primary/10 w-full flex justify-center">
                                    <Button
                                        onClick={runMassiveGeneration}
                                        disabled={isProcessing || allAvailableProducts.length === 0}
                                        className="rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest px-12 h-12 shadow-lg shadow-primary/20 scale-110"
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        {selectedSkus.size > 0 ? `Procesar Seleccionados (${selectedSkus.size})` : "Procesar Todo el Catálogo"}
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
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                                            Se han cargado {importedProducts.length} productos desde el archivo.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleImportClick}
                                        className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest"
                                    >
                                        <RotateCcw className="w-3 h-3 mr-2" />
                                        Cambiar
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => { setImportedProducts([]); reset(); }}
                                        className="h-10 rounded-xl text-[10px] font-black uppercase tracking-widest text-danger hover:bg-danger/10"
                                    >
                                        <XIcon className="w-3 h-3 mr-2" />
                                        Quitar
                                    </Button>
                                </div>
                                <div className="ml-4 pl-4 border-l border-success/20">
                                    <Button
                                        onClick={runMassiveGeneration}
                                        disabled={isProcessing || allAvailableProducts.length === 0}
                                        className="rounded-2xl bg-success hover:bg-success/90 text-success-foreground font-black uppercase tracking-widest px-8 h-12 shadow-lg shadow-success/20"
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        {selectedSkus.size > 0 ? `Procesar Seleccionados (${selectedSkus.size})` : `Procesar Importados (${importedProducts.length})`}
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
                            className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary h-auto p-0"
                        >
                            <Download className="w-3 h-3 mr-2" />
                            Descargar Plantilla de Importación
                        </Button>
                    </div>
                )}
            </div>

            {/* Export Options */}
            <div className="p-4 rounded-2xl bg-sidebar/40 border border-sidebar-border/50 space-y-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 px-1">
                    Opciones de Exportación (PDF)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="m-includeFC"
                            checked={exportOptions.includeFC}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, includeFC: !!c }))}
                        />
                        <Label htmlFor="m-includeFC" className="text-[10px] font-bold uppercase cursor-pointer">Ficha (FC)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="m-includeAudit"
                            checked={exportOptions.includeAudit}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, includeAudit: !!c }))}
                        />
                        <Label htmlFor="m-includeAudit" className="text-[10px] font-bold uppercase cursor-pointer">Auditoría</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="m-skipZeros"
                            checked={exportOptions.skipZeros}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, skipZeros: c }))}
                        />
                        <Label htmlFor="m-skipZeros" className="text-[10px] font-bold uppercase cursor-pointer">Omitir Ceros</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="m-consolidated"
                            checked={exportOptions.consolidated}
                            onCheckedChange={(c) => setExportOptions(prev => ({ ...prev, consolidated: c }))}
                        />
                        <Label htmlFor="m-consolidated" className="text-[10px] font-bold uppercase cursor-pointer">Consolidar</Label>
                    </div>
                </div>

                {currentSheet?.annexes && currentSheet.annexes.length > 0 && (
                    <div className="pt-2 border-t border-sidebar-border/30">
                        <div className="text-[9px] font-bold uppercase text-muted-foreground mb-2">Anexos a incluir:</div>
                        <div className="flex flex-wrap gap-3">
                            {currentSheet.annexes.map(a => (
                                <div key={a.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`m-annex-${a.id}`}
                                        checked={exportOptions.includeAnnexes.includes(a.id)}
                                        onCheckedChange={(checked) => {
                                            setExportOptions(prev => ({
                                                ...prev,
                                                includeAnnexes: checked
                                                    ? [...prev.includeAnnexes, a.id]
                                                    : prev.includeAnnexes.filter(id => id !== a.id)
                                            }));
                                        }}
                                    />
                                    <Label htmlFor={`m-annex-${a.id}`} className="text-[10px] font-medium cursor-pointer">{a.id}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Catalog Selector / Filter */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 px-1">
                        Selección de Productos ({selectedSkus.size} seleccionados)
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input
                            type="text"
                            placeholder="Buscar en catálogo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-sidebar/50 border border-sidebar-border/50 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none w-full sm:w-64"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleSelectAll}
                            className="rounded-xl h-9 text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                        >
                            {selectedSkus.size === filteredProducts.length ? "Deseleccionar Todo" : "Seleccionar Todo"}
                        </Button>
                    </div>
                </div>

                <div className="rounded-2xl border border-sidebar-border/50 max-h-64 overflow-y-auto bg-background/30 no-scrollbar">
                    <Table>
                        <TableHeader className="sticky top-0 bg-sidebar/90 backdrop-blur-md z-10">
                            <TableRow className="border-sidebar-border/50 hover:bg-transparent">
                                <TableHead className="w-10"></TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest h-10">SKU</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest h-10">Nombre</TableHead>
                                <TableHead className="text-[10px] font-black uppercase tracking-widest h-10 text-right">Precio</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredProducts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground text-[10px] font-bold uppercase">
                                        No se encontraron productos
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredProducts.map((p) => (
                                    <TableRow
                                        key={p.sku || p.id}
                                        className={cn(
                                            "border-sidebar-border/50 cursor-pointer transition-colors",
                                            selectedSkus.has(p.sku || p.id) ? "bg-primary/10" : "hover:bg-sidebar/20"
                                        )}
                                        onClick={() => toggleSelect(p.sku || p.id)}
                                    >
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedSkus.has(p.sku || p.id)}
                                                onCheckedChange={() => toggleSelect(p.sku || p.id)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-[10px]">{p.sku || 'N/A'}</TableCell>
                                        <TableCell className="text-xs font-bold">{p.name}</TableCell>
                                        <TableCell className="text-right text-xs font-black text-primary">${(p.price || 0).toLocaleString()}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Stats / Progress */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <div className="text-[10px] font-black text-primary/70 tracking-[0.2em] uppercase mb-1">Total Disponibles</div>
                    <div className="text-2xl font-black text-foreground">{allAvailableProducts.length}</div>
                </div>
                <div className="p-4 rounded-2xl bg-success/5 border border-success/10">
                    <div className="text-[10px] font-black text-success/70 tracking-[0.2em] uppercase mb-1">Procesados</div>
                    <div className="text-2xl font-black text-foreground">
                        {results.filter(r => r.status === 'completed').length}
                    </div>
                </div>
                <div className="p-4 rounded-2xl bg-danger/5 border border-danger/10">
                    <div className="text-[10px] font-black text-danger/70 tracking-[0.2em] uppercase mb-1">Errores</div>
                    <div className="text-2xl font-black text-foreground">
                        {results.filter(r => r.status === 'error').length}
                    </div>
                </div>
            </div>

            {isProcessing && (
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
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
                            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10">SKU</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10">Producto</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10 text-right">Costo</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10 text-right">Venta</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10 text-right">Utilidad</TableHead>
                            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10 text-center">Estado</TableHead>
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
                                    idx === currentIndex ? "bg-primary/5" : "hover:bg-sidebar/20"
                                )}>
                                    <TableCell className="font-mono text-[10px] text-muted-foreground">{result.sku}</TableCell>
                                    <TableCell className="font-bold text-xs max-w-[200px] truncate">{result.name}</TableCell>
                                    <TableCell className="text-right font-bold text-xs">${result.cost.toLocaleString()}</TableCell>
                                    <TableCell className="text-right font-bold text-xs text-success">${result.salePrice.toLocaleString()}</TableCell>
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

        <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5 flex flex-col sm:flex-row sm:justify-between items-center gap-4">
            <div className="flex gap-2 w-full sm:w-auto">
                <Button
                    variant="outline"
                    onClick={reset}
                    disabled={isProcessing || results.length === 0}
                    className="flex-1 sm:flex-none rounded-2xl border-sidebar-border hover:bg-sidebar/50 font-bold uppercase tracking-widest text-[10px]"
                >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reiniciar
                </Button>
                <Button
                    variant="outline"
                    onClick={handleExportResults}
                    disabled={isProcessing || results.length === 0}
                    className="flex-1 sm:flex-none rounded-2xl border-sidebar-border hover:bg-sidebar/50 font-bold uppercase tracking-widest text-[10px]"
                >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Exportar Tabla
                </Button>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
                {isProcessing ? (
                    <Button
                        variant="destructive"
                        onClick={handleCancel}
                        className="w-full sm:w-auto rounded-2xl font-black uppercase tracking-widest px-8 h-12"
                    >
                        <Pause className="w-4 h-4 mr-2" />
                        Detener
                    </Button>
                ) : (
                    <Button
                        onClick={runMassiveGeneration}
                        disabled={isProcessing || allAvailableProducts.length === 0}
                        className="w-full sm:w-auto rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest px-12 h-12 shadow-lg shadow-primary/20"
                    >
                        <Play className="w-4 h-4 mr-2" />
                        Iniciar Generación ({selectedSkus.size > 0 ? selectedSkus.size : allAvailableProducts.length})
                    </Button>
                )}
            </div>
        </div>
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx,.xls"
            className="hidden"
        />
    </div>
  );

  if (isOpen) {
      return (
        <Dialog open={isOpen} onOpenChange={(open) => !isProcessing && !open && onClose()}>
            <DialogContent className="max-w-5xl max-h-[95vh] p-0 flex flex-col overflow-hidden bg-transparent border-none shadow-none">
                {content}
            </DialogContent>
        </Dialog>
      );
  }

  return content;
};
