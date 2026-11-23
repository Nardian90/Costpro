'use client';

/**
 * MISIÓN REDISEÑO EJECUTIVO 2026-11-23 · §4/§5 — «Ranking Comercial»
 *
 * PREGUNTA DE NEGOCIO: ¿qué productos están vendiéndose ahora, cuáles
 * lideraban el tramo equivalente del mes anterior, quién crece, quién pierde
 * protagonismo y quién dejó de venderse?
 *
 * COMPARACIÓN TEMPORAL CORRECTA (misión §4.1): mes en curso acumulado
 * (1º → hoy, La Habana) contra el MISMO TRAMO del mes anterior
 * (1–22 nov ↔ 1–22 oct, previousMonthEquivalentWindow — meses de distinta
 * duración y bisiestos ajustados al último día real; inicio inclusivo, fin
 * inclusivo en hora local, como todo el sistema). Las fechas exactas de ambos
 * períodos se muestran en la interfaz.
 *
 * DATOS (misión §4.2 — fuentes oficiales, cero cálculos propios):
 *  · RPC get_sales_dashboard_analytics (top_net de CADA período, misma
 *    valoración canónica CUP del resto de reportes — anulaciones,
 *    devoluciones y descuentos ya resueltos por el agregado autorizado).
 *  · Clasificación: buildComparison (lógica pura compartida con la vista
 *    «Comparar productos») + evidencia REAL del mayor de inventario
 *    (stock_movements movement_type='sale') para distinguir «dejó de
 *    venderse» de «sale del Top» — nunca se inventa el cero.
 *  · El hook es el MISMO (y el mismo queryKey) que consume el Resumen de
 *    Indicadores y la vista dedicada: una consulta, tres superficies.
 *
 * REGLAS DE VARIACIÓN (misión §4.2): anterior = 0 con ventas actuales →
 * «Nuevo»; ambos en cero → sin porcentaje; NUNCA división entre cero ni
 * porcentajes infinitos. Moneda: CUP contable canónico — sin conversiones.
 *
 * EXPERIENCIA (misión §4.3/§5): vista ejecutiva compacta — top 5 con barras
 * comparativas discretas (proporción sobre el líder), movimiento de posición,
 * franja de «salieron del Top» con clasificación honesta y el botón
 * «Comparar productos» integrado EN EL ENCABEZADO de la sección (misión §5),
 * alineado con el título — no un botón perdido en el dashboard.
 */
import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  GitCompareArrows,
  Minus,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore, useUIStore } from '@/store';
import { useProductComparison } from '@/hooks/api/useProductComparison';
import {
  buildComparison,
  EVOLUCION_LABEL,
  type ComparisonRow,
  type Evolucion,
} from '@/lib/product-comparison/compare';
import { previousMonthEquivalentWindow, toDateInputValue } from '@/lib/sales-dashboard/periods';

/** Etiquetas compactas de movimiento para la vista ejecutiva. */
const MOVIMIENTO: Record<Evolucion, { label: string; icon: React.ElementType; className: string }> = {
  lidera: { label: 'Se mantiene', icon: Minus, className: 'bg-muted text-muted-foreground' },
  crece: { label: 'Sube', icon: ArrowUpRight, className: 'bg-success/10 text-success' },
  desciende: { label: 'Baja', icon: ArrowDownRight, className: 'bg-warning/10 text-warning' },
  nuevo: { label: 'Nuevo', icon: ArrowUpRight, className: 'bg-primary/10 text-primary' },
  dejo_de_venderse: { label: 'Dejó de venderse', icon: Minus, className: 'bg-destructive/10 text-destructive' },
  sale_del_top: { label: 'Sale del Top', icon: Minus, className: 'bg-muted text-muted-foreground' },
};

const TOP_VISIBLE = 5;
const SALIERON_VISIBLE = 3;

