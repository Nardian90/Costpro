'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useInventory } from '@/hooks/api/useInventory';
import { useAuthStore } from '@/store';
import { Play, Pause, RotateCcw, FileSpreadsheet } from 'lucide-react';
import { ExportOptions } from './CostSheetExportModal';
import { exportToExcel } from '@/services/export-service';
import { importMassiveProducts } from '@/services/excel-service';
import { MassiveResult, MappingConfig, ProductItem, CostSheetMassiveGeneratorProps } from './MassiveGenerator.types';
import { runMassiveGeneration } from './MassiveGenerator.utils';
import { MassiveGeneratorForm } from './MassiveGeneratorForm';
import { MassiveGeneratorPreview } from './MassiveGeneratorPreview';
import { MassiveGeneratorProgress } from './MassiveGeneratorProgress';
export const CostSheetMassiveGenerator: React.FC<CostSheetMassiveGeneratorProps> = ({
  isOpen = false, onClose = () => {}, isSection = false,
  initialProducts, initialMapping, autoStart = false, isQuickAction = false,
}) => {
  const { data: currentSheet } = useCostSheetStore();
  const { user } = useAuthStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<MassiveResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [mappingConfig, setMappingConfig] = useState<MappingConfig>({
    targetColumn: initialMapping?.targetColumn ?? 'none',
    modificationRow: initialMapping?.modificationRow ?? '13.1',
  });
  const [showMapping, setShowMapping] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importedProducts, setImportedProducts] = useState<ProductItem[]>([]);

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeFC: true, includeAudit: false,
    includeAnnexes: (currentSheet?.annexes as { id: string }[] | undefined)?.map((a) => a.id) || [],
    consolidated: true, skipZeros: true, includeFinancialSummary: true,
    includeUtilityNote: true, showDateTime: true, alwaysZip: false, pdfFormat: 'standard',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: inventoryData, isLoading: isLoadingInventory } = useInventory(user?.activeStoreId, '', '', 1000);
  const products = useMemo(() => {
    if (importedProducts.length > 0) return importedProducts;
    return (inventoryData?.pages.flatMap((p) => p.products) || []) as ProductItem[];
  }, [inventoryData, importedProducts]);

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = (await importMassiveProducts(file)) as ProductItem[];
      setImportedProducts(imported);
      const init: MassiveResult[] = imported.map((p, i) => ({
        sku: p.sku || `IMP-${i}`, name: p.name || '', um: p.um, quantity: p.quantity,
        cost: (p.cost as number) || (p.price as number) || 0,
        salePrice: (p.price as number) || 0, utility: 0, status: 'pending' as const,
      }));
      setResults(init);
      setSelectedIds(new Set(init.map((r) => r.sku)));
      setShowMapping(true);
    } catch (err) { console.error(err); }
    e.target.value = '';
  };

  const reset = () => { setResults([]); setProgress(0); setCurrentIndex(-1); setIsProcessing(false); };
  const clearImported = () => { setImportedProducts([]); reset(); };

  const startGeneration = () => {
    if (isQuickAction) setExportOptions((p) => ({
      ...p, pdfFormat: 'standard', includeAudit: false, includeFC: true, alwaysZip: false,
    }));
    runMassiveGeneration({
      isQuickAction, products, selectedIds, currentSheet: currentSheet as Record<string, unknown>,
      mappingConfig, exportOptions, setIsProcessing, isProcessingRef, setResults, setCurrentIndex, setProgress,
    });
  };

  const handleCancel = () => { isProcessingRef.current = false; setIsProcessing(false); };

  const handleExportResults = async () => {
    exportToExcel(results,
      ['sku', 'name', 'cost', 'salePrice', 'utility', 'status'] as (keyof MassiveResult)[],
      { sku: 'SKU', name: 'Producto', cost: 'Costo Total', salePrice: 'Precio Venta', utility: 'Utilidad', status: 'Estado' },
      `Resultados-Masivos-${new Date().toISOString().split('T')[0]}`);
  };

  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    if (initialProducts && initialProducts.length > 0) {
      initRef.current = true;
      const init: MassiveResult[] = initialProducts.map((p, i) => ({
        sku: p.sku || `IMP-${i}`, name: p.name || '', um: p.unit_of_measure || p.um,
        quantity: p.quantity, cost: (p.price as number) || 0,
        salePrice: (p.sale_price as number) || 0, utility: 0, status: 'pending' as const,
      }));
      // Defer state updates to avoid synchronous setState in effect
      React.startTransition(() => {
        setImportedProducts(initialProducts);
        setResults(init);
        setSelectedIds(new Set(init.map((r) => r.sku)));
        setShowMapping(true);
      });
      if (autoStart) setTimeout(() => startGeneration(), 500);
    }
  }, [initialProducts]);

  const isQuickProcessing = isQuickAction && isProcessing;
  const annexes = (currentSheet?.annexes || []) as { id: string; title?: string }[];
  const progressProps = { isProcessing, progress, currentIndex, selectedIdsSize: selectedIds.size, productsLength: products.length, results };
  const fileInput = <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.xls" aria-label="Seleccionar archivo Excel" className="hidden" />;

  const content = (
    <>
      {isQuickProcessing ? (
        <MassiveGeneratorProgress mode="overlay" {...progressProps} />
      ) : (
        <div className={cn(
          'flex flex-col overflow-hidden',
          isSection ? 'w-full bg-card rounded-3xl border border-border shadow-sm'
            : 'max-w-4xl max-h-[90vh] bg-sidebar/95 backdrop-blur-2xl border-sidebar-border shadow-2xl rounded-3xl',
        )}>
          {/* Header */}
          <div className="p-6 border-b border-sidebar-border/50">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-primary/10"><FileSpreadsheet className="w-6 h-6 text-primary" /></div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Generación Masiva de Fichas</h3>
                <p className="text-muted-foreground font-medium text-sm">Crea fichas de costo para todos los productos del catálogo usando la configuración actual.</p>
              </div>
            </div>
          </div>

          {/* Body: sub-components */}
          <div className={cn('flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar', isSection ? 'min-h-[600px]' : '')}>
            <MassiveGeneratorForm
              importedProducts={importedProducts} isProcessing={isProcessing} products={products}
              onImportClick={handleImportClick} onSwitchToSystem={clearImported} onRemoveImport={clearImported}
              onStartGeneration={startGeneration} exportOptions={exportOptions} onExportOptionsChange={setExportOptions}
              annexes={annexes} mappingConfig={mappingConfig} onMappingConfigChange={setMappingConfig}
              showMapping={showMapping} onCloseMapping={() => setShowMapping(false)}
              results={results} initialProducts={initialProducts}
            />
            <MassiveGeneratorProgress mode="inline" {...progressProps} />
            <MassiveGeneratorPreview
              results={results} isProcessing={isProcessing} currentIndex={currentIndex}
              isLoadingInventory={isLoadingInventory} selectedIds={selectedIds}
              onToggleSelectAll={() => setSelectedIds(
                selectedIds.size === results.length && results.length > 0
                  ? new Set() : new Set(results.map((r) => r.sku)),
              )}
              onToggleSelect={(sku) => {
                const n = new Set(selectedIds);
                if (n.has(sku)) { n.delete(sku); } else { n.add(sku); }
                setSelectedIds(n);
              }}
              onUpdateResultField={(idx, field, value) =>
                setResults((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
              }
            />
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5 flex flex-col sm:flex-row gap-4 sm:justify-between items-center">
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} disabled={isProcessing || !results.length}
                className="rounded-2xl border-sidebar-border hover:bg-sidebar/50">
                <RotateCcw className="w-4 h-4 mr-2" />Reiniciar
              </Button>
              <Button variant="outline" onClick={handleExportResults} disabled={isProcessing || !results.length}
                className="rounded-2xl border-sidebar-border hover:bg-sidebar/50">
                <FileSpreadsheet className="w-4 h-4 mr-2" />Exportar Tabla
              </Button>
            </div>
            <div className="flex gap-2">
              {isProcessing ? (
                <Button variant="destructive" onClick={handleCancel}
                  className="rounded-2xl font-black uppercase tracking-widest px-8">
                  <Pause className="w-4 h-4 mr-2" />Detener
                </Button>
              ) : (
                <>
                  {onClose && (
                    <Button variant="outline" onClick={onClose} disabled={isProcessing}
                      className="rounded-2xl border-sidebar-border hover:bg-sidebar/50">
                      {isSection ? 'Volver' : 'Cerrar'}
                    </Button>
                  )}
                  <Button onClick={startGeneration} disabled={isProcessing || !products.length}
                    className="rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest px-8">
                    <Play className="w-4 h-4 mr-2" />Iniciar Generación
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isSection) return <div className="w-full">{fileInput}{content}</div>;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isProcessing && !open && onClose()}>
      {fileInput}
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none bg-transparent">
        {content}
      </DialogContent>
    </Dialog>
  );
};

export default CostSheetMassiveGenerator;
