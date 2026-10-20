'use client';

/**
 * CashFlowDetailModal — detalle completo del documento Ingreso/Egreso.
 *
 * Requisitos §10 del brief: datos del documento, tipo y motivo, tienda/caja/
 * turno, importe y moneda, responsable, justificación, estado, fechas
 * relevantes, efecto sobre el saldo, historia de anulación y documento
 * original relacionado. Acciones contextuales: imprimir/exportar comprobante
 * (PDF identificado como Ingreso/Egreso de caja — NO factura) y anular (solo
 * confirmados con permiso).
 */

import React, { useState } from 'react';
import { Printer, Loader2, Ban, FileText, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatTime, cn } from '@/lib/utils';
import { conceptLabel, isFondoConcept } from '@/lib/cash-flow/constants';
import { buildCashFlowComprobantePdf, comprobanteFileName } from '@/lib/cash-flow/comprobante-pdf';
import { toast } from 'sonner';
import type { CashFlowDocument } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  doc: CashFlowDocument | null;
  storeName: string | null;
  canAnnul: boolean;
  onAnular: (d: CashFlowDocument) => void;
}

export function CashFlowDetailModal({ open, onClose, doc: d, storeName, canAnnul, onAnular }: Props) {
  const [exporting, setExporting] = useState(false);

  async function exportarComprobante() {
    if (!d || exporting) return;
    setExporting(true);
    try {
      const pdf = await buildCashFlowComprobantePdf({ doc: d, storeName });
      pdf.save(comprobanteFileName(d));
      toast.success('Comprobante generado', {
        description: `${d.document_number} · Ingreso/Egreso de caja (no es factura de venta)`,
      });
    } catch (err: unknown) {
      toast.error('No se pudo generar el comprobante', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExporting(false);
    }
  }

  if (!d) return null;

  const esIngreso = d.doc_type === 'ingreso';
  const anulado = d.status === 'anulado';

  const DataRow = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-border/40 last:border-b-0">
      <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0 pt-0.5">{label}</dt>
      <dd className={cn('text-xs font-bold text-right min-w-0 break-words', mono && 'font-mono')}>{value}</dd>
    </div>
  );

  return (
    <BaseModal
      open={open}
      onOpenChange={o => { if (!o) onClose(); }}
      maxWidth="sm:max-w-2xl"
      title={
        <span className="flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
          Documento {d.document_number}
        </span>
      }
      description="Ingreso / Egreso de caja — movimiento de efectivo documentado"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={exportarComprobante}
            disabled={exporting}
            className="h-10 rounded-lg text-xs font-black uppercase tracking-wide"
            aria-label={`Imprimir comprobante ${d.document_number}`}
          >
            {exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Printer className="w-4 h-4 mr-1.5" />}
            Comprobante PDF
          </Button>
          {canAnnul && !anulado && (
            <Button
              type="button"
              onClick={() => onAnular(d)}
              className="h-10 rounded-lg text-xs font-black uppercase tracking-wide"
              aria-label={`Anular documento ${d.document_number}`}
            >
              <Ban className="w-4 h-4 mr-1.5" /> Anular documento
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Cabecera del documento */}
        <div className={cn(
          'rounded-xl border-2 p-4 flex items-start justify-between gap-3',
          anulado ? 'border-border/50 bg-muted/20' : esIngreso ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5',
        )}>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn(
                'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded',
                esIngreso ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
              )}>
                {esIngreso ? <ArrowDownToLine className="w-3 h-3" aria-hidden="true" /> : <ArrowUpFromLine className="w-3 h-3" aria-hidden="true" />}
                {esIngreso ? 'Ingreso' : 'Egreso'}
              </span>
              {isFondoConcept(d.concept) && (
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-warning/10 text-warning">
                  Fondo de cambio
                </span>
              )}
              <span className={cn(
                'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded',
                anulado ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
              )}>
                {anulado ? 'Anulado' : 'Confirmado'}
              </span>
            </div>
            <p className="text-sm font-black">{conceptLabel(d.concept)}</p>
            <p className="text-xs text-muted-foreground">{d.justification}</p>
          </div>
          <div className="text-right shrink-0">
            <p className={cn('text-2xl font-black tabular-nums', anulado ? 'text-muted-foreground line-through' : esIngreso ? 'text-success' : 'text-destructive')}>
              {esIngreso ? '+' : '−'}{formatCurrency(d.amount, d.currency)}
            </p>
            {d.currency === 'USD' && (
              <p className="text-[10px] font-bold text-muted-foreground tabular-nums">
                ≈ {formatCurrency(d.amount_cup)} CUP · tasa {Number(d.exchange_rate).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Datos del documento */}
        <section aria-label="Datos del documento">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Datos del documento</h3>
          <dl>
            <DataRow label="Número" value={d.document_number} mono />
            <DataRow label="Tienda" value={storeName ?? d.store_id.slice(0, 8)} />
            <DataRow label="Caja / Turno" value={d.closure_id ? `Turno abierto ${d.closure_id.slice(0, 8)}…` : '—'} mono />
            <DataRow label="Moneda" value={`${d.currency} · efectivo físico`} />
            <DataRow label="Fecha operativa" value={`${formatDate(d.operation_date)} · ${formatTime(d.operation_date)}`} />
            <DataRow label="Registrado" value={`${formatDate(d.created_at)} · ${formatTime(d.created_at)}`} />
            <DataRow label="Confirmado" value={`${formatDate(d.confirmed_at)} · ${formatTime(d.confirmed_at)}`} />
          </dl>
        </section>

        {/* Responsables */}
        <section aria-label="Personas involucradas">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Personas</h3>
          <dl>
            <DataRow label="Responsable que registra" value={d.responsible?.full_name ?? '—'} />
            {d.counterparty && (
              <DataRow label={esIngreso ? 'Entregado por' : 'Recibido por'} value={d.counterparty} />
            )}
          </dl>
        </section>

        {/* Observaciones + vínculo */}
        {(d.notes || d.related_document?.document_number) && (
          <section aria-label="Observaciones y vínculos">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Observaciones y vínculos</h3>
            <dl>
              {d.notes && <DataRow label="Observaciones" value={d.notes} />}
              {d.related_document?.document_number && (
                <DataRow
                  label="Fondo de origen"
                  value={`${d.related_document.document_number} · ${conceptLabel(d.related_document.concept ?? '')}`}
                  mono
                />
              )}
            </dl>
          </section>
        )}

        {/* Efecto sobre el saldo */}
        <section aria-label="Efecto sobre el saldo" className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Efecto sobre el saldo de caja</h3>
          <p className="text-xs leading-relaxed">
            {anulado ? (
              <>Documento anulado: el efecto neto en el efectivo esperado es <span className="font-black">cero</span> (fila original + fila contraria en el ledger).</>
            ) : (
              <>
                {esIngreso ? 'Suma' : 'Resta'}{' '}
                <span className={cn('font-black tabular-nums', esIngreso ? 'text-success' : 'text-destructive')}>
                  {formatCurrency(d.amount_cup)} CUP
                </span>{' '}
                al efectivo esperado del turno (canónico CUP{d.currency === 'USD' ? ', conversión única en escritura' : ''}).
                Participa una sola vez en el arqueo, el Reporte de Entrega y los indicadores de Inicio.
              </>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Efecto financiero: fila del ledger <span className="font-mono">{d.payment_transaction_id?.slice(0, 8) ?? '—'}…</span>
            {anulado && (
              <> · reversión: <span className="font-mono">{d.annulment_payment_transaction_id?.slice(0, 8) ?? '—'}…</span></>
            )}
          </p>
        </section>

        {/* Historial de anulación */}
        {anulado && (
          <section aria-label="Anulación" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-destructive mb-1">Anulación</h3>
            <dl>
              <DataRow label="Anulado por" value={d.annulled_by_profile?.full_name ?? '—'} />
              <DataRow label="Fecha de anulación" value={d.annulled_at ? `${formatDate(d.annulled_at)} · ${formatTime(d.annulled_at)}` : '—'} />
              <DataRow label="Motivo" value={d.annulment_reason ?? '—'} />
            </dl>
          </section>
        )}
      </div>
    </BaseModal>
  );
}
