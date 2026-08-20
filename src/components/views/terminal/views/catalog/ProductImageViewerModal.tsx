'use client';

/**
 * ProductImageViewerModal
 *
 * Visor y editor de imagen de producto accesible directamente desde el catálogo.
 *
 * Funciones:
 *   - Ver imagen ampliada
 *   - Recortar (selección visual, aspect ratio 1:1, previsualización)
 *   - Cambiar imagen (cargar nueva, opcionalmente recortar antes de guardar)
 *   - Guardar cambios (upload a bucket + UPDATE products.image_url + GC archivo anterior)
 *   - Cancelar (sin modificar)
 *   - Eliminar imagen (acción destructiva: null + remove del bucket)
 *
 * NO reemplaza EditProductModal — es una vía rápida para gestionar solo la imagen.
 * Reutiliza:
 *   - catalogService.uploadProductImage() (servicio existente, con GC)
 *   - catalogService.deleteProductImage() (nuevo, con storage cleanup)
 *   - compressImage() (lib/image-compress)
 *   - cropImage() (lib/image-crop — Canvas-based, sin dependencias)
 *   - getProductImageUrl() (lib/utils)
 *
 * Aspect ratio 1:1: el catálogo renderiza imágenes en contenedores
 * `aspect-square sm:aspect-video` con `object-cover` (ver ProductCard y table).
 * `object-cover` recorta al aspect del contenedor. Para consistencia entre
 * grid y table, y para evitar que el crop final se deforme en cualquier
 * contenedor, el output del recorte es cuadrado 1024×1024px. Las imágenes
 * verticales/horizontales se centran con `object-contain` en el modal y
 * `object-cover` en el catálogo — no se deforman.
 *
 * Patrón de modal: BaseModal (sticky header/footer + focus trap + mobile-first)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import {
  ZoomIn, Crop as CropIcon, RefreshCw, Save, X, Upload, Trash2,
  ImageOff, AlertTriangle, Loader2, Maximize2, RotateCcw,
} from 'lucide-react';
import { cn, getProductImageUrl } from '@/lib/utils';
import { catalogService } from '@/services/catalog-service';
import { compressImage } from '@/lib/image-compress';
import {
  cropImageElement, loadImageFromFile, loadImageFromUrl,
  constrainCropArea, defaultCropArea, type CropArea,
} from '@/lib/image-crop';
import { toast } from 'sonner';
import type { Product } from '@/types';

export interface ProductImageViewerModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  /** Callback after a successful image save/delete; should refetch products. */
  onImageChanged?: (productId: string, newImageUrl: string | null) => void;
}

type Mode = 'view' | 'crop';

interface DragState {
  dragging: boolean;
  startX: number; // pointer X at drag start
  startY: number;
  originX: number; // crop area origin at drag start
  originY: number;
  mode: 'move' | 'resize-se'; // which handle is being dragged
}

const ASPECT = 1; // square (catalog renders object-cover in square/video containers)
const CROP_OUTPUT_PX = 1024;
const MIN_CROP_PX = 64; // minimum crop size in image-natural pixels
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']);

/**
 * Validate image file by inspecting its actual content (magic bytes),
 * not just the MIME type reported by the browser (which is extension-based).
 *
 * This catches attacks where a non-image file is renamed to .jpg.
 */
function validateImageFileContent(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Solo se permiten archivos de imagen (JPG, PNG, WebP, GIF, BMP)';
  }
  if (!ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return `Formato no soportado: ${file.type}. Usa JPG, PNG, WebP, GIF o BMP.`;
  }
  if (file.size === 0) return 'El archivo de imagen está vacío';
  if (file.size > MAX_FILE_SIZE_BYTES) return `La imagen no debe superar los 10 MB`;
  return null;
}

/**
 * Deeper content-based validation: read the first few bytes of the file and
 * check against known image magic bytes. This is the ONLY way to be sure
 * the file is actually an image (browser MIME is just extension-based).
 */
async function validateImageMagicBytes(file: File): Promise<string | null> {
  // Read first 16 bytes
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  // JPEG: FFD8FF
  const isJpeg = header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;
  // PNG: 89504E470D0A1A0A
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
  // WebP: RIFF....WEBP
  const isWebp = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  // GIF: GIF87a or GIF89a
  const isGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && (header[3] === 0x38);
  // BMP: 424D (BM)
  const isBmp = header[0] === 0x42 && header[1] === 0x4D;

  if (!isJpeg && !isPng && !isWebp && !isGif && !isBmp) {
    return 'El archivo no contiene una imagen válida (magic bytes no reconocidos).';
  }
  return null;
}

