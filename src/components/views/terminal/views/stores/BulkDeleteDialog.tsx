'use client';

/**
 * @file BulkDeleteDialog.tsx
 * @description Iteración 8 — Dialog orchestrator para bulk delete/archive.
 *
 * Maneja el flujo completo:
 *   1. Preview (valida dependencias + identifica protegidas)
 *   2. Muestra BulkPreviewPanel con resultado
 *   3. Si can_proceed: muestra BulkConfirmationFlow
 *   4. Si !can_proceed: solo muestra blockers, no permite continuar
 *
 * Estados:
 *   - 'loading' — preview en curso
 *   - 'preview' — mostrando resultados del preview
 *   - 'confirm' — flujo de confirmación activo
 *   - 'error' — error en preview
 *
 * Seguridad:
 *   - No guarda tokens en localStorage
 *   - Si se cierra el dialog, el estado se resetea
 *   - Refresh de página → volver a preview
 */

import React, { useState, useEffect } from 'react';
import { Loader2, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { BulkPreviewPanel } from './BulkPreviewPanel';
import { BulkConfirmationFlow } from './BulkConfirmationFlow';
import {
  useBulkPreview,
  useBulkExecute,
  type BulkPreviewResult,
} from '@/hooks/api/useStores';
import { toast } from 'sonner';

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeIds: string[];
  action: 'delete' | 'archive';
  onComplete?: (result: { success: boolean; processed?: number; failed?: number }) => void;
}

type DialogState = 'loading' | 'preview' | 'confirm' | 'error';

export function BulkDeleteDialog({
  open,
  onOpenChange,
  storeIds,
  action,
  onComplete,
}: BulkDeleteDialogProps) {
  const [state, setState] = useState<DialogState>('loading');
  const [previewData, setPreviewData] = useState<BulkPreviewResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const previewMutation = useBulkPreview();

  // Trigger preview when dialog opens
  useEffect(() => {
    if (open && storeIds.length > 0) {
      setState('loading');
      setErrorMsg(null);
      setPreviewData(null);

      previewMutation.mutate(
        { storeIds, action },
        {
          onSuccess: (data) => {
            setPreviewData(data);
            setState('preview');
          },
          onError: (error: unknown) => {
            setErrorMsg(error instanceof Error ? error.message : 'Error en preview');
            setState('error');
          },
        }
      );
    }
  }, [open, storeIds, action]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state after dialog closes
      setTimeout(() => {
        setState('loading');
        setPreviewData(null);
        setErrorMsg(null);
      }, 300);
    }
    onOpenChange(newOpen);
  };

  const handleComplete = (result: { success: boolean; processed?: number; failed?: number }) => {
    if (result.success) {
      const verb = action === 'delete' ? 'eliminadas' : 'archivadas';
      toast.success(`${result.processed || 0} tienda(s) ${verb}`);
    } else {
      toast.error('Operación falló — revisa los blockers');
    }
    onComplete?.(result);
    handleOpenChange(false);
  };

  const actionLabel = action === 'delete' ? 'Eliminación' : 'Archivado';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{actionLabel} masiva de tiendas</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            {storeIds.length} tienda(s) seleccionada(s) — {action === 'delete' ? 'operación destructiva' : 'datos conservados'}
          </DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {state === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
              <div className="font-bold text-foreground">Validando dependencias...</div>
              <div className="text-sm text-muted-foreground mt-1">
                Verificando transfers, recepciones, caja, reservas y compras
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="p-6">
            <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <AlertCircle className="w-6 h-6 text-destructive shrink-0" />
              <div>
                <div className="font-bold text-destructive">Error en preview</div>
                <div className="text-sm text-muted-foreground">{errorMsg}</div>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {/* Preview state */}
        {state === 'preview' && previewData && (
          <div className="space-y-4">
            <BulkPreviewPanel preview={previewData} action={action} />

            {previewData.can_proceed ? (
              <>
                <div className="border-t pt-4">
                  <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    Confirmación
                  </div>
                  <BulkConfirmationFlow
                    preview={previewData}
                    storeIds={storeIds}
                    action={action}
                    onComplete={handleComplete}
                    onCancel={() => handleOpenChange(false)}
                  />
                </div>
              </>
            ) : (
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
