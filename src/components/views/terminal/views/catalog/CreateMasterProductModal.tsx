'use client';

/**
 * CreateMasterProductModal — CORRECCIÓN FUNCIONAL CATÁLOGO MAESTRO (2026-11-12) §4.
 *
 * Creación de productos del Catálogo Maestro directamente desde el diálogo
 * «Catálogo de la organización», SIN cerrar la ventana ni volver a la pestaña
 * «Catálogo» de Inventario.
 *
 * Mismo SERVICIO de creación que la pestaña Catálogo de Inventario (brief §5):
 *  · `useCreateMasterProduct` → RPC certificada `create_master_product`
 *    (maestro UNA VEZ + fila local de la tienda activa en una transacción
 *    atómica; dedup previo con findMasterBySku y oferta de activación del
 *    maestro existente, igual que CreateProductModal).
 *  · Al guardar: (1) registro en el Catálogo Maestro de la organización,
 *    (2) vínculo correcto con la tienda activa, (3) fila local con los
 *    defaults de alta manual (precio 0/CUP, min_stock 1, existencia 0, sin
 *    movimientos — NADA se copia de otras tiendas), (4) precio/costo/unidad
 *    y demás datos comerciales se configuran DESDE el inventario de esta
 *    tienda, (5) la interfaz se actualiza sin recarga (invalidación del
 *    hook + refresco de la lista del diálogo).
 *  · La imagen (opcional) se sube tras crear el maestro con el prefijo
 *    compartido `master-{id}-…` (política de storage 20261112120000) y se
 *    aplica vía la RPC gobernada: gobernador → update_master_product
 *    (propagación inmediata); no gobernador → propose_master_change
 *    (pendiente de aprobación). Si la aplicación falla, el archivo se
 *    limpia (sin huérfanos) y el producto YA creado permanece.
 *
 * SKU: introducible SOLO aquí (es la creación); tras ella es compartido e
 * inmutable (ERR_SKU_IMMUTABLE en el servidor). Validaciones de unicidad
 * previas (findMasterBySku) + la unicidad real de la BD (ERR_MASTER_SKU_EXISTS
 * con carrera incluida). Sin identidades duplicadas ni productos huérfanos.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, ImagePlus, Info, Loader2, Lock, PackagePlus, X } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { compressImage, validateImageFile } from '@/lib/image-compress';
import { supabase } from '@/lib/supabaseClient';
import {
  findMasterBySku,
  useActivateMasterProduct,
  useCreateMasterProduct,
  useProposeMasterChange,
  useUpdateMasterProduct,
} from '@/hooks/api/useMasterCatalog';
import { toast } from 'sonner';

export interface CreateMasterProductModalProps {
  open: boolean;
  onClose: () => void;
  /** Tienda activa — origen de la creación y vínculo local. */
  storeId: string | null;
  /** ¿El usuario es gobernador del catálogo de la organización? */
  isGovernor: boolean;
}

function translateCreateError(msg: string): string {
  if (msg.includes('ERR_MASTER_SKU_EXISTS')) return 'Ya existe un producto maestro con ese SKU en la organización: actívalo desde la lista (no se crea un duplicado).';
  if (msg.includes('ERR_SKU_EXISTS_LOCAL')) return 'Esta tienda ya tiene un producto local con ese SKU: vincúlalo al catálogo en lugar de duplicar.';
  if (msg.includes('ERR_STORE_NOT_CONNECTED')) return 'La tienda no está conectada al catálogo de la organización.';
  if (msg.includes('ERR_UNAUTHORIZED')) return 'Sin permiso de alta de productos en esta tienda.';
  if (msg.includes('ERR_MASTER_NOT_FOUND')) return 'El producto maestro ya no existe en la organización.';
  if (msg.includes('ERR_BARCODE_EXISTS')) return 'Ya existe otro producto con ese código de barras.';
  if (msg.includes('ERR_SKU_IMMUTABLE')) return 'El SKU es compartido e inmutable: no puede modificarse después de la creación del producto.';
  if (msg.includes('ERR_SKU_LOCKED_BY_MOVEMENTS')) return 'El SKU está bloqueado: el producto tiene movimientos históricos.';
  return msg;
}

