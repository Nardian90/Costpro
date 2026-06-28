'use client';

import React, { useRef, useState } from 'react';
import { PrimaryButton, SearchInput, SecondaryButton } from '@/components/ui/atomic';
import { BaseModal } from '@/components/ui/BaseModal';
import {
  Package, X, Plus, Trash2, FileSpreadsheet, Upload, Download,
  AlertCircle, CheckCircle2, AlertTriangle, ChevronLeft, Loader2,
  Camera, Zap, ClipboardList, Clock,
} from 'lucide-react';
import { SupplierSelector } from './SupplierSelector';
import { ReceptionSuccessModal } from './ReceptionSuccessModal';
import { ReceptionExpressMode } from './ReceptionExpressMode';
import { ReceptionOfflineIndicator } from './ReceptionOfflineIndicator';
import { InvoiceOCRModal } from './InvoiceOCRModal';
import {
  ReceiveAgainstPOModal,
  type ReceiveAgainstPOPayload,
} from './ReceiveAgainstPOModal';
import { useReceptionState, UNIT_OF_MEASURE_OPTIONS } from './useReceptionState';
import type { Product } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface ProductReceptionViewProps {
  onCancel: () => void;
  preselectedProduct?: Product | null;
}

// ────────────────────────────────────────────────────────────
// Component (thin orchestrator)
// ────────────────────────────────────────────────────────────

