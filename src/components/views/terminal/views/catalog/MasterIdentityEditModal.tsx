'use client';

/**
 * MasterIdentityEditModal — MISIÓN GESTIÓN DE PRODUCTOS VINCULADOS AL
 * CATÁLOGO MAESTRO (2026-11-11) · CORRECCIÓN FUNCIONAL (2026-11-12).
 *
 * Edición de la IDENTIDAD COMPARTIDA (nombre, imagen y descripción) de un
 * producto del Catálogo Maestro, accesible directamente desde la pestaña
 * «Catálogo» de Inventario (filas solo-maestro y filas locales vinculadas)
 * y desde el modal «Catálogo de la organización» (interfaz alternativa).
 *
 * Reglas de arquitectura respetadas (verificadas en auditoría previa):
 *  · El NOMBRE, la imagen y la descripción del maestro son atributos
 *    COMPARTIDOS por todas las tiendas de la organización vinculadas a ese
 *    producto: la edición se realiza en el registro maestro, nunca en copias
 *    locales (fn_master_apply_identity_changes propaga nombre e imagen a
 *    las filas vinculadas; la descripción compartida es la base de las
 *    tiendas que no personalizan la suya).
 *  · Escritura EXCLUSIVA vía RPC certificadas (el cliente jamás escribe
 *    master_products): gobernador → update_master_product (aplicación
 *    inmediata con auditoría por campo); no gobernador → propose_master_
 *    change (queda pendiente de aprobación del gobernador).
 *  · El alcance GLOBAL del cambio queda claro para el usuario ANTES de
 *    guardar (brief §3: «Cuando una modificación tenga alcance global… ese
 *    alcance debe quedar claro para el usuario antes de guardar»).
 *  · Sin campos duplicados ni relaciones paralelas: mismos buckets/tablas/RPCs.
 *
 * El SKU NO se edita aquí NI EN NINGUNA INTERFAZ: compartido e INMUTABLE
 * después de la creación (brief 2026-11-12 §2; ERR_SKU_IMMUTABLE en el
 * punto único de escritura del servidor). Se muestra como campo protegido.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Building2, Camera, ImagePlus, Loader2, Lock, X } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { getSupabaseUrl, getProductImageUrl } from '@/lib/utils';
import { compressImage, validateImageFile } from '@/lib/image-compress';
import { supabase } from '@/lib/supabaseClient';
import { useMasterProductIdentity, useUpdateMasterProduct, useProposeMasterChange, type MasterChanges } from '@/hooks/api/useMasterCatalog';
import { toast } from 'sonner';
import type { Product } from '@/types';

export interface MasterIdentityEditModalProps {
  /** Fila del catálogo (source='master' sin fila local, o local vinculada). */
  product: Product | null;
  open: boolean;
  onClose: () => void;
  /** Tienda activa — origen de la operación (auditoría/propuestas). */
  storeId: string | null;
  /** ¿El usuario es gobernador del catálogo de la organización? */
  isGovernor: boolean;
}

function translateMasterError(msg: string): string {
  if (msg.includes('ERR_MASTER_NOT_FOUND')) return 'El producto maestro ya no existe en la organización.';
  if (msg.includes('ERR_UNAUTHORIZED')) return 'Sin permiso para esta operación (gobernador del catálogo).';
  if (msg.includes('ERR_SKU_IMMUTABLE')) return 'El SKU es compartido e inmutable: no puede modificarse después de la creación del producto.';
  if (msg.includes('ERR_SKU_LOCKED_BY_MOVEMENTS')) return 'El SKU está bloqueado: el producto tiene movimientos históricos.';
  if (msg.includes('ERR_STORE_NOT_CONNECTED')) return 'Esta tienda no está conectada al catálogo de la organización.';
  return msg;
}

/** Resuelve el id del maestro desde la fila del catálogo. */
export function resolveMasterId(product: Product | null): string | null {
  if (!product) return null;
  if (product.master_product_id) return product.master_product_id;
  // Filas solo-maestro: el id listado ES el del maestro (COALESCE(p.id, m.id)
  // en get_paginated_products_v2 — sin fila local en esta tienda).
  if (product.source === 'master') return product.id;
  return null;
}