export function ProductImageViewerModal({
  product,
  open,
  onClose,
  onImageChanged,
}: ProductImageViewerModalProps) {
  // === Source image state ===
  // `sourceUrl` is what's currently shown in the viewer. It can be:
  //   - the product's persisted image_url (read-only initial state)
  //   - a blob: URL for a newly picked file (not yet saved)
  //   - a blob: URL for a cropped result (not yet saved)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  // `sourceIsPersisted` is true when sourceUrl is the DB-saved image (no save needed).
  const [sourceIsPersisted, setSourceIsPersisted] = useState<boolean>(true);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // === UI state ===
  const [mode, setMode] = useState<Mode>('view');
  const [zoom, setZoom] = useState<number>(1);
  const [crop, setCrop] = useState<CropArea | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // === Refs for crop drag interaction ===
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgWrapperRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  // === Ref for race condition prevention (double-click on Save) ===
  // We use a ref in addition to the isSaving state because state updates are
  // async — between the first click and setIsSaving(true), a second click
  // could slip through. The ref is set synchronously.
  const isSavingRef = useRef<boolean>(false);
  const isDeletingRef = useRef<boolean>(false);

  // === Reset state when modal opens or product changes ===
  useEffect(() => {
    if (!open || !product) return;
    setError(null);
    setMode('view');
    setZoom(1);
    setCrop(null);
    setSourceFile(null);
    setIsSaving(false);
    setIsDeleting(false);
    isSavingRef.current = false;
    isDeletingRef.current = false;
    const persistedUrl = product.image_url
      ? getProductImageUrl(product.image_url)
      : product.public_image_url
        ? getProductImageUrl(product.public_image_url)
        : null;
    setSourceUrl(persistedUrl);
    setSourceIsPersisted(true);
    setImageNaturalSize(null);
  }, [open, product]);

  // === Revoke object URLs when sourceUrl changes OR on unmount ===
  // We track the previous blob URL in a ref so we can revoke it on the
  // NEXT change (not on the current render, which would break the visible image).
  const prevBlobUrlRef = useRef<string | null>(null);
  useEffect(() => {
    // If we had a previous blob URL and we're switching to a different one,
    // revoke the previous one.
    if (prevBlobUrlRef.current && prevBlobUrlRef.current !== sourceUrl) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
    }
    prevBlobUrlRef.current = sourceUrl && sourceUrl.startsWith('blob:') ? sourceUrl : null;
  }, [sourceUrl]);

  // On unmount: revoke any lingering blob URL
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
        prevBlobUrlRef.current = null;
      }
    };
  }, []);

  // === Image onLoad: capture natural dimensions for crop math ===
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // === Pick a new file (replace flow) ===
  const handlePickFile = useCallback(async (file: File) => {
    setError(null);
    // Step 1: extension/MIME/size validation (fast)
    const fastErr = validateImageFileContent(file);
    if (fastErr) {
      setError(fastErr);
      toast.error(fastErr);
      return;
    }
    // Step 2: magic-bytes content validation (slow but secure)
    const contentErr = await validateImageMagicBytes(file);
    if (contentErr) {
      setError(contentErr);
      toast.error(contentErr);
      return;
    }
    try {
      // Revoke previous blob URL (defensive — the effect also does this)
      if (sourceUrl && sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
      const url = URL.createObjectURL(file);
      setSourceUrl(url);
      setSourceFile(file);
      setSourceIsPersisted(false);
      setMode('view');
      setZoom(1);
      setCrop(null);
      setImageNaturalSize(null);
      toast.success('Imagen cargada. Recorta si quieres y guarda.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo cargar la imagen.';
      setError(msg);
      toast.error(msg);
    }
  }, [sourceUrl]);

  // === Enter crop mode: initialize crop area at centered 80% square ===
  const enterCropMode = useCallback(async () => {
    if (!sourceUrl) return;
    if (!imageNaturalSize) {
      // Force-load to get natural dimensions if image came from URL
      try {
        const img = await loadImageFromUrl(sourceUrl);
        setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        const init = defaultCropArea(img.naturalWidth, img.naturalHeight);
        setCrop(init);
        setMode('crop');
      } catch (e) {
        toast.error('No se pudo cargar la imagen para recortar.');
      }
      return;
    }
    if (!crop) {
      const init = defaultCropArea(imageNaturalSize.w, imageNaturalSize.h);
      setCrop(init);
    }
    setMode('crop');
  }, [sourceUrl, imageNaturalSize, crop]);

  // === Cancel crop: revert to view mode, keep original source ===
  const cancelCrop = useCallback(() => {
    setMode('view');
    setCrop(null);
  }, []);

  // === Confirm crop: produce a new File and set as new source ===
  const confirmCrop = useCallback(async () => {
    if (!crop || !sourceUrl) return;
    setError(null);
    try {
      setIsSaving(true);
      // Load the source as HTMLImageElement (works for both blob: and https: URLs)
      const img = sourceFile
        ? await loadImageFromFile(sourceFile)
        : await loadImageFromUrl(sourceUrl);
      // Constrain crop to bounds (defensive)
      const safeArea = constrainCropArea(crop, img.naturalWidth, img.naturalHeight);
      const cropped = await cropImageElement(img, safeArea, {
        outputWidth: CROP_OUTPUT_PX,
        outputHeight: CROP_OUTPUT_PX,
        mimeType: 'image/webp',
        quality: 0.85,
      });
      // Note: prevBlobUrlRef effect will revoke the old blob URL on next render
      const newUrl = URL.createObjectURL(cropped);
      setSourceFile(cropped);
      setSourceUrl(newUrl);
      setSourceIsPersisted(false);
      setImageNaturalSize({ w: CROP_OUTPUT_PX, h: CROP_OUTPUT_PX });
      setMode('view');
      setZoom(1);
      setCrop(null);
      toast.success('Recorte aplicado. Guarda para confirmar.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo recortar la imagen.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [crop, sourceUrl, sourceFile]);

  // === Save: compress + upload to Supabase + UPDATE product ===
  // Race condition prevention: isSavingRef is set synchronously BEFORE any
  // async work, so a second click on Save (before React re-renders with the
  // disabled state) will see isSavingRef=true and bail out.
  const handleSave = useCallback(async () => {
    if (!product) return;
    if (isSavingRef.current) {
      // Already saving — ignore the second click
      return;
    }
    if (sourceIsPersisted) {
      // Nothing to save (image already persisted).
      onClose();
      return;
    }
    if (!sourceFile) {
      // Source is a URL (no new file/crop). Nothing to do.
      onClose();
      return;
    }
    setError(null);
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      // Compress before upload (matches existing EditProductModal flow)
      const compressed = await compressImage(sourceFile);
      // uploadProductImage now also GCs the previous file from storage
      const newFileName = await catalogService.uploadProductImage(product.id, compressed);
      toast.success('Imagen guardada correctamente');
      onImageChanged?.(product.id, newFileName);
      // Mark persisted so onClose doesn't try to revoke
      setSourceIsPersisted(true);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al guardar la imagen.';
      // FIX per spec: if save fails, keep previous image (don't update state to broken)
      setError(msg);
      toast.error('No se pudo guardar. La imagen anterior se conserva.');
      // Restore source to persisted (previous) image
      // prevBlobUrlRef effect will revoke the failed blob URL on next render
      const prevUrl = product.image_url
        ? getProductImageUrl(product.image_url)
        : product.public_image_url
          ? getProductImageUrl(product.public_image_url)
          : null;
      setSourceUrl(prevUrl);
      setSourceFile(null);
      setSourceIsPersisted(true);
      setMode('view');
      setCrop(null);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [product, sourceIsPersisted, sourceFile, sourceUrl, onClose, onImageChanged]);

  // === Delete: remove image_url + remove file from Storage (destructive, separated) ===
  const handleDelete = useCallback(async () => {
    if (!product) return;
    if (isDeletingRef.current) return;
    if (!window.confirm('¿Eliminar la imagen del producto? Esta acción no se puede deshacer.')) {
      return;
    }
    setError(null);
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      // Use catalogService.deleteProductImage which:
      //   1. nulls products.image_url
      //   2. removes the file from the product-images bucket (GC)
      await catalogService.deleteProductImage(product.id);
      toast.success('Imagen eliminada');
      onImageChanged?.(product.id, null);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar la imagen.';
      setError(msg);
      toast.error(msg);
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  }, [product, onClose, onImageChanged]);

  // === Crop drag handlers (mouse + touch unified via pointer events) ===
  const onCropPointerDown = useCallback((e: React.PointerEvent, handle: 'move' | 'resize-se') => {
    if (!crop || !imageNaturalSize) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: crop.x,
      originY: crop.y,
      mode: handle,
    };
  }, [crop, imageNaturalSize]);

  const onCropPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag || !drag.dragging || !imageNaturalSize || !crop) return;
    e.preventDefault();

    // Convert screen px delta to image-natural px delta using the rendered size
    const renderedImg = imgWrapperRef.current?.querySelector('img');
    if (!renderedImg) return;
    const renderedW = renderedImg.clientWidth;
    const renderedH = renderedImg.clientHeight;
    const scaleX = imageNaturalSize.w / renderedW;
    const scaleY = imageNaturalSize.h / renderedH;

    const dx = (e.clientX - drag.startX) * scaleX;
    const dy = (e.clientY - drag.startY) * scaleY;

    if (drag.mode === 'move') {
      const next: CropArea = {
        x: drag.originX + dx,
        y: drag.originY + dy,
        width: crop.width,
        height: crop.height,
      };
      setCrop(constrainCropArea(next, imageNaturalSize.w, imageNaturalSize.h));
    } else if (drag.mode === 'resize-se') {
      // Maintain square aspect ratio (ASPECT=1)
      const delta = Math.max(dx, dy);
      const newSide = Math.max(MIN_CROP_PX, Math.min(
        crop.width + delta,
        Math.min(imageNaturalSize.w - crop.x, imageNaturalSize.h - crop.y),
      ));
      setCrop({
        x: crop.x,
        y: crop.y,
        width: newSide,
        height: newSide,
      });
    }
  }, [crop, imageNaturalSize]);

  const onCropPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragStateRef.current) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    }
    dragStateRef.current = null;
  }, []);

  // === Reset zoom ===
  const resetZoom = useCallback(() => setZoom(1), []);

  // === Restore original (revert to persisted image, discarding local edits) ===
  const handleRestore = useCallback(() => {
    if (!product) return;
    // prevBlobUrlRef effect will revoke the old blob URL on next render
    const prevUrl = product.image_url
      ? getProductImageUrl(product.image_url)
      : product.public_image_url
        ? getProductImageUrl(product.public_image_url)
        : null;
    setSourceUrl(prevUrl);
    setSourceFile(null);
    setSourceIsPersisted(true);
    setMode('view');
    setZoom(1);
    setCrop(null);
    setError(null);
    setImageNaturalSize(null);
    toast.info('Imagen original restaurada (sin guardar cambios)');
  }, [product]);

  const hasImage = !!sourceUrl;
  const canSave = !sourceIsPersisted && !!sourceFile && !isSaving;
  const showRestore = !sourceIsPersisted;

  // === Hidden file input ===
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // === Render ===
  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={product ? `Imagen — ${product.name}` : 'Imagen del producto'}
      description={
        mode === 'crop'
          ? 'Arrastra el área para seleccionar lo que se conservará'
          : 'Visualiza, recorta o cambia la imagen del producto'
      }
      maxWidth="sm:max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          {mode === 'crop' ? (
            <>
              <Button variant="ghost" onClick={cancelCrop} disabled={isSaving}>
                <X className="w-4 h-4 mr-1" /> Cancelar recorte
              </Button>
              <Button onClick={confirmCrop} disabled={isSaving || !crop}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CropIcon className="w-4 h-4 mr-1" />}
                Aplicar recorte
              </Button>
            </>
          ) : (
            <>
              {showRestore && (
                <Button variant="ghost" onClick={handleRestore} disabled={isSaving}>
                  <RotateCcw className="w-4 h-4 mr-1" /> Restaurar original
                </Button>
              )}
              <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                <X className="w-4 h-4 mr-1" /> Cerrar
              </Button>
              {hasImage && (
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting || !sourceIsPersisted && !sourceFile}
                  title="Eliminar imagen del producto"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  Eliminar
                </Button>
              )}
              {canSave && (
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Guardar cambios
                </Button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'view' && hasImage && (
            <>
              <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}>
                <ZoomIn className="w-4 h-4 mr-1" /> Ampliar
              </Button>
              <Button variant="outline" size="sm" onClick={resetZoom} title="Restablecer zoom">
                <Maximize2 className="w-4 h-4 mr-1" /> 100%
              </Button>
              <Button variant="outline" size="sm" onClick={enterCropMode}>
                <CropIcon className="w-4 h-4 mr-1" /> Recortar
              </Button>
              <Button variant="outline" size="sm" onClick={triggerFilePicker}>
                <RefreshCw className="w-4 h-4 mr-1" /> Cambiar imagen
              </Button>
            </>
          )}
          {mode === 'view' && !hasImage && (
            <Button onClick={triggerFilePicker} disabled={isSaving}>
              <Upload className="w-4 h-4 mr-1" /> Agregar imagen
            </Button>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePickFile(f);
            e.target.value = ''; // allow re-picking same file
          }}
        />

        {/* Image canvas area */}
        <div
          ref={containerRef}
          className="relative w-full aspect-square sm:aspect-video bg-muted/30 rounded-lg overflow-hidden border border-border flex items-center justify-center select-none"
          style={{ minHeight: '280px' }}
        >
          {hasImage ? (
            <div
              ref={imgWrapperRef}
              className="relative w-full h-full flex items-center justify-center overflow-hidden"
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
            >
              <img
                src={sourceUrl || undefined}
                alt={product?.name || 'Producto'}
                onLoad={handleImageLoad}
                draggable={false}
                className="max-w-full max-h-full object-contain transition-transform duration-150 pointer-events-none"
                style={{ transform: mode === 'view' ? `scale(${zoom})` : 'scale(1)' }}
              />

              {/* Crop overlay */}
              {mode === 'crop' && crop && imageNaturalSize && (
                <CropOverlay
                  crop={crop}
                  natural={imageNaturalSize}
                  onPointerDown={onCropPointerDown}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageOff className="w-10 h-10 opacity-50" />
              <p className="text-sm">Sin imagen</p>
              <p className="text-xs">Haz clic en “Agregar imagen” para subir una.</p>
            </div>
          )}
        </div>

        {/* Help text */}
        {mode === 'crop' && (
          <p className="text-xs text-muted-foreground">
            Mantén presionado el área seleccionada para moverte. Arrastra la esquina inferior derecha para cambiar el tamaño.
            El resultado se guarda como cuadrado {CROP_OUTPUT_PX}×{CROP_OUTPUT_PX}px (formato catálogo).
          </p>
        )}
        {mode === 'view' && hasImage && !sourceIsPersisted && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Tienes cambios sin guardar. Presiona “Guardar cambios” para aplicarlos.
          </p>
        )}
      </div>
    </BaseModal>
  );
}

