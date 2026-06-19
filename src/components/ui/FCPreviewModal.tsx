'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FCStatusBadge } from '@/components/ui/FCStatusBadge';
import { useAutoGenerateFC, useDeleteProductCostSheet } from '@/hooks/api/useProductCostSheet';
import type { ProductFCStatus } from '@/contracts/product-cost-sheet';
import type { FCPdfFormat } from '@/contracts/store-cost-template';
import { FileText, Download, Loader2, AlertCircle, Trash2, RefreshCw } from 'lucide-react';
import { authHeaders } from '@/services/store-api-client';

// ============================================
// Props
// ============================================

interface FCPreviewModalProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  storeId: string;
  fcStatus: ProductFCStatus;
  pdfFormat?: FCPdfFormat;
  /** ID del cost sheet existente (para poder eliminarlo) */
  costSheetId?: string | null;
}

// ============================================
// Internal states
// ============================================

type ModalViewMode = 'loading' | 'preview' | 'generate' | 'regenerating' | 'no_template' | 'error';

// ============================================
// Component
// ============================================

export function FCPreviewModal({
  open,
  onClose,
  productId,
  productName,
  storeId,
  fcStatus,
  pdfFormat = 'res148',
  costSheetId,
}: FCPreviewModalProps) {
  // Track the effective status — can change from pendiente → vigente after generation
  const [effectiveStatus, setEffectiveStatus] = useState<ProductFCStatus>(fcStatus);
  const [pdfLoadError, setPdfLoadError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  // FIX-FC-AUTH: Store PDF as blob URL so iframe can display it with auth
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // FIX-FC-RATE-LIMIT: Track in-flight fetch to prevent duplicate requests
  const fetchInProgressRef = useRef(false);

  // Sync external fcStatus changes via queueMicrotask to satisfy react-hooks/set-state-in-effect
  useEffect(() => {
    queueMicrotask(() => {
      setEffectiveStatus(fcStatus);
      setPdfLoadError(false);
    });
  }, [fcStatus]);

  const autoGenerateMutation = useAutoGenerateFC();
  const deleteMutation = useDeleteProductCostSheet();

  // Build the PDF URL
  const pdfUrl = useMemo(
    () =>
      `/api/product-cost-sheets/quick-pdf?product_id=${encodeURIComponent(productId)}&store_id=${encodeURIComponent(storeId)}&pdf_format=${encodeURIComponent(pdfFormat)}`,
    [productId, storeId, pdfFormat],
  );

  // Determine the current view mode
  const viewMode: ModalViewMode = useMemo(() => {
    if (pdfLoadError) return 'error';
    if (isRegenerating) return 'regenerating';
    if (autoGenerateMutation.isPending || deleteMutation.isPending) return 'loading';
    if (effectiveStatus === 'vigente') return pdfLoading ? 'loading' : 'preview';
    if (effectiveStatus === 'pendiente') return 'generate';
    return 'no_template';
  }, [effectiveStatus, pdfLoadError, autoGenerateMutation.isPending, deleteMutation.isPending, pdfLoading, isRegenerating]);

  // FIX-FC-AUTH: Fetch PDF with auth header when in preview mode
  // FIX-FC-RATE-LIMIT: Only fetch once per open+preview cycle, not on every viewMode change
  useEffect(() => {
    // Only fetch when: modal is open, status is vigente, no fetch in progress, no blob URL yet
    if (open && effectiveStatus === 'vigente' && !fetchInProgressRef.current && !pdfBlobUrl) {
      fetchInProgressRef.current = true;
      setPdfLoading(true);
      setPdfLoadError(false);

      fetch(pdfUrl, { method: 'GET', headers: authHeaders() })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          setPdfBlobUrl(url);
          setPdfLoading(false);
          fetchInProgressRef.current = false;
        })
        .catch(() => {
          setPdfLoadError(true);
          setPdfLoading(false);
          fetchInProgressRef.current = false;
        });
    }

    // Cleanup: revoke blob URL when modal closes
    if (!open && pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
      fetchInProgressRef.current = false;
    }
  }, [open, effectiveStatus, pdfUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: revoke and reset PDF blob
  const resetPdfBlob = useCallback(() => {
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    fetchInProgressRef.current = false;
  }, [pdfBlobUrl]);

  // Handlers
  const handleGenerate = useCallback(async () => {
    try {
      const result = await autoGenerateMutation.mutateAsync({
        product_id: productId,
        store_id: storeId,
      });
      if (result.data?.generated) {
        setEffectiveStatus('vigente');
        setPdfLoadError(false);
        setPdfLoading(true);
        // pdfBlobUrl is null, so the useEffect above will trigger the fetch
      }
    } catch {
      // Error toast is handled by the mutation hook
    }
  }, [autoGenerateMutation, productId, storeId]);

  // Delete + Regenerate: soft-delete the existing FC, then auto-generate a new one
  const handleDeleteAndRegenerate = useCallback(async () => {
    if (!costSheetId) return;
    setIsRegenerating(true);
    try {
      // 1. Soft-delete existing FC
      await deleteMutation.mutateAsync({ cost_sheet_id: costSheetId });

      // 2. Clear PDF state
      resetPdfBlob();
      setPdfLoadError(false);

      // 3. Generate new FC with current template
      const result = await autoGenerateMutation.mutateAsync({
        product_id: productId,
        store_id: storeId,
      });

      if (result.data?.generated) {
        setEffectiveStatus('vigente');
        setPdfLoading(true);
        // pdfBlobUrl is null, so the useEffect above will trigger the fetch
      } else {
        // If generation returned but not "generated" (e.g. needs_template), go to pendiente
        setEffectiveStatus('pendiente');
      }
    } catch {
      // Error toast handled by mutation hooks
      // Revert status if something went wrong
      setEffectiveStatus('vigente');
    } finally {
      setIsRegenerating(false);
    }
  }, [costSheetId, deleteMutation, autoGenerateMutation, productId, storeId, resetPdfBlob]);

  const handleRetry = useCallback(() => {
    resetPdfBlob();
    setPdfLoadError(false);
    // The useEffect will detect pdfBlobUrl is null and effectiveStatus is vigente → re-fetch
  }, [resetPdfBlob]);

  const handleExportPdf = useCallback(async () => {
    try {
      const response = await fetch(pdfUrl, {
        method: 'GET',
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error('Error al descargar PDF');
      }
      const blob = await response.blob();
      // Create a download link instead of window.open for better UX
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `FC_${productName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revoke after a small delay to ensure download starts
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      // No fallback to direct URL — it won't work without auth headers
      setPdfLoadError(true);
    }
  }, [pdfUrl, productName]);

  const handleIframeLoad = useCallback(() => {
    setPdfLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setPdfLoading(false);
    setPdfLoadError(true);
  }, []);

  // Reset internal state when modal closes
  const handleClose = useCallback(() => {
    setPdfLoadError(false);
    setPdfLoading(false);
    setIsRegenerating(false);
    onClose();
  }, [onClose]);

  const isBusy = autoGenerateMutation.isPending || deleteMutation.isPending || isRegenerating;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        className="
          fc-preview-modal-content
          sm:max-w-[80vw] w-full
          max-h-[95vh] sm:max-h-[90vh]
          flex flex-col
          p-0 gap-0
          overflow-hidden
        "
        aria-labelledby="fc-preview-title"
      >
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0 border-b border-border">
          <div className="flex items-center gap-3">
            <DialogTitle id="fc-preview-title" className="flex items-center gap-2 text-base">
              <FileText className="size-5 text-primary shrink-0" />
              <span className="truncate">Ficha de Costo — {productName}</span>
            </DialogTitle>
            <FCStatusBadge status={effectiveStatus} variant="pill" />
          </div>
          <DialogDescription className="sr-only">
            Vista previa y opciones de exportación de la Ficha de Costo para {productName}
          </DialogDescription>
        </DialogHeader>

        {/* ── Body ── */}
        <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
          {/* Loading state */}
          {(viewMode === 'loading' || viewMode === 'regenerating') && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-muted-foreground">
              <Loader2 className="size-10 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {isRegenerating
                  ? 'Regenerando Ficha de Costo…'
                  : autoGenerateMutation.isPending
                  ? 'Generando Ficha de Costo…'
                  : deleteMutation.isPending
                  ? 'Eliminando FC anterior…'
                  : 'Cargando vista previa…'}
              </p>
            </div>
          )}

          {/* PDF Preview (vigente) */}
          {viewMode === 'preview' && (
            <div className="relative w-full h-full min-h-[300px]">
              {pdfLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              )}
              <iframe
                src={pdfBlobUrl || ''}
                className="w-full h-full min-h-[400px] md:min-h-[500px] rounded border border-border bg-white"
                title={`Vista previa FC — ${productName}`}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            </div>
          )}

          {/* Generate prompt (pendiente) */}
          {viewMode === 'generate' && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center">
              <div className="rounded-full bg-warning/10 p-4">
                <AlertCircle className="size-10 text-warning" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Ficha de Costo pendiente de generación
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Este producto tiene una plantilla configurada pero aún no se ha generado
                  la Ficha de Costo. Pulse el botón para generarla automáticamente.
                </p>
              </div>
              <Button onClick={handleGenerate} disabled={autoGenerateMutation.isPending}>
                {autoGenerateMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generando…
                  </>
                ) : (
                  <>
                    <FileText className="size-4" />
                    Generar FC
                  </>
                )}
              </Button>
            </div>
          )}

          {/* No template (sin_fc) */}
          {viewMode === 'no_template' && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center">
              <div className="rounded-full bg-muted/50 p-4">
                <AlertCircle className="size-10 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Sin plantilla configurada para esta tienda
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  No se ha configurado una plantilla de Ficha de Costo para esta tienda.
                  Configure una en los ajustes de la tienda para habilitar la generación automática.
                </p>
              </div>
              <Button
                variant="outline"
                asChild
              >
                <a href={`/settings/stores/${storeId}`}>
                  <FileText className="size-4" />
                  Ir a ajustes de tienda
                </a>
              </Button>
            </div>
          )}

          {/* Error state */}
          {viewMode === 'error' && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertCircle className="size-10 text-destructive" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Error al cargar la vista previa
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  No se pudo cargar el PDF de la Ficha de Costo. Intente nuevamente o
                  exporte el PDF directamente.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRetry}>
                  Reintentar
                </Button>
                <Button onClick={handleExportPdf}>
                  <Download className="size-4" />
                  Exportar PDF
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="px-6 py-4 shrink-0 border-t border-border gap-2">
          {effectiveStatus === 'vigente' && !pdfLoadError && (
            <>
              <Button variant="outline" onClick={handleExportPdf}>
                <Download className="size-4" />
                Exportar PDF
              </Button>
              <Button
                variant="outline"
                onClick={handleDeleteAndRegenerate}
                disabled={isBusy || !costSheetId}
                className="text-warning border-warning/30 hover:bg-warning/10 hover:text-warning"
              >
                <RefreshCw className="size-4" />
                Eliminar y Regenerar
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={handleClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FCPreviewModal;