export const CreateMasterProductModal: React.FC<CreateMasterProductModalProps> = ({
  open,
  onClose,
  storeId,
  isGovernor,
}) => {
  const createMaster = useCreateMasterProduct(storeId);
  const activateMaster = useActivateMasterProduct(storeId);
  const updateMaster = useUpdateMasterProduct(storeId);
  const proposeMaster = useProposeMasterChange(storeId);

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Reset del formulario en cada apertura (estado limpio por producto nuevo).
  useEffect(() => {
    if (!open) return;
    setSku('');
    setName('');
    setDescription('');
    setImageFile(null);
    setImagePreview(null);
  }, [open]);

  // Liberar object URLs al desmontar/cambiar.
  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageSelect = useCallback(async (file: File) => {
    const validationError = validateImageFile(file, 10);
    if (validationError) { toast.error(validationError); return; }
    if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, [imagePreview]);

  const handleRemoveImage = useCallback(() => {
    setImageFile(null);
    if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  }, [imagePreview]);

  /** Sube la imagen al bucket product-images con el prefijo compartido del
   *  maestro recién creado (política 20261112120000: master-{id}-…). */
  const uploadSharedImage = useCallback(async (masterId: string): Promise<string> => {
    if (!imageFile) throw new Error('Sin imagen seleccionada');
    const compressed = await compressImage(imageFile);
    const fileExt = (imageFile.name.split('.').pop() || 'webp').toLowerCase();
    const fileName = `master-${masterId}-${crypto.randomUUID()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, compressed, { cacheControl: 'public, max-age=31536000, immutable' });
    if (uploadError) throw uploadError;
    return fileName;
  }, [imageFile]);

  const handleClose = useCallback(() => {
    if (isSaving || isUploadingImage) return;
    if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    onClose();
  }, [isSaving, isUploadingImage, imagePreview, onClose]);

  const handleCreate = useCallback(async () => {
    if (!storeId) {
      toast.error('No hay una tienda activa seleccionada');
      return;
    }
    // Validaciones previas — el diálogo NO se cierra ante error (brief §7).
    const cleanSku = sku.trim();
    const cleanName = name.trim();
    if (!cleanSku) {
      toast.error('El SKU es obligatorio');
      return;
    }
    if (cleanSku.length > 50) {
      toast.error('El SKU no debe superar los 50 caracteres');
      return;
    }
    if (!cleanName) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (cleanName.length > 150) {
      toast.error('El nombre no debe superar los 150 caracteres');
      return;
    }
    if (description.length > 2000) {
      toast.error('La descripción no debe superar los 2000 caracteres');
      return;
    }

    setIsSaving(true);
    try {
      // Dedup ANTES de insertar (misma verificación que la pestaña Catálogo
      // de Inventario): si el SKU ya existe como maestro, se OFRECE activarlo
      // en esta tienda en lugar de crear una identidad duplicada.
      const master = await findMasterBySku(storeId, cleanSku);
      if (master) {
        if (master.activated) {
          toast.error(`El SKU ${master.sku} ya existe en esta tienda como producto vinculado al catálogo.`);
          setIsSaving(false);
          return;
        }
        const aceptar = window.confirm(
          `El SKU «${master.sku}» ya existe en el catálogo de la organización como «${master.name}».\n\n` +
          '¿Activarlo en esta tienda? Se creará el producto local vinculado (existencia 0, sin movimientos); ' +
          'el precio y demás datos comerciales se configuran después desde el inventario.\n\n' +
          'Cancelar: no se creará nada.'
        );
        if (!aceptar) {
          setIsSaving(false);
          return;
        }
        await activateMaster.mutateAsync(master.id);
        toast.success('Producto del catálogo existente activado en esta tienda (existencia 0, sin movimientos).');
        onClose();
        return;
      }

      // Creación con identidad compartida — MISMO servicio que la pestaña
      // «Catálogo» de Inventario (create_master_product: maestro + fila local
      // de esta tienda con defaults de alta manual, transacción atómica).
      const res = await createMaster.mutateAsync({
        sku: cleanSku,
        name: cleanName,
        description: description.trim() || null,
        local: {},
      });

      // Imagen compartida (opcional): subida con prefijo del maestro nuevo y
      // aplicación vía la RPC gobernada — gobernador aplica (propagación a
      // las tiendas vinculadas), no gobernador propone (aprobación posterior).
      if (imageFile && res.master_product_id) {
        setIsUploadingImage(true);
        let uploadedFileName: string | null = null;
        try {
          uploadedFileName = await uploadSharedImage(res.master_product_id);
          if (isGovernor) {
            await updateMaster.mutateAsync({ masterId: res.master_product_id, changes: { image_path: uploadedFileName } });
          } else {
            await proposeMaster.mutateAsync({ masterId: res.master_product_id, changes: { image_path: uploadedFileName } });
          }
        } catch (imgError) {
          // Sin aplicar: limpiar el archivo para no dejar huérfanos. El
          // producto YA está creado — se informa y se continúa sin imagen.
          if (uploadedFileName) {
            try { await supabase.storage.from('product-images').remove([uploadedFileName]); } catch { /* best-effort */ }
          }
          const msg = imgError instanceof Error ? imgError.message : 'Error al guardar la imagen compartida';
          toast.warning(`Producto creado, pero la imagen no se pudo aplicar: ${translateCreateError(msg)}`);
        } finally {
          setIsUploadingImage(false);
        }
      }

      toast.success(
        `Producto creado en el Catálogo Maestro y vinculado a esta tienda (existencia 0, sin movimientos). ` +
        'Configura su precio, costo y demás datos comerciales desde Inventario → Catálogo.'
      );
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al crear el producto del catálogo';
      toast.error(translateCreateError(msg));
    } finally {
      setIsSaving(false);
    }
  }, [storeId, sku, name, description, imageFile, createMaster, activateMaster, updateMaster, proposeMaster, uploadSharedImage, isGovernor, onClose]);

  const saving = isSaving || isUploadingImage;

  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => { if (!o) handleClose(); }}
      title="Crear producto del Catálogo Maestro"
      description="Identidad compartida de la organización (SKU, nombre, imagen, descripción). Se vincula a la tienda activa; los precios, costos y existencias se configuran después desde el inventario de esta tienda."
      maxWidth="sm:max-w-xl"
      footer={
        <>
          <SecondaryButton onClick={handleClose} label="Cancelar" className="flex-1" disabled={saving} />
          <PrimaryButton
            onClick={handleCreate}
            label={saving ? 'Guardando…' : 'Crear producto'}
            disabled={saving}
            className="flex-1"
          />
        </>
      }
    >
      <div className="space-y-4">
        {/* Alcance compartido — claro ANTES de guardar. */}
        <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-[11px] leading-relaxed">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            El producto se crea <strong>una sola vez</strong> en el Catálogo Maestro de la organización y queda
            <strong> vinculado a la tienda activa</strong> (fila local con existencia 0 y sin movimientos; precio 0/CUP
            y mínimo 1 como alta manual). Los precios, costos y existencias de cada tienda{' '}
            <strong>nunca se comparten</strong>: se configuran después desde Inventario → Catálogo. {isGovernor
              ? 'Como gobernador, la imagen que adjuntes se aplica de inmediato a todas las tiendas vinculadas.'
              : 'Como no eres gobernador, la imagen que adjuntes quedará pendiente de aprobación del gobernador.'}
          </div>
        </div>

        {/* SKU — introducible SOLO en la creación; después es inmutable. */}
        <div>
          <label htmlFor="create-master-sku" className="text-xs font-black uppercase tracking-widest ml-1">
            SKU
          </label>
          <input
            id="create-master-sku"
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            maxLength={50}
            disabled={saving}
            aria-label="SKU del producto (solo en la creación)"
            className="neu-input w-full font-mono"
            placeholder="SKU-001"
            data-testid="create-master-sku-input"
          />
          <div className="flex items-center gap-1.5 mt-1 ml-1">
            <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
            <p className="text-[10px] text-muted-foreground italic">
              Único en la organización. Compartido e inmutable: después de crear el producto no puede modificarse.
            </p>
          </div>
        </div>

        {/* Nombre compartido */}
        <div>
          <label htmlFor="create-master-name" className="text-xs font-black uppercase tracking-widest ml-1">
            Nombre
          </label>
          <input
            id="create-master-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={150}
            disabled={saving}
            aria-label="Nombre compartido del producto"
            className="neu-input w-full font-bold"
            placeholder="Ej: Cable Solar Rojo 4mm"
            data-testid="create-master-name-input"
          />
          <p className="text-[10px] text-muted-foreground italic ml-1 mt-1">
            Compartido: se refleja en todas las tiendas de la organización que activen este producto.
          </p>
        </div>

        {/* Imagen compartida (opcional) */}
        <div>
          <label className="text-xs font-black uppercase tracking-widest ml-1" htmlFor="create-master-image">
            Imagen (opcional)
          </label>
          <div className="mt-2 flex items-center gap-3" id="create-master-image">
            {imagePreview ? (
              <div className="relative group">
                <img
                  src={imagePreview}
                  alt="Vista previa de la imagen compartida"
                  className="w-20 h-20 rounded-xl object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg transition-opacity"
                  aria-label="Quitar imagen seleccionada"
                  disabled={saving}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-bold transition-colors"
                  disabled={saving}
                >
                  <Camera className="w-3.5 h-3.5" /> Cámara
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-bold transition-colors"
                  disabled={saving}
                >
                  <ImagePlus className="w-3.5 h-3.5" /> Galería
                </button>
              </div>
            )}
            <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />
            <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />
            {imagePreview && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => galleryRef.current?.click()}
                disabled={saving}
                aria-label="Cambiar imagen seleccionada"
              >
                <PackagePlus className="h-3.5 w-3.5 mr-1.5" /> Cambiar imagen
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground italic ml-1 mt-1">
            Imagen compartida de la organización (misma referencia para todas las tiendas vinculadas).
          </p>
        </div>

        {/* Descripción compartida */}
        <div>
          <label htmlFor="create-master-description" className="text-xs font-black uppercase tracking-widest ml-1">
            Descripción compartida
          </label>
          <textarea
            id="create-master-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            disabled={saving}
            aria-label="Descripción compartida del producto"
            className="neu-input w-full resize-y"
            placeholder="Descripción visible para las tiendas de la organización que no personalicen la suya…"
            data-testid="create-master-description-input"
          />
          <p className="text-[10px] text-muted-foreground italic ml-1">
            {description.length}/2000 caracteres. Base compartida; cada tienda puede personalizar la suya localmente.
          </p>
        </div>

        {/* Nota de trazabilidad del SKU inmutable — refuerzo visual. */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div>
            <strong className="font-black uppercase tracking-wide">SKU inmutable:</strong> revisa el SKU antes de
            guardar — es el identificador compartido de la identidad y <strong>no podrá modificarse después</strong> de
            la creación (ninguna interfaz ni operación del backend lo permite).
          </div>
        </div>

        {saving && (
          <div className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Creando producto en el catálogo de la organización…
          </div>
        )}
      </div>
    </BaseModal>
  );
};

export default CreateMasterProductModal;
