'use client';

/**
 * CP-FIN-REC-001 · Vista B — Pestaña «Conciliación operativa-contable».
 *
 * Responde de forma permanente a: ¿el saldo que muestra la contabilidad
 * coincide realmente con el valor que generan las operaciones de la empresa?
 *
 * Compara dos fuentes INDEPENDIENTES por cuenta:
 *  · Valor operacional — calculado por el RPC desde los módulos operativos
 *    (products, payment_transactions, receipts, transactions, kardex…),
 *    nunca desde fin_movements (prohibición de conciliación circular).
 *  · Valor contable — saldo del mayor (fin_movements) de la generación activa.
 *
 * Convención uniforme: Diferencia = operacional − contable (naturaleza-aware).
 * La ecuación contable puede estar perfectamente cuadrada y aun así existir
 * una diferencia aquí (p. ej. inventario contable −2.36 M vs operativo +0.59 M):
 * eso es EXACTAMENTE lo que esta pestaña debe hacer visible.
 *
 * Ejecución bajo demanda (misión §5.5): la matriz se calcula al pulsar
 * «Ejecutar conciliación» o «Actualizar» — nunca se presenta una conciliación
 * antigua como actual (la barra de ejecución muestra fecha/hora, corte,
 * generación, período y frescura de las fuentes).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  History,
  Loader2,
  RefreshCw,
  Save,
  Search,
  XCircle,
} from 'lucide-react';
import { cn, formatLabeledCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { fetchReconciliation, fetchReconciliationHistory, saveReconciliationSnapshot } from './fin-api';
import { CategoryDetailPanel } from './CategoryDetailPanel';
// ADNEGOCIO-UI 2026-11-23 (misión §2): centralización de la información
// contable en esta pestaña — orden definitivo: 1) Diferencia de valoración
// contable CUP, 2) Caja — Respaldo físico y disponibilidad, 3) Configuración
// contable pendiente. Los tres bloques se RETIRARON del Inicio y del
// Dashboard de esta vista: una sola representación, sin duplicados.
import { FinValoracionBlock } from './FinValoracionBlock';
import { FinCajaFisicaBlock } from './FinCajaFisicaBlock';
import { FinDocumentConfigAlert } from './FinDocumentConfigAlert';
import type {
  FinClase,
  ReconciliationAccountRow,
  ReconciliationData,
  ReconciliationEstado,
  ReconciliationSnapshotMeta,
} from './types';

interface ReconciliationTabProps {
  storeId: string;
  /** Fecha de corte para las cuentas de balance. */
  asOf: string;
  /** Período para las cuentas de resultado (ingresos/gastos). */
  from: string;
  to: string;
  /** Se incrementa con «Actualizar» global: re-ejecuta si ya se ejecutó. */
  refreshKey: number;
}

const ESTADOS: { id: ReconciliationEstado | 'TODOS'; label: string }[] = [
  { id: 'TODOS', label: 'Todos los estados' },
  { id: 'CONCILIADO', label: 'CONCILIADO' },
  { id: 'DIFERENCIA', label: 'DIFERENCIA' },
  { id: 'ALERTA', label: 'ALERTA' },
  { id: 'INCOMPLETO', label: 'INCOMPLETO' },
  { id: 'NO_CONCILIABLE', label: 'NO CONCILIABLE' },
  { id: 'PENDIENTE', label: 'PENDIENTE' },
];

const CLASES: { id: FinClase | 'TODAS'; label: string }[] = [
  { id: 'TODAS', label: 'Todas las clases' },
  { id: 'activo', label: 'Activo' },
  { id: 'pasivo', label: 'Pasivo' },
  { id: 'patrimonio', label: 'Patrimonio' },
  { id: 'ingreso', label: 'Ingreso' },
  { id: 'gasto', label: 'Gasto' },
];

