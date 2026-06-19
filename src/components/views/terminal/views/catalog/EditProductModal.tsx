'use client';

import React, { useRef } from 'react';
import {
  Plus, Trash2, CheckCircle2, X,
  Package, Camera, ImagePlus, Info,
  FileText, AlertCircle,
} from 'lucide-react';
import {
  PrimaryButton, SecondaryButton,
} from '@/components/ui/atomic';
import { BaseModal } from '@/components/ui/BaseModal';
import { FCStatusBadge } from '@/components/ui/FCStatusBadge';
import { cn } from '@/lib/utils';
// Accessibility-Fix: helper para detectar campos faltantes del producto.
import { getIncompleteReasons } from '@/lib/product-completeness';
import type { Product, ProductVariant, ProductFCStatus } from '@/types';

export interface EditFormState {
  name: string;
  sku: string;
  category: string;
  price: number;
  precio_empresa: number;
  cost_price: number;
  unit_of_measure: string;
  description: string;
}

export type EditVariant = ProductVariant & { _isNew?: boolean };

interface EditProductModalProps {
  product: Product | null;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  isUploadingImage: boolean;
  editForm: EditFormState;
  onFormChange: (form: EditFormState) => void;
  editImagePreview: string | null;
  editImage: File | null;
  onImageSelect: (file: File) => void;
  onRemoveImage: () => void;
  editVariants: EditVariant[];
  onVariantsChange: (variants: EditVariant[]) => void;
  showVariants: boolean;
  onToggleVariants: () => void;
  onSaveVariant: (index: number) => void;
  onRemoveVariant: (index: number) => void;
  onAddVariant: () => void;
  onUpdateVariant: (index: number, field: string, value: string | number) => void;
  /** FC Status del producto */
  fcStatus?: ProductFCStatus;
  /** Store ID para generar URLs de PDF */
  storeId?: string;
  /** Callback para ver/generar FC */
  onViewFC?: () => void;
}