/** Fila del top actual: puesto, producto, barra proporcional y variación. */
function RankingRow({ row, maxVentas }: { row: ComparisonRow; maxVentas: number }) {
  const mov = MOVIMIENTO[row.evolucion];
  const MovIcon = mov.icon;
  const barPct = row.ventasActuales > 0 && maxVentas > 0 ? Math.max(6, Math.round((row.ventasActuales / maxVentas) * 100)) : 0;

  return (
    <li
      className="flex items-center gap-3 px-3 py-2.5 border-b border-border/50 last:border-b-0 min-h-[44px] hover:bg-muted/30 transition-colors"
      data-testid="ranking-row"
    >
      <span className="w-6 h-6 shrink-0 rounded-lg bg-muted text-[11px] font-black text-foreground tabular-nums inline-flex items-center justify-center" aria-label={`Puesto ${row.posActual}`}>
        {row.posActual}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-bold text-foreground truncate">{row.name}</span>
          {row.sku && <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground/70 uppercase">{row.sku}</span>}
        </div>
        {/* Barra comparativa discreta: proporción sobre el líder del período */}
        <div className="mt-1 h-1.5 rounded-full bg-muted/60 overflow-hidden max-w-[220px]" aria-hidden="true">
          <div className="h-full rounded-full bg-primary/40" style={{ width: `${barPct}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
          {row.unidadesActuales.toLocaleString('es-CU')} u ·{' '}
          {row.posAnterior !== null ? `antes #${row.posAnterior}` : 'sin ventas comparables'}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-black tabular-nums text-foreground">
          {formatCurrency(row.ventasActuales)} <span className="text-[10px] font-bold text-muted-foreground">CUP</span>
        </p>
        {row.ventasAnteriores === 0 && row.ventasActuales > 0 ? (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black bg-primary/10 text-primary" title={EVOLUCION_LABEL.nuevo}>
            Nuevo
          </span>
        ) : row.ventasAnteriores === 0 && row.ventasActuales === 0 ? (
          <span className="mt-0.5 block text-[10px] text-muted-foreground" title="Ambos períodos sin ventas: no se calcula crecimiento artificial">—</span>
        ) : (
          <p
            className={cn(
              'mt-0.5 text-[10px] font-black tabular-nums',
              row.difCup > 0 ? 'text-success' : row.difCup < 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {row.difCup > 0 ? '+' : ''}{formatCurrency(row.difCup)} CUP
            {row.varPct !== null ? ` · ${row.varPct > 0 ? '+' : ''}${row.varPct.toFixed(1)}%` : ''}
          </p>
        )}
        <span
          className={cn('mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black', mov.className)}
          title={EVOLUCION_LABEL[row.evolucion]}
        >
          <MovIcon className="w-3 h-3" /> {mov.label}
        </span>
      </div>
    </li>
  );
}

export function CommercialRanking() {
  const { user } = useAuthStore();
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const q = useProductComparison(user?.activeStoreId ?? null);

  const goToComparator = () => setCurrentView('product-comparison');

  if (q.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-busy="true" data-testid="commercial-ranking-loading">
        <div className="h-10 rounded-lg bg-muted/20 animate-pulse mb-3" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 rounded-lg bg-muted/20 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (q.isError || !q.data) {
    return (
      <section
        className="flex items-start justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
        data-testid="commercial-ranking-error"
        aria-label="Ranking comercial no disponible"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-foreground">
            No se pudo consultar el ranking comercial.
            {q.error instanceof Error ? ` ${q.error.message}` : ''}
          </p>
        </div>
        <div className="shrink-0 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => q.refetch()}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-border text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted transition-colors min-h-[36px]"
            data-testid="ranking-retry"
          >
            <RefreshCw className="w-3 h-3" /> Reintentar
          </button>
        </div>
      </section>
    );
  }

  const { actual, anterior, ventana, ventasEnPeriodoActual } = q.data;
  const ventanaAnterior = previousMonthEquivalentWindow(ventana);

  // net_cup es opcional en el schema del RPC: 0 honesto cuando falta
  // (misma normalización de la vista «Comparar productos»).
  const { rows, resumen } = buildComparison(
    actual.products.top_net.map((r) => ({ ...r, net_cup: r.net_cup ?? 0 })),
    anterior.products.top_net.map((r) => ({ ...r, net_cup: r.net_cup ?? 0 })),
    [],
    ventasEnPeriodoActual,
  );

  const topActual = rows.filter((r) => r.posActual !== null).slice(0, TOP_VISIBLE);
  const salieron = rows
    .filter((r) => r.posActual === null && r.posAnterior !== null)
    .sort((a, b) => (a.posAnterior ?? 99) - (b.posAnterior ?? 99));
  const salieronVisibles = salieron.slice(0, SALIERON_VISIBLE);
  const maxVentas = Math.max(...topActual.map((r) => r.ventasActuales), 0);

  return (
    <section
      className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
      aria-label="Ranking comercial: productos líderes del mes en curso contra el mismo tramo del mes anterior"
      data-testid="commercial-ranking"
    >
      {/* Encabezado de la sección: título + contexto + acción «Comparar productos»
          integrada (misión §5) — alineada con el título y sus acciones. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-border bg-muted/30">
        <div className="min-w-0">
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Ranking Comercial</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums" data-testid="ranking-periods">
            {toDateInputValue(ventana.from)} — {toDateInputValue(ventana.to)}
            {' · vs '}
            {toDateInputValue(ventanaAnterior.from)} — {toDateInputValue(ventanaAnterior.to)}
          </p>
        </div>
        <button
          type="button"
          onClick={goToComparator}
          className="inline-flex items-center justify-center gap-2 min-h-[40px] px-4 rounded-xl border border-primary/40 bg-primary/[0.06] text-primary text-[11px] font-black uppercase tracking-widest hover:bg-primary/10 active:scale-[0.98] transition-all"
          data-testid="ranking-compare-button"
          title="Abrir la comparación completa de productos entre los dos períodos"
        >
          <GitCompareArrows className="w-4 h-4" /> Comparar productos
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center px-4" data-testid="ranking-empty">
          <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">
            Sin ventas registradas en el período comparado
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No hay productos en el Top de ventas del mes en curso ni del tramo equivalente del mes anterior.
          </p>
        </div>
      ) : (
        <div className="px-3 sm:px-4 py-2 space-y-2">
          {resumen.cambioLider && (
            <div
              className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2"
              data-testid="ranking-cambio-lider"
            >
              <Trophy className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-[11px] font-bold text-foreground leading-snug">{resumen.cambioLider}</p>
            </div>
          )}

          <ul className="rounded-lg border border-border overflow-hidden" data-testid="ranking-list">
            {topActual.map((row) => (
              <RankingRow key={row.productId} row={row} maxVentas={maxVentas} />
            ))}
          </ul>

          {salieron.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5" data-testid="ranking-salieron">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                Salieron del Top actual ({salieron.length})
              </p>
              <ul className="space-y-1">
                {salieronVisibles.map((r) => {
                  const mov = MOVIMIENTO[r.evolucion];
                  const MovIcon = mov.icon;
                  return (
                    <li key={r.productId} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-muted-foreground">
                        <span className="font-bold text-foreground">{r.name}</span> · antes #{r.posAnterior} ·{' '}
                        {formatCurrency(r.ventasAnteriores)} CUP
                      </span>
                      <span
                        className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black shrink-0', mov.className)}
                        title={EVOLUCION_LABEL[r.evolucion]}
                      >
                        <MovIcon className="w-3 h-3" /> {mov.label}
                      </span>
                    </li>
                  );
                })}
                {salieron.length > SALIERON_VISIBLE && (
                  <li className="text-[10px] text-muted-foreground">+{salieron.length - SALIERON_VISIBLE} más — detalle completo en «Comparar productos»</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
