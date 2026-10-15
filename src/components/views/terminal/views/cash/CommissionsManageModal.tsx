'use client';

/**
 * CommissionsManageModal — §5 del brief de auditoría del Reporte Entrega.
 *
 * Gestión del pago de comisiones DESDE el reporte, reutilizando el mecanismo
 * documental EXISTENTE de CostPro (no se inventa otro):
 *
 *   1. Sugerencias reales:  POST /api/commissions/calculate (motor de reglas:
 *      commission_rules + commission-engine, con product_breakdown por
 *      trabajador). NUNCA un porcentaje plano inventado.
 *   2. Documento:           POST /api/commissions/payments → crea
 *      commission_payments (status='draft') con calculated_amount
 *      recalculado server-side, final_amount y manual_adjustment_reason
 *      OBLIGATORIO si difieren. Idempotente (índice único worker+periodo →
 *      409, sin duplicar pagos).
 *   3. Confirmación:        PATCH /api/commissions/payments/[id]
 *      action='pay' con payment_method (efectivo por defecto, o transferencia)
 *      → status='paid' + paid_at + paid_by. Pagar dos veces es idempotente.
 *
 * Distinción conservada (§5.2): comisión calculada (original) vs modificada
 * (final) vs confirmada (paid) + nota de justificación. El histórico no se
 * sobrescribe: calculated_amount queda inmutable en el documento.
 *
 * Integración (§5.4): al confirmarse, el reporte recalcula — las comisiones
 * pagadas en EFECTIVO reducen el efectivo esperado; por TRANSFERENCIA no
 * tocan el efectivo físico (solo el flujo de transferencia).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, X, RefreshCw, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';

export interface CommissionsModalPeriod {
  startDate: string;
  endDate: string;
}

interface WorkerSuggestion {
  worker_id: string;
  worker_name: string;
  worker_ci?: string | null;
  commission_suggested: number;
  rule_applied_id?: string | null;
  calculation_explanation?: string;
  product_breakdown?: Array<{
    product_id: string;
    product_name?: string;
    quantity?: number;
    line_total?: number;
    commission?: number;
  }>;
  sales?: { cash?: number; transfer?: number; total?: number };
}

interface ExistingPayment {
  id: string;
  worker_id: string;
  calculated_amount: number | null;
  final_amount: number | null;
  status: string;
  payment_method: string | null;
  currency: string | null;
  manual_adjustment_reason: string | null;
  paid_at: string | null;
  period_start: string;
  period_end: string;
  worker?: { first_name?: string; last_name?: string; ci?: string } | null;
}

interface DraftRow {
  worker_id: string;
  worker_name: string;
  suggested: number;
  final: string;          // editable por el usuario
  reason: string;         // obligatoria si final ≠ sugerido
  method: 'cash' | 'transfer';
  productCount: number;
}

type Tab = 'propuesta' | 'historial';

export default function CommissionsManageModal({
  storeId,
  period,
  onClose,
  onConfirmed,
}: {
  /** Tienda activa — REQUERIDA: el motor y el historial filtran por tienda
   * (RLS + contrato de /api/commissions/*). Sin store_id el backend responde 400. */
  storeId: string;
  period: CommissionsModalPeriod;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [tab, setTab] = useState<Tab>('propuesta');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WorkerSuggestion[]>([]);
  const [existing, setExisting] = useState<ExistingPayment[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const touch = 'min-h-[44px]';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const loadErrors: string[] = [];
    try {
      // AUDIT-2026-10-15: ambos endpoints requieren store_id REAL (contrato API +
      // RLS). Antes: calculate sin store_id (→ 400) y payments con el centinela
      // "me" (→ 500 por casteo UUID) — ambos errores tragados mostrando un estado
      // vacío engañoso. Ahora: store_id real + errores visibles para el usuario.
      const [calc, paid] = await Promise.all([
        apiFetch('/api/commissions/calculate', {
          method: 'POST',
          body: JSON.stringify({
            store_id: storeId,
            date_from: period.startDate,
            date_to: period.endDate,
            mode: 'rules',
          }),
        }).catch((e: unknown) => {
          loadErrors.push(`No se pudieron calcular las comisiones sugeridas${e instanceof Error ? `: ${e.message}` : '.'}`);
          return null;
        }),
        apiFetch<{ payments?: ExistingPayment[] }>(`/api/commissions/payments?store_id=${storeId}&period_start=${period.startDate}&period_end=${period.endDate}&limit=100`)
          .catch((e: unknown) => {
            loadErrors.push(`No se pudo cargar el historial de pagos del período${e instanceof Error ? `: ${e.message}` : '.'}`);
            return null;
          }),
      ]);
      if (loadErrors.length > 0) setLoadError(loadErrors.join(' '));
      const calcs: WorkerSuggestion[] = Array.isArray(calc) ? calc : (calc?.calculations || calc?.results || []);
      const payments: ExistingPayment[] = paid?.payments || [];
      setSuggestions(calcs);
      setExisting(payments);

      // Borradores: sugerencia del motor; los workers ya pagados no se duplican.
      const paidWorkers = new Set(payments.filter(p => p.status !== 'cancelled').map(p => p.worker_id));
      const rows: DraftRow[] = calcs
        .filter(c => c.commission_suggested > 0 && !paidWorkers.has(c.worker_id))
        .map(c => ({
          worker_id: c.worker_id,
          worker_name: c.worker_name || 'Trabajador',
          suggested: Number(c.commission_suggested) || 0,
          final: String(Number(c.commission_suggested) || 0),
          reason: '',
          method: 'cash', // §5.1: efectivo por defecto
          productCount: Array.isArray(c.product_breakdown) ? c.product_breakdown.length : 0,
        }));
      setDrafts(rows);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setLoadError(e?.message || 'No se pudieron cargar las comisiones.');
    } finally {
      setLoading(false);
    }
  }, [period.startDate, period.endDate]);

  useEffect(() => { void load(); }, [load]);

  // Escape para cerrar (accesibilidad teclado §10)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updateDraft = (workerId: string, patch: Partial<DraftRow>) => {
    setDrafts(prev => prev.map(d => d.worker_id === workerId ? { ...d, ...patch } : d));
  };

  const totalSugerido = useMemo(() => drafts.reduce((s, d) => s + d.suggested, 0), [drafts]);
  const totalFinal = useMemo(() => drafts.reduce((s, d) => s + (Number(d.final) || 0), 0), [drafts]);
  const totalsDiffieren = Math.abs(totalFinal - totalSugerido) > 0.005;

  const filasInvalidas = drafts.filter(d => {
    const f = Number(d.final);
    return !Number.isFinite(f) || f < 0 || (Math.abs(f - d.suggested) > 0.005 && d.reason.trim().length === 0);
  });

  const puedeConfirmar = !loading && !submitting && drafts.length > 0 && filasInvalidas.length === 0;

  const handleConfirm = async () => {
    if (!puedeConfirmar || submittingRef.current) return;
    submittingRef.current = true; // §5.3: sin duplicación por doble clic
    setSubmitting(true);
    try {
      let confirmadas = 0;
      for (const d of drafts) {
        const final = Number(d.final) || 0;
        if (final <= 0) continue; // renglón eliminado por importe 0
        const difiere = Math.abs(final - d.suggested) > 0.005;

        // 1) Documento (draft) — calculated_amount real, final editado + nota.
        const created = await apiFetch<{ payment: { id: string } }>('/api/commissions/payments', {
          method: 'POST',
          body: JSON.stringify({
            store_id: storeId, // AUDIT-2026-10-15: requerido por contrato (faltaba → 400 al confirmar)
            worker_id: d.worker_id,
            period_start: period.startDate,
            period_end: period.endDate,
            final_amount: final,
            manual_adjustment_reason: difiere ? d.reason.trim() : null,
            calculated_breakdown: {
              calculation_mode: 'rules',
              calculation_explanation: `Sugerencia del motor para ${d.worker_name} (${period.startDate} → ${period.endDate})`,
            },
          }),
        });
        const paymentId = created?.payment?.id;
        if (!paymentId) throw new Error('El documento de comisión no devolvió id.');

        // 2) Confirmación (pay) con el medio de pago elegido.
        await apiFetch(`/api/commissions/payments/${paymentId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'pay',
            payment_method: d.method,
            currency: 'CUP',
            exchange_rate: 1,
          }),
        });
        confirmadas++;
      }
      if (confirmadas > 0) {
        toast.success(`${confirmadas} comisión(es) confirmadas — el reporte se recalculará.`);
        onConfirmed();
      } else {
        toast.info('Ninguna comisión con importe positivo para confirmar.');
        onClose();
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || 'No se pudo confirmar el documento de comisiones.');
      void load(); // recargar: puede haber quedado un draft creado sin pagar
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose} data-testid="commissions-manage-modal">
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Gestión de comisiones del reporte"
      >
        {/* Encabezado */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card">
          <div>
            <h3 className="text-sm font-black uppercase flex items-center gap-2"><Users className="w-4 h-4" /> Gestión de Comisiones</h3>
            <p className="text-[10px] text-muted-foreground">Período {period.startDate} → {period.endDate}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className={cn('p-2 rounded-lg hover:bg-muted', touch)}><X className="w-4 h-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/40" role="tablist" aria-label="Secciones de comisiones">
          {([['propuesta', 'Propuesta'], ['historial', 'Historial del período']] as Array<[Tab, string]>).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('px-4 py-2 text-xs font-black uppercase border-b-2 transition-colors', tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {label}{id === 'historial' && existing.length > 0 ? ` (${existing.length})` : ''}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {loading && (
            <div className="py-8 text-center" aria-live="polite">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Calculando comisiones sugeridas (motor de reglas)…</p>
            </div>
          )}

          {loadError && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {loadError}
            </div>
          )}

          {!loading && tab === 'propuesta' && (
            <>
              {drafts.length === 0 ? (
                loadError ? null : ( // con error de carga el vacío sería engañoso (AUDIT-2026-10-15)
                <div className="py-6 text-center space-y-2">
                  <Info className="w-8 h-8 mx-auto text-muted-foreground/40" />
                  <p className="text-xs font-bold">Sin comisiones sugeridas pendientes</p>
                  <p className="text-[10px] text-muted-foreground max-w-sm mx-auto">
                    El motor de reglas no generó sugerencias para el período, o ya fueron confirmadas.
                    Las sugerencias provienen de commission_rules (Trabajadores y Comisiones).
                  </p>
                </div>
                )
              ) : (
                <>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Importes sugeridos por el <strong>cálculo real del sistema</strong> (reglas por trabajador).
                    Puedes ajustar el importe final: si difiere del sugerido, la <strong>nota justificativa es obligatoria</strong>
                    y queda registrada en el documento. Confirmar crea un documento de comisión trazable y lo paga
                    con el medio elegido (efectivo por defecto).
                  </p>

                  <div className="space-y-2">
                    {drafts.map(d => {
                      const f = Number(d.final);
                      const difiere = Math.abs(f - d.suggested) > 0.005;
                      const sinNota = difiere && d.reason.trim().length === 0;
                      return (
                        <div key={d.worker_id} className={cn('rounded-xl border p-3 space-y-2', sinNota ? 'border-warning/40 bg-warning/5' : 'border-border/40')}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">{d.worker_name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                Sugerido: {formatCurrency(d.suggested)}{d.productCount > 0 ? ` · ${d.productCount} producto(s)` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <label className="text-[10px] font-black uppercase text-muted-foreground" htmlFor={`cm-fin-${d.worker_id}`}>Final</label>
                              <input
                                id={`cm-fin-${d.worker_id}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={d.final}
                                onChange={e => updateDraft(d.worker_id, { final: e.target.value })}
                                className="w-24 px-2 py-1.5 rounded-lg border border-border/40 bg-background text-xs font-mono"
                              />
                            </div>
                          </div>
                          {difiere && (
                            <div>
                              <label htmlFor={`cm-nota-${d.worker_id}`} className="block text-[10px] font-black uppercase text-muted-foreground mb-1">
                                Nota justificativa * (el importe difiere del sugerido)
                              </label>
                              <input
                                id={`cm-nota-${d.worker_id}`}
                                type="text"
                                maxLength={500}
                                value={d.reason}
                                onChange={e => updateDraft(d.worker_id, { reason: e.target.value })}
                                placeholder="Motivo del ajuste (obligatorio)"
                                className="w-full px-3 py-2 rounded-lg border border-border/40 bg-background text-xs"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-muted-foreground">Medio de pago:</span>
                            {(['cash', 'transfer'] as const).map(m => (
                              <button
                                key={m}
                                onClick={() => updateDraft(d.worker_id, { method: m })}
                                aria-pressed={d.method === m}
                                className={cn('px-2.5 py-1 rounded-lg border text-[10px] font-bold', d.method === m ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground')}
                              >
                                {m === 'cash' ? 'Efectivo' : 'Transferencia'}
                              </button>
                            ))}
                            {d.method === 'transfer' && <span className="text-[9px] text-muted-foreground italic">no reduce el efectivo físico</span>}
                          </div>
                          <div className="flex justify-end">
                            <button
                              onClick={() => setDrafts(prev => prev.filter(x => x.worker_id !== d.worker_id))}
                              className="text-[10px] font-bold text-destructive hover:underline"
                            >
                              Eliminar renglón
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totales §5.1: sugerido vs final */}
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Total sugerido</span>
                      <span className="font-mono font-bold">{formatCurrency(totalSugerido)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Total final a confirmar</span>
                      <span className={cn('font-mono font-black', totalsDiffieren ? 'text-warning' : 'text-success')}>{formatCurrency(totalFinal)}</span>
                    </div>
                    {totalsDiffieren && (
                      <p className="text-[9px] text-warning flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Diferencia de {formatCurrency(Math.abs(totalFinal - totalSugerido))} — cada renglón modificado exige nota.
                      </p>
                    )}
                  </div>

                  {filasInvalidas.length > 0 && (
                    <p role="alert" className="text-[11px] text-warning flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> {filasInvalidas.length} renglón(es) sin nota justificativa o importe inválido.
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={onClose} className={cn('flex-1 rounded-xl border border-border/40 text-xs font-black uppercase hover:bg-muted', touch)}>Cancelar</button>
                    <button
                      onClick={handleConfirm}
                      disabled={!puedeConfirmar}
                      aria-busy={submitting}
                      className={cn('flex-1 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-1.5', touch, !puedeConfirmar && 'opacity-50 cursor-not-allowed')}
                    >
                      {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {submitting ? 'Confirmando…' : 'Confirmar y pagar'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {!loading && tab === 'historial' && (
            <div className="space-y-2">
              {existing.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin documentos de comisión en el período.</p>
              ) : existing.map(p => {
                const calc = Number(p.calculated_amount || 0);
                const fin = Number(p.final_amount || 0);
                const modificado = Math.abs(fin - calc) > 0.005;
                return (
                  <div key={p.id} className="rounded-xl border border-border/40 p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold truncate">
                        {p.worker?.first_name || ''} {p.worker?.last_name || ''}
                        {p.worker?.ci ? <span className="text-muted-foreground font-normal"> ({p.worker.ci})</span> : null}
                      </p>
                      <span className={cn('text-[9px] font-black uppercase px-1.5 py-0.5 rounded', p.status === 'paid' ? 'bg-success/20 text-success' : p.status === 'draft' ? 'bg-muted/40 text-muted-foreground' : 'bg-warning/20 text-warning')}>
                        {p.status === 'paid' ? 'Pagada' : p.status === 'draft' ? 'Borrador' : p.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Período {p.period_start} → {p.period_end}</span>
                      <span>{p.payment_method === 'cash' ? 'Efectivo' : p.payment_method === 'transfer' ? 'Transferencia' : '—'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Calculado: {formatCurrency(calc)}</span>
                      <span className={cn('font-mono font-bold', modificado && 'text-warning')}>Final: {formatCurrency(fin)}</span>
                    </div>
                    {modificado && p.manual_adjustment_reason && (
                      <p className="text-[10px] text-warning italic truncate" title={p.manual_adjustment_reason}>Nota: {p.manual_adjustment_reason}</p>
                    )}
                    <p className="text-[9px] font-mono text-muted-foreground">{p.id}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
