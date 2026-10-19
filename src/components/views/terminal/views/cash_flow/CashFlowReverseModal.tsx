'use client';

/**
 * CashFlowReverseModal — anulación de un documento Ingreso/Egreso confirmado.
 *
 * Requisitos §9: permiso (admin/manager/encargado — espejo del RPC), motivo
 * OBLIGATORIO (≥ 3 caracteres), confirmación con documento e importe, efecto
 * revertido con fila contraria (nunca borrado), historia intacta e
 * imposibilidad de doble anulación (ERR_ALREADY_ANNULLED → 409).
 *
 * Patrón UX: ValeSalidaReverseModal / ReverseDocumentModal (focus-trap por
 * BaseModal, motivo con contador, error visible sin cerrar).
 */

import React, { useEffect, useState } from 'react';
import { Ban, Loader2, AlertTriangle } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { formatCurrency, cn, touch } from '@/lib/utils';
import { conceptLabel, ANNULMENT_REASON_MIN_LENGTH, ANNULMENT_REASON_MAX_LENGTH } from '@/lib/cash-flow/constants';
import { useReverseCashFlow } from '@/hooks/api/useCashFlow';
import type { CashFlowDocument } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  doc: CashFlowDocument | null;
}

export function CashFlowReverseModal({ isOpen, onClose, doc: d }: Props) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reverseMutation = useReverseCashFlow();

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
      reverseMutation.reset();
    }
  }, [isOpen]);

  if (!d) return null;

  const esIngreso = d.doc_type === 'ingreso';
  const canSubmit = reason.trim().length >= ANNULMENT_REASON_MIN_LENGTH && !reverseMutation.isPending;

  async function anular() {
    if (!canSubmit || !d) return;
    setError(null);
    try {
      await reverseMutation.mutateAsync({ document_id: d.id, reason: reason.trim() });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={o => { if (!o && !reverseMutation.isPending) onClose(); }}
      maxWidth="sm:max-w-lg"
      title={
        <span className="flex items-center gap-2">
          <Ban className="w-4 h-4 text-destructive" aria-hidden="true" /> Anular Documento de Caja
        </span>
      }
      description="La anulación revierte el efecto en caja con una fila contraria; el documento y su historia quedan intactos."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={reverseMutation.isPending}
            className="h-10 rounded-lg"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={anular}
            disabled={!canSubmit}
            className="h-10 rounded-lg font-black uppercase text-xs tracking-wide"
            aria-label="Confirmar anulación del documento"
          >
            {reverseMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Anulando…</>
            ) : (
              <><Ban className="w-4 h-4 mr-1.5" /> Anular {d.document_number}</>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Confirmación inequívoca: documento + importe + efecto */}
        <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Documento</span>
            <span className="font-mono font-black">{d.document_number}</span>
          </div>
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Tipo</span>
            <span className={cn('font-black uppercase', esIngreso ? 'text-success' : 'text-destructive')}>
              {esIngreso ? 'Ingreso' : 'Egreso'} · {conceptLabel(d.concept)}
            </span>
          </div>
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Importe</span>
            <span className="font-black tabular-nums">{formatCurrency(d.amount, d.currency)}</span>
          </div>
          <div className="flex justify-between gap-2 text-xs pt-1 border-t border-destructive/20">
            <span className="text-muted-foreground">Efecto de la anulación</span>
            <span className="font-bold">
              {esIngreso
                ? <>Sale del efectivo esperado: <span className="text-destructive font-black">−{formatCurrency(d.amount_cup)} CUP</span></>
                : <>Regresa al efectivo esperado: <span className="text-success font-black">+{formatCurrency(d.amount_cup)} CUP</span></>}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-muted/30 border border-border/50 rounded-lg p-2.5 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            La reversión se registra ahora (fila contraria con fecha actual). Si el documento pertenecía a un turno ya
            cerrado, ese cierre histórico NO se modifica. No es posible anular dos veces el mismo documento.
          </span>
        </div>

        {/* Motivo obligatorio */}
        <div>
          <label htmlFor="cf-annul-reason" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
            Motivo de la anulación * (mínimo {ANNULMENT_REASON_MIN_LENGTH} caracteres)
          </label>
          <textarea
            id="cf-annul-reason"
            rows={3}
            maxLength={ANNULMENT_REASON_MAX_LENGTH}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej. Registrado por error de importe; se emitirá el documento correcto"
            className={cn('w-full px-3 py-2 rounded-xl border border-border bg-background text-sm', touch)}
            data-autofocus
          />
          <p className="text-[10px] text-muted-foreground mt-1 text-right">
            {reason.length}/{ANNULMENT_REASON_MAX_LENGTH} caracteres (mínimo {ANNULMENT_REASON_MIN_LENGTH})
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs p-3 rounded-xl bg-destructive/10 text-destructive font-medium">{error}</p>
        )}
      </div>
    </BaseModal>
  );
}
