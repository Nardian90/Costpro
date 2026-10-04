'use client';

/**
 * AuditEventDetailModal — detalle de un evento de auditoría en lenguaje de
 * negocio, con trazabilidad técnica preservada (FASE 9/10/11/14).
 *
 * DASHBOARD V3 (feat/dashboard-v3-audit-ux):
 *   - Explica QUÉ ocurrió / CUÁNDO / QUIÉN / en qué TIENDA con datos reales.
 *   - "Detalles técnicos" (sección colapsada) conserva la trazabilidad
 *     completa: ID del evento, referencia, tipo interno, origen, tabla,
 *     metadatos y datos anterior/nuevo (JSON crudo).
 *   - "Documento asociado": SOLO cuando la relación es inequívoca
 *     (whitelist en lib/audit/eventPresentation). El documento se abre con
 *     el visor existente TransactionDetailsModal — no se crea un segundo
 *     visor (FASE 12). Estados contemplados: cargando, documento inexistente
 *     y documento no accesible (FASE 14) — jamás se fabrica un documento.
 *
 * Accesibilidad (FASE 17): Dialog de Radix (focus trap, Escape, restauración
 * de foco); título con DialogTitle; sección técnica con <details>/<summary>
 * nativos; botón de documento con nombre accesible contextual.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Store, User, CalendarClock, Info } from 'lucide-react';
import { formatDate, formatTime, cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import type { Transaction } from '@/types';
import { useTransactionDetails } from '@/hooks/api/useTransactions';
import { TransactionDetailsModal } from '@/components/views/terminal/views/sales/TransactionDetailsModal';
import type { AuditLogEntry } from '@/hooks/api/useAuditLogs';
import {
  getAuditEventPresentation,
  getActorLabel,
  getGenericSentence,
} from '@/lib/audit/eventPresentation';

interface AuditEventDetailModalProps {
  entry: AuditLogEntry | null;
  /** Nombre de tienda resuelto por la vista (stores list) — opcional. */
  storeName?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

/** Fila etiqueta+valor del bloque de negocio. */
function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground shrink-0" aria-hidden="true">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <div className="text-sm text-foreground font-medium break-words">{children}</div>
      </div>
    </div>
  );
}

