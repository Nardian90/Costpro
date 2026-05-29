'use client';

import React, { useRef } from 'react';
import {
  Plus, Trash2, CheckCircle2, X,
  Package, Camera, ImagePlus, Info,
} from 'lucide-react';
import {
  PrimaryButton, SecondaryButton,
} from '@/components/ui/atomic';
import { BaseModal } from '@/components/ui/BaseModal';
import type { Product, ProductVariant } from '@/types';

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
}: EditProductModalProps) {
  const editCameraRef = useRef<HTMLInputElement>(null);
  const editGalleryRef = useRef<HTMLInputElement>(null);

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
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
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

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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
                <div key={variant.id} className="grid grid-cols-4 gap-2 items-end">
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
