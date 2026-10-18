'use client';

/**
 * WorkDatesView — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Centro de control transversal de las fechas de trabajo por tipo de
 * movimiento (OPERACIÓN → Control operativo → Fechas de trabajo).
 *
 * QUÉ RESUELVE: la política temporal del PR #1422 ya valida las fechas de
 * extremo a extremo, pero los selectores viven DENTRO de los flujos de
 * confirmación (modales/paneles) y no existe ningún lugar del producto donde
 * consultar y gestionar el estado temporal de la operación. Esta vista es
 * ese lugar:
 *
 *   - Consulta la fecha efectiva que usará el próximo documento de cada tipo.
 *   - Muestra los límites REALES calculados por el servidor (mínimo per-store
 *     forward-only del RPC get_global_max_operation_date, máximo HOY Habana
 *     computado en el servidor vía /api/work-dates).
 *   - Permite fijar la fecha de trabajo de un tipo (preferencia por usuario +
 *     tienda + tipo — aislada, no toca otros usuarios/tiendas/tipos).
 *   - Explica por qué una fecha no es admisible (validación del PR #1422).
 *   - Navega al formulario de cada flujo conservando el contexto de tienda.
 *
 * ALCANCE DE LA SELECCIÓN (misión §3.4, decisión documentada):
 *   «Cambiar fecha» aquí fija el DEFAULT del selector del próximo documento
 *   del tipo, para ESTE usuario en ESTA tienda. No es un ajuste global, no
 *   cambia la fecha de trabajo de otros usuarios ni de otras tiendas, y el
 *   selector del formulario sigue siendo el control visible y autoritativo
 *   en el momento de confirmar (el servidor revalida SIEMPRE).
 *
 * Datos: /api/work-dates (tablas reales + RPC — sin tablas paralelas).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, RefreshCcw, Search, CalendarClock, Info, ExternalLink,
  CalendarCheck, CalendarX2, Sun, Clock, X, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore, useUIStore } from '@/store';
import { useWorkDatePrefsStore } from '@/store/work-date-prefs';
import { useGlobalOperationDate } from '@/hooks/api/useGlobalOperationDate';
import {
  MOVEMENT_TYPES, WORK_DATE_AREAS, getMovementType,
  type MovementTypeInfo, type WorkDateStatus, type WorkDateArea,
} from '@/config/work-dates/movement-types';
import { OperationDatePicker } from '@/components/ui/OperationDatePicker';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// ──────────────────────────────────────────────────────────────────────────
// Tipos de la respuesta del API
// ──────────────────────────────────────────────────────────────────────────

interface WorkDatesTypeRow {
  type: string;
  lastOperativeDate: string | null;
  lastOperativeDay: string | null;
  documentCount: number | null;
}

interface WorkDatesResponse {
  today: string;
  storeMinDate: string | null;
  floorDate: string;
  timezone: string;
  types: WorkDatesTypeRow[];
}

type AreaFilter = 'all' | WorkDateArea;

// ──────────────────────────────────────────────────────────────────────────
// Helpers de presentación
// ──────────────────────────────────────────────────────────────────────────

function formatDayEs(day: string | null): string {
  if (!day) return '—';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

function dayVsToday(day: string | null, today: string): 'past' | 'today' | 'future' | 'none' {
  if (!day) return 'none';
  if (day < today) return 'past';
  if (day > today) return 'future';
  return 'today';
}

const STATUS_BADGE: Record<WorkDateStatus, { label: string; className: string }> = {
  configurable: {
    label: 'Configurable',
    className: 'bg-primary/10 text-primary border-primary/25',
  },
  fija: {
    label: 'Fija',
    className: 'bg-muted text-muted-foreground border-border',
  },
  informativa: {
    label: 'Informativa',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Vista principal
// ──────────────────────────────────────────────────────────────────────────

export default function WorkDatesView() {
  const { user } = useAuthStore();
  const { setCurrentView } = useUIStore();
  const storeId = user?.activeStoreId ?? null;
  const storeName = (user?.memberships ?? []).find((m) => m.store_id === storeId)?.store?.name ?? null;

  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [onlyConfigurable, setOnlyConfigurable] = useState(false);
  const [dialogType, setDialogType] = useState<string | null>(null);

  // Preferencias (scope usuario+tienda — cargadas por el store).
  const loadScope = useWorkDatePrefsStore((s) => s.loadScope);
  const prefs = useWorkDatePrefsStore((s) => s.prefs);
  useEffect(() => {
    loadScope(user?.id, storeId);
  }, [user?.id, storeId, loadScope]);

  // Datos reales del servidor (matriz + límites autorizados).
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<WorkDatesResponse>({
    queryKey: ['work-dates', storeId],
    queryFn: () => apiFetch<WorkDatesResponse>(`/api/work-dates?store_id=${storeId}`),
    enabled: !!storeId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Mínimo vivo (RPC forward-only per-store) para el badge resumen — misma
  // fuente que usan los selectores de los formularios (PR #1422).
  const { data: globalDateInfo } = useGlobalOperationDate(storeId);

  const today = data?.today ?? null;
  const storeMinDay = data?.storeMinDate ?? null;
  const floorDate = data?.floorDate ?? null;
  const lastByType = useMemo(() => {
    const map: Record<string, WorkDatesTypeRow> = {};
    for (const row of data?.types ?? []) map[row.type] = row;
    return map;
  }, [data]);

  // Filtrado de la matriz.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MOVEMENT_TYPES.filter((t) => {
      if (areaFilter !== 'all' && t.area !== areaFilter) return false;
      if (onlyConfigurable && t.status !== 'configurable') return false;
      if (!q) return true;
      return (
        t.label.toLowerCase().includes(q) ||
        t.area.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    });
  }, [search, areaFilter, onlyConfigurable]);

  const configurableCount = MOVEMENT_TYPES.filter((t) => t.preferenceEnabled).length;
  const prefsActiveCount = Object.keys(prefs).length;

  if (!storeId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 px-4 text-center">
        <CalendarClock className="w-10 h-10 text-muted-foreground/40" aria-hidden="true" />
        <h2 className="text-base font-black uppercase tracking-wide">Fechas de trabajo</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Selecciona una tienda activa para consultar y gestionar las fechas de trabajo de sus
          movimientos. La política temporal es por tienda (forward-only).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full">
      {/* ── Cabecera ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-black uppercase tracking-wide flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" aria-hidden="true" />
            Fechas de trabajo
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Centro de control del estado temporal de la operación de
            <strong className="text-foreground"> {storeName || 'la tienda activa'}</strong> · zona de negocio America/Havana
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching || isLoading}
          className="gap-2 shrink-0"
          aria-label="Actualizar fechas de trabajo"
        >
          {isRefetching || isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          Actualizar
        </Button>
      </div>

      {/* ── Resumen de límites (lógica autorizada del PR #1422) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <SummaryTile
          icon={<Sun className="w-4 h-4" aria-hidden="true" />}
          label="Hoy (negocio)"
          value={today ? formatDayEs(today) : '…'}
          hint={today ? 'Fecha máxima de todo documento' : 'Cargando'}
          tone="primary"
        />
        <SummaryTile
          icon={<CalendarX2 className="w-4 h-4" aria-hidden="true" />}
          label="Mín. operativo (tienda)"
          value={storeMinDay ? formatDayEs(storeMinDay) : 'Sin documentos'}
          hint={storeMinDay ? 'Última fecha operativa registrada' : 'Primera operación sin piso de secuencia'}
          tone={dayVsToday(storeMinDay, today ?? '') === 'future' ? 'danger' : 'default'}
        />
        <SummaryTile
          icon={<Clock className="w-4 h-4" aria-hidden="true" />}
          label="Piso histórico"
          value={floorDate ? formatDayEs(floorDate) : '…'}
          hint="Gate canónico: hoy − 6 meses"
          tone="default"
        />
        <SummaryTile
          icon={<CalendarCheck className="w-4 h-4" aria-hidden="true" />}
          label="Fechas de trabajo activas"
          value={`${prefsActiveCount} / ${configurableCount}`}
          hint={`Preferencias tuyas en esta tienda (${prefsActiveCount === 0 ? 'todas usan HOY' : 'el resto usa HOY'})`}
          tone={prefsActiveCount > 0 ? 'primary' : 'default'}
        />
      </div>

      {/* ── Explicación de alcance (misión §3.4) ── */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Alcance de la selección:</strong> la fecha de trabajo
          que fijes aquí es el <strong className="text-foreground">valor inicial del selector</strong> de tus
          próximos documentos de ese tipo, en esta tienda y para tu usuario. No cambia la fecha de
          trabajo de otros usuarios, ni de otras tiendas, ni de otros tipos de movimiento. El
          selector del formulario sigue visible al confirmar y el{' '}
          <strong className="text-foreground">servidor revalida la fecha</strong> (tope HOY + mínimo
          forward-only) en cada documento.
        </p>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar movimiento…"
            aria-label="Buscar tipo de movimiento"
            className="w-full pl-9 pr-3 h-10 rounded-xl border border-border bg-background text-sm font-medium"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar por área">
          <FilterChip active={areaFilter === 'all'} onClick={() => setAreaFilter('all')}>Todas las áreas</FilterChip>
          {WORK_DATE_AREAS.map((a) => (
            <FilterChip key={a} active={areaFilter === a} onClick={() => setAreaFilter(a)}>{a}</FilterChip>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={onlyConfigurable}
            onChange={(e) => setOnlyConfigurable(e.target.checked)}
            className="accent-primary"
            aria-label="Mostrar solo movimientos configurables"
          />
          Solo configurables
        </label>
      </div>

      {/* ── Matriz de movimientos ── */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" role="status">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold">Consultando fechas reales de la tienda…</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-12 px-4 text-center" role="alert">
          <AlertTriangle className="w-8 h-8 text-destructive/60" aria-hidden="true" />
          <p className="text-sm font-bold">No se pudieron consultar las fechas de trabajo</p>
          <p className="text-xs text-muted-foreground max-w-md">{(error as Error)?.message ?? 'Error desconocido'}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCcw className="w-4 h-4" /> Reintentar
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
          <Search className="w-7 h-7 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-sm font-bold">Sin resultados</p>
          <p className="text-xs text-muted-foreground">Ningún tipo de movimiento coincide con el filtro actual.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th scope="col" className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo de movimiento</th>
                  <th scope="col" className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Área</th>
                  <th scope="col" className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fecha de trabajo actual</th>
                  <th scope="col" className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Última fecha operativa</th>
                  <th scope="col" className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mín. permitida</th>
                  <th scope="col" className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Máx. permitida</th>
                  <th scope="col" className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</th>
                  <th scope="col" className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <MovementRow
                    key={t.id}
                    info={t}
                    pref={prefs[t.id] ?? null}
                    last={lastByType[t.id] ?? null}
                    today={today}
                    storeMinDay={storeMinDay}
                    onOpenDialog={setDialogType}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
            «Fecha de trabajo actual» = fecha efectiva que usará el próximo documento del tipo (tu
            preferencia o HOY implícito). «Última fecha operativa» = fecha del último documento
            registrado de ese tipo en esta tienda (tablas reales). «Mín. permitida» = límite
            forward-only de la tienda — compartido por todos los tipos.
          </p>
        </div>
      )}

      {/* ── Diálogo de cambio de fecha ── */}
      {dialogType && (
        <WorkDateDialog
          typeId={dialogType}
          storeId={storeId}
          storeName={storeName}
          today={today}
          storeMinDay={storeMinDay ?? globalDateInfo?.minAllowedDate?.slice(0, 10) ?? null}
          currentPref={prefs[dialogType] ?? null}
          onClose={() => setDialogType(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ──────────────────────────────────────────────────────────────────────────

function SummaryTile({ icon, label, value, hint, tone }: {
  icon: React.ReactNode; label: string; value: string; hint: string;
  tone: 'primary' | 'default' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 bg-card',
        tone === 'primary' && 'border-primary/25 bg-primary/[0.04]',
        tone === 'danger' && 'border-destructive/40 bg-destructive/[0.05]',
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('mt-1.5 text-sm font-black tabular-nums', tone === 'danger' && 'text-destructive')}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'px-3 h-8 rounded-full text-[11px] font-bold border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function MovementRow({ info, pref, last, today, storeMinDay, onOpenDialog }: {
  info: MovementTypeInfo;
  pref: string | null;
  last: WorkDatesTypeRow | null;
  today: string | null;
  storeMinDay: string | null;
  onOpenDialog: (typeId: string) => void;
}) {
  const { setCurrentView: navigate } = useUIStore();
  const badge = STATUS_BADGE[info.status];
  // Fecha de trabajo actual: preferencia del usuario o HOY implícito.
  const workDate = info.preferenceEnabled ? (pref ?? today) : null;
  const workDateTone = dayVsToday(workDate, today ?? '');
  // Detección de preferencia caducada (visible en la fila).
  const prefStale = !!pref && !!storeMinDay && pref < storeMinDay;

  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors align-top">
      {/* Tipo */}
      <td className="px-4 py-3">
        <p className="text-sm font-bold leading-tight">{info.label}</p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 max-w-[280px]">{info.description}</p>
        <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">{info.writesTo}</p>
      </td>
      {/* Área */}
      <td className="px-4 py-3">
        <span className="text-xs font-bold text-muted-foreground">{info.area}</span>
      </td>
      {/* Fecha de trabajo actual */}
      <td className="px-4 py-3">
        {info.preferenceEnabled ? (
          <div className="space-y-0.5">
            <p className={cn(
              'text-sm font-black tabular-nums',
              workDateTone === 'past' && 'text-amber-700 dark:text-amber-400',
              workDateTone === 'today' && 'text-primary',
            )}>
              {formatDayEs(workDate)}
              {workDateTone === 'today' && <span className="ml-1.5 text-[10px] font-bold text-muted-foreground uppercase">(hoy implícito)</span>}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {pref ? 'Tu preferencia para el próximo documento' : 'Sin preferencia → HOY'}
            </p>
            {prefStale && (
              <p className="text-[10px] text-destructive font-bold">
                Caducada: quedó bajo el mínimo ({formatDayEs(storeMinDay!)}). El formulario usará HOY.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No aplica · {info.status === 'fija' ? 'regla fija del flujo' : 'fecha informativa'}</p>
        )}
      </td>
      {/* Última fecha operativa */}
      <td className="px-4 py-3">
        <p className="text-sm font-bold tabular-nums">{formatDayEs(last?.lastOperativeDay ?? null)}</p>
        {last?.documentCount != null && last.documentCount > 0 && (
          <p className="text-[10px] text-muted-foreground">{last.documentCount} doc.</p>
        )}
        {last?.documentCount === 0 && <p className="text-[10px] text-muted-foreground">Sin documentos aún</p>}
      </td>
      {/* Mínimo permitida */}
      <td className="px-4 py-3">
        <p className="text-sm font-bold tabular-nums">
          {info.status === 'fija' || info.status === 'informativa'
            ? 'No aplica'
            : formatDayEs(storeMinDay)}
        </p>
        {info.status === 'configurable' && !storeMinDay && (
          <p className="text-[10px] text-muted-foreground">Sin documentos previos en la tienda</p>
        )}
        {info.status === 'configurable' && info.id === 'transfer' && (
          <p className="text-[10px] text-muted-foreground">Máx. de AMBAS tiendas (origen y destino)</p>
        )}
      </td>
      {/* Máximo */}
      <td className="px-4 py-3">
        <p className="text-sm font-bold tabular-nums">
          {info.status === 'informativa' ? 'No aplica' : formatDayEs(today)}
        </p>
        <p className="text-[10px] text-muted-foreground">{info.status === 'fija' ? 'Ventana real del turno' : 'Hoy (America/Havana)'}</p>
      </td>
      {/* Estado */}
      <td className="px-4 py-3">
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide', badge.className)}>
          {badge.label}
        </span>
      </td>
      {/* Acción */}
      <td className="px-4 py-3 text-right">
        <div className="inline-flex flex-col sm:flex-row gap-1.5 justify-end">
          {info.preferenceEnabled && (
            <button
              type="button"
              onClick={() => onOpenDialog(info.id)}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-primary text-primary-foreground text-[11px] font-black uppercase hover:opacity-90 transition-opacity"
            >
              <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
              {pref ? 'Cambiar fecha' : 'Fijar fecha'}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(info.targetView as never)}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-border bg-background text-[11px] font-black uppercase text-muted-foreground hover:bg-muted transition-colors"
            title={info.selectorLocation}
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Ir al flujo
          </button>
        </div>
      </td>
    </tr>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Diálogo: fijar la fecha de trabajo de un tipo
// ──────────────────────────────────────────────────────────────────────────

function WorkDateDialog({ typeId, storeId, storeName, today, storeMinDay, currentPref, onClose }: {
  typeId: string;
  storeId: string;
  storeName: string | null;
  today: string | null;
  storeMinDay: string | null;
  currentPref: string | null;
  onClose: () => void;
}) {
  const info = getMovementType(typeId);
  const setWorkDate = useWorkDatePrefsStore((s) => s.setWorkDate);
  const clearWorkDate = useWorkDatePrefsStore((s) => s.clearWorkDate);
  const { setCurrentView } = useUIStore();
  // Valor editable: preferencia actual o HOY. El picker valida min/max en vivo
  // (validación del PR #1422: mínimo forward-only per-store, máximo HOY).
  const [value, setValue] = useState<string>(currentPref ?? today ?? '');

  if (!info || !info.preferenceEnabled) return null;

  const handleSave = () => {
    if (!today) return;
    if (!value || value === today) {
      // HOY = convención canónica «hoy implícito» → sin preferencia guardada.
      clearWorkDate(typeId);
      toast.success(`Fecha de trabajo de ${info.label}: HOY (${formatDayEs(today)}) — sin preferencia`);
    } else {
      const ok = setWorkDate(typeId, value);
      if (!ok) {
        toast.error('No se pudo guardar la preferencia (tipo o fecha inválida).');
        return;
      }
      toast.success(`Fecha de trabajo de ${info.label} fijada: ${formatDayEs(value)}`);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Fecha de trabajo: ${info.label}`}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-black uppercase tracking-wide leading-tight">Fecha de trabajo</h2>
            <p className="text-xs font-bold text-primary mt-0.5">{info.label}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Tienda: <strong className="text-foreground">{storeName || storeId.slice(0, 8)}</strong> · Área {info.area}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted shrink-0" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Selector con límites reales (PR #1422) */}
          <OperationDatePicker
            value={value}
            onChange={setValue}
            label="Fecha del próximo documento"
            storeId={storeId}
            max={today ?? undefined}
            inputId={`work-date-pref-${typeId}`}
          />

          {/* Contexto y límites */}
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5 text-[11px] leading-relaxed">
            <p className="flex items-center gap-1.5 font-bold text-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
              Límites de la política (PR #1422)
            </p>
            <p className="text-muted-foreground">
              Mínimo: <strong className="text-foreground tabular-nums">{formatDayEs(storeMinDay) ?? 'Sin documentos previos'}</strong>{' '}
              (última fecha operativa de la tienda, inclusiva){' · '}
              Máximo: <strong className="text-foreground tabular-nums">{formatDayEs(today)}</strong> (HOY Habana).
            </p>
            <p className="text-muted-foreground">{info.policyNote}</p>
            <p className="text-muted-foreground">
              Selector en el flujo: <strong className="text-foreground">{info.selectorLocation}</strong>
            </p>
          </div>

          {/* Alcance */}
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Esta preferencia aplica <strong className="text-foreground">solo a tus próximos documentos</strong> de
              este tipo, en esta tienda. El selector del formulario permanece visible y editable al
              confirmar, y el servidor revalida la fecha final.
            </span>
          </div>

          {/* Acciones */}
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 h-10 font-black uppercase text-xs">
              Cancelar
            </Button>
            {currentPref && (
              <Button
                variant="outline"
                onClick={() => {
                  clearWorkDate(typeId);
                  toast.success(`Preferencia eliminada: ${info.label} volverá a HOY`);
                  onClose();
                }}
                className="flex-1 h-10 font-black uppercase text-xs"
              >
                Restaurar HOY
              </Button>
            )}
            <Button onClick={handleSave} className="flex-1 h-10 font-black uppercase text-xs gap-1.5">
              <CalendarCheck className="w-4 h-4" aria-hidden="true" />
              Guardar
            </Button>
          </div>

          {/* Navegación directa al formulario */}
          <button
            type="button"
            onClick={() => {
              onClose();
              setCurrentView(info.targetView as never);
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-primary hover:underline pt-1"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Abrir {info.label} ahora
          </button>
        </div>
      </div>
    </div>
  );
}