export function AuditEventDetailModal({ entry, storeName, isOpen, onClose }: AuditEventDetailModalProps) {
  const presentation = entry ? getAuditEventPresentation(entry) : null;

  // Documento asociado (solo venta anulada — whitelist estricta).
  const [docRequested, setDocRequested] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);

  // FASE 12: reutilizar el visor existente — la transacción se resuelve por
  // record_id (id real de la venta anulada) SOLO cuando el usuario pide el
  // documento (fetch diferido, cero consultas para el resto de eventos).
  const { data: transaction, isLoading: isLoadingDoc, error: docError } = useQuery({
    queryKey: ['audit-sale-document', presentation?.document?.recordId],
    queryFn: async (): Promise<Transaction | null> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', presentation!.document!.recordId)
        .maybeSingle();
      if (error) throw error;
      return (data as Transaction) ?? null;
    },
    enabled: isOpen && docRequested && presentation?.document?.kind === 'sale' && !!presentation.document.recordId,
    staleTime: 30_000,
  });

  const { data: docItems = [], isLoading: isLoadingDocItems } = useTransactionDetails(
    docModalOpen && transaction ? transaction.id : undefined
  );

  if (!entry || !presentation) return null;

  const actor = getActorLabel(entry);
  const description = presentation.description || getGenericSentence(entry);
  const hasDocument = presentation.document?.kind === 'sale';
  const docUnavailable = docRequested && !isLoadingDoc && (docError || !transaction);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setDocRequested(false); setDocModalOpen(false); onClose(); } }}>
        <DialogContent
          className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl"
          aria-describedby="audit-event-detail-description"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-black text-foreground leading-snug text-left">
              {presentation.title}
            </DialogTitle>
            <DialogDescription id="audit-event-detail-description" className="text-xs text-muted-foreground text-left">
              Detalle del evento registrado en Auditoría.
            </DialogDescription>
          </DialogHeader>

          {/* ── Bloque de negocio (FASE 10) ── */}
          <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
            <DetailRow icon={<Info className="w-4 h-4" />} label="Qué ocurrió">
              <p>{description}</p>
            </DetailRow>

            <DetailRow icon={<CalendarClock className="w-4 h-4" />} label="Cuándo">
              <p>{formatDate(entry.created_at)} · {formatTime(entry.created_at)}</p>
            </DetailRow>

            <DetailRow icon={<User className="w-4 h-4" />} label="Quién">
              <p>{actor}</p>
            </DetailRow>

            {storeName && (
              <DetailRow icon={<Store className="w-4 h-4" />} label="Tienda">
                <p>{storeName}</p>
              </DetailRow>
            )}
          </div>

          {/* ── Documento asociado (FASE 11/12/14 — solo si existe relación real) ── */}
          {hasDocument && (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Documento asociado</p>

              {!docRequested && (
                <button
                  type="button"
                  onClick={() => setDocRequested(true)}
                  aria-label={`Ver documento de la venta anulada del ${formatDate(entry.created_at)}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-border bg-background text-xs font-black uppercase tracking-widest text-primary hover:bg-muted transition-colors"
                >
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  Ver documento
                </button>
              )}

              {docRequested && isLoadingDoc && (
                <div className="flex items-center gap-3" role="status" aria-live="polite">
                  <Skeleton className="h-4 w-40" />
                  <span className="text-xs text-muted-foreground">Cargando documento…</span>
                </div>
              )}

              {docUnavailable && (
                <p className="text-xs text-muted-foreground" role="status">
                  El documento ya no existe o no es accesible con tu rol. La trazabilidad del evento se conserva en los detalles técnicos.
                </p>
              )}

              {docRequested && !isLoadingDoc && transaction && (
                <button
                  type="button"
                  onClick={() => setDocModalOpen(true)}
                  aria-label={`Abrir documento de la venta anulada del ${formatDate(entry.created_at)}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                >
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  Abrir documento
                </button>
              )}
            </div>
          )}

          {/* ── Trazabilidad técnica (FASE 9 — secundaria y colapsada) ── */}
          <details className="rounded-xl border border-border/60 bg-background">
            <summary className="cursor-pointer select-none px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              Detalles técnicos
            </summary>
            <div className="px-4 pb-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-2">
                <TechRow label="ID del evento" value={entry.id} mono />
                {entry.record_id && <TechRow label="Referencia" value={entry.record_id} mono />}
                <TechRow label="Tipo interno" value={entry.action} mono />
                <TechRow label="Origen" value={entry.user_id ? 'Usuario autenticado' : 'Sistema'} />
                {entry.table_name && <TechRow label="Tabla interna" value={entry.table_name} mono />}
              </div>

              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Metadatos</p>
                  <pre className="text-[10px] font-mono text-muted-foreground bg-muted/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {(entry.old_data || entry.new_data) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {entry.old_data && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Estado anterior</p>
                      <pre className="text-[10px] font-mono text-muted-foreground bg-muted/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                        {JSON.stringify(entry.old_data, null, 2)}
                      </pre>
                    </div>
                  )}
                  {entry.new_data && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Estado nuevo</p>
                      <pre className="text-[10px] font-mono text-muted-foreground bg-muted/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                        {JSON.stringify(entry.new_data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
        </DialogContent>
      </Dialog>

      {/* FASE 12: visor de venta EXISTENTE — cero visores nuevos. */}
      <TransactionDetailsModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        transaction={transaction ?? null}
        items={docItems}
        isLoading={isLoadingDocItems}
      />
    </>
  );
}

function TechRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-1.5 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-foreground text-right break-all min-w-0', mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  );
}