export default function EditProductModal({
  product,
  onClose,
  onSave,
  isSaving,
  isUploadingImage,
  editForm,
  onFormChange,
  editImagePreview,
  editImage,
  onImageSelect,
  onRemoveImage,
  editVariants,
  onVariantsChange,
  showVariants,
  onToggleVariants,
  onSaveVariant,
  onRemoveVariant,
  onAddVariant,
  onUpdateVariant,
  fcStatus,
  storeId,
  onViewFC,
}: EditProductModalProps) {
  const editCameraRef = useRef<HTMLInputElement>(null);
  const editGalleryRef = useRef<HTMLInputElement>(null);

  // FC auto-enabled state (local toggle)
  const fcAutoEnabled = product?.fc_auto_enabled ?? true;

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageSelect(file);
  };

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageSelect(file);
  };

  return (
    <BaseModal
      open={!!product}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Editar Producto"
      maxWidth="sm:max-w-2xl"
      footer={
        <>
          <SecondaryButton onClick={onClose} label="Cancelar" className="flex-1" />
          <PrimaryButton
            onClick={onSave}
            label={isSaving || isUploadingImage ? "Guardando..." : "Guardar Cambios"}
            disabled={isSaving || isUploadingImage}
            className="flex-1"
          />
        </>
      }
    >
      <div className="space-y-5">
        {/* Accessibility-Fix: Checklist de completitud.
            Muestra qué campos faltan para que el producto esté completo.
            Guía al usuario para resolver el estado "Incompleto". */}
        <ProductCompletenessChecklist editForm={editForm} product={product} />
        {/* ── FC Status Section ────────────────────────────────────────── */}
        {fcStatus && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-primary/40" />
              <FCStatusBadge status={fcStatus} variant="pill" />
            </div>
            <div className="flex items-center gap-2">
              {/* Toggle fc_auto_enabled */}
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                FC Auto
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={fcAutoEnabled}
                aria-label="Generación automática de FC"
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  fcAutoEnabled ? 'bg-primary' : 'bg-muted'
                )}
                title={fcAutoEnabled ? 'FC automática activada' : 'FC automática desactivada'}
              >
                <span className={cn(
                  'inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-sm',
                  fcAutoEnabled ? 'translate-x-5' : 'translate-x-1'
                )} />
              </button>
              {/* View/Generate FC Button */}
              {onViewFC && fcStatus !== 'sin_fc' && (
                <button
                  type="button"
                  onClick={onViewFC}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-black uppercase tracking-widest"
                  title={fcStatus === 'vigente' ? 'Ver Ficha de Costo' : 'Generar Ficha de Costo'}
                >
                  <FileText className="w-3 h-3" />
                  {fcStatus === 'vigente' ? 'Ver FC' : 'Generar FC'}
                </button>
              )}
              {onViewFC && fcStatus === 'sin_fc' && (
                <button
                  type="button"
                  onClick={onViewFC}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors text-[10px] font-black uppercase tracking-widest"
                  title="Sin plantilla FC configurada"
                >
                  <FileText className="w-3 h-3" />
                  Sin FC
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Image Section ────────────────────────────────────────── */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest ml-1">Imagen del Producto</label>
          <div className="mt-2 flex items-center gap-3">
            {editImagePreview ? (
              <div className="relative group">
                <img
                  src={editImagePreview}
                  alt="Vista previa"
                  className="w-20 h-20 rounded-xl object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={onRemoveImage}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  aria-label="Eliminar imagen"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => editCameraRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-bold transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" /> Cámara
                </button>
                <button
                  type="button"
                  onClick={() => editGalleryRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-bold transition-colors"
                >
                  <ImagePlus className="w-3.5 h-3.5" /> Galería
                </button>
              </div>
            )}
            {/* Show change-image buttons alongside the preview */}
            {editImagePreview && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => editCameraRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-bold transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" /> Cambiar
                </button>
                <button
                  type="button"
                  onClick={() => editGalleryRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-bold transition-colors"
                >
                  <ImagePlus className="w-3.5 h-3.5" /> Galería
                </button>
              </div>
            )}
          </div>
          <input
            ref={editCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
            className="hidden"
          />
          <input
            ref={editGalleryRef}
            type="file"
            accept="image/*"
            onChange={handleGallerySelect}
            className="hidden"
          />
        </div>

        {/* ── Basic Fields ─────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label htmlFor="edit-product-name" className="text-xs font-black uppercase tracking-widest ml-1">Nombre</label>
          <input
            id="edit-product-name"
            type="text"
            value={editForm.name}
            onChange={(e) => onFormChange({ ...editForm, name: e.target.value })}
            aria-label="Nombre del producto"
            className="neu-input w-full font-bold"
            placeholder="Ej: Camiseta Algodón"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-product-sku" className="text-xs font-black uppercase tracking-widest ml-1">SKU</label>
            <input
              id="edit-product-sku"
              type="text"
              aria-label="SKU del producto"
              value={editForm.sku}
              onChange={(e) => onFormChange({ ...editForm, sku: e.target.value })}
              className="neu-input w-full"
              placeholder="SKU-001"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-product-category" className="text-xs font-black uppercase tracking-widest ml-1">Categoría</label>
            <input
              id="edit-product-category"
              type="text"
              aria-label="Categoría del producto"
              value={editForm.category}
              onChange={(e) => onFormChange({ ...editForm, category: e.target.value })}
              className="neu-input w-full"
              placeholder="Ropa"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-product-um" className="text-xs font-black uppercase tracking-widest ml-1">Unidad de Medida</label>
            <input
              id="edit-product-um"
              type="text"
              aria-label="Unidad de medida"
              value={editForm.unit_of_measure}
              onChange={(e) => onFormChange({ ...editForm, unit_of_measure: e.target.value })}
              className="neu-input w-full"
              placeholder="unidad"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-product-cost" className="text-xs font-black uppercase tracking-widest ml-1">Costo</label>
            <input
              id="edit-product-cost"
              type="number"
              aria-label="Costo del producto"
              value={editForm.cost_price || ''}
              onChange={(e) => onFormChange({ ...editForm, cost_price: parseFloat(e.target.value) || 0 })}
              className="neu-input w-full font-bold text-primary"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-product-price" className="text-xs font-black uppercase tracking-widest ml-1">Precio Minorista</label>
            <input
              id="edit-product-price"
              type="number"
              aria-label="Precio de venta minorista"
              value={editForm.price || ''}
              onChange={(e) => onFormChange({ ...editForm, price: parseFloat(e.target.value) || 0 })}
              className="neu-input w-full font-bold"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-product-precio-empresa" className="text-xs font-black uppercase tracking-widest ml-1">
              Precio Empresa <span className="font-normal normal-case tracking-normal text-muted-foreground">(venta mayorista)</span>
            </label>
            <input
              id="edit-product-precio-empresa"
              type="number"
              aria-label="Precio de venta empresa/mayorista"
              value={editForm.precio_empresa || ''}
              onChange={(e) => onFormChange({ ...editForm, precio_empresa: parseFloat(e.target.value) || 0 })}
              className="neu-input w-full font-bold"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-product-description" className="text-xs font-black uppercase tracking-widest ml-1">Descripción</label>
          <textarea
            id="edit-product-description"
            aria-label="Descripción del producto"
            value={editForm.description}
            onChange={(e) => onFormChange({ ...editForm, description: e.target.value })}
            className="neu-input w-full min-h-[80px] text-sm"
            placeholder="Detalles adicionales del producto..."
          />
        </div>

        {/* ── Unit Variants Section ───────────────────────────────── */}
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={onToggleVariants}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <Package className="w-3.5 h-3.5" />
            Unidades de Medida Alternativas
            {editVariants.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {editVariants.length}
              </span>
            )}
          </button>

          {showVariants && (
            <div className="mt-3 space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border">
                <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Agrega variantes para vender el mismo producto en diferentes presentaciones (ej: caja de 12 unidades).
                  Cada variante define un factor de conversión respecto a la unidad base.
                </p>
              </div>

              {editVariants.map((variant, index) => (
                <div key={variant.id} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-0.5">Nombre</label>
                    <input
                      type="text"
                      value={variant.name}
                      onChange={(e) => onUpdateVariant(index, 'name', e.target.value)}
                      className="neu-input w-full text-xs"
                      placeholder="Caja x12"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-0.5">Factor</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={variant.conversion_factor || ''}
                      onChange={(e) => onUpdateVariant(index, 'conversion_factor', parseFloat(e.target.value) || 0)}
                      className="neu-input w-full text-xs"
                      placeholder="12"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-0.5">Precio</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={variant.price || ''}
                      onChange={(e) => onUpdateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                      className="neu-input w-full text-xs font-bold"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="space-y-1 flex-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-0.5">P. Empresa</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={variant.precio_empresa || ''}
                        onChange={(e) => onUpdateVariant(index, 'precio_empresa', parseFloat(e.target.value) || 0)}
                        className="neu-input w-full text-xs"
                        placeholder="0.00"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onSaveVariant(index)}
                      className="mb-0.5 p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                      title="Guardar variante"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveVariant(index)}
                      className="mb-0.5 p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      title="Eliminar variante"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={onAddVariant}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-xs font-bold text-muted-foreground hover:text-primary transition-all w-full justify-center"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Variante
              </button>
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Accessibility-Fix: ProductCompletenessChecklist
// ════════════════════════════════════════════════════════════════════════
// Componente que muestra un checklist de campos faltantes para que el producto
// esté "completo". Aparece al editar un producto marcado como incompleto.
// Cada item muestra: ícono (✓ completado / ⚠ faltante) + label + hint.
//
// Casos de uso:
//  - Usuario ve badge "Incompleto" en la tarjeta → abre editar → ve el checklist
//  - Usuario completa campos → el checklist se actualiza en tiempo real
//  - Cuando todos los críticos están OK, el checklist desaparece
// ════════════════════════════════════════════════════════════════════════

function ProductCompletenessChecklist({
  editForm,
  product,
}: {
  editForm: EditFormState;
  product: Product | null;
}) {
  // Combinar editForm con product para tener todos los campos disponibles
  const combinedProduct: Partial<Product> = {
    ...product,
    sku: editForm.sku,
    name: editForm.name,
    category: editForm.category,
    price: editForm.price,
    cost_price: editForm.cost_price,
    unit_of_measure: editForm.unit_of_measure,
    description: editForm.description,
  };

  const reasons = getIncompleteReasons(combinedProduct);

  if (reasons.length === 0) {
    // Producto completo — no mostrar nada (o mostrar un mensaje de éxito opcional)
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <span className="text-xs font-black uppercase tracking-widest text-success">
          Producto completo
        </span>
      </div>
    );
  }

  const critical = reasons.filter(r => r.severity === 'critical');
  const recommended = reasons.filter(r => r.severity === 'recommended');

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-warning shrink-0" />
        <span className="text-xs font-black uppercase tracking-widest text-warning">
          Producto incompleto — {critical.length} crítico(s), {recommended.length} recomendado(s)
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Completa estos campos para que el producto sea operativo en ventas, recepciones y reportes.
      </p>
      <div className="space-y-1.5">
        {reasons.map((reason, idx) => (
          <div
            key={`${reason.field}-${idx}`}
            className={cn(
              "flex items-start gap-2 p-2 rounded-lg border",
              reason.severity === 'critical'
                ? "border-danger/20 bg-danger/5"
                : "border-muted-foreground/20 bg-muted/30"
            )}
          >
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
              reason.severity === 'critical' ? 'bg-danger/20' : 'bg-muted-foreground/20'
            )}>
              <X className={cn(
                "w-3 h-3",
                reason.severity === 'critical' ? 'text-danger' : 'text-muted-foreground'
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-black uppercase tracking-widest",
                  reason.severity === 'critical' ? 'text-danger' : 'text-muted-foreground'
                )}>
                  {reason.label}
                </span>
                {reason.severity === 'critical' && (
                  <span className="text-[9px] font-bold uppercase tracking-widest bg-danger/20 text-danger px-1.5 py-0.5 rounded">
                    Requerido
                  </span>
                )}
                {reason.severity === 'recommended' && (
                  <span className="text-[9px] font-bold uppercase tracking-widest bg-muted-foreground/20 text-muted-foreground px-1.5 py-0.5 rounded">
                    Recomendado
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                {reason.hint}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