// === Sub-component: Crop overlay (visual selection box) ===
interface CropOverlayProps {
  crop: CropArea;
  natural: { w: number; h: number };
  onPointerDown: (e: React.PointerEvent, handle: 'move' | 'resize-se') => void;
}

function CropOverlay({ crop, natural, onPointerDown }: CropOverlayProps) {
  // Convert natural px to percentage so overlay scales with rendered image
  const left = (crop.x / natural.w) * 100;
  const top = (crop.y / natural.h) * 100;
  const width = (crop.width / natural.w) * 100;
  const height = (crop.height / natural.h) * 100;

  return (
    <>
      {/* Dark mask outside the crop area */}
      <div className="absolute inset-0 bg-black/60 pointer-events-none" />
      <div
        className="absolute bg-transparent border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
        }}
      />
      {/* Interactive layer (move + resize) */}
      <div
        className="absolute cursor-move touch-none"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        }}
        onPointerDown={(e) => onPointerDown(e, 'move')}
      />
      {/* Resize handle (bottom-right) */}
      <div
        className="absolute w-4 h-4 bg-white border border-black rounded-sm cursor-se-resize touch-none"
        style={{
          left: `calc(${left + width}% - 8px)`,
          top: `calc(${top + height}% - 8px)`,
        }}
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, 'resize-se'); }}
      />
    </>
  );
}