export default function ProductReceptionView({ onCancel, preselectedProduct }: ProductReceptionViewProps) {
  const s = useReceptionState({ preselectedProduct, onCancel });
  // fileInputRef se mantiene en el orquestador (no en el hook) porque el
  // React Compiler marca como "ref access during render" cualquier propiedad
  // accedida desde un objeto que contenga un RefObject. El hook no lee
  // .current, solo el orquestador usa el ref como atributo del input oculto.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // EM-R5: Estado local del modal "Recibir contra OC".
  // Se maneja aquí en el orquestador (no en useReceptionState) para mantener
  // el hook libre de dependencias de UI y permitir reutilizar el handler
  // handleOCRImportItems para cargar items desde la OC.
  const [showReceivePO, setShowReceivePO] = useState(false);

  // EM-R1: Si modo Express está activo, renderiza el layout full-screen alternativo.
  if (s.expressMode) {
    return <ReceptionExpressMode onExit={() => s.setExpressMode(false)} />;
  }

  return (
    <div className="space-y-6">
      {/* REC-1 QW-R8: Live region para lectores de pantalla. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {s.items.length === 0
          ? 'Recepción vacía'
          : `${s.items.length} producto${s.items.length !== 1 ? 's' : ''} en la recepción. Total: ${formatCurrency(s.totalCost)}`}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Nueva Recepcion</h2>
        <div className="flex items-center gap-2">
          {/* EM-R7: Indicador offline/sync */}
          <ReceptionOfflineIndicator />
          {/* EM-R1: Toggle Modo Recepción Express */}
          <button
            type="button"
            onClick={() => s.setExpressMode(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border-2 border-primary/30 bg-primary/5 text-primary font-black text-xs uppercase tracking-widest hover:bg-primary/10 hover:border-primary/50 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Activar modo Recepción Express"
            title="Modo Express: layout optimizado para recepción rápida"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Express</span>
          </button>
          <button onClick={onCancel} className="p-2 min-w-[44px] min-h-[44px] hover:bg-muted rounded-lg flex items-center justify-center" type="button" aria-label="Cancelar">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Form: Supplier, Invoice, Notes (FIX-09) */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Informacion de la Recepcion</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="rec-supplier" className="text-xs font-black uppercase tracking-widest ml-1">Proveedor</label>
            <SupplierSelector value={s.supplier} onChange={(name) => s.setSupplier(name)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rec-invoice" className="text-xs font-black uppercase tracking-widest ml-1">N Factura</label>
            <input id="rec-invoice" type="text" value={s.invoiceNumber} onChange={e => s.setInvoiceNumber(e.target.value)} className="neu-input w-full font-bold" placeholder="FAC-001" aria-label="Numero de factura" />
          </div>
        </div>
        {/* REC-1 QW-R4: Date picker para fecha de recepción.
            Política forward-only: min = fecha MAX global, max = hoy. */}
        <div className="space-y-1.5">
          <label htmlFor="rec-date" className="text-xs font-black uppercase tracking-widest ml-1">
            Fecha de Recepción
            <span className="text-muted-foreground font-normal ml-2">(default: hoy)</span>
          </label>
          <input
            id="rec-date"
            type="date"
            value={s.receptionDate}
            onChange={e => s.setReceptionDate(e.target.value)}
            min={s.globalMinDate}
            max={s.todayStr}
            className="neu-input w-full sm:w-auto font-bold"
            aria-label="Fecha de recepción"
          />
          {s.globalMinDate && (
            <p className="text-[10px] text-muted-foreground ml-1">
              Fecha mínima permitida: <strong className="text-foreground">{s.globalMinDate}</strong>
              {' '}· Política de secuencia global (forward-only)
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rec-notes" className="text-xs font-black uppercase tracking-widest ml-1">Notas <span className="text-muted-foreground font-normal">(opcional)</span></label>
          <textarea id="rec-notes" value={s.notes} onChange={e => s.setNotes(e.target.value)} className="neu-input w-full min-h-[60px] text-sm" placeholder="Observaciones, condiciones, faltantes..." aria-label="Notas de la recepcion" />
        </div>
      </div>

      {/* Items Section */}
      {/* UX-02: Drop zone on main view */}
      <div
        className={cn(
          'rounded-2xl border bg-card p-6 space-y-4 transition-all duration-200',
          s.isDragOver
            ? 'border-primary border-2 bg-primary/5 scale-[1.005] shadow-lg shadow-primary/10'
            : 'border-border'
        )}
        onDragEnter={s.handleDragEnter}
        onDragOver={s.handleDragOver}
        onDragLeave={s.handleDragLeave}
        onDrop={s.handleDrop}
      >
        {/* UX-03: Grouped action buttons in one row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
            Productos ({s.items.length})
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <PrimaryButton label="Agregar Producto" onClick={s.handleOpenForm} icon={Plus} />
            <div className="w-px h-6 bg-border mx-1" />
            {/* EM-R4: OCR de factura */}
            <button
              type="button"
              onClick={() => s.setShowOCR(true)}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-black text-xs uppercase tracking-widest transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="Escanear factura con cámara y extraer items automáticamente"
            >
              <Camera className="w-3.5 h-3.5" /> Escanear Factura
            </button>
            {/* EM-R5: Recibir contra OC — selecciona una OC pendiente y carga sus items */}
            <button
              type="button"
              onClick={() => setShowReceivePO(true)}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-black text-xs uppercase tracking-widest transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="Cargar items desde una Orden de Compra pendiente"
            >
              <ClipboardList className="w-3.5 h-3.5" /> Recibir contra OC
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" aria-label="Importar Excel" />
            <button type="button" onClick={s.handleOpenImport} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-black text-xs uppercase tracking-widest transition-all active:scale-95">
              <Upload className="w-3.5 h-3.5" /> Importar Excel
            </button>
            <button type="button" onClick={s.handleExportExcel} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-widest transition-all active:scale-95">
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </button>
          </div>
        </div>

        {s.items.length === 0 ? (
          <div className={cn(
            'py-8 text-center text-sm transition-all duration-200 rounded-2xl border-2 border-dashed',
            s.isDragOver
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-transparent text-muted-foreground'
          )}>
            <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-all duration-200',
              s.isDragOver ? 'bg-primary/20 scale-110' : 'bg-muted/50'
            )}>
              {s.isDragOver ? <Upload className="w-8 h-8 text-primary animate-bounce" /> : <FileSpreadsheet className="w-8 h-8 opacity-30" />}
            </div>
            <p className={cn('mb-1', s.isDragOver && 'font-bold text-primary')}>{
              s.isDragOver
                ? 'Suelta el archivo Excel aqui'
                : 'No hay productos agregados.'
            }</p>
            <p className="text-xs">
              {s.isDragOver
                ? 'Se abrira el asistente de importacion'
                : <>Haz clic en &quot;Agregar Producto&quot; o arrastra un Excel aqui</>
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {s.items.map((item, index) => {
              const itemKey = item.sku ? `${item.sku}-${index}` : `new-${index}`;
              return (
                <div key={itemKey} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{index + 1}</span>
                      <p className="font-bold text-sm truncate">{item.name}</p>
                      {item.is_new && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/20">Nuevo</span>
                      )}
                      {item.update_price && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">Precio: {formatCurrency(item.sale_price || 0)}</span>
                      )}
                    </div>
                    {s.editingIndex === index ? (
                      <div className="flex items-center gap-2 ml-6 mt-1">
                        <div className="flex items-center gap-1">
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Cant:</label>
                          <input type="number" inputMode="decimal" min="0.0001" step="0.01" value={s.editQuantity} onChange={e => s.setEditQuantity(Math.max(0.0001, parseFloat(e.target.value) || 1))} className="w-16 px-2 py-1 text-xs font-bold rounded-lg border border-border bg-background" autoFocus />
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="text-[10px] font-bold uppercase text-muted-foreground">Costo:</label>
                          <input type="number" inputMode="decimal" min="0" step="0.01" value={s.editCost || ''} onChange={e => s.setEditCost(parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 text-xs font-bold rounded-lg border border-border bg-background" />
                        </div>
                        <button onClick={s.handleSaveEdit} className="px-2 py-1 text-[10px] font-black uppercase rounded-lg bg-primary/10 text-primary hover:bg-primary/20" type="button">OK</button>
                        <button type="button" onClick={() => s.setEditingIndex(null)} className="px-2 py-1 text-[10px] font-bold uppercase rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">X</button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground ml-6">
                        SKU: {item.sku || '--'} · UM: {item.unit_of_measure} · Cant: {item.quantity} · Costo: {formatCurrency(item.unit_cost)}
                        {item.variant_name && <span className="ml-2 text-info font-bold"> · Var: {item.variant_name}</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-primary tabular-nums">{formatCurrency(item.quantity * item.unit_cost)}</span>
                    {s.editingIndex !== index && (
                      <button type="button" onClick={() => s.handleStartEdit(index)} className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label={`Editar ${item.name}`}>
                        <Package className="w-4 h-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => s.handleRequestRemove(item.local_id)} className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-destructive/10 rounded-lg text-destructive/70 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30" aria-label={`Eliminar ${item.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {s.items.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{s.items.length} producto(s)</span>
              {s.items.some(i => i.is_new) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/20">
                  {s.items.filter(i => i.is_new).length} nuevo(s)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Total:</span>
              <span className="font-black text-lg text-primary tabular-nums">{formatCurrency(s.totalCost)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation bar */}
      {s.pendingDelete !== null && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 p-3 pr-2 rounded-2xl bg-card border border-destructive/30 shadow-xl">
          <span className="text-xs font-bold text-muted-foreground">
            Eliminar &quot;{s.items.find(i => i.local_id === s.pendingDelete)?.name ?? 'item'}&quot;?
          </span>
          <button onClick={s.handleConfirmRemove} type="button" className="px-3 py-1.5 text-xs font-black uppercase rounded-lg bg-destructive text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30">Si, eliminar</button>
          <button onClick={s.handleCancelRemove} type="button" className="px-3 py-1.5 text-xs font-bold uppercase rounded-lg bg-muted text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">Cancelar</button>
        </div>
      )}

      {/* Warnings */}
      {s.items.some(i => i.is_new) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-info/5 border border-info/20 text-sm">
          <AlertCircle className="w-4 h-4 text-info mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-info">{s.items.filter(i => i.is_new).length} producto(s) se crearan automaticamente al registrar</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Los productos marcados como &quot;Nuevo&quot; no existen en el catalogo y se crearan con los datos de esta recepcion. Si no tienen precio de venta, no apareceran en el punto de venta hasta que se les asigne uno.
            </p>
          </div>
        </div>
      )}

      {/* Submit */}
      {/* Reception-Flow-Fix: 2 botones — "Guardar Pendiente" (no aplica stock)
          + "Registrar Recepción" (confirma y aplica stock). */}
      <div className="flex justify-end gap-2 flex-wrap">
        <button
          type="button"
          onClick={s.handleSavePending}
          disabled={s.isSubmitting || s.items.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border-2 border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed font-black text-xs uppercase tracking-widest"
          aria-label="Guardar recepción como pendiente"
          title="Guarda la recepción sin aplicar cambios al inventario. Puedes confirmarla después desde el historial."
        >
          <Clock className="w-4 h-4" />
          {s.isSubmitting ? 'Guardando...' : 'Guardar Pendiente'}
        </button>
        <PrimaryButton
          label={s.isSubmitting || s.registerReceptionIsPending ? 'Registrando...' : 'Registrar Recepción'}
          onClick={s.handleSubmit}
          icon={Package}
          disabled={s.registerReceptionIsPending || s.isSubmitting || s.items.length === 0}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════
          FIX-01: Import Wizard Dialog (3 steps)
          ═══════════════════════════════════════════════════════════ */}
      <Dialog open={s.isImportOpen} onOpenChange={(open) => { if (!open) s.resetImportWizard(); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Importar Recepcion desde Excel
            </DialogTitle>
            <DialogDescription>
              {s.importStep === 'upload' && 'Selecciona un archivo Excel con los productos a recibir.'}
              {s.importStep === 'preview' && 'Revisa la clasificacion de productos antes de agregarlos a la recepcion.'}
              {s.importStep === 'confirm' && 'Confirma los productos que se agregaran a la recepcion.'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2">
            {(['upload', 'preview', 'confirm'] as const).map((step, idx) => (
              <React.Fragment key={step}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-colors',
                  s.importStep === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>{idx + 1}</div>
                {idx < 2 && <div className={cn('w-12 h-0.5', s.importStep === step || (idx === 0 && s.importStep === 'preview') || (idx === 1 && s.importStep === 'confirm') ? 'bg-primary/50' : 'bg-border')} />}
              </React.Fragment>
            ))}
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-2">
              {s.importStep === 'upload' ? 'Subir archivo' : s.importStep === 'preview' ? 'Revision' : 'Confirmar'}
            </span>
          </div>

          <div className="space-y-4">
            {/* Step 1: Upload — UX-02: Drag-and-drop enhanced */}
            {s.importStep === 'upload' && (
              <label
                htmlFor="reception-import-file"
                className={cn(
                  'flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 group',
                  s.isDragOver
                    ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-primary/5'
                )}
              >
                {s.isImporting
                  ? <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  : s.isDragOver
                    ? <FileSpreadsheet className="w-10 h-10 text-primary animate-bounce" />
                    : <Upload className="w-8 h-8 text-primary group-hover:scale-110 transition-transform" />
                }
                <div className="text-center">
                  <p className={cn('font-black text-sm uppercase tracking-widest', s.isDragOver && 'text-primary')}>Seleccionar archivo Excel</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx o .xls — Arrastra o haz clic</p>
                </div>
                <input id="reception-import-file" type="file" accept=".xlsx,.xls" onChange={s.handleImportFileSelect} className="hidden" disabled={s.isImporting} />
              </label>
            )}

            {/* Step 2: Preview / Classification */}
            {s.importStep === 'preview' && (
              <>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { count: s.importCounts.new, label: 'Nuevos', color: 'text-info bg-info/10 border-info/20' },
                    { count: s.importCounts.existing, label: 'Existentes', color: 'text-success bg-success/10 border-success/20' },
                    { count: s.importCounts.price_changed, label: 'Con cambios', color: 'text-warning bg-warning/10 border-warning/20' },
                    { count: s.importCounts.error, label: 'Errores', color: 'text-destructive bg-destructive/10 border-destructive/20' },
                  ].map(item => (
                    <div key={item.label} className={cn('p-3 rounded-xl border text-center', item.color)}>
                      <div className="text-2xl font-black">{item.count}</div>
                      <div className="text-[9px] font-black uppercase tracking-widest mt-1">{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* Errors list */}
                {s.classifiedRows.filter(r => r.status === 'error').length > 0 && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      <span className="text-xs font-black uppercase tracking-widest text-destructive">Errores ({s.classifiedRows.filter(r => r.status === 'error').length})</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto p-3 space-y-1">
                      {s.classifiedRows.filter(r => r.status === 'error').map((r, idx) => (
                        <div key={idx} className="text-xs"><span className="font-mono text-muted-foreground">SKU {r.sku || '--'}:</span> <span className="text-destructive">{r.errors.join(', ')}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price changes warning */}
                {s.classifiedRows.filter(r => r.status === 'price_changed').length > 0 && (
                  <div className="rounded-xl border border-warning/20 bg-warning/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      <span className="text-xs font-black uppercase tracking-widest text-warning">Cambio de precio ({s.classifiedRows.filter(r => r.status === 'price_changed').length})</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto p-3 space-y-1">
                      {s.classifiedRows.filter(r => r.status === 'price_changed').map((r, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="font-bold truncate max-w-[120px]">{r.name}</span>
                          <span className="text-muted-foreground">Precio actual:</span>
                          <span className="font-mono">{formatCurrency(r.existingProduct?.price || 0)}</span>
                          <span className="text-warning">→</span>
                          <span className="font-mono font-bold text-warning">{formatCurrency(r.salePrice || 0)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2 border-t border-warning/10">
                      <p className="text-[10px] text-muted-foreground">Al agregar, el precio de venta se actualizara para estos productos.</p>
                    </div>
                  </div>
                )}

                {/* New products info */}
                {s.importCounts.new > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-info/5 border border-info/20">
                    <CheckCircle2 className="w-4 h-4 text-info mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-bold text-info">{s.importCounts.new} producto(s)</span> se crearan automaticamente en el catalogo al registrar la recepcion. Unidad de medida por defecto: &quot;unidad&quot;.
                    </p>
                  </div>
                )}

                {/* Preview table */}
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr className="text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
                          <th className="p-2 text-left">Estado</th>
                          <th className="p-2 text-left">SKU</th>
                          <th className="p-2 text-left">Nombre</th>
                          <th className="p-2 text-right">Cant</th>
                          <th className="p-2 text-right">Costo</th>
                          <th className="p-2 text-left">UM</th>
                          <th className="p-2 text-right">P. Venta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.classifiedRows.slice(0, 100).map((r, idx) => (
                          <tr key={idx} className={cn('border-b border-border/50', r.status === 'error' && 'bg-destructive/5')}>
                            <td className="p-2">
                              <span className={cn(
                                'text-[9px] font-black uppercase px-1.5 py-0.5 rounded',
                                r.status === 'new' ? 'bg-info/10 text-info' :
                                r.status === 'existing' ? 'bg-success/10 text-success' :
                                r.status === 'price_changed' ? 'bg-warning/10 text-warning' :
                                'bg-destructive/10 text-destructive'
                              )}>
                                {r.status === 'new' ? 'Nuevo' : r.status === 'existing' ? 'OK' : r.status === 'price_changed' ? 'Cambio' : 'Error'}
                              </span>
                            </td>
                            <td className="p-2 font-mono">{r.sku || '--'}</td>
                            <td className="p-2 font-bold max-w-[120px] truncate">{r.name}</td>
                            <td className="p-2 text-right tabular-nums">{r.quantity}</td>
                            <td className="p-2 text-right tabular-nums">{formatCurrency(r.unitCost)}</td>
                            <td className="p-2 text-muted-foreground">{r.unitOfMeasure}</td>
                            <td className="p-2 text-right tabular-nums">{r.salePrice ? formatCurrency(r.salePrice) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {s.classifiedRows.length > 100 && (
                    <div className="p-2 text-center text-[10px] text-muted-foreground bg-muted/30">... y {s.classifiedRows.length - 100} filas mas</div>
                  )}
                </div>
              </>
            )}

            {/* Step 3: Confirm */}
            {s.importStep === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <p className="font-black text-sm">Resumen de la importacion</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /><span>{s.importCounts.existing} existente(s) — se recibiran normalmente</span></div>
                    <div className="flex items-center gap-2"><Package className="w-4 h-4 text-info" /><span>{s.importCounts.new} nuevo(s) — se crearan en el catalogo</span></div>
                    <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning" /><span>{s.importCounts.price_changed} con cambio de precio — se actualizara</span></div>
                    <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-destructive" /><span>{s.importCounts.error} error(es) — se omitiran</span></div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Al confirmar, <span className="font-bold">{s.classifiedRows.filter(r => r.status !== 'error').length}</span> producto(s) se agregaran a la recepcion.
                  {s.importCounts.new > 0 && <> Los productos nuevos se crearan en el catalogo con UM = &quot;unidad&quot;.</>}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {s.importStep !== 'upload' && (
              <SecondaryButton onClick={s.handleImportBack} label="Volver" icon={ChevronLeft} className="gap-1.5" />
            )}
            <SecondaryButton onClick={s.resetImportWizard} label="Cancelar" />
            {s.importStep === 'preview' && (
              <PrimaryButton onClick={() => s.setImportStep('confirm')} label="Continuar" disabled={s.classifiedRows.filter(r => r.status !== 'error').length === 0} />
            )}
            {s.importStep === 'confirm' && (
              <PrimaryButton onClick={s.handleImportToReception} label={`Agregar ${s.classifiedRows.filter(r => r.status !== 'error').length} producto(s)`} />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════
          Add Product Modal (with manual add option)
          ═══════════════════════════════════════════════════════════ */}
      <BaseModal
        open={s.isFormOpen}
        onOpenChange={(open) => { if (!open) s.handleCloseForm(); }}
        title="Agregar Producto"
        maxWidth="sm:max-w-md"
        footer={
          <>
            <SecondaryButton onClick={s.handleCloseForm} label="Cancelar" className="flex-1" />
            {s.selectedProductId ? (
              <PrimaryButton onClick={s.handleAddItem} label="Agregar" className="flex-1" />
            ) : (
              <PrimaryButton onClick={s.handleAddManualProduct} label="Agregar como nuevo" className="flex-1" icon={Plus} />
            )}
          </>
        }
      >
        <div className="space-y-4">
          {/* Search existing products
              REC-2 MM-R2: Enter en search → scanner mode (match SKU/barcode → agregar directo) */}
          <div className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-widest ml-1">
              Buscar Producto
              <span className="text-muted-foreground font-normal ml-2 normal-case tracking-normal">
                (Enter = agregar por SKU/barcode)
              </span>
            </span>
            <form onSubmit={(e) => { e.preventDefault(); s.handleSearchSubmit(); }}>
              <SearchInput id="rec-add-item-search" value={s.addItemSearch} onChange={s.setAddItemSearch} placeholder="Buscar por nombre, SKU o escanear..." aria-label="Buscar producto" />
            </form>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-xl border divide-y divide-border">
            {s.filteredFormProducts.length === 0 && !s.addItemSearch ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No se encontraron productos</div>
            ) : s.filteredFormProducts.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Sin resultados</div>
            ) : (
              s.filteredFormProducts.slice(0, 50).map(product => (
                <button type="button" key={product.id as any} onClick={() => s.setSelectedProductId(product.id as any)} className={cn(
                  'w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-muted/50',
                  s.selectedProductId === product.id && 'bg-primary/10 ring-1 ring-primary/30'
                )}>
                  <span className="font-bold">{product.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">{product.sku}</span>
                  {(product.cost_price ?? 0) > 0 && <span className="ml-2 text-xs text-primary font-mono">{formatCurrency(product.cost_price ?? 0)}</span>}
                </button>
              ))
            )}
          </div>

          {/* FIX-07: Load more */}
          {s.hasMoreProducts && (
            <button type="button" onClick={() => s.setSearchLimit(prev => prev + 20)} className="text-xs text-primary hover:underline mx-auto block">
              Cargar mas productos...
            </button>
          )}

          {s.selectedProductId && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="item-qty" className="text-xs font-black uppercase tracking-widest ml-1">Cantidad</label>
                  <input id="item-qty" type="number" inputMode="decimal" min="0.0001" step="0.01" value={s.newQuantity} onChange={e => s.setNewQuantity(Math.max(0.0001, parseFloat(e.target.value) || 1))} className="neu-input w-full font-bold" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="item-cost" className="text-xs font-black uppercase tracking-widest ml-1">Costo Unit.</label>
                  <input id="item-cost" type="number" inputMode="decimal" min="0" step="0.01" value={s.newUnitCost || ''} onChange={e => s.setNewUnitCost(parseFloat(e.target.value) || 0)} className="neu-input w-full font-bold text-primary" placeholder="0.00" />
                </div>
              </div>

              {/* REC-2 MM-R9: Precio de venta editable en modal */}
              <div className="space-y-1.5">
                <label htmlFor="item-sale-price" className="text-xs font-black uppercase tracking-widest ml-1">
                  Precio Venta <span className="text-muted-foreground font-normal normal-case tracking-normal">(opcional, actualizará el producto)</span>
                </label>
                <input
                  id="item-sale-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={s.newSalePrice ?? ''}
                  onChange={e => s.setNewSalePrice(e.target.value ? parseFloat(e.target.value) : null)}
                  className="neu-input w-full font-bold text-success"
                  placeholder="0.00 (dejar vacío para no cambiar)"
                />
              </div>

              {/* REC-2 MM-R4: Selector de variante si el producto las tiene */}
              {(() => {
                const selected = s.products.find(p => p.id === s.selectedProductId) as Product | undefined;
                const variants = selected?.product_variants;
                if (!variants || variants.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <label htmlFor="item-variant" className="text-xs font-black uppercase tracking-widest ml-1">
                      Variante <span className="text-muted-foreground font-normal normal-case tracking-normal">(unidad base si no seleccionas)</span>
                    </label>
                    <select
                      id="item-variant"
                      value={s.selectedVariantId || ''}
                      onChange={e => s.setSelectedVariantId(e.target.value || null)}
                      className="neu-input w-full font-bold"
                    >
                      <option value="">Unidad base</option>
                      {variants.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name} {v.conversion_factor ? `(×${v.conversion_factor})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
          )}

          {/* FIX-02: Manual add for products not in catalog */}
          {!s.selectedProductId && (
            <div className="pt-2 border-t border-border space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No encuentras el producto?</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                <input type="text" value={s.manualName} onChange={e => s.setManualName(e.target.value)} className="neu-input w-full text-sm" placeholder="Nombre del producto nuevo" aria-label="Nombre del producto nuevo" />
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={s.manualSku} onChange={e => s.setManualSku(e.target.value)} className="neu-input w-full text-xs" placeholder="SKU (opcional)" aria-label="SKU del producto nuevo" />
                  <input type="number" inputMode="decimal" min="0.0001" step="0.01" value={s.newQuantity} onChange={e => s.setNewQuantity(Math.max(0.0001, parseFloat(e.target.value) || 1))} className="neu-input w-full text-xs" placeholder="Cantidad" aria-label="Cantidad" />
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={s.newUnitCost || ''} onChange={e => s.setNewUnitCost(parseFloat(e.target.value) || 0)} className="neu-input w-full text-xs" placeholder="Costo" aria-label="Costo unitario" />
                </div>
                {/* REC-2 MM-R10: UM picker estructurado */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={s.manualUnitOfMeasure}
                    onChange={e => s.setManualUnitOfMeasure(e.target.value)}
                    className="neu-input w-full text-xs"
                    aria-label="Unidad de medida"
                  >
                    {UNIT_OF_MEASURE_OPTIONS.map(um => (
                      <option key={um} value={um}>{um}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={s.newSalePrice ?? ''}
                    onChange={e => s.setNewSalePrice(e.target.value ? parseFloat(e.target.value) : null)}
                    className="neu-input w-full text-xs text-success"
                    placeholder="Precio venta (opcional)"
                    aria-label="Precio de venta opcional"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </BaseModal>

      {/* ═══════════════════════════════════════════════════════════
          FIX-06: Submit Confirmation AlertDialog
          ═══════════════════════════════════════════════════════════ */}
      <AlertDialog open={s.showSubmitConfirm} onOpenChange={s.setShowSubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar Recepcion</AlertDialogTitle>
            {/* Audit-Fix #2 & #3: AlertDialogDescription renderiza un <p> nativo,
                y HTML no permite <div> ni <p> anidados dentro de <p> (hydration error).
                Reemplazado por un <div> con las mismas clases para soportar contenido
                estructurado (divs, spans) sin violar el HTML spec. */}
            <div className="text-muted-foreground text-sm space-y-2 mt-2">
              <p>Estas a punto de registrar una recepcion con los siguientes datos:</p>
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Proveedor:</span><span className="font-bold">{s.supplier}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Factura:</span><span className="font-bold">{s.invoiceNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Productos:</span><span className="font-bold">{s.items.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total:</span><span className="font-bold text-primary">{formatCurrency(s.totalCost)}</span></div>
                {s.items.some(i => i.is_new) && (
                  <div className="flex justify-between text-info"><span>{s.items.filter(i => i.is_new).length} producto(s) nuevo(s) se crearan</span></div>
                )}
                {s.items.some(i => i.update_price) && (
                  <div className="flex justify-between text-warning"><span>{s.items.filter(i => i.update_price).length} precio(s) se actualizaran</span></div>
                )}
              </div>
              <p className="text-muted-foreground">Esta accion afectara el inventario y no se puede deshacer.</p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={s.executeSubmit} disabled={s.isSubmitting}>
              {s.isSubmitting ? 'Registrando...' : 'Confirmar Registro'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* REC-2 MM-R12: Modal de comprobante post-registro */}
      <ReceptionSuccessModal
        open={s.successData.open}
        onClose={s.handleSuccessClose}
        onNewReception={s.handleSuccessNewReception}
        receiptId={s.successData.receiptId}
        supplier={s.successData.supplier}
        invoiceNumber={s.successData.invoiceNumber}
        itemCount={s.successData.itemCount}
        totalCost={s.successData.totalCost}
        receptionDate={s.successData.receptionDate}
        newProductsCount={s.successData.newProductsCount}
        priceUpdatedCount={s.successData.priceUpdatedCount}
      />

      {/* EM-R4: OCR de factura paper impresa */}
      <InvoiceOCRModal
        open={s.showOCR}
        onClose={() => s.setShowOCR(false)}
        onImportItems={s.handleOCRImportItems}
      />

      {/* EM-R5: Recibir contra OC — carga items desde una OC pendiente */}
      <ReceiveAgainstPOModal
        open={showReceivePO}
        onClose={() => setShowReceivePO(false)}
        onReceive={(payload: ReceiveAgainstPOPayload) => {
          // Reutilizamos handleOCRImportItems que acepta el mismo shape
          // (name, sku, quantity, unit_cost, unit_of_measure, sale_price).
          // La OC ya actualizó quantity_received en el backend (en el hook
          // useReceiveAgainstPO); aquí solo cargamos los items en la
          // recepción actual para continuar el flujo normal.
          const itemsToLoad = payload.items.map((it) => ({
            name: it.product_name,
            sku: it.sku,
            quantity: it.quantity,
            unit_cost: it.unit_cost,
            unit_of_measure: it.unit_of_measure,
            sale_price: null,
          }));
          s.handleOCRImportItems(
            itemsToLoad,
            payload.purchaseOrder.supplier_name,
            payload.purchaseOrder.po_number,
          );
        }}
      />
    </div>
  );
}
