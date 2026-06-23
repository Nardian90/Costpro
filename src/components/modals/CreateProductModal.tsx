'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { useUIStore, useAuthStore } from '@/store';
import { useCreateProduct, useAddVariant } from '@/hooks/api/useProducts';
import { catalogService } from '@/services/catalog-service';
import { toast } from 'sonner';
import { Camera, ImagePlus, X, Upload, Loader2, Package, Plus, Trash2, Info } from 'lucide-react';
import { compressImage, validateImageFile } from '@/lib/image-compress';
import { generateEAN13FromSKU } from '@/lib/barcode-utils';
import { supabase } from '@/lib/supabaseClient';

interface VariantForm {
  name: string;
  sku: string;
  price: number;
  conversion_factor: number;
}

export const CreateProductModal = () => {
  const { isCreateProductModalOpen, setIsCreateProductModalOpen, initialProductName, setInitialProductName } = useUIStore();
  const { user } = useAuthStore();
  const createProductMutation = useCreateProduct();
  const addVariantMutation = useAddVariant();

  const initialFormState = {
    name: '',
    sku: '',
    category: '',
    price: 0,
    cost_price: 0,
    barcode: '',
    unit_of_measure: 'unidad',
    description: ''
  };

  const [form, setForm] = useState(initialFormState);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // CM-2.1: Cargar categorías existentes para autocompletado (datalist)
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  useEffect(() => {
    if (!isCreateProductModalOpen || !user?.activeStoreId) return;
    supabase
      .from('products')
      .select('category')
      .eq('store_id', user.activeStoreId)
      .not('category', 'is', null)
      .neq('category', '')
      .then(({ data }) => {
        if (data) {
          const unique = Array.from(new Set(data.map(d => d.category).filter(Boolean))) as string[];
          setExistingCategories(unique.sort());
        }
      });
  }, [isCreateProductModalOpen, user?.activeStoreId]);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [variants, setVariants] = useState<VariantForm[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreateProductModalOpen && initialProductName) {
      requestAnimationFrame(() => {
        setForm(prev => ({ ...prev, name: initialProductName }));
      });
    }
  }, [isCreateProductModalOpen, initialProductName]);

  // Cleanup image preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleClose = () => {
    setIsCreateProductModalOpen(false);
    setInitialProductName('');
    setForm(initialFormState);
    setSelectedImage(null);
    setImagePreview(null);
    setCompressedSize(null);
    setShowVariants(false);
    setVariants([]);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleImageSelect = useCallback(async (file: File) => {
    // Use shared validation — accept up to 10MB (will be compressed)
    const validationError = validateImageFile(file, 10);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSelectedImage(file);

    // Generate preview from original
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    // Pre-compress and cache result to avoid double compression on save
    try {
      const compressed = await compressImage(file);
      const savings = ((1 - compressed.size / file.size) * 100).toFixed(0);
      // Store the compressed file directly — reuse on save (no double compression)
      setSelectedImage(compressed);
      setCompressedSize(compressed.size);
      toast.success(`Imagen optimizada: ${(file.size / 1024).toFixed(0)} KB → ${(compressed.size / 1024).toFixed(0)} KB (${savings}% reducción)`);
    } catch (err: unknown) {
      // Keep original if compression fails validation (e.g., too small dimensions)
      setSelectedImage(file);
      toast.warning((err instanceof Error ? err.message : '') || 'No se pudo optimizar la imagen. Se guardará tal cual.');
    }
  }, [imagePreview]);

  const handleCameraCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
  }, [handleImageSelect]);

  const handleGallerySelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
  }, [handleImageSelect]);

  const removeImage = useCallback(() => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setCompressedSize(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }, [imagePreview]);

  // ---- Variant Management ----
  const addVariant = () => {
    setVariants(prev => [...prev, { name: '', sku: '', price: 0, conversion_factor: 1 }]);
  };

  const removeVariant = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: keyof VariantForm, value: string | number) => {
    setVariants(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const handleCreate = async () => {
    if (!form.name?.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (form.name.length > 150) {
      toast.error('El nombre no debe superar los 150 caracteres');
      return;
    }
    if (!form.sku?.trim()) {
      toast.error('El SKU es obligatorio');
      return;
    }
    if (form.sku.length > 50) {
      toast.error('El SKU no debe superar los 50 caracteres');
      return;
    }
    if (form.price < 0) {
      toast.error('El precio no puede ser negativo');
      return;
    }
    if (form.cost_price < 0) {
      toast.error('El costo no puede ser negativo');
      return;
    }
    if (!user?.activeStoreId) {
      toast.error('No hay una tienda activa seleccionada');
      return;
    }

    // Validate variants
    const validVariants = variants.filter(v => v.name && v.conversion_factor > 0);
    if (variants.length > 0 && validVariants.length === 0) {
      toast.error('Las variantes agregadas necesitan nombre y factor de conversión');
      return;
    }

    try {
      // 1. Create product
      const result = await createProductMutation.mutateAsync({
        ...form,
        barcode: form.barcode ? form.barcode : generateEAN13FromSKU(form.sku),
        barcode_type: form.barcode ? 'CODE128' : 'EAN13',
        store_id: user.activeStoreId
      });

      const productId = (result as any)?.id;
      if (!productId) throw new Error('No se recibió ID del producto creado');

      // 2. Create variants in parallel
      if (validVariants.length > 0) {
        const variantPromises = validVariants.map(v =>
          addVariantMutation.mutateAsync({
            product_id: productId,
            name: v.name,
            sku: v.sku || null,
            price: v.price,
            conversion_factor: v.conversion_factor,
          }).catch(err => {
            console.error(`Error creating variant "${v.name}":`, err);
            toast.warning(`Variante "${v.name}" no se pudo crear`);
            return null;
          })
        );
        await Promise.all(variantPromises);
      }

      // 3. Upload image (already compressed during selection — no double compression)
      if (selectedImage) {
        setIsUploadingImage(true);
        try {
          await catalogService.uploadProductImage(productId, selectedImage);
          const vCount = validVariants.length > 0 ? ` con ${validVariants.length} variante(s)` : '';
          toast.success(`Producto creado con imagen${vCount}`);
        } catch (imgError: unknown) {
          console.error('Error uploading image:', imgError);
          toast.warning('Producto creado, pero la imagen no se pudo subir.');
        } finally {
          setIsUploadingImage(false);
        }
      } else {
        const vCount = validVariants.length > 0 ? ` con ${validVariants.length} variante(s)` : '';
        toast.success(`Producto creado con éxito${vCount}`);
      }
      handleClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al crear producto';
      toast.error(message);
    }
  };

  return (
    <BaseModal
      open={isCreateProductModalOpen}
      onOpenChange={handleClose}
      title="Nuevo Producto"
      maxWidth="sm:max-w-lg"
      footer={
        <>
          <SecondaryButton onClick={handleClose} label="Cancelar" className="flex-1" />
          <PrimaryButton
            onClick={handleCreate}
            label={createProductMutation.isPending || isUploadingImage ? "Guardando..." : "Crear Producto"}
            disabled={createProductMutation.isPending || isUploadingImage}
            className="flex-1"
          />
        </>
      }
    >
        <div className="space-y-4">

          {/* Image Section */}
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-widest ml-1">Imagen del Producto</label>
            {imagePreview ? (
              <div className="relative group rounded-xl border border-border overflow-hidden bg-muted/10">
                <img
                  src={imagePreview}
                  alt="Vista previa del producto"
                  className="w-full h-40 object-cover"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg opacity-80 hover:opacity-100 transition-opacity"
                  aria-label="Eliminar imagen"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-2 flex gap-2">
                  <span className="px-2 py-1 bg-black/60 rounded-lg text-[10px] text-white font-semibold">
                    Original: {((selectedImage as any).size / 1024).toFixed(0)} KB
                  </span>
                  {compressedSize && (
                    <span className="px-2 py-1 bg-success/80 rounded-lg text-[10px] text-foreground font-semibold">
                      Optimizada: {(compressedSize / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                  aria-label="Tomar foto con cámara"
                >
                  <Camera className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cámara</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                  aria-label="Seleccionar de galería"
                >
                  <ImagePlus className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Galería</span>
                </button>
              </div>
            )}

            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} className="hidden" aria-hidden="true" />
            <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleGallerySelect} className="hidden" aria-hidden="true" />
            <p className="text-[10px] text-muted-foreground italic ml-1">
              Máx. 10 MB. Se optimiza automáticamente a WebP (máx. 1024px, &lt; 200 KB, mín. 100×100px).
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="product-name" className="text-xs font-black uppercase tracking-widest ml-1">Nombre</label>
            <input
              id="product-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-label="Nombre del producto"
              className="neu-input w-full font-bold"
              placeholder="Ej: Camiseta Algodón"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="product-sku" className="text-xs font-black uppercase tracking-widest ml-1 flex justify-between">
                <span>SKU</span>
                {/* CM-4.4: Botón para autogenerar SKU secuencial */}
                <button
                  type="button"
                  onClick={async () => {
                    if (!user?.activeStoreId) return;
                    // Generar SKU secuencial: contar productos existentes + 1
                    try {
                      const { count } = await supabase
                        .from('products')
                        .select(undefined, { count: 'exact', head: true })
                        .eq('store_id', user.activeStoreId);
                      const nextNum = (count ?? 0) + 1;
                      // Formato: PROD-0001, PROD-0002, etc.
                      const generatedSku = `PROD-${String(nextNum).padStart(4, '0')}`;
                      setForm({ ...form, sku: generatedSku });
                      toast.success(`SKU generado: ${generatedSku}`);
                    } catch {
                      toast.error('No se pudo generar SKU');
                    }
                  }}
                  className="text-xs text-primary hover:underline italic"
                >
                  ↻ Auto-generar
                </button>
              </label>
              <input
                id="product-sku"
                type="text"
                aria-label="SKU del producto"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="neu-input w-full"
                placeholder="SKU-001 o clic en Auto-generar"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-barcode" className="text-xs font-black uppercase tracking-widest ml-1 flex justify-between">
                <span>Código Barras</span>
                <span className="text-xs text-primary/70 italic">Opcional</span>
              </label>
              <input
                id="product-barcode"
                type="text"
                aria-label="Código de barras del producto"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="neu-input w-full"
                placeholder="Auto desde SKU"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="product-category" className="text-xs font-black uppercase tracking-widest ml-1">Categoría</label>
              {/* CM-2.1: Autocompletado de categorías con datalist */}
              <input
                id="product-category"
                type="text"
                list="product-categories-list"
                aria-label="Categoría del producto"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="neu-input w-full"
                placeholder="Ropa"
              />
              <datalist id="product-categories-list">
                {existingCategories.map(cat => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-unit" className="text-xs font-black uppercase tracking-widest ml-1">Unidad</label>
              <select
                id="product-unit"
                aria-label="Unidad de medida base"
                value={form.unit_of_measure}
                onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })}
                className="neu-input w-full"
              >
                <option value="unidad">Unidad</option>
                <option value="kg">Kilogramo</option>
                <option value="g">Gramo</option>
                <option value="l">Litro</option>
                <option value="ml">Mililitro</option>
                <option value="m">Metro</option>
                <option value="m2">Metro²</option>
                <option value="m3">Metro³</option>
                <option value="caja">Caja</option>
                <option value="paquete">Paquete</option>
                <option value="bolsa">Bolsa</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="product-cost" className="text-xs font-black uppercase tracking-widest ml-1 flex justify-between">
                 <span>Costo</span>
                 <span className="text-xs text-primary/70 italic">Por unidad base</span>
              </label>
              <input
                id="product-cost"
                type="number"
                aria-label="Costo del producto por unidad base"
                value={form.cost_price || ''}
                onChange={(e) => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })}
                className="neu-input w-full font-bold text-primary"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-price" className="text-xs font-black uppercase tracking-widest ml-1">
                Precio <span className="text-xs opacity-50 lowercase font-normal">(venta unidad)</span>
              </label>
              <input
                id="product-price"
                type="number"
                aria-label="Precio de venta por unidad base"
                value={form.price || ''}
                onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                className="neu-input w-full font-bold"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* ---- Unit Variants Section ---- */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between ml-1">
              <label className="text-xs font-black uppercase tracking-widest">Variantes de Unidad</label>
              <button
                type="button"
                onClick={() => { setShowVariants(!showVariants); if (!showVariants && variants.length === 0) addVariant(); }}
                className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-widest hover:underline"
              >
                <Package className="w-3 h-3" />
                {showVariants ? 'Ocultar' : 'Agregar'}
              </button>
            </div>

            {showVariants && (
              <div className="space-y-3 p-3 rounded-xl border border-border bg-muted/10">
                <div className="flex items-start gap-2 px-2">
                  <Info className="w-3.5 h-3.5 text-primary/60 mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Define presentaciones alternativas. Ej: <strong>Caja x24</strong> con factor <strong>24</strong>
                    significa que 1 caja equivale a 24 unidades base. Cada variante puede tener su propio precio.
                  </p>
                </div>

                {variants.map((variant, index) => (
                  <div key={index} className="relative grid grid-cols-4 gap-2 p-2 rounded-lg border border-border/50 bg-background">
                    <input
                      type="text"
                      value={variant.name}
                      onChange={(e) => updateVariant(index, 'name', e.target.value)}
                      className="col-span-2 neu-input w-full text-xs"
                      placeholder="Ej: Caja x24"
                      aria-label="Nombre de la variante"
                    />
                    <input
                      type="number"
                      value={variant.conversion_factor || ''}
                      onChange={(e) => updateVariant(index, 'conversion_factor', parseFloat(e.target.value) || 0)}
                      className="neu-input w-full text-xs text-center"
                      placeholder="x24"
                      min="1"
                      step="1"
                      aria-label="Factor de conversión (cuántas unidades base)"
                    />
                    <input
                      type="number"
                      value={variant.price || ''}
                      onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                      className="neu-input w-full text-xs font-bold text-primary"
                      placeholder="$2,500"
                      min="0"
                      step="0.01"
                      aria-label="Precio de esta variante"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(index)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                      aria-label="Eliminar variante"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addVariant}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-primary/30 text-primary/60 hover:bg-primary/5 hover:border-primary/50 transition-all text-xs font-bold uppercase tracking-wider"
                >
                  <Plus className="w-3 h-3" />
                  Agregar Variante
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
              <label htmlFor="product-description" className="text-xs font-black uppercase tracking-widest ml-1">Descripción</label>
              <textarea
                id="product-description"
                aria-label="Descripción del producto"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="neu-input w-full min-h-[80px] text-sm"
                placeholder="Detalles adicionales del producto..."
              />
          </div>
        </div>
    </BaseModal>
  );
};
