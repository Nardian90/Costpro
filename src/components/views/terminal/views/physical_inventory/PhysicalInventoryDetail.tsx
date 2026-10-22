'use client';

/**
 * PhysicalInventoryDetail — espacio de trabajo de un inventario físico.
 *
 * Pestañas:
 *   - Conteo: captura manual rápida (autosave), importación Excel, hoja PDF.
 *   - Conciliación: diferencias (solo roles privilegiados), revisión de motivos,
 *     movimientos posteriores al corte, envío a autorización.
 *   - Ajustes: documentos generados con su estado y trazabilidad.
 *   - Auditoría: historial de capturas y versiones de hojas.
 *
 * Máquina de estados (validada en BD por fn_validate_pi_transition):
 *   draft → prepared → in_progress → counted → in_reconciliation →
 *   pending_authorization → conciliated → closed  (+ voided antes de conciliar)
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Loader2, RefreshCcw, EyeOff, PlayCircle, CheckCircle2, PackageCheck,
  ClipboardList, ShieldCheck, FileWarning, Ban, XCircle, Save, Upload,
  FileText, ArrowLeftRight, History, Search, AlertTriangle, Clock, TrendingDown,
  TrendingUp, PackageMinus, PackagePlus, Eye, ExternalLink, Lock, Layers,
} from 'lucide-react';
import { cn, formatDate, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { BaseModal } from '@/components/ui/BaseModal';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import { CountSheetModal } from './CountSheetModal';
import { ImportCountDialog } from './ImportCountDialog';
import {
  PI_STATUS_META, PI_SCOPE_LABELS,
  type PIHeader, type PILine, type PISheet, type PIReconciliation,
} from './pi-types';

interface Props {
  piId: string;
  onBack: () => void;
}

type Tab = 'count' | 'reconciliation' | 'adjustments' | 'audit';

const touch = 'min-h-[44px]';

interface DetailResponse {
  inventory: PIHeader & {
    store_id: string;
    snapshot_meta?: Record<string, unknown> | null;
    count_started_at?: string | null;
    count_completed_at?: string | null;
    void_reason?: string | null;
  };
  lines: PILine[];
  showTheoretical: boolean;
  sheets: PISheet[];
}

export const PhysicalInventoryDetail: React.FC<Props> = ({ piId, onBack }) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('count');
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  // ── Carga del detalle ──────────────────────────────────────────────────
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pi-detail', piId],
    queryFn: () => apiFetch<DetailResponse>(`/api/physical-inventory/${piId}`),
    enabled: !!piId,
  });

  const pi = data?.inventory;
  const lines = data?.lines || [];
  const showTheoretical = data?.showTheoretical ?? false;

  // ¿Puede ver teóricas? (rol privilegiado en la tienda o admin global)
  const canSeeTheoretical = useMemo(() => {
    if (user?.role === 'admin') return true;
    const m = (user?.memberships || []).find(
      (mm: { store_id: string; status: string }) =>
        mm.store_id === pi?.store_id && mm.status === 'active'
    ) as { role?: string } | undefined;
    return ['admin', 'manager', 'encargado'].includes(m?.role || '');
  }, [user, pi?.store_id]);

  const canAuthorize = canSeeTheoretical;
  const canClose = useMemo(() => {
    if (user?.role === 'admin') return true;
    const m = (user?.memberships || []).find(
      (mm: { store_id: string; status: string }) =>
        mm.store_id === pi?.store_id && mm.status === 'active'
    ) as { role?: string } | undefined;
    return ['admin', 'manager'].includes(m?.role || '');
  }, [user, pi?.store_id]);

  // ── Conciliación (roles privilegiados, con teóricas + post-corte) ─────
  const { data: reconciliation, refetch: refetchRecon } = useQuery({
    queryKey: ['pi-reconciliation', piId],
    queryFn: () => apiFetch<PIReconciliation>(`/api/physical-inventory/${piId}/reconciliation`),
    enabled: !!piId && canSeeTheoretical && ['counted', 'in_reconciliation', 'pending_authorization', 'conciliated', 'closed'].includes(pi?.status || ''),
  });

  // ── Transiciones ───────────────────────────────────────────────────────
  const runTransition = useCallback(async (action: string, extra?: Record<string, unknown>) => {
    if (transitioning) return;
    setTransitioning(action);
    const tid = toast.loading('Procesando…');
    try {
      const res = await apiFetch<Record<string, unknown>>(`/api/physical-inventory/${piId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ action, ...extra }),
      });
      toast.success('Acción completada', { id: tid, description: describeTransition(action, res) });
      await queryClient.invalidateQueries({ queryKey: ['pi-detail', piId] });
      await queryClient.invalidateQueries({ queryKey: ['pi-reconciliation', piId] });
      await queryClient.invalidateQueries({ queryKey: ['physical-inventories'] });
    } catch (e) {
      toast.error('Acción rechazada', { id: tid, description: e instanceof Error ? e.message : undefined });
    } finally {
      setTransitioning(null);
    }
  }, [piId, queryClient, transitioning]);

  const refreshAll = useCallback(() => {
    refetch();
    refetchRecon();
  }, [refetch, refetchRecon]);

  if (isLoading || !pi) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  const meta = PI_STATUS_META[pi.status];
  const activeCount = pi.status === 'in_progress';
  const canReview = ['in_reconciliation', 'pending_authorization'].includes(pi.status);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* ── Cabecera del documento ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <button
              onClick={onBack}
              className={cn(touch, 'rounded-xl border border-border bg-card px-3 text-muted-foreground hover:bg-muted')}
              aria-label="Volver al listado"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-xl font-black text-primary">{pi.pi_number}</h2>
                <span className={cn('inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-black uppercase tracking-wider', meta.className)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                  {meta.label}
                </span>
                {pi.blind_mode && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    <EyeOff className="h-3 w-3" /> Conteo ciego
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {pi.store?.name} · Corte: <span className="font-bold">{formatDate(pi.cutoff_date)}</span> · Creado: {formatDate(pi.created_at)}
                {pi.responsible_name ? <> · Responsable: <span className="font-bold">{pi.responsible_name}</span></> : null}
              </p>
              {pi.description && <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{pi.description}</p>}
            </div>
          </div>
          <button onClick={refreshAll} className={cn(touch, 'rounded-xl border border-border bg-card px-3 text-muted-foreground hover:bg-muted')} aria-label="Actualizar">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </button>
        </div>

        {/* Timeline de momentos */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
          <span>Creación: <b>{formatDate(pi.created_at)}</b></span>
          {pi.count_started_at && <span>· Inicio conteo: <b>{formatDate(pi.count_started_at)}</b></span>}
          {pi.count_completed_at && <span>· Conteo: <b>{formatDate(pi.count_completed_at)}</b></span>}
          {pi.submitted_at && <span>· Conciliación: <b>{formatDate(pi.submitted_at)}</b></span>}
          {pi.authorized_at && <span>· Autorización: <b>{formatDate(pi.authorized_at)}</b></span>}
          {pi.closed_at && <span>· Cierre: <b>{formatDate(pi.closed_at)}</b></span>}
          {pi.voided_at && <span className="text-destructive">· Anulado: <b>{formatDate(pi.voided_at)}</b> ({pi.void_reason})</span>}
          <span className="ml-auto">Alcance: <b>{PI_SCOPE_LABELS[pi.scope_type]}</b></span>
        </div>

        {/* Acciones de estado */}
        <StateActions
          pi={pi}
          canAuthorize={canAuthorize}
          canClose={canClose}
          transitioning={transitioning}
          onTransition={runTransition}
          onVoid={() => setVoidOpen(true)}
        />
      </div>

      {/* ── Pestañas ── */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1 overflow-x-auto">
        {([
          ['count', 'Conteo', ClipboardList, `${pi.counted_items}/${pi.total_items}`],
          ['reconciliation', 'Conciliación', Scale, canSeeTheoretical ? `${(pi.shortfall_items || 0) + (pi.surplus_items || 0)} dif.` : '—'],
          ['adjustments', 'Ajustes', ArrowLeftRight, `${pi.adjustments?.length || 0}`],
          ['audit', 'Auditoría', History, ''],
        ] as Array<[Tab, string, React.ComponentType<{ className?: string }>, string]>).map(([id, label, Icon, badge]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide transition-colors min-h-[40px]',
              tab === id ? 'bg-card text-primary shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-current={tab === id}
          >
            <Icon className="h-4 w-4" />
            {label}
            {badge && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono">{badge}</span>}
          </button>
        ))}
      </div>

      {/* Contenido por pestaña */}
      {tab === 'count' && (
        <CountPanel
          piId={piId}
          pi={pi}
          lines={lines}
          showTheoretical={showTheoretical}
          onChanged={refreshAll}
          onOpenSheet={() => setSheetOpen(true)}
          onOpenImport={() => setImportOpen(true)}
        />
      )}

      {tab === 'reconciliation' && (
        <ReconciliationPanel
          piId={piId}
          pi={pi}
          reconciliation={reconciliation}
          canSeeTheoretical={canSeeTheoretical}
          canReview={canReview}
          onChanged={refreshAll}
        />
      )}

      {tab === 'adjustments' && (
        <AdjustmentsPanel pi={pi} onChanged={refreshAll} />
      )}

      {tab === 'audit' && (
        <AuditPanel piId={piId} pi={pi} sheets={data?.sheets || []} onChanged={refreshAll} />
      )}

      {/* Modal de anulación */}
      <BaseModal
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={<span className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /> Anular inventario físico</span>}
        description={`Se anulará ${pi.pi_number}. Esta acción solo es posible antes de conciliar y queda registrada en auditoría.`}
        maxWidth="sm:max-w-md"
        footer={
          <div className="flex gap-2">
            <SecondaryButton className="flex-1" onClick={() => setVoidOpen(false)}>Cancelar</SecondaryButton>
            <button
              className="flex-1 min-h-[44px] rounded-xl bg-destructive text-destructive-foreground text-xs font-black uppercase hover:bg-destructive/90 disabled:opacity-50"
              disabled={voidReason.trim().length < 3 || transitioning === 'void'}
              onClick={async () => {
                await runTransition('void', { reason: voidReason.trim() });
                setVoidOpen(false);
                setVoidReason('');
              }}
            >
              {transitioning === 'void' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Anular inventario'}
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground" htmlFor="void-reason">
            Motivo de la anulación (mínimo 3 caracteres)
          </label>
          <textarea
            id="void-reason"
            className="min-h-[80px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive/30"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="P. ej. se creó por error de tienda; se repetirá el conteo…"
          />
        </div>
      </BaseModal>

      {/* Hoja de conteo PDF */}
      <CountSheetModal
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        pi={pi}
        lines={lines}
        canSeeTheoretical={canSeeTheoretical}
      />

      {/* Importación Excel */}
      <ImportCountDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        pi={pi}
        lines={lines}
        onChanged={refreshAll}
      />
    </div>
  );
};

// Icono balanza para la pestaña conciliación
function Scale({ className }: { className?: string }) {
  return <Layers className={className} />;
}

function describeTransition(action: string, res: Record<string, unknown>): string {
  switch (action) {
    case 'prepare':
      return `${res.lines || 0} líneas generadas con existencia teórica congelada${res.ledger_drift_products ? ` (${res.ledger_drift_products} con deriva de ledger)` : ''}.`;
    case 'generate_adjustments':
      return `Faltantes: ${res.shortfall_items || 0} · Sobrantes: ${res.surplus_items || 0} — borradores creados en Ajustes Documentales.`;
    case 'complete':
      return res.pending_lines ? `Conteo completado con ${res.pending_lines} línea(s) pendiente(s).` : 'Conteo completado.';
    default:
      return 'Estado actualizado.';
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Panel de CONTEO — captura rápida con autosave
// ──────────────────────────────────────────────────────────────────────────

function CountPanel({
  piId, pi, lines, showTheoretical, onChanged, onOpenSheet, onOpenImport,
}: {
  piId: string;
  pi: PIHeader;
  lines: PILine[];
  showTheoretical: boolean;
  onChanged: () => void;
  onOpenSheet: () => void;
  onOpenImport: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'counted'>('all');
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCounting = pi.status === 'in_progress';

  const dirtyCount = Object.keys(edits).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (q && !(`${l.sku || ''} ${l.name}`.toLowerCase().includes(q))) return false;
      if (filter === 'pending' && l.counted_qty !== null && !(l.id in edits && edits[l.id] === '')) return false;
      if (filter === 'counted' && l.counted_qty === null && !(l.id in edits && edits[l.id] !== '')) return false;
      return true;
    });
  }, [lines, search, filter, edits]);

  const save = useCallback(async (silent = true) => {
    const ids = Object.keys(edits);
    if (ids.length === 0 || saving) return;
    setSaving(true);
    try {
      const items = ids.map((id) => {
        const raw = edits[id];
        const line = lines.find((l) => l.id === id);
        return {
          item_id: id,
          counted_qty: raw === '' ? null : Number(raw),
          expected_updated_at: line?.updated_at || null,
        };
      }).filter((it) => it.counted_qty === null || (Number.isFinite(it.counted_qty) && it.counted_qty >= 0));
      if (items.length === 0) { setEdits({}); return; }
      await apiFetch(`/api/physical-inventory/${piId}/count`, {
        method: 'POST',
        body: JSON.stringify({ items, source: 'manual' }),
      });
      setEdits({});
      setLastSavedAt(new Date().toISOString());
      onChanged();
      if (!silent) toast.success(`${items.length} cantidad(es) guardada(s)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Conflicto')) {
        toast.error('Otro usuario actualizó algunas líneas', {
          description: 'Los valores actuales se recargaron; revise y vuelva a capturar.',
        });
        setEdits({});
        onChanged();
      } else {
        toast.error('No se pudo guardar el conteo', { description: msg || undefined });
      }
    } finally {
      setSaving(false);
    }
  }, [edits, lines, piId, saving, onChanged]);

  // Autosave discreto (2.5s sin escritura)
  useEffect(() => {
    if (dirtyCount === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(true), 2500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [edits, dirtyCount, save]);

  const progress = pi.total_items > 0 ? Math.round((pi.counted_items / pi.total_items) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de progreso + acciones de conteo */}
      <div className="flex flex-col lg:flex-row gap-2 lg:items-center rounded-xl border border-border bg-card p-3">
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <span>Progreso del conteo</span>
            <span className="font-mono">{pi.counted_items}/{pi.total_items} ({progress}%)</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          {lastSavedAt && dirtyCount === 0 && (
            <p className="mt-1 text-[10px] text-success flex items-center gap-1">
              <Save className="h-3 w-3" /> Guardado {formatDate(lastSavedAt)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={onOpenSheet}>
            <FileText className="h-4 w-4" /> Hoja de conteo (PDF)
          </SecondaryButton>
          <SecondaryButton onClick={onOpenImport} disabled={!isCounting}>
            <Upload className="h-4 w-4" /> Importar Excel
          </SecondaryButton>
          {isCounting && (
            <PrimaryButton onClick={() => save(false)} disabled={dirtyCount === 0 || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
            </PrimaryButton>
          )}
        </div>
      </div>

      {!isCounting && (
        <p className="rounded-xl border border-info/20 bg-info/5 px-3 py-2 text-xs text-info flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {pi.status === 'draft' && 'Prepare el inventario para generar las líneas de conteo con la existencia teórica congelada.'}
          {pi.status === 'prepared' && 'Inicie el conteo para habilitar la captura de cantidades físicas.'}
          {['counted', 'in_reconciliation', 'pending_authorization', 'conciliated', 'closed'].includes(pi.status) && 'El conteo está cerrado. Consulte la pestaña Conciliación para revisar las diferencias.'}
          {pi.status === 'voided' && 'Este inventario fue anulado.'}
        </p>
      )}

      {/* Filtros de líneas */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full min-h-[44px] rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Buscar producto o código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {([['all', 'Todas'], ['pending', 'Pendientes'], ['counted', 'Contadas']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-black uppercase transition-colors min-h-[36px]',
                filter === id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de captura */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b sticky top-0 z-10">
            <tr>
              {[
                ['#', 'w-10'],
                ['Código', 'w-28'],
                ['Producto', ''],
                ['Unidad', 'w-16'],
                ...(showTheoretical ? [['Teórica', 'w-20'], ['Dif.', 'w-16']] : []),
                ['Cantidad física', 'w-32'],
                ['Estado', 'w-24'],
              ].map(([label, w], i) => (
                <th key={i} className={cn('p-2.5 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground', w)}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const edited = l.id in edits;
              const value = edited ? edits[l.id] : l.counted_qty === null ? '' : String(l.counted_qty);
              const diff = showTheoretical && l.theoretical_qty !== undefined && l.counted_qty !== null && !edited
                ? Number(l.counted_qty) - Number(l.theoretical_qty)
                : null;
              const isPending = !edited ? l.counted_qty === null : edits[l.id] === '';
              return (
                <tr key={l.id} className={cn('border-b border-border/40 last:border-0', edited && 'bg-primary/5')}>
                  <td className="p-2.5 font-mono text-muted-foreground">{l.line_number}</td>
                  <td className="p-2.5 font-mono">{l.sku || '—'}</td>
                  <td className="p-2.5 font-bold max-w-[260px] truncate" title={l.name}>{l.name}</td>
                  <td className="p-2.5 text-muted-foreground">{l.unit || '—'}</td>
                  {showTheoretical && (
                    <>
                      <td className="p-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {l.theoretical_qty !== undefined ? Number(l.theoretical_qty) : '—'}
                        {l.theoretical_source === 'ledger_drift' && (
                          <span title="El ledger no concuerda con el saldo actual — verifique en conciliación">
                            <AlertTriangle className="ml-1 inline h-3 w-3 text-warning" />
                          </span>
                        )}
                      </td>
                      <td className={cn('p-2.5 text-right font-mono tabular-nums font-black',
                        diff === null ? 'text-muted-foreground/40' :
                        diff < 0 ? 'text-destructive' : diff > 0 ? 'text-success' : 'text-muted-foreground')}>
                        {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </>
                  )}
                  <td className="p-2.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      disabled={!isCounting}
                      value={value}
                      onChange={(e) => setEdits({ ...edits, [l.id]: e.target.value })}
                      placeholder="—"
                      aria-label={`Cantidad física de ${l.name}`}
                      className={cn(
                        'w-full min-h-[36px] rounded-lg border bg-background px-2 text-right font-mono tabular-nums text-sm outline-none focus:ring-2 focus:ring-primary/30',
                        isPending ? 'border-border' : 'border-primary/40 font-bold',
                        !isCounting && 'opacity-60'
                      )}
                    />
                  </td>
                  <td className="p-2.5">
                    {edited ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-primary">Editado</span>
                    ) : l.counted_qty === null ? (
                      <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-warning">
                        <Clock className="h-2.5 w-2.5" /> Pendiente
                      </span>
                    ) : Number(l.counted_qty) === 0 ? (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-destructive">Cero</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-success">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Contado
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">Ninguna línea coincide con el filtro.</p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Un campo vacío significa <b>pendiente</b>; un 0 explícito significa <b>contado y sin existencia</b>. Las cantidades admiten decimales según la unidad del producto.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Panel de CONCILIACIÓN — diferencias + revisión + autorización
// ──────────────────────────────────────────────────────────────────────────

function ReconciliationPanel({
  piId, pi, reconciliation, canSeeTheoretical, canReview, onChanged,
}: {
  piId: string;
  pi: PIHeader;
  reconciliation: PIReconciliation | undefined;
  canSeeTheoretical: boolean;
  canReview: boolean;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'shortfall' | 'surplus' | 'pending' | 'match' | 'post_cutoff'>('all');
  const [reviewItem, setReviewItem] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  if (!canSeeTheoretical) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <EyeOff className="h-12 w-12 text-muted-foreground/25" />
        <p className="text-sm font-bold text-muted-foreground">Conciliación restringida</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Este inventario es de conteo ciego y su rol no está autorizado a consultar existencias teóricas ni diferencias.
          Registre las cantidades físicas y entregue el resultado a un usuario autorizado.
        </p>
      </div>
    );
  }

  if (!reconciliation) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  const t = reconciliation.totals;
  const lines = reconciliation.lines || [];

  const filtered = lines.filter((l) => {
    if (l.counted_qty === null) return filter === 'all' || filter === 'pending';
    const d = Number(l.difference);
    if (filter === 'shortfall') return d < 0;
    if (filter === 'surplus') return d > 0;
    if (filter === 'match') return d === 0;
    if (filter === 'post_cutoff') return (l.post_cutoff_movements || 0) > 0;
    return true;
  });

  const submitReview = async () => {
    if (!reviewItem || reviewNotes.trim().length < 3) return;
    setSavingReview(true);
    try {
      await apiFetch(`/api/physical-inventory/${piId}/review`, {
        method: 'POST',
        body: JSON.stringify({ itemId: reviewItem, reviewNotes: reviewNotes.trim() }),
      });
      toast.success('Revisión registrada');
      setReviewItem(null);
      setReviewNotes('');
      onChanged();
    } catch (e) {
      toast.error('No se pudo registrar la revisión', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {([
          ['Líneas', t.total_items, 'text-foreground'],
          ['Contadas', t.counted, 'text-primary'],
          ['Pendientes', t.pending, 'text-warning'],
          ['Sin diferencia', t.match, 'text-success'],
          ['Faltantes', t.shortfall, 'text-destructive'],
          ['Sobrantes', t.surplus, 'text-success'],
          ['Mov. post-corte', t.post_cutoff_affected, 'text-info'],
        ] as Array<[string, number, string]>).map(([label, value, cls]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-xl font-black tabular-nums', cls)}>{value}</p>
          </div>
        ))}
      </div>

      {t.drift > 0 && (
        <p className="rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t.drift} producto(s) con saldo histórico reconstruido desde el ledger que NO concuerda con el saldo actual
          (posible dato inicial sin movimientos). Revise estas líneas antes de autorizar ajustes.
        </p>
      )}
      {t.post_cutoff_affected > 0 && (
        <p className="rounded-xl border border-info/25 bg-info/5 px-3 py-2 text-xs text-info flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {t.post_cutoff_affected} producto(s) con movimientos posteriores al corte. La comparación usa el saldo al corte;
          el ajuste generado parte del saldo ACTUAL para dejar el stock en la cantidad contada (regla de conciliación temporal).
        </p>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {([
          ['all', `Todas (${t.total_items})`],
          ['shortfall', `Faltantes (${t.shortfall})`],
          ['surplus', `Sobrantes (${t.surplus})`],
          ['pending', `Pendientes (${t.pending})`],
          ['match', `Sin diferencia (${t.match})`],
          ['post_cutoff', `Post-corte (${t.post_cutoff_affected})`],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-black uppercase transition-colors',
              filter === id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabla de diferencias */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b">
            <tr>
              {['#', 'Código', 'Producto', 'Teórica', 'Contada', 'Dif.', 'Valor dif.', 'Post-corte', 'Revisión'].map((h, i) => (
                <th key={i} className={cn('p-2.5 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground',
                  i >= 3 && i <= 6 && 'text-right')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const d = Number(l.difference);
              return (
                <tr key={l.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                  <td className="p-2.5 font-mono text-muted-foreground">{l.line_number}</td>
                  <td className="p-2.5 font-mono">{l.sku || '—'}</td>
                  <td className="p-2.5 font-bold max-w-[220px] truncate" title={l.name}>{l.name}</td>
                  <td className="p-2.5 text-right font-mono tabular-nums">
                    {Number(l.theoretical_qty)}
                    {l.theoretical_source === 'ledger_drift' && <AlertTriangle className="ml-1 inline h-3 w-3 text-warning" />}
                  </td>
                  <td className="p-2.5 text-right font-mono tabular-nums font-bold">
                    {l.counted_qty === null ? '—' : Number(l.counted_qty)}
                  </td>
                  <td className={cn('p-2.5 text-right font-mono tabular-nums font-black',
                    l.counted_qty === null ? 'text-muted-foreground/40' : d < 0 ? 'text-destructive' : d > 0 ? 'text-success' : 'text-muted-foreground')}>
                    {l.counted_qty === null ? '—' : d > 0 ? `+${d}` : d}
                  </td>
                  <td className="p-2.5 text-right font-mono tabular-nums text-muted-foreground">
                    {l.counted_qty !== null && d !== 0 ? formatCurrency(Number(l.difference_value) || 0) : '—'}
                  </td>
                  <td className="p-2.5 text-right">
                    {(l.post_cutoff_movements || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-info/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-info" title={`Neto post-corte: ${Number(l.post_cutoff_net)}`}>
                        {l.post_cutoff_movements} mov
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="p-2.5">
                    {l.review_notes ? (
                      <span className="block max-w-[180px] truncate text-[10px] italic text-muted-foreground" title={l.review_notes}>
                        “{l.review_notes}”
                      </span>
                    ) : canReview && d !== 0 ? (
                      <button
                        onClick={() => { setReviewItem(l.id); setReviewNotes(''); }}
                        className="rounded-lg border border-border px-2 py-1 text-[10px] font-black uppercase text-muted-foreground hover:bg-muted"
                      >
                        + Explicar
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">Ninguna línea con este filtro.</p>
        )}
      </div>

      {/* Modal de revisión */}
      <BaseModal
        open={!!reviewItem}
        onOpenChange={(o) => !o && setReviewItem(null)}
        title={<span className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-warning" /> Explicación de la diferencia</span>}
        description="Registre el motivo (rotura, robo, error de registro, ubicación, etc.). Queda asociado a la línea y a su usuario."
        maxWidth="sm:max-w-md"
        footer={
          <div className="flex gap-2">
            <SecondaryButton className="flex-1" onClick={() => setReviewItem(null)}>Cancelar</SecondaryButton>
            <PrimaryButton className="flex-1" onClick={submitReview} disabled={reviewNotes.trim().length < 3 || savingReview}>
              {savingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Guardar revisión
            </PrimaryButton>
          </div>
        }
      >
        <textarea
          className="min-h-[90px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Motivo de la diferencia…"
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          maxLength={500}
        />
      </BaseModal>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Panel de AJUSTES — documentos generados
// ──────────────────────────────────────────────────────────────────────────

function AdjustmentsPanel({ pi, onChanged }: { pi: PIHeader; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const links = pi.adjustments || [];

  const goToAdjustments = () => {
    // Navegación al módulo Ajustes Documentales (mismo patrón del shell)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/?view=inventory_adjustments');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const confirmAdjustment = async (adjustmentId: string) => {
    const tid = toast.loading('Confirmando ajuste…');
    try {
      const { supabase: sb } = await import('@/lib/supabaseClient');
      const { error } = await sb.rpc('confirm_inventory_adjustment', { p_adjustment_id: adjustmentId });
      if (error) throw new Error(error.message);
      toast.success('Ajuste confirmado y aplicado al inventario', { id: tid });
      queryClient.invalidateQueries({ queryKey: ['pi-detail', pi.id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-adjustments'] });
      onChanged();
    } catch (e) {
      toast.error('No se pudo confirmar', { id: tid, description: e instanceof Error ? e.message : undefined });
    }
  };

  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
        <ArrowLeftRight className="h-10 w-10 text-muted-foreground/25" />
        <p className="text-sm font-bold text-muted-foreground">
          {['draft', 'prepared', 'in_progress', 'counted', 'in_reconciliation'].includes(pi.status)
            ? 'Aún no se han generado ajustes'
            : 'Sin diferencias que ajustar'}
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          {['pending_authorization'].includes(pi.status)
            ? 'Desde la pestaña Conciliación, un usuario autorizado puede generar los borradores de ajuste por faltantes y sobrantes.'
            : 'Los ajustes se generan al autorizar la conciliación de un conteo con diferencias.'}
        </p>
        <SecondaryButton onClick={goToAdjustments}>
          <ExternalLink className="h-4 w-4" /> Ver Ajustes Documentales
        </SecondaryButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Documentos generados desde {pi.pi_number}. Los borradores se aplican desde aquí o desde Ajustes Documentales
          (Inicio → Operación → Almacén → Ajustes Documentales).
        </p>
        <SecondaryButton onClick={goToAdjustments}>
          <ExternalLink className="h-4 w-4" /> Ir a Ajustes Documentales
        </SecondaryButton>
      </div>

      {links.map((link) => {
        const adj = link.adjustment;
        const isShortfall = link.kind === 'shortfall';
        return (
          <div key={link.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider',
                isShortfall ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
                {isShortfall ? <PackageMinus className="h-3.5 w-3.5" /> : <PackagePlus className="h-3.5 w-3.5" />}
                {isShortfall ? 'Faltantes' : 'Sobrantes'}
              </span>
              <span className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-primary">
                Ajuste por inventario físico
              </span>
              <span className="font-mono text-xs text-muted-foreground">doc {link.adjustment_id.slice(0, 8)}…</span>
              {adj && <DocumentStatusBadge type="adjustment" status={adj.status} size="xs" />}
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {link.items_count} producto(s) · generado {formatDate(link.generated_at)}
              </span>
            </div>

            {adj && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <div><p className="font-black uppercase tracking-widest text-muted-foreground">Motivo</p><p className="mt-0.5 text-xs font-bold">
                  {adj.reason === 'STOCKTAKE_SHRINKAGE' ? 'Faltante de inventario' : adj.reason === 'STOCKTAKE_SURPLUS' ? 'Sobrante de inventario' : adj.reason}
                </p></div>
                <div><p className="font-black uppercase tracking-widest text-muted-foreground">Creado</p><p className="mt-0.5 text-xs">{formatDate(adj.created_at)}</p></div>
                <div><p className="font-black uppercase tracking-widest text-muted-foreground">Confirmado</p><p className="mt-0.5 text-xs">{adj.confirmed_at ? formatDate(adj.confirmed_at) : '—'}</p></div>
                <div><p className="font-black uppercase tracking-widest text-muted-foreground">Notas</p><p className="mt-0.5 truncate text-xs" title={adj.notes || ''}>{adj.notes || '—'}</p></div>
              </div>
            )}

            {adj?.status === 'pending' && (
              <div className="mt-3 flex justify-end">
                <PrimaryButton onClick={() => confirmAdjustment(link.adjustment_id)}>
                  <ShieldCheck className="h-4 w-4" /> Confirmar y aplicar al inventario
                </PrimaryButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Panel de AUDITORÍA — historial de capturas + hojas
// ──────────────────────────────────────────────────────────────────────────

function AuditPanel({ piId, pi, sheets, onChanged }: { piId: string; pi: PIHeader; sheets: PISheet[]; onChanged: () => void }) {
  const [logPage, setLogPage] = useState(0);
  const PAGE = 30;

  const { data: log = [], isLoading } = useQuery({
    queryKey: ['pi-count-log', piId, logPage],
    queryFn: async () => {
      const from = logPage * PAGE;
      const { data } = await supabase
        .from('physical_inventory_count_log')
        .select('action, old_counted_qty, new_counted_qty, source, created_at, user:profiles!physical_inventory_count_log_user_id_fkey(full_name)')
        .eq('pi_id', piId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      return (data || []) as Array<{
        action: string; old_counted_qty: number | null; new_counted_qty: number | null;
        source: string; created_at: string; user?: { full_name: string } | null;
      }>;
    },
    enabled: !!piId,
  });

  const ACTION_LABELS: Record<string, string> = {
    count: 'Conteo manual', clear: 'Limpieza', import: 'Importación Excel', review: 'Revisión',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Momentos e instantánea */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Instantánea de existencias teóricas</p>
          <div className="mt-2 space-y-1 text-xs">
            <p>Método: <b>{String((pi.snapshot_meta as Record<string, unknown>)?.theoretical_method || '—')}</b></p>
            <p>Líneas generadas: <b>{String((pi.snapshot_meta as Record<string, unknown>)?.lines_generated ?? pi.total_items)}</b></p>
            <p>Deriva de ledger: <b>{String((pi.snapshot_meta as Record<string, unknown>)?.ledger_drift_products ?? 0)}</b> producto(s)</p>
            <p>Fecha de corte: <b>{formatDate(pi.cutoff_date)}</b></p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Hojas de conteo generadas</p>
          <div className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs">
            {sheets.length === 0 && <p className="text-muted-foreground">Ninguna generada.</p>}
            {sheets.map((s) => (
              <p key={s.id} className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold">#{s.seq}</span>
                <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-black uppercase',
                  s.mode === 'blind' ? 'bg-muted text-muted-foreground' : 'bg-info/10 text-info')}>
                  {s.mode === 'blind' ? 'Ciega' : 'Con teóricas'}
                </span>
                <span className="text-muted-foreground">{s.total_lines} líneas · {formatDate(s.generated_at)}</span>
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Historial de capturas */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Historial de capturas (quién, cuándo, valor anterior → nuevo)
          </p>
          {logPage > 0 && (
            <button className="text-[10px] font-bold text-primary" onClick={() => setLogPage(logPage - 1)}>← Anteriores</button>
          )}
        </div>
        <table className="w-full text-xs">
          <thead className="border-b">
            <tr>
              {['Fecha', 'Acción', 'Anterior', 'Nuevo', 'Origen', 'Usuario'].map((h) => (
                <th key={h} className="p-2.5 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground/40" /></td></tr>
            ) : log.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin eventos registrados.</td></tr>
            ) : log.map((e, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                <td className="p-2.5 font-mono text-muted-foreground">{formatDate(e.created_at)}</td>
                <td className="p-2.5 font-bold">{ACTION_LABELS[e.action] || e.action}</td>
                <td className="p-2.5 font-mono tabular-nums">{e.old_counted_qty ?? '—'}</td>
                <td className="p-2.5 font-mono tabular-nums font-bold">
                  {e.new_counted_qty ?? '(pendiente)'}
                </td>
                <td className="p-2.5">
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-black uppercase',
                    e.source === 'excel' ? 'bg-info/10 text-info' : 'bg-muted text-muted-foreground')}>
                    {e.source === 'excel' ? 'Excel' : 'Manual'}
                  </span>
                </td>
                <td className="p-2.5">{e.user?.full_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {log.length === PAGE && (
          <button className="w-full border-t p-2 text-[10px] font-black uppercase text-primary" onClick={() => setLogPage(logPage + 1)}>
            Cargar más
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Acciones de estado (según estado actual y permisos)
// ──────────────────────────────────────────────────────────────────────────

function StateActions({
  pi, canAuthorize, canClose, transitioning, onTransition, onVoid,
}: {
  pi: PIHeader;
  canAuthorize: boolean;
  canClose: boolean;
  transitioning: string | null;
  onTransition: (action: string, extra?: Record<string, unknown>) => void;
  onVoid: () => void;
}) {
  const s = pi.status;
  const btn = (action: string, label: string, Icon: React.ComponentType<{ className?: string }>, primary = false) => (
    primary ? (
      <PrimaryButton key={action} onClick={() => onTransition(action)} disabled={transitioning === action}>
        {transitioning === action ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {label}
      </PrimaryButton>
    ) : (
      <SecondaryButton key={action} onClick={() => onTransition(action)} disabled={transitioning === action}>
        {transitioning === action ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {label}
      </SecondaryButton>
    )
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {s === 'draft' && canAuthorize && btn('prepare', 'Preparar conteo', PackageCheck, true)}
      {s === 'prepared' && btn('start', 'Iniciar conteo', PlayCircle, true)}
      {s === 'in_progress' && btn('complete', 'Completar conteo', CheckCircle2, true)}
      {s === 'counted' && canAuthorize && btn('submit_reconciliation', 'Enviar a conciliación', ClipboardList, true)}
      {s === 'in_reconciliation' && canAuthorize && btn('submit_authorization', 'Enviar a autorización', ShieldCheck, true)}
      {s === 'pending_authorization' && canAuthorize && (
        <>
          {btn('generate_adjustments', 'Generar ajustes documentales', ArrowLeftRight, true)}
          {btn('submit_reconciliation', 'Devolver a conciliación', TrendingDown)}
        </>
      )}
      {s === 'conciliated' && canClose && btn('close', 'Cerrar inventario', Lock, true)}
      {['draft', 'prepared', 'in_progress', 'counted', 'in_reconciliation', 'pending_authorization'].includes(s) && (
        <button
          onClick={onVoid}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/5 px-4 text-xs font-black uppercase text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          <Ban className="h-4 w-4" /> Anular
        </button>
      )}
    </div>
  );
}
