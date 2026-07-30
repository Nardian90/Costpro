'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Check,
  X,
  AlertTriangle,
  Save,
  ClipboardList,
  LayoutGrid,
  List,
  Download,
  Upload,
  Plus,
  Trash2,
  RotateCcw,
  BarChart3,
} from 'lucide-react';
import ActionMenu from '@/components/ui/ActionMenu';
import SearchBar from '@/components/ui/SearchBar';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { cn } from '@/lib/utils';
import { SecurityScrollContainer } from '@/components/ui/SecurityScrollContainer';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import InventoryCountCardView from './InventoryCountCardView';
import InventoryCountTableView from './InventoryCountTableView';
import { useInventoryCount } from './useInventoryCount';

export default function InventoryCountView() {
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const [layoutMode, setLayoutMode] = useState<'table' | 'card'>('table');

  const {
    searchTerm,
    setSearchTerm,
    countedQuantities,
    loading,
    isModalOpen,
    setIsModalOpen,
    differences,
    processing,
    filteredProducts,
    isAdjustmentValid,
    handleQuantityChange,
    handleInitialSubmit,
    handleFinalSubmit,
    allProducts,
    samplePercentage,
    addToCount,
    removeFromCount,
    resetCountToAll,
    countedProductIds,
    handleExportExcel,
    handleImportExcel,
    fileInputRef,
  } = useInventoryCount();
  const modalRef = useFocusTrap(isModalOpen);

  // Products currently NOT in the count (available to add)
  const productsNotInCount = useMemo(() => {
    if (countedProductIds.size === 0) return []; // All products already in count
    return allProducts.filter(p => !countedProductIds.has(p.id));
  }, [allProducts, countedProductIds]);

  // Products not in the count that match the search term (for the "add" dropdown)
  const productsToAddDropdown = useMemo(() => {
    if (!searchTerm.trim() || countedProductIds.size === 0) return [];
    const term = searchTerm.toLowerCase();
    return productsNotInCount.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.category && p.category.toLowerCase().includes(term))
    ).slice(0, 6);
  }, [searchTerm, productsNotInCount, countedProductIds.size]);

  const handleAddProduct = (productId: string) => {
    addToCount(productId);
  };

  const [showAddDropdown, setShowAddDropdown] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      setLayoutMode(isMobile ? 'card' : 'table');
    });
  }, [isMobile]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-0 pb-20 sm:pb-0">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <ClipboardList className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-foreground tracking-tighter uppercase leading-tight text-[clamp(1.5rem,5vw,2rem)] font-black uppercase tracking-tighter text-primary"> Auditoría de Stock </h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
              {samplePercentage}% de la muestra ({countedProductIds.size === 0 ? allProducts.length : countedProductIds.size} de {allProducts.length} productos)
            </p>
          </div>
        </div>
        {!isMobile && (
          <ActionMenu
            actions={[
              {
                id: 'toggle-layout',
                label: layoutMode === 'table' ? 'Tarjetas' : 'Tabla',
                icon: layoutMode === 'table' ? LayoutGrid : List,
                onClick: () => setLayoutMode(prev => prev === 'table' ? 'card' : 'table'),
                variant: 'outline',
                className: 'hidden sm:flex'
              },
              { id: 'reset-count', label: 'Conteo Total', icon: RotateCcw, onClick: resetCountToAll, variant: 'outline', className: 'hidden sm:flex' },
              { id: 'export', label: 'Exportar Excel', icon: Download, onClick: handleExportExcel, variant: 'outline' },
              { id: 'submit', label: 'Finalizar', icon: Check, onClick: handleInitialSubmit, variant: 'primary', disabled: loading }
            ]}
            className="sm:w-auto"
          />
        )}
      </div>

      <QueryInspector />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar por producto, SKU o categoría..." />
            </div>
            {countedProductIds.size > 0 && productsNotInCount.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAddDropdown(prev => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-black text-xs uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap"
                aria-label="Agregar producto al conteo"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </button>
            )}
          </div>
          {/* Dropdown: add product to count */}
          {showAddDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 neu-card z-50 shadow-2xl">
              <div className="p-2 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Agregar al conteo ({productsNotInCount.length} disponibles)
                </span>
                <button type="button" onClick={() => setShowAddDropdown(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {productsToAddDropdown.length > 0 ? (
                  productsToAddDropdown.map((p) => (
                    <div
                      key={p.id}
                      role="option"
                      aria-selected={false}
                      tabIndex={0}
                      aria-label={`Agregar ${p.name} al conteo`}
                      onClick={() => handleAddProduct(p.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddProduct(p.id)}
                      className="p-3 hover:bg-primary/10 cursor-pointer flex justify-between items-center border-b border-white/5 last:border-0 transition-colors"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground font-mono uppercase">
                          {p.sku || 'SIN SKU'} &middot; Stock: {p.stock_current}
                        </span>
                      </div>
                      <Plus className="w-4 h-4 text-primary shrink-0 ml-2" aria-hidden="true" />
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      {searchTerm.trim()
                        ? `No hay productos fuera del conteo que coincidan con "${searchTerm}"`
                        : 'Todos los productos ya están en el conteo'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
            ref={fileInputRef}
            aria-label="Importar conteo desde Excel"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            aria-label="Importar conteo desde archivo Excel"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar Excel
          </button>
        </div>
      </div>

      {/* Sample indicator bar */}
      <div className="neu-card !p-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Muestra</span>
          <span className="text-sm font-black text-primary">{samplePercentage}%</span>
          <span className="text-xs text-muted-foreground">({countedProductIds.size === 0 ? allProducts.length : countedProductIds.size} / {allProducts.length} productos)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                samplePercentage >= 80 ? "bg-success" : samplePercentage >= 50 ? "bg-warning" : "bg-danger"
              )}
              style={{ width: `${Math.min(100, samplePercentage)}%` }}
            />
          </div>
          {countedProductIds.size > 0 && (
            <button
              type="button"
              onClick={resetCountToAll}
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
              title="Restablecer conteo a todos los productos"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="relative min-h-[400px]">
        <AnimatePresence mode="wait">
          {layoutMode === 'card' ? (
            <motion.div
              key="card-view"
              initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }}
              animate={prefersReducedMotion ? false : { opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <InventoryCountCardView
                products={filteredProducts}
                countedQuantities={countedQuantities}
                onQuantityChange={handleQuantityChange}
                loading={loading}
                onRemoveProduct={removeFromCount}
                samplePercentage={samplePercentage}
                showRemoveButton
              />
            </motion.div>
          ) : (
            <motion.div
              key="table-view"
              initial={prefersReducedMotion ? false : { opacity: 0, x: -20 }}
              animate={prefersReducedMotion ? false : { opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <InventoryCountTableView
                products={filteredProducts}
                countedQuantities={countedQuantities}
                onQuantityChange={handleQuantityChange}
                loading={loading}
                onRemoveProduct={removeFromCount}
                samplePercentage={samplePercentage}
                showRemoveButton
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isMobile && (
        <ActionMenu
          actions={[
            {
              id: 'toggle-layout',
              label: layoutMode === 'table' ? 'Tarjetas' : 'Tabla',
              icon: layoutMode === 'table' ? LayoutGrid : List,
              onClick: () => setLayoutMode(prev => prev === 'table' ? 'card' : 'table'),
              variant: 'outline',
            },
            { id: 'reset-count', label: 'Conteo Total', icon: RotateCcw, onClick: resetCountToAll, variant: 'outline' },
            { id: 'export', label: 'Exportar Excel', icon: Download, onClick: handleExportExcel, variant: 'outline' },
            { id: 'submit', label: 'Finalizar', icon: Check, onClick: handleInitialSubmit, variant: 'primary', disabled: loading }
          ]}
          position="bottom"
        />
      )}

      {/* Confirmation Modal */}
      {isModalOpen && (
        <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Resumen de auditoría de stock" className="fixed inset-0 bg-background/90 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="neu-card max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden !p-0 border-primary/20 shadow-2xl">
            <div className="p-6 sm:p-8 border-b border-white/5 bg-primary/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-warning" />
                <h3 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tighter whitespace-nowrap">
                  Resumen
                </h3>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-danger/10 text-muted-foreground hover:text-danger rounded-full transition-colors">
                <X className="w-6 h-6 sm:w-8 sm:h-8" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 sm:space-y-8 no-scrollbar">
              <p className="text-xs sm:text-xs font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
                Se han detectado las siguientes diferencias. Confirma las acciones de ajuste para proceder:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {differences.map((d) => (
                  <div key={d.productId} className="neu-raised-sm !p-6 border border-white/5 bg-background/50 relative overflow-hidden group">
                    <div className={cn("absolute top-0 left-0 w-1 h-full", d.diff > 0 ? "bg-success" : "bg-danger")} />

                    <SecurityScrollContainer minWidth="240px">
                      <div className="flex justify-between items-start mb-6 gap-4">
                        <div className="flex-1 overflow-hidden">
                          <h4 className="font-black text-sm uppercase tracking-tight truncate pr-4">{d.name}</h4>
                          <div className="text-xs font-bold text-muted-foreground uppercase mt-1 tracking-widest flex gap-4 whitespace-nowrap tabular-nums">
                            <span>Sistema: <strong className="text-foreground">{d.expected}</strong></span>
                            <span>Contado: <strong className="text-foreground">{d.counted}</strong></span>
                          </div>
                        </div>
                        <div className={cn("text-2xl font-black tracking-tighter whitespace-nowrap tabular-nums", d.diff > 0 ? "text-success" : "text-danger")}>
                          {d.diff > 0 ? `+${d.diff}` : d.diff}
                        </div>
                      </div>
                    </SecurityScrollContainer>

                    {d.diff < 0 && (
                      <div className="space-y-4 pt-4 border-t border-white/5">
                        <h5 className="text-xs font-black text-warning uppercase tracking-[0.3em]">Resolución de Faltante (Venta)</h5>
                        <div className="space-y-2">
                           {d.decomposition.map((item, vIdx) => (
                             <div key={item.variantId || `base-${vIdx}`} className="flex items-center justify-between p-3 neu-inset-sm bg-background border border-white/5">
                                <span className="text-xs font-black uppercase tracking-tight">{item.name}</span>
                                <span className="font-black text-primary text-sm">x{item.quantity}</span>
                             </div>
                           ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 sm:p-8 border-t border-white/5 bg-muted/10 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="neu-btn w-full sm:flex-1 !py-4 font-black uppercase text-xs sm:text-xs tracking-[0.2em]"
                disabled={processing}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="neu-btn-primary w-full sm:flex-1 flex items-center justify-center gap-3 font-black uppercase text-xs sm:text-xs tracking-[0.2em] shadow-xl shadow-primary/20"
                disabled={processing || !isAdjustmentValid}
              >
                {processing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Ejecutar Ajustes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
