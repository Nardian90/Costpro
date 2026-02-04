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
import { Play, Pause, RotateCcw, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { exportToExcel } from '@/services/export-service';

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
  isOpen,
  onClose
}) => {
  const { data: currentSheet } = useCostSheetStore();
  const { user } = useAuthStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = React.useRef(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<MassiveResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // We fetch a large number of products for massive generation
  // In a real scenario, we might want to fetch all pages sequentially
  const { data: inventoryData, isLoading: isLoadingInventory } = useInventory(
    user?.activeStoreId,
    '',
    '',
    1000 // High limit for massive generation
  );

  const products = useMemo(() => {
    return inventoryData?.pages.flatMap(page => page.products) || [];
  }, [inventoryData]);

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
                    const val = vhSums[child.id] ?? child.valor_historico ?? 0;
                    return sum + val;
                }, 0);
            } else {
                vhSums[r.id] = r.valor_historico ?? 0;
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

        let formula = r.formula;
        if (!formula && r.children && r.children.length > 0 && r.calculation_method !== 'ValorFijo') {
            formula = '=sum(children)';
        }

        let formaCalculo: FormaCalculo = 'FIJO';
        if (r.calculation_method === 'Prorrateo') formaCalculo = 'PRORRATEO';
        if (r.is_percent) formaCalculo = 'COEFICIENTE';
        if (formula) formaCalculo = 'FORMULA';

        let baseCalculo: BaseRef | null = null;
        const baseRefId = r.base_ref;
        if (baseRefId) {
            const isAnnex = (baseSheet?.annexes || []).some((a: any) => a.id === baseRefId) || /^[IVXLC]+$/.test(baseRefId);
            if (isAnnex) {
                baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
                if (r.calculation_method !== 'Prorrateo' && !r.formula) {
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
          valorHistorico: vhSums[r.id] ?? r.valor_historico,
          baseCalculo,
          coeficiente: r.is_percent ? (r.valor_historico) : (r.coeficiente || 0),
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
        id: product.sku || 'export',
        name: `Ficha: ${product.name}`,
        currency: baseSheet?.header?.currency || 'CUP',
        decimals: 2,
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

    for (let i = 0; i < products.length; i++) {
      if (!isProcessingRef.current) {
        toast.info("Proceso cancelado por el usuario");
        break;
      }

      setCurrentIndex(i);
      const product = products[i];

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
          body: JSON.stringify(result)
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${product.sku || 'ficha'}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
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

      setProgress(((i + 1) / products.length) * 100);

      // Small delay to prevent blocking the UI thread and allow browser to breathe
      await new Promise(resolve => setTimeout(resolve, 500));
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isProcessing && !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden bg-sidebar/95 backdrop-blur-2xl border-sidebar-border shadow-2xl rounded-3xl">
        <DialogHeader className="p-6 border-b border-sidebar-border/50">
          <div className="flex items-center gap-4">
             <div className="p-3 rounded-2xl bg-primary/10">
                <FileSpreadsheet className="w-6 h-6 text-primary" />
             </div>
             <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">
                    Generación Masiva de Fichas
                </DialogTitle>
                <DialogDescription className="text-muted-foreground font-medium">
                    Crea fichas de costo para todos los productos del catálogo usando la configuración actual.
                </DialogDescription>
             </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
            {/* Stats / Progress */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <div className="text-[10px] font-black text-primary/70 tracking-[0.2em] uppercase mb-1">Total Productos</div>
                    <div className="text-2xl font-black text-foreground">{products.length}</div>
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
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                            <span>Cargando catálogo...</span>
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
                                        {result.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin mx-auto text-primary" />}
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

        <DialogFooter className="p-6 border-t border-sidebar-border/50 bg-sidebar/5 flex sm:justify-between items-center">
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
                        <Button
                            variant="outline"
                            onClick={onClose}
                            disabled={isProcessing}
                            className="rounded-2xl border-sidebar-border hover:bg-sidebar/50"
                        >
                            Cerrar
                        </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