function EstadoBadge({ estado }: { estado: ReconciliationEstado }) {
  const map: Record<ReconciliationEstado, string> = {
    CONCILIADO: 'bg-success/10 text-success',
    DIFERENCIA: 'bg-warning/10 text-warning',
    ALERTA: 'bg-destructive/10 text-destructive',
    INCOMPLETO: 'bg-muted text-muted-foreground italic',
    NO_CONCILIABLE: 'bg-muted/60 text-muted-foreground',
    PENDIENTE: 'bg-primary/10 text-primary',
  };
  const label = estado === 'NO_CONCILIABLE' ? 'NO CONCILIABLE' : estado;
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap',
        map[estado],
      )}
      data-testid={`estado-${estado}`}
    >
      {label}
    </span>
  );
}

/** Moneda CUP o «—» cuando no aplica (sin fuente / sin período). */
function cup(n: number | null | undefined): string {
  return n == null ? '—' : formatLabeledCurrency(n, 'CUP');
}

/** Lecturas seguras del detalle JSON (payload por cuenta definido en el RPC). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

export function ReconciliationTab({ storeId, asOf, from, to, refreshKey }: ReconciliationTabProps) {
  const token = useAuthStore((s) => s.token);
  const canManage = useAuthStore((s) => ['admin', 'manager'].includes(s.user?.role ?? ''));

  const [data, setData] = useState<ReconciliationData | null>(null);
  const [executed, setExecuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estadoFiltro, setEstadoFiltro] = useState<ReconciliationEstado | 'TODOS'>('TODOS');
  const [claseFiltro, setClaseFiltro] = useState<FinClase | 'TODAS'>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ReconciliationSnapshotMeta[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const ejecutar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchReconciliation(storeId, asOf, from, to, token);
      setData(d);
      setExecuted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al ejecutar la conciliación');
    } finally {
      setLoading(false);
    }
  }, [storeId, asOf, from, to, token]);

  // «Actualizar» global (refreshKey) re-ejecuta solo si ya se ejecutó: la
  // conciliación es bajo demanda (misión §5.5), nunca automática al montar.
  useEffect(() => {
    if (executed) {
      void ejecutar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const guardarSnapshot = useCallback(async () => {
    if (!data || saving) return;
    setSaving(true);
    try {
      const r = await saveReconciliationSnapshot(storeId, asOf, from, to, token);
      toast.success(`Snapshot guardado (${r.run_id.slice(0, 8)}…) — queda como evidencia de auditoría`);
      setHistory(null); // fuerza recarga del historial si está abierto
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar el snapshot');
    } finally {
      setSaving(false);
    }
  }, [data, saving, storeId, asOf, from, to, token]);

  const toggleHistorial = useCallback(async () => {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    if (history === null) {
      setHistoryLoading(true);
      try {
        setHistory(await fetchReconciliationHistory(storeId, token));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al consultar el historial');
        setHistoryOpen(false);
      } finally {
        setHistoryLoading(false);
      }
    }
  }, [historyOpen, history, storeId, token]);

  const cuentasFiltradas = useMemo(() => {
    const rows = data?.cuentas ?? [];
    const q = busqueda.trim().toLowerCase();
    return rows.filter((r) => {
      if (estadoFiltro !== 'TODOS' && r.estado !== estadoFiltro) return false;
      if (claseFiltro !== 'TODAS' && r.clase !== claseFiltro) return false;
      if (q && !(`${r.cuenta} ${r.nombre}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, estadoFiltro, claseFiltro, busqueda]);

  // ADNEGOCIO-UI (misión §2): información contable centralizada, en el orden
  // exigido — 1) Diferencia de valoración contable CUP, 2) Caja — Respaldo
  // físico y disponibilidad, 3) Configuración contable pendiente. Visible en
  // TODOS los estados de la pestaña (antes de ejecutar, cargando, error y
  // matriz): la centralización no depende de la ejecución bajo demanda.
  const seccionCentralizada = (
    <div className="space-y-3" data-testid="reconciliacion-centralizada">
      <FinValoracionBlock />
      <FinCajaFisicaBlock />
      <FinDocumentConfigAlert storeId={storeId} refreshKey={refreshKey} />
    </div>
  );

  // ── Estado inicial: PENDIENTE (no ejecutada) ──
  if (!executed && !loading) {
    return (
      <div className="space-y-4" data-testid="reconciliation-tab">
        {seccionCentralizada}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm" data-testid="recon-pendiente">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="w-8 h-8 text-primary" />
          </div>
          <div className="max-w-lg space-y-2">
            <h3 className="text-base font-black uppercase tracking-tight">Conciliación operativa-contable</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Compara el valor calculado desde los módulos operativos (inventario, caja, obligaciones,
              ventas) con el saldo del mayor contable de la generación activa. Detecta diferencias
              aunque la ecuación contable esté cuadrada y los saldos sean positivos. La ejecución es
              bajo demanda: no se calcula nada hasta que la solicites.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Corte: <span className="font-bold">{asOf}</span> · Período de resultado:{' '}
              <span className="font-bold">
                {from} — {to}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void ejecutar()}
            className="h-11 px-5 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-wide hover:opacity-90 transition-all min-h-[44px] flex items-center gap-2"
            data-testid="btn-ejecutar-conciliacion"
          >
            <ClipboardCheck className="w-4 h-4" /> Ejecutar conciliación
          </button>
          {error && <p className="text-xs text-destructive font-bold">{error}</p>}
        </div>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-4" data-testid="reconciliation-tab">
        {seccionCentralizada}
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" data-testid="recon-loading">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-xs font-black uppercase tracking-widest">Ejecutando conciliación…</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4" data-testid="reconciliation-tab">
        {seccionCentralizada}
        <div className="py-8 text-center space-y-3" data-testid="recon-error">
        <p className="text-xs text-destructive font-bold">{error}</p>
        <button
          type="button"
          onClick={() => void ejecutar()}
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:underline min-h-[36px]"
        >
          <RefreshCw className="w-3 h-3" /> Reintentar
        </button>
      </div>
    </div>
    );
  }

  if (!data) return null;

  const { ejecucion, resumen, hallazgos } = data;
  const fmtFechaHora = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('es-CU', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

  return (
    <div className="space-y-4" data-testid="reconciliation-tab">
      {seccionCentralizada}

      {/* Barra de ejecución: nunca presentar una conciliación antigua como actual */}
      <div
        className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm text-[11px] text-muted-foreground"
        data-testid="recon-ejecucion"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-black uppercase tracking-widest text-foreground">Conciliación ejecutada</span>
          <span>
            Calculada: <span className="font-bold text-foreground">{fmtFechaHora(ejecucion.calculado_en)}</span>
          </span>
          <span>
            Corte: <span className="font-bold text-foreground">{ejecucion.fecha_corte}</span>
          </span>
          <span>
            Período de resultado: <span className="font-bold text-foreground">
              {ejecucion.desde ?? '—'} — {ejecucion.hasta ?? '—'}
            </span>
          </span>
          <span>
            Generación: <span className="font-bold text-foreground">{ejecucion.generacion?.code ?? '— (legada)'}</span>
          </span>
          <span>
            Metodología: <span className="font-bold text-foreground">{ejecucion.metodologia_version}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
          <span>Última actualización de las fuentes:</span>
          {Object.entries(ejecucion.fuentes_actualizadas ?? {})
            .filter(([, v]) => v)
            .slice(0, 6)
            .map(([k, v]) => (
              <span key={k} className="tabular-nums">
                {k}: <span className="font-bold">{fmtFechaHora(v)}</span>
              </span>
            ))}
        </div>
      </div>

      {/* Resumen rápido + acciones */}
      <div className="flex flex-wrap items-center gap-2" data-testid="recon-resumen">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success/10 text-success text-[11px] font-black uppercase tracking-wide">
          <CheckCircle2 className="w-3 h-3" /> {resumen.conciliadas} conciliadas
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning/10 text-warning text-[11px] font-black uppercase tracking-wide">
          <AlertTriangle className="w-3 h-3" /> {resumen.diferencias} con diferencia
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-[11px] font-black uppercase tracking-wide">
          <XCircle className="w-3 h-3" /> {resumen.alertas} alertas
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-black uppercase tracking-wide">
          {resumen.incompletas} incompletas
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground text-[11px] font-black uppercase tracking-wide">
          {resumen.no_conciliables} no conciliables
        </span>
        {(resumen.documentos_pendientes > 0 || resumen.movimientos_sin_respaldo > 0) && (
          <span className="text-[11px] font-bold text-destructive">
            {resumen.documentos_pendientes} documento(s) sin asiento ·{' '}
            {resumen.movimientos_sin_respaldo} movimiento(s) sin respaldo
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => void ejecutar()}
            disabled={loading}
            className="h-10 px-3 rounded-lg border border-border text-xs font-black uppercase tracking-wide text-muted-foreground hover:bg-muted transition-all min-h-[40px] flex items-center gap-1.5 disabled:opacity-50"
            data-testid="btn-re-ejecutar"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-ejecutar
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => void guardarSnapshot()}
              disabled={saving}
              title="Guardar esta ejecución como evidencia de auditoría (evolución histórica de diferencias)"
              className="h-10 px-3 rounded-lg border border-primary/40 bg-primary/5 text-primary text-xs font-black uppercase tracking-wide hover:bg-primary/10 transition-all min-h-[40px] flex items-center gap-1.5 disabled:opacity-50"
              data-testid="btn-guardar-snapshot"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar snapshot
            </button>
          )}
          <button
            type="button"
            onClick={() => void toggleHistorial()}
            className="h-10 px-3 rounded-lg border border-border text-xs font-black uppercase tracking-wide text-muted-foreground hover:bg-muted transition-all min-h-[40px] flex items-center gap-1.5"
            data-testid="btn-historial"
          >
            <History className="w-3.5 h-3.5" /> Historial
          </button>
        </div>
      </div>

      {/* Historial de snapshots (evolución de diferencias — misión §5.7) */}
      {historyOpen && (
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm" data-testid="recon-historial">
          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-widest">Cargando historial…</span>
            </div>
          ) : (history?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              Sin snapshots guardados todavía. Usa «Guardar snapshot» para conservar evidencia de una
              ejecución y poder comparar la evolución de las diferencias en el tiempo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead className="bg-muted/50">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="px-2.5 py-2 text-left">Ejecutado</th>
                    <th className="px-2.5 py-2 text-left">Corte</th>
                    <th className="px-2.5 py-2 text-left">Período</th>
                    <th className="px-2.5 py-2 text-left">Generación</th>
                    <th className="px-2.5 py-2 text-right">Conciliadas</th>
                    <th className="px-2.5 py-2 text-right">Diferencias</th>
                    <th className="px-2.5 py-2 text-right">Alertas</th>
                    <th className="px-2.5 py-2 text-right">Docs. pendientes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(history ?? []).map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{fmtFechaHora(s.ejecutado_en)}</td>
                      <td className="px-2.5 py-2 tabular-nums">{s.fecha_corte}</td>
                      <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                        {s.desde && s.hasta ? `${s.desde} — ${s.hasta}` : '—'}
                      </td>
                      <td className="px-2.5 py-2">{s.generacion ?? '—'}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums">{s.resumen?.conciliadas ?? '—'}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums">{s.resumen?.diferencias ?? '—'}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums">{s.resumen?.alertas ?? '—'}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums">{s.resumen?.documentos_pendientes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filtros de la matriz (misión §5.5) */}
      <div className="flex flex-wrap items-center gap-2" data-testid="recon-filtros">
        <label className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código o nombre…"
            className="h-10 w-56 rounded-lg border border-border bg-background pl-8 pr-3 text-xs font-bold outline-none focus:border-primary min-h-[40px]"
            aria-label="Buscar cuenta por código o nombre"
            data-testid="filter-busqueda-recon"
          />
        </label>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value as ReconciliationEstado | 'TODOS')}
          className="h-10 rounded-lg border border-border bg-background px-2 text-xs font-bold outline-none focus:border-primary min-h-[40px]"
          aria-label="Filtrar por estado de conciliación"
          data-testid="filter-estado-recon"
        >
          {ESTADOS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          value={claseFiltro}
          onChange={(e) => setClaseFiltro(e.target.value as FinClase | 'TODAS')}
          className="h-10 rounded-lg border border-border bg-background px-2 text-xs font-bold outline-none focus:border-primary min-h-[40px]"
          aria-label="Filtrar por clase de cuenta"
          data-testid="filter-clase-recon"
        >
          {CLASES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
          {cuentasFiltradas.length} de {data.cuentas.length} cuentas
        </span>
      </div>

      {/* Matriz de conciliación */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm" data-testid="recon-table">
        <table className="w-full text-xs min-w-[1100px]">
          <thead className="bg-muted/50">
            <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <th className="px-2.5 py-2 text-left">Cuenta</th>
              <th className="px-2.5 py-2 text-left hidden lg:table-cell">Clase / Grupo</th>
              <th className="px-2.5 py-2 text-right">Valor operacional</th>
              <th className="px-2.5 py-2 text-right">Valor contable</th>
              <th className="px-2.5 py-2 text-right">Diferencia</th>
              <th className="px-2.5 py-2 text-right hidden md:table-cell">%</th>
              <th className="px-2.5 py-2 text-right hidden xl:table-cell">Docs. op.</th>
              <th className="px-2.5 py-2 text-right hidden xl:table-cell">Movs. contables</th>
              <th className="px-2.5 py-2 text-left hidden lg:table-cell">Última actualización</th>
              <th className="px-2.5 py-2 text-left">Calidad</th>
              <th className="px-2.5 py-2 text-left">Estado</th>
              <th className="px-2 py-2 w-8" aria-label="Expandir detalle" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {cuentasFiltradas.map((r) => {
              const isExpanded = expanded === r.cuenta;
              return (
                <React.Fragment key={r.cuenta}>
                  <tr
                    className={cn(
                      'cursor-pointer hover:bg-muted/30 transition-colors',
                      isExpanded && 'bg-muted/40',
                      r.estado === 'ALERTA' && 'bg-destructive/5',
                    )}
                    onClick={() => setExpanded(isExpanded ? null : r.cuenta)}
                    data-testid={`recon-row-${r.cuenta}`}
                    aria-expanded={isExpanded}
                  >
                    <td className="px-2.5 py-2">
                      <div className="font-mono font-bold">{r.cuenta}</div>
                      <div className="text-muted-foreground text-[11px]">{r.nombre}</div>
                    </td>
                    <td className="px-2.5 py-2 hidden lg:table-cell text-muted-foreground">
                      <span className="capitalize">{r.clase}</span>
                      <div className="text-[10px]">{r.grupo.replaceAll('_', ' ')}</div>
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums font-bold whitespace-nowrap">
                      {r.es_periodo && !(ejecucion.desde && ejecucion.hasta) ? (
                        <span className="text-muted-foreground italic text-[10px]">requiere período</span>
                      ) : (
                        cup(r.valor_operacional)
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-2.5 py-2 text-right tabular-nums whitespace-nowrap',
                        (r.valor_contable ?? 0) < 0 && 'text-destructive',
                      )}
                    >
                      {cup(r.valor_contable)}
                    </td>
                    <td
                      className={cn(
                        'px-2.5 py-2 text-right tabular-nums font-black whitespace-nowrap',
                        r.diferencia != null && Math.abs(r.diferencia) > (r.tolerancia ?? 0.01) && 'text-destructive',
                      )}
                    >
                      {cup(r.diferencia)}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                      {r.diferencia_pct != null ? `${r.diferencia_pct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums hidden xl:table-cell text-muted-foreground">
                      {r.documentos_operacionales ?? '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums hidden xl:table-cell text-muted-foreground">
                      {r.movimientos_contables ?? '—'}
                    </td>
                    <td className="px-2.5 py-2 hidden lg:table-cell text-muted-foreground whitespace-nowrap text-[11px]">
                      <div>Op.: {r.ultima_fecha_operacional ?? '—'}</div>
                      <div>Cont.: {r.ultima_fecha_contable ?? '—'}</div>
                    </td>
                    <td className="px-2.5 py-2 text-muted-foreground text-[10px] font-bold uppercase">
                      {r.calidad === 'SIN_FUENTE' ? 'Sin fuente' : r.calidad === 'PARCIAL' ? 'Parcial' : 'Completa'}
                    </td>
                    <td className="px-2.5 py-2">
                      <EstadoBadge estado={r.estado} />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={12} className="px-3 py-4 bg-muted/20 border-t border-border/50">
                        <ReconDetail
                          row={r}
                          storeId={storeId}
                          asOf={asOf}
                          from={ejecucion.desde ?? from}
                          to={ejecucion.hasta ?? to}
                          docsPendientes={hallazgos.documentos_pendientes}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {cuentasFiltradas.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground text-xs">
                  Ninguna cuenta cumple los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Convención: <span className="font-bold">Diferencia = valor operacional − valor contable</span> (con la
        naturaleza del rubro: débito−crédito en activo/gasto, crédito−débito en el resto). El valor operacional
        se calcula SIEMPRE desde tablas operativas independientes (nunca desde el propio mayor) y el contable
        corresponde a la generación activa al momento de la ejecución. Las cuentas sin fuente operacional
        independiente se presentan como NO CONCILIABLE, sin cifras inventadas.
      </p>
    </div>
  );
}

// ── Panel de detalle por cuenta (misión §5.6: investigar, no solo alertar) ──

function ReconDetail({
  row,
  storeId,
  asOf,
  from,
  to,
  docsPendientes,
}: {
  row: ReconciliationAccountRow;
  storeId: string;
  asOf: string;
  from: string;
  to: string;
  docsPendientes: { tipo: string; pendientes?: number; n?: number }[];
}) {
  const det = row.detalle ?? {};
  const esInventario = row.cuenta === 'ACT_INVENTARIO';
  const pendientesPorTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of docsPendientes) m.set(h.tipo, h.pendientes ?? h.n ?? 0);
    return m;
  }, [docsPendientes]);

  return (
    <div className="space-y-4" data-testid={`recon-detail-${row.cuenta}`}>
      {/* Explicación del cálculo */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-black uppercase tracking-widest text-foreground">Fórmula y fuentes</h4>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{row.metodologia}</p>
          <p className="text-[11px] text-muted-foreground">
            Fuentes consultadas: <span className="font-bold">{row.fuentes?.join(', ') || '—'}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Tolerancia: {row.tolerancia != null ? formatLabeledCurrency(row.tolerancia, 'CUP') : '—'} · Materialidad
            (ALERTA): {row.materialidad != null ? formatLabeledCurrency(row.materialidad, 'CUP') : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background p-3 space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Valor operacional</span>
            <span className="font-bold tabular-nums">{cup(row.valor_operacional)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Valor contable (mayor)</span>
            <span className="font-bold tabular-nums">{cup(row.valor_contable)}</span>
          </div>
          <div className="flex justify-between text-[11px] border-t border-border/60 pt-1">
            <span className="text-muted-foreground">Diferencia (op. − cont.)</span>
            <span
              className={cn(
                'font-black tabular-nums',
                row.diferencia != null && Math.abs(row.diferencia) > (row.tolerancia ?? 0.01) && 'text-destructive',
              )}
            >
              {cup(row.diferencia)}
            </span>
          </div>
          {row.diferencia_pct != null && (
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Diferencia porcentual (s/contable)</span>
              <span className="font-bold tabular-nums">{row.diferencia_pct.toFixed(2)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Detalle específico de INVENTARIO (misión §5.2) */}
      {esInventario && (
        <div className="space-y-3">
          <h4 className="text-[11px] font-black uppercase tracking-widest text-foreground">
            Conciliación específica de inventario
          </h4>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 text-[11px]">
            {[
              ['Productos con existencia', num(det.con_stock_positivo)?.toString() ?? '—'],
              ['Productos sin existencia', num(det.stock_cero)?.toString() ?? '—'],
              ['Existencias negativas', num(det.stock_negativo)?.toString() ?? '—'],
              ['Cantidad total', num(det.cantidad_total)?.toString() ?? '—'],
              ['Costo promedio pond.', num(det.costo_promedio_ponderado)?.toString() ?? '—'],
              ['Valor WAC (sistema)', cup(num(det.valor_wac))],
              ['Valor según Kardex', cup(num(det.valor_kardex))],
              ['Valor a costo documental', cup(num(det.valor_cost_price))],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border/60 bg-background p-2">
                <div className="text-muted-foreground text-[10px] uppercase font-black tracking-wide">{label}</div>
                <div className="font-bold tabular-nums mt-0.5">{value}</div>
              </div>
            ))}
          </div>
          {(num(det.productos_sin_costo) ?? 0) > 0 && (
            <p className="text-[11px] text-warning font-bold" data-testid="recon-inv-sin-costo">
              ⚠ {num(det.productos_sin_costo)} producto(s) con existencia y costo promedio 0 — valoración no
              verificable (calidad PARCIAL). SKUs: {arr(det.sin_costo_detalle)
                .map((p) => String(p.sku ?? ''))
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          {arr(det.top_productos).length > 0 && (
            <details className="rounded-lg border border-border/60 bg-background">
              <summary className="px-3 py-2 text-[11px] font-black uppercase tracking-widest cursor-pointer">
                Top productos por valor operativo
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[560px]">
                  <thead className="bg-muted/50">
                    <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="px-2.5 py-1.5 text-left">SKU</th>
                      <th className="px-2.5 py-1.5 text-left">Producto</th>
                      <th className="px-2.5 py-1.5 text-right">Existencia</th>
                      <th className="px-2.5 py-1.5 text-right">Costo prom.</th>
                      <th className="px-2.5 py-1.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {arr(det.top_productos).map((p, i) => (
                      <tr key={i}>
                        <td className="px-2.5 py-1.5 font-mono">{String(p.sku ?? '')}</td>
                        <td className="px-2.5 py-1.5">{String(p.nombre ?? '')}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{num(p.existencia) ?? '—'}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{num(p.costo_promedio) ?? '—'}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums font-bold">{cup(num(p.valor))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Detalle de cuentas financieras: desglose por origen */}
      {!esInventario && obj(det.desglose) && Object.keys(obj(det.desglose)).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-black uppercase tracking-widest text-foreground">Flujos por origen</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(obj(det.desglose)).map(([origen, monto]) => (
              <span
                key={origen}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1 text-[11px]"
              >
                <span className="text-muted-foreground capitalize">{origen.replaceAll('_', ' ')}:</span>
                <span className={cn('font-bold tabular-nums', num(monto) != null && num(monto)! < 0 && 'text-destructive')}>
                  {cup(num(monto))}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Documentos pendientes de contabilización + movimientos sin respaldo */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-black uppercase tracking-widest text-foreground">Hallazgos de cobertura</h4>
        {pendientesPorTipo.size === 0 && Object.keys(obj(det.movimientos_sin_respaldo)).length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Sin documentos pendientes de contabilización ni movimientos sin respaldo documental.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...pendientesPorTipo.entries()].map(([tipo, n]) => (
              <span
                key={`pend-${tipo}`}
                className="inline-flex items-center gap-1 rounded-lg bg-warning/10 text-warning px-2.5 py-1 text-[11px] font-bold"
              >
                {tipo}: {n} documento(s) sin asiento
              </span>
            ))}
            {Object.entries(obj(det.movimientos_sin_respaldo)).map(([tipo, n]) => (
              <span
                key={`resp-${tipo}`}
                className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 text-destructive px-2.5 py-1 text-[11px] font-bold"
              >
                {tipo}: {String(n)} movimiento(s) con documento inexistente
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Movimientos contables de la cuenta (drill-down reutilizado) */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-black uppercase tracking-widest text-foreground">
          Movimientos contables de la cuenta (generación activa)
        </h4>
        <CategoryDetailPanel
          storeId={storeId}
          categoryCode={row.cuenta}
          categoryName={row.nombre}
          from={row.es_periodo ? from : '1900-01-01'}
          to={row.es_periodo ? to : asOf}
        />
      </div>
    </div>
  );
}