export const MasterIdentityEditModal: React.FC<MasterIdentityEditModalProps> = ({
  product,
  open,
  onClose,
  storeId,
  isGovernor,
}) => {
  const masterId = open ? resolveMasterId(product) : null;
  const identity = useMasterProductIdentity(masterId, open);

  const updateMaster = useUpdateMasterProduct(storeId);
  const proposeMaster = useProposeMasterChange(storeId);

  // CORRECCIÓN FUNCIONAL (2026-11-12) §3.B: el NOMBRE forma parte de la
  // identidad compartida editable del catálogo (junto a imagen y descripción).
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Hidratar el formulario con la identidad vigente del maestro.
  useEffect(() => {
    if (!open) return;
    setName(identity.data?.name ?? '');
    setDescription(identity.data?.description ?? '');
    setImageFile(null);
    const persisted = identity.data?.image_path
      ? (getSupabaseUrl('product-images', identity.data.image_path) ?? null)
      : null;
    setImagePreview(persisted);
  }, [open, identity.data]);

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
    const persisted = identity.data?.image_path
      ? (getSupabaseUrl('product-images', identity.data.image_path) ?? null)
      : null;
    if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImagePreview(persisted);
  }, [identity.data, imagePreview]);

  /** Sube la imagen nueva al bucket product-images (nombre único por UUID). */
  const uploadMasterImage = useCallback(async (): Promise<string> => {
    if (!masterId || !imageFile) throw new Error('Sin imagen seleccionada');
    const compressed = await compressImage(imageFile);
    const fileExt = (imageFile.name.split('.').pop() || 'webp').toLowerCase();
    const fileName = `master-${masterId}-${crypto.randomUUID()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, compressed, { cacheControl: 'public, max-age=31536000, immutable' });
    if (uploadError) throw uploadError;
    return fileName;
  }, [masterId, imageFile]);

  const handleSave = useCallback(async () => {
    if (!masterId) return;
    // Validación ANTES de cualquier escritura: el diálogo NO se cierra si
    // hay error de validación (brief §7: «Evitar cerrar el diálogo cuando
    // exista un error de validación»).
    const nextName = name.trim();
    if (!nextName) {
      toast.error('El nombre compartido es obligatorio');
      return;
    }
    if (nextName.length > 150) {
      toast.error('El nombre no debe superar los 150 caracteres');
      return;
    }
    setIsSaving(true);
    let uploadedFileName: string | null = null;
    try {
      const changes: MasterChanges = {};
      if (nextName !== (identity.data?.name ?? '')) {
        changes.name = nextName;
      }
      const nextDescription = description.trim();
      if (nextDescription !== (identity.data?.description ?? '')) {
        changes.description = nextDescription || null;
      }
      if (imageFile) {
        uploadedFileName = await uploadMasterImage();
        changes.image_path = uploadedFileName;
      }
      if (Object.keys(changes).length === 0) {
        toast.info('No hay cambios que guardar');
        setIsSaving(false);
        return;
      }

      if (isGovernor) {
        await updateMaster.mutateAsync({ masterId, changes });
        toast.success('Identidad compartida actualizada (nombre, imagen o descripción; se refleja en las tiendas vinculadas)');
      } else {
        if (!storeId) throw new Error('Sin tienda activa');
        await proposeMaster.mutateAsync({ masterId, changes });
        toast.success('Propuesta creada: quedará pendiente de aprobación por el gobernador del catálogo');
      }
      onClose();
    } catch (e) {
      // Sin aplicar: limpiar el archivo subido para no dejar huérfanos.
      if (uploadedFileName) {
        try { await supabase.storage.from('product-images').remove([uploadedFileName]); } catch { /* best-effort */ }
      }
      const msg = e instanceof Error ? e.message : 'Error al guardar la identidad compartida';
      toast.error(translateMasterError(msg));
    } finally {
      setIsSaving(false);
    }
  }, [masterId, name, description, imageFile, identity.data, isGovernor, storeId, updateMaster, proposeMaster, uploadMasterImage, onClose]);

  const productName = product?.name ?? identity.data?.name ?? '';
  const productSku = product?.sku ?? identity.data?.sku ?? '';

  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Identidad compartida del catálogo"
      description={`${productSku ? `SKU ${productSku} · ` : ''}${productName}. Nombre, imagen y descripción compartidos por las tiendas de la organización vinculadas a este producto.`}
      maxWidth="sm:max-w-xl"
      footer={
        <>
          <SecondaryButton onClick={onClose} label="Cancelar" className="flex-1" disabled={isSaving} />
          <PrimaryButton
            onClick={handleSave}
            label={isSaving ? 'Guardando…' : (isGovernor ? 'Guardar cambios compartidos' : 'Proponer cambio')}
            icon={isGovernor ? undefined : undefined}
            disabled={isSaving || identity.isLoading || !masterId}
            className="flex-1"
          />
        </>
      }
    >
      <div className="space-y-4">
        {/* ALCANCE GLOBAL — claro ANTES de guardar (brief §3). */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div>
            <strong className="font-black uppercase tracking-wide">Alcance global:</strong>{' '}
            estos datos se guardan en el <strong>registro maestro compartido</strong> y afectan a
            todas las tiendas de la organización vinculadas a este producto. {isGovernor
              ? 'Como gobernador del catálogo, el cambio se aplica de inmediato.'
              : 'Como no eres gobernador del catálogo, el cambio quedará pendiente de aprobación.'}
            {!isGovernor && ' '}La descripción compartida se usa como base en las tiendas que no hayan personalizado la suya.
          </div>
        </div>

        {/* SKU PROTEGIDO — compartido e inmutable tras la creación (brief
            2026-11-12 §2/§7: identificado claramente como campo no editable). */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <label className="text-xs font-black uppercase tracking-widest ml-1" htmlFor="master-identity-sku">
            SKU (protegido)
          </label>
          <div className="mt-1.5 flex items-center gap-2" id="master-identity-sku">
            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="font-mono text-sm font-bold px-2 py-1 rounded bg-muted" data-testid="master-identity-sku-value">
              {productSku || '—'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Compartido e inmutable: no puede modificarse después de la creación del producto.
            </span>
          </div>
        </div>

        {identity.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando identidad del catálogo…
          </div>
        ) : !identity.data ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            No se pudo leer la identidad compartida del producto. Verifica la conexión de la tienda al
            catálogo de la organización e inténtalo de nuevo.
          </div>
        ) : (
          <>
            {/* Nombre compartido — CORRECCIÓN FUNCIONAL (2026-11-12) §3.B:
                el nombre forma parte de la identidad compartida del catálogo
                y se edita en el registro maestro (propagación a todas las
                tiendas vinculadas vía fn_master_apply_identity_changes). */}
            <div>
              <label htmlFor="master-identity-name" className="text-xs font-black uppercase tracking-widest ml-1">
                Nombre compartido
              </label>
              <input
                id="master-identity-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={150}
                disabled={isSaving}
                aria-label="Nombre compartido del producto"
                className="neu-input w-full font-bold"
                placeholder="Nombre visible en todas las tiendas vinculadas"
                data-testid="master-identity-name-input"
              />
              <p className="text-[10px] text-muted-foreground italic ml-1 mt-1">
                Se guarda en el registro maestro y se refleja automáticamente en todas las tiendas vinculadas.
              </p>
            </div>

            {/* Imagen compartida */}
            <div>
              <label className="text-xs font-black uppercase tracking-widest ml-1" htmlFor="master-identity-image">
                Imagen compartida
              </label>
              <div className="mt-2 flex items-center gap-3" id="master-identity-image">
                {imagePreview ? (
                  <div className="relative group">
                    <img
                      src={/^(https?:|blob:|data:)/.test(imagePreview)
                        ? imagePreview
                        : (getProductImageUrl(imagePreview) || imagePreview)}
                      alt="Imagen compartida actual"
                      className="w-20 h-20 rounded-xl object-cover border border-border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg transition-opacity"
                      aria-label="Descartar imagen nueva"
                      title="Descartar imagen nueva (mantiene la vigente)"
                      disabled={isSaving || !imageFile}
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
                      disabled={isSaving}
                    >
                      <Camera className="w-3.5 h-3.5" /> Cámara
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-xs font-bold transition-colors"
                      disabled={isSaving}
                    >
                      <ImagePlus className="w-3.5 h-3.5" /> Galería
                    </button>
                  </div>
                )}
                <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />
                <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />
                {imagePreview && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => galleryRef.current?.click()}
                      disabled={isSaving}
                      aria-label="Cambiar imagen compartida"
                    >
                      <Building2 className="h-3.5 w-3.5 mr-1.5" /> Cambiar imagen
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground italic ml-1 mt-1">
                La nueva imagen se propaga a las tiendas vinculadas sin generar copias por tienda.
              </p>
            </div>

            {/* Descripción compartida */}
            <div>
              <label htmlFor="master-identity-description" className="text-xs font-black uppercase tracking-widest ml-1">
                Descripción compartida
              </label>
              <textarea
                id="master-identity-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                disabled={isSaving}
                aria-label="Descripción compartida del producto"
                className="neu-input w-full resize-y"
                placeholder="Descripción visible para las tiendas de la organización que no personalicen la suya…"
              />
              <p className="text-[10px] text-muted-foreground italic ml-1">
                {description.length}/2000 caracteres. Cada tienda puede personalizar su propia descripción local desde su edición de producto.
              </p>
            </div>

            {/* El SKU ya se muestra arriba como campo protegido: compartido
                e inmutable tras la creación (brief 2026-11-12 §2). */}
          </>
        )}
      </div>
    </BaseModal>
  );
};

export default MasterIdentityEditModal;
