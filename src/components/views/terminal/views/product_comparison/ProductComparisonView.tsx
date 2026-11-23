'use client';

/**
 * ADNEGOCIO-UI 2026-11-23 · «Comparar productos» — vista analítica dedicada
 * (misión §5), ahora con UBICACIÓN OFICIAL en ANÁLISIS (misión Comparar
 * Productos 2026-11-23: hoja del menú ANÁLISIS + botón del Ranking Comercial
 * del Inicio) y tab «INFORME EJECUTIVO» con vista preliminar y exportación
 * PDF mediante el patrón documental del Reporte de Entrega.
 *
 * PREGUNTA COMERCIAL: ¿qué productos se vendían más el mes pasado, cuáles se
 * están vendiendo más este mes y qué productos han perdido o ganado
 * protagonismo?
 *
 * DATOS (fuentes oficiales, sin duplicar cálculos):
 *  · Ventas por producto: RPC get_sales_dashboard_analytics en DOS llamadas
 *    (mes acumulado vs mismo tramo del mes anterior) — p_limit_products=20 y
 *    UNIÓN de ambos Tops: un líder anterior con ventas cero hoy PERMANECE
 *    visible (no desaparece por salir del Top actual).
 *  · Existencias / unidad de medida: catálogo oficial (useProducts).
 *  · Diagnóstico de inventario: mayor real de stock_movements vía
 *    useProductKardex (saldo corrido derivado cronológicamente) — SOLO se
 *    afirma agotamiento si el histórico es confiable (sin truncado y
 *    conciliado con la existencia autoritativa); si no, se dice expresamente
 *    que no hay información suficiente. NUNCA se inventan causas.
 *  · Informe Ejecutivo: buildInformeEjecutivo (lib pura) — UNA sola fuente de
 *    redacción y cifras para pantalla y PDF (informe-ejecutivo-pdf.ts).
 *
 * MONEDA: el ranking por ingresos usa la valoración canónica autorizada por
 * el sistema (CUP contable, tasa de cada venta, neto de devoluciones). No se
 * mezclan nominales CUP/USD ni se aplican tasas propias.
 *
 * TABLA (misión §2): contenedor con scroll horizontal real (y vertical con
 * techo), encabezado fijo al desplazarse, primera columna fija
 * (.sticky-column-1) y ancho mínimo declarado — sin sacrificar información.
 *
 * PREVIEW (patrón Reporte de Entrega, §5): cache por firma de parámetros
 * (tienda + ventanas + datos), doc.output('bloburl') en iframe, banner
 * «desactualizado» + regeneración explícita, y descarga como acción separada.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Info,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore, useUIStore } from '@/store';
import { toast } from 'sonner';
import { isAdminLevel } from '@/lib/roles';
import { useStores } from '@/hooks/api/useStores';
import { useProducts } from '@/hooks/api/useProducts';
import { useProductComparison, monthToDateWindow } from '@/hooks/api/useProductComparison';
import { useProductKardex } from '@/hooks/api/useProductKardex';
import {
  buildComparison,
  EVOLUCION_LABEL,
  SITUACION_LABEL,
  situacionStock,
  evaluarEvidenciaKardex,
  type ComparisonRow,
  type Evolucion,
  type ProductCatalogRow,
} from '@/lib/product-comparison/compare';
import { buildInformeEjecutivo, type InformeEjecutivo } from '@/lib/product-comparison/informe';
import { previousMonthEquivalentWindow, toDateInputValue, type PeriodWindow } from '@/lib/sales-dashboard/periods';
import type { Product } from '@/types';

const EVOLUCION_TONE: Record<Evolucion, string> = {
  lidera: 'bg-primary/10 text-primary',
  crece: 'bg-success/10 text-success',
  desciende: 'bg-warning/10 text-warning',
  nuevo: 'bg-primary/10 text-primary',
  dejo_de_venderse: 'bg-destructive/10 text-destructive',
  sale_del_top: 'bg-muted text-muted-foreground',
};

type SortId = 'posActual' | 'posAnterior' | 'ventasActuales' | 'ventasAnteriores' | 'unidadesActuales' | 'difCup' | 'varPct' | 'stockActual';

/** Tabs de la vista (misión §3): comparación analítica + informe ejecutivo. */
type ComparisonTab = 'comparacion' | 'informe';

function fmtUnidades(n: number, um: string | null): string {
  return `${n.toLocaleString('es-CU')} ${um ?? 'u'}`;
}

/** Resumen ejecutivo (misión §5.5) — todo del análisis real, «No disponible» honesto. */
function ResumenEjecutivo({ resumen, rows }: { resumen: ReturnType<typeof buildComparison>['resumen']; rows: ComparisonRow[] }) {
  const items = [
    {
      label: 'Líder del período actual',
      value: resumen.liderActual ? `${resumen.liderActual.name}` : 'Sin datos',
      sub: resumen.liderActual ? formatCurrency(resumen.liderActual.ventas) + ' CUP' : null,
      icon: Trophy,
      tone: 'text-primary',
    },
    {
      label: 'Líder del período anterior',
      value: resumen.liderAnterior ? `${resumen.liderAnterior.name}` : 'Sin datos',
      sub: resumen.liderAnterior ? formatCurrency(resumen.liderAnterior.ventas) + ' CUP' : null,
      icon: Trophy,
      tone: 'text-muted-foreground',
    },
    {
      label: 'Mayor crecimiento',
      value: resumen.mayorCrecimiento ? resumen.mayorCrecimiento.name : 'No disponible',
      sub: resumen.mayorCrecimiento
        ? `${resumen.mayorCrecimiento.varPct !== null ? `${resumen.mayorCrecimiento.varPct > 0 ? '+' : ''}${resumen.mayorCrecimiento.varPct}%` : ''} · ${formatCurrency(resumen.mayorCrecimiento.difCup)} CUP`
        : null,
      icon: TrendingUp,
      tone: 'text-success',
    },
    {
      label: 'Mayor caída',
      value: resumen.mayorCaída ? resumen.mayorCaída.name : 'No disponible',
      sub: resumen.mayorCaída
        ? `${resumen.mayorCaída.varPct !== null ? `${resumen.mayorCaída.varPct > 0 ? '+' : ''}${resumen.mayorCaída.varPct}%` : ''} · ${formatCurrency(resumen.mayorCaída.difCup)} CUP`
        : null,
      icon: TrendingDown,
      tone: 'text-destructive',
    },
  ];

  return (
    <section className="grid grid-cols-2 xl:grid-cols-4 gap-2.5" aria-label="Resumen ejecutivo de la comparación" data-testid="comparison-summary">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-border bg-card p-3 shadow-sm" title={it.label}>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <it.icon className={cn('w-3.5 h-3.5', it.tone)} /> {it.label}
          </p>
          <p className="text-sm font-bold text-foreground mt-1 truncate">{it.value}</p>
          {it.sub && <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{it.sub}</p>}
        </div>
      ))}
      {/* Cambios detectados (misión §5.5: cantidad que dejó de venderse + cambios) */}
      <div className="col-span-2 xl:col-span-4 rounded-xl border border-border bg-card p-3" data-testid="comparison-changes">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Principales cambios detectados</p>
        <ul className="space-y-1 text-[11px] leading-relaxed">
          {resumen.cambioLider && <li className="text-foreground">· {resumen.cambioLider}.</li>}
          {resumen.dejaronDeVenderse.length > 0 && (
            <li className="text-foreground">
              · {resumen.dejaronDeVenderse.length} producto{resumen.dejaronDeVenderse.length !== 1 ? 's' : ''} dejó de registrar ventas respecto al mes anterior:{' '}
              <span className="text-muted-foreground">{resumen.dejaronDeVenderse.join(', ')}.</span>
            </li>
          )}
          {resumen.nuevos.length > 0 && (
            <li className="text-foreground">
              · {resumen.nuevos.length} nuevo{resumen.nuevos.length !== 1 ? 's' : ''} en el Top actual sin ventas comparables el mes anterior:{' '}
              <span className="text-muted-foreground">{resumen.nuevos.join(', ')}.</span>
            </li>
          )}
          {rows.filter((r) => r.evolucion === 'sale_del_top').length > 0 && (
            <li className="text-muted-foreground">
              · Salen del Top (siguen vendiendo): {rows.filter((r) => r.evolucion === 'sale_del_top').map((r) => r.name).join(', ')}.
            </li>
          )}
          {!resumen.cambioLider && resumen.dejaronDeVenderse.length === 0 && resumen.nuevos.length === 0 && rows.filter((r) => r.evolucion === 'sale_del_top').length === 0 && (
            <li className="text-muted-foreground">· Sin cambios relevantes en la composición del ranking.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

/** Diagnóstico de inventario de un producto expandido (misión §5.4). */
function ProductDiagnosis({ row, storeId, desdeIso, hastaIso }: {
  row: ComparisonRow;
  storeId: string | null;
  desdeIso: string;
  hastaIso: string;
}) {
  const kardex = useProductKardex(row.productId, storeId, desdeIso, hastaIso);
  const stockSit = situacionStock(row);

  const evidencia = useMemo(() => {
    if (!kardex.data) return null;
    return evaluarEvidenciaKardex({
      saldoInicial: kardex.data.saldoInicial,
      movimientos: kardex.data.movimientos.map((m) => ({
        created_at: m.created_at,
        quantity_change: m.quantity_change,
        saldo: m.saldo,
        movement_type: m.movement_type,
        reference_type: m.reference_type ?? null,
        reference_doc: m.reference_doc ?? null,
      })),
      isTruncated: kardex.data.isTruncated,
      sumaTotal: kardex.data.sumaTotal,
      stockAutoritativo: row.stockActual ?? 0,
    });
  }, [kardex.data, row.stockActual]);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2" data-testid={`diagnosis-${row.productId}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        Diagnóstico de inventario · {SITUACION_LABEL[stockSit]}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div>
          <p className="text-muted-foreground">Existencia actual</p>
          <p className="font-bold tabular-nums text-foreground">
            {row.stockActual === null ? 'N/D' : fmtUnidades(row.stockActual, row.unidadMedida)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Entradas del período</p>
          <p className="font-bold tabular-nums text-foreground">
            {kardex.data ? kardex.data.resumen.entradas.toLocaleString('es-CU') : '…'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Salidas del período</p>
          <p className="font-bold tabular-nums text-foreground">
            {kardex.data ? Math.abs(kardex.data.resumen.salidas).toLocaleString('es-CU') : '…'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Último movimiento</p>
          <p className="font-bold tabular-nums text-foreground truncate" title={evidencia?.ultimoMovimiento?.reference_doc ?? undefined}>
            {kardex.isLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" aria-label="Consultando mayor de inventario" />
              : evidencia?.ultimoMovimiento
                ? `${toDateInputValue(new Date(evidencia.ultimoMovimiento.fecha))} · ${evidencia.ultimoMovimiento.quantity_change > 0 ? '+' : ''}${evidencia.ultimoMovimiento.quantity_change}`
                : kardex.data ? 'Sin movimientos' : '…'}
          </p>
        </div>
      </div>
      {/* Evidencia histórica — honesta: solo afirma agotamiento con ledger confiable */}
      <p className={cn(
        'text-[11px] leading-relaxed rounded-lg border px-2.5 py-1.5',
        evidencia?.historicoConfiable && evidencia.saldoMinimo !== null && evidencia.saldoMinimo <= 0
          ? 'border-warning/40 bg-warning/5 text-foreground'
          : 'border-border bg-background text-muted-foreground',
      )} data-testid={`diagnosis-evidence-${row.productId}`}>
        {evidencia?.nota ?? 'Consultando el mayor de inventario…'}
        {evidencia?.historicoConfiable && evidencia.momentoAgotamiento && (
          <> Momento del mínimo saldo: <span className="font-bold">{toDateInputValue(new Date(evidencia.momentoAgotamiento))}</span>
            {evidencia.saldoMinimo !== null && <> (saldo {evidencia.saldoMinimo.toLocaleString('es-CU')}).</>}</>
        )}
      </p>
    </div>
  );
}

/** Vista principal. */
export default function ProductComparisonView() {
  const { user } = useAuthStore();
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const storeId = user?.activeStoreId ?? null;

  // Nombre de la tienda activa (misma fuente que el selector del header).
  const isEncargado =
    user?.role === 'encargado' ||
    user?.role === 'manager' ||
    user?.memberships?.some((m) => m.role === 'encargado') ||
    false;
  const { data: stores = [] } = useStores(user?.id || '', isAdminLevel(user?.role), isEncargado);
  const activeStore = useMemo(() => stores.find((s) => s.id === storeId) ?? null, [stores, storeId]);

  const q = useProductComparison(storeId);
  const productsQuery = useProducts(storeId);

  const ventana = q.data?.ventana ?? monthToDateWindow();
  const ventanaAnterior = q.data?.ventanaAnterior ?? previousMonthEquivalentWindow(ventana);

  // Combinación ventas × catálogo en memoria (sin re-consultar ventas).
  const catalogo: ProductCatalogRow[] = useMemo(
    () => ((productsQuery.data ?? []) as Product[]).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku ?? null,
      stock_current: p.stock_current ?? 0,
      unit_of_measure: p.unit_of_measure ?? null,
      min_stock: p.min_stock ?? null,
    })),
    [productsQuery.data],
  );

  const { rows, resumen } = useMemo(() => {
    if (!q.data) return { rows: [] as ComparisonRow[], resumen: null };
    // net_cup es opcional en el schema del RPC: 0 honesto cuando falta.
    const topActual = (q.data.actual.products?.top_net ?? []).map((r) => ({ ...r, net_cup: r.net_cup ?? 0 }));
    const topAnterior = (q.data.anterior.products?.top_net ?? []).map((r) => ({ ...r, net_cup: r.net_cup ?? 0 }));
    return buildComparison(topActual, topAnterior, catalogo, q.data.ventasEnPeriodoActual);
  }, [q.data, catalogo]);

  // ── Tabs (misión §3) ──
  const [activeTab, setActiveTab] = useState<ComparisonTab>('comparacion');

  // ── Interacción de la tabla: búsqueda, filtro de evolución, orden ──
  const [search, setSearch] = useState('');
  const [evolucionFilter, setEvolucionFilter] = useState<Evolucion | 'TODOS'>('TODOS');
  const [sortId, setSortId] = useState<SortId>('ventasActuales');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    let out = rows;
    if (evolucionFilter !== 'TODOS') out = out.filter((r) => r.evolucion === evolucionFilter);
    const needle = search.trim().toLowerCase();
    if (needle) {
      out = out.filter((r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.sku ?? '').toLowerCase().includes(needle),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = a[sortId] as number | null;
      const bv = b[sortId] as number | null;
      // null (sin posición) SIEMPRE al final en los órdenes de posición.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }, [rows, search, evolucionFilter, sortId, sortDir]);

  const toggleSort = (id: SortId) => {
    if (sortId === id) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortId(id);
      setSortDir(id === 'posActual' || id === 'posAnterior' ? 'asc' : 'desc');
    }
  };

  const sortBtn = (id: SortId, label: string) => (
    <button type="button" onClick={() => toggleSort(id)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors uppercase"
      aria-label={`Ordenar por ${label}`}>
      {label}
      {sortId === id && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );

  const desdeIso = ventanaAnterior.from.toISOString();
  const hastaIso = ventana.to.toISOString();

  const evolucionCounts = useMemo(() => {
    const m = new Map<Evolucion, number>();
    for (const r of rows) m.set(r.evolucion, (m.get(r.evolucion) ?? 0) + 1);
    return m;
  }, [rows]);

  // ══ INFORME EJECUTIVO (patrón Reporte de Entrega §5) ══
  // Cache por firma: TIENDA + ventanas + updatedAt + hash compacto de las
  // filas → cualquier cambio de parámetros/datos marca el informe «stale».
  const informeSignature = useMemo(() => JSON.stringify({
    storeId,
    actual: `${toDateInputValue(ventana.from)}|${toDateInputValue(ventana.to)}`,
    anterior: `${toDateInputValue(ventanaAnterior.from)}|${toDateInputValue(ventanaAnterior.to)}`,
    updatedAt: q.data?.updatedAt ?? null,
    rows: rows.map((r) => [r.productId, r.posActual, r.posAnterior, r.ventasActuales, r.ventasAnteriores, r.unidadesActuales, r.evolucion, r.stockActual]),
  }), [storeId, ventana, ventanaAnterior, q.data?.updatedAt, rows]);

  const [informe, setInforme] = useState<InformeEjecutivo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const informeSigRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const buildingRef = useRef(false);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(String(previewUrlRef.current)); } catch {}
      previewUrlRef.current = null;
    }
    informeSigRef.current = null;
    setInforme(null);
    setPreviewUrl(null);
  }, []);

  // Libera el blob al desmontar la vista (misma regla del Reporte de Entrega).
  useEffect(() => () => {
    if (previewUrlRef.current) { try { URL.revokeObjectURL(String(previewUrlRef.current)); } catch {} }
  }, []);

  const generarInforme = useCallback(async (force = false) => {
    if (!resumen || rows.length === 0) return;
    if (buildingRef.current) return;
    // Cache vigente: la firma de la vista coincide con la del documento.
    if (!force && previewUrlRef.current && informeSigRef.current === informeSignature) return;
    buildingRef.current = true;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      // UNA fuente de redacción/cifras: el motor analítico consume rows/resumen
      // y la evidencia del mayor de inventario (sin afirmar ventas ni su ausencia).
      const informeEjecutivo = buildInformeEjecutivo({
        rows,
        resumen,
        generadoEl: new Date().toISOString(),
        ventasEnPeriodoActual: q.data?.ventasEnPeriodoActual ?? null,
        meta: {
          entidadNombre: activeStore?.name ?? 'Tienda activa',
          periodoActual: { desde: toDateInputValue(ventana.from), hasta: toDateInputValue(ventana.to) },
          periodoComparacion: { desde: toDateInputValue(ventanaAnterior.from), hasta: toDateInputValue(ventanaAnterior.to) },
          ambito: activeStore?.name ?? 'tienda activa',
        },
      });
      // Carga DIFERIDA del generador PDF (bundle gate: jspdf fuera del chunk inicial).
      const { buildInformeEjecutivoPdf } = await import('./informe-ejecutivo-pdf');
      const doc = await buildInformeEjecutivoPdf(informeEjecutivo);
      const url = doc.output('bloburl');
      const old = previewUrlRef.current;
      previewUrlRef.current = String(url);
      informeSigRef.current = informeSignature;
      setInforme(informeEjecutivo);
      setPreviewUrl(String(url));
      if (old) { try { URL.revokeObjectURL(String(old)); } catch {} }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setPreviewError(e?.message || 'No se pudo generar el informe.');
    } finally {
      buildingRef.current = false;
      setPreviewLoading(false);
    }
  }, [resumen, rows, activeStore, ventana, ventanaAnterior, informeSignature, q.data]);

  // Al abrir el tab del informe con datos: construir si no hay cache vigente.
  useEffect(() => {
    if (activeTab === 'informe' && rows.length > 0 && resumen) {
      void generarInforme(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /** ¿La vista preliminar corresponde a los parámetros/datos ACTUALES? */
  const informeStale = !!informe && informeSigRef.current !== null && informeSigRef.current !== informeSignature;

  const exportarInforme = useCallback(async () => {
    if (!informe) {
      toast.info('Genera el informe primero con «Generar informe».');
      return;
    }
    if (informeSigRef.current !== informeSignature) {
      toast.info('El informe está desactualizado: pulsa «Actualizar vista preliminar» y exporta después.');
      return;
    }
    setExporting(true);
    try {
      const { exportInformeEjecutivoPdf } = await import('./informe-ejecutivo-pdf');
      await exportInformeEjecutivoPdf(informe);
      toast.success('Informe ejecutivo exportado (PDF).');
    } catch {
      toast.error('No se pudo exportar el PDF del informe. Intente nuevamente.');
    } finally {
      setExporting(false);
    }
  }, [informe, informeSignature]);

  return (
    <div className="space-y-5 max-w-6xl mx-auto px-3 sm:px-6 py-4" data-testid="product-comparison-view">
      {/* Encabezado con regreso claro al Dashboard (misión §5) */}
      <div>
        <button
          type="button"
          onClick={() => setCurrentView('dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
          data-testid="comparison-back"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
        </button>
        {/* GATE 16 (misión BI 2026-11-23): UNA sola h1 por página — la pinta el
            shell Header con el label oficial de la navegación. La vista usa h2. */}
        <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground mt-1">Comparar productos</h2>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
          Ranking comercial: mes en curso vs mismo tramo del mes anterior
        </p>
      </div>

      {/* Encabezado comparativo (misión §5.1): períodos, fecha de proceso, ámbito */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px]" data-testid="comparison-header">
        <span>
          <span className="text-muted-foreground">Período actual (mes en curso): </span>
          <span className="font-bold text-foreground tabular-nums">
            {toDateInputValue(ventana.from)} — {toDateInputValue(ventana.to)}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Período anterior comparable: </span>
          <span className="font-bold text-foreground tabular-nums">
            {toDateInputValue(ventanaAnterior.from)} — {toDateInputValue(ventanaAnterior.to)}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Ventas procesadas hasta: </span>
          <span className="font-bold text-foreground tabular-nums" data-testid="comparison-updated">
            {q.data?.updatedAt
              ? `${toDateInputValue(new Date(q.data.updatedAt))} · ${new Date(q.data.updatedAt).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}`
              : '…'}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Ámbito: </span>
          <span className="font-bold text-foreground">{activeStore?.name ?? 'Tienda activa'}</span>
        </span>
      </div>

      {q.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-24 rounded-xl bg-muted/20 animate-pulse" />
          <div className="h-64 rounded-xl bg-muted/20 animate-pulse" />
        </div>
      ) : q.isError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-destructive/5 border border-destructive/20 rounded-2xl">
          <p className="text-sm font-black uppercase tracking-widest text-destructive">No se pudo cargar la comparación</p>
          <p className="text-xs text-muted-foreground">{q.error instanceof Error ? q.error.message : 'Error de consulta'}</p>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest min-h-[44px]"
            data-testid="comparison-retry"
          >
            <RefreshCw className="w-3 h-3" /> Reintentar
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-border bg-card">
          <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Sin ventas en ninguno de los dos períodos</p>
          <p className="text-xs text-muted-foreground mt-1">No hay productos comparables en el Top de ventas del mes en curso ni del anterior.</p>
        </div>
      ) : (
        <>
          {/* ── Tab bar (patrón Reporte de Entrega — hand-rolled, mobile-safe) ── */}
          <div className="flex border-b border-border bg-card rounded-t-xl overflow-hidden" role="tablist" aria-label="Secciones de Comparar Productos" data-testid="comparison-tabs">
            {([
              ['comparacion', 'Comparación', ArrowLeftRight],
              ['informe', 'Informe Ejecutivo', FileText],
            ] as Array<[ComparisonTab, string, React.ElementType]>).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                id={`pc-tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`pc-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex-1 py-2.5 px-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5 min-h-[44px]',
                  activeTab === id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
                data-testid={`comparison-tab-${id}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
                {id === 'informe' && informeStale && (
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" title="El informe necesita regenerarse con los datos actuales" />
                )}
              </button>
            ))}
          </div>

          <div
            className="border border-t-0 border-border rounded-b-xl p-3 sm:p-4 space-y-4"
            role="tabpanel"
            id={`pc-panel-${activeTab}`}
            aria-labelledby={`pc-tab-${activeTab}`}
            data-testid={`comparison-panel-${activeTab}`}
          >
            {activeTab === 'comparacion' ? (
              <>
                {resumen && <ResumenEjecutivo resumen={resumen} rows={rows} />}

                {/* Filtros por evolución (misión §5.3: clasificaciones comprensibles) */}
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por evolución">
                  <button
                    type="button"
                    onClick={() => setEvolucionFilter('TODOS')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border min-h-[36px] transition-all',
                      evolucionFilter === 'TODOS' ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    Todos ({rows.length})
                  </button>
                  {(Object.keys(EVOLUCION_LABEL) as Evolucion[]).map((ev) => (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => setEvolucionFilter(ev)}
                      aria-pressed={evolucionFilter === ev}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border min-h-[36px] transition-all',
                        evolucionFilter === ev ? 'bg-primary/10 border-primary/40 text-primary' : cn('border-border bg-background hover:bg-muted', EVOLUCION_TONE[ev]),
                      )}
                    >
                      {EVOLUCION_LABEL[ev]} ({evolucionCounts.get(ev) ?? 0})
                    </button>
                  ))}
                </div>

                {/* Búsqueda */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o SKU…"
                    aria-label="Buscar producto por nombre o SKU"
                    className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-ring"
                    data-testid="comparison-search"
                  />
                </div>

                {/*
                  Tabla analítica (misión §2, rediseño 2026-11-23):
                  · scroll horizontal REAL dentro del contenedor (overflow-x-auto) —
                    las columnas NO desbordan la página;
                  · scroll vertical con techo (max-h) + thead sticky → encabezados
                    siempre visibles al recorrer conjuntos amplios;
                  · primera columna FIJA (sticky-column-1) con sombra de separación;
                  · min-w declarado en la tabla: no se comprime ni pierde legibilidad.
                */}
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-testid="comparison-table">
                  <div className="overflow-x-auto overflow-y-auto max-h-[72vh]">
                    <table className="w-full min-w-[880px] text-left sticky-column-1">
                      <thead className="sticky top-0 z-20">
                        <tr className="border-b border-border bg-muted/95 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          <th className="px-3 py-2.5 min-w-[180px] sticky top-0 z-30 bg-muted/95">Producto</th>
                          <th className="px-2.5 py-2.5 text-center">{sortBtn('posActual', 'Pos. actual')}</th>
                          <th className="px-2.5 py-2.5 text-center">{sortBtn('posAnterior', 'Pos. anterior')}</th>
                          <th className="px-2.5 py-2.5 text-right">{sortBtn('ventasActuales', 'Ventas act.')}</th>
                          <th className="px-2.5 py-2.5 text-right">{sortBtn('ventasAnteriores', 'Ventas ant.')}</th>
                          <th className="px-2.5 py-2.5 text-right">{sortBtn('unidadesActuales', 'Unid. act.')}</th>
                          <th className="px-2.5 py-2.5 text-right">Unid. ant.</th>
                          <th className="px-2.5 py-2.5 text-right">{sortBtn('difCup', 'Variación')}</th>
                          <th className="px-2.5 py-2.5 text-right">{sortBtn('stockActual', 'Existencia')}</th>
                          <th className="px-2.5 py-2.5">Evolución</th>
                          <th className="px-2 py-2.5" aria-label="Expandir diagnóstico" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r) => (
                          <React.Fragment key={r.productId}>
                            <tr
                              className={cn(
                                'border-b border-border/50 text-[12px] hover:bg-muted/30 transition-colors',
                                expanded === r.productId && 'bg-muted/20',
                              )}
                              data-testid={`comparison-row-${r.productId}`}
                            >
                              <td className="px-3 py-2 min-w-[180px] bg-card">
                                <span className="font-bold text-foreground block truncate max-w-[220px]" title={r.name}>{r.name}</span>
                                {r.sku && <span className="text-[10px] font-mono text-muted-foreground uppercase">{r.sku}</span>}
                              </td>
                              <td className="px-2.5 py-2 text-center tabular-nums font-black text-foreground">
                                {r.posActual ?? <span className="text-muted-foreground/50">—</span>}
                              </td>
                              <td className="px-2.5 py-2 text-center tabular-nums text-muted-foreground">
                                {r.posAnterior ?? <span className="text-muted-foreground/50">—</span>}
                              </td>
                              <td className="px-2.5 py-2 text-right tabular-nums font-bold text-foreground whitespace-nowrap">
                                {formatCurrency(r.ventasActuales)}
                                <span className="ml-1 text-[9px] text-muted-foreground">CUP</span>
                              </td>
                              <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                {formatCurrency(r.ventasAnteriores)}
                                <span className="ml-1 text-[9px] text-muted-foreground/60">CUP</span>
                              </td>
                              <td className="px-2.5 py-2 text-right tabular-nums text-foreground whitespace-nowrap">
                                {fmtUnidades(r.unidadesActuales, r.unidadMedida)}
                                {r.devolucionesActuales > 0 && (
                                  <span className="block text-[9px] text-destructive">−{fmtUnidades(r.devolucionesActuales, r.unidadMedida)} dev.</span>
                                )}
                              </td>
                              <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                {fmtUnidades(r.unidadesAnteriores, r.unidadMedida)}
                              </td>
                              <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">
                                {r.varPct === null ? (
                                  <span className="text-muted-foreground text-[10px] uppercase" title="Sin base: el período anterior no registró ventas">sin base</span>
                                ) : (
                                  <span className={cn(
                                    'inline-flex items-center gap-1 font-bold',
                                    r.difCup > 0 ? 'text-success' : r.difCup < 0 ? 'text-destructive' : 'text-muted-foreground',
                                  )}>
                                    {r.difCup > 0 ? <ArrowUpRight className="w-3 h-3" /> : r.difCup < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                    {r.varPct > 0 ? '+' : ''}{r.varPct}%
                                    <span className="text-[9px] text-muted-foreground font-normal">
                                      ({r.difCup > 0 ? '+' : ''}{formatCurrency(r.difCup)})
                                    </span>
                                  </span>
                                )}
                              </td>
                              <td className="px-2.5 py-2 text-right tabular-nums">
                                {r.stockActual === null ? (
                                  <span className="text-muted-foreground/60">N/D</span>
                                ) : (
                                  <span className={cn('font-bold', r.stockActual <= 0 ? 'text-destructive' : 'text-foreground')}>
                                    {fmtUnidades(r.stockActual, r.unidadMedida)}
                                  </span>
                                )}
                              </td>
                              <td className="px-2.5 py-2">
                                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide whitespace-nowrap', EVOLUCION_TONE[r.evolucion])}>
                                  {EVOLUCION_LABEL[r.evolucion]}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => setExpanded(expanded === r.productId ? null : r.productId)}
                                  aria-expanded={expanded === r.productId}
                                  aria-label={`Diagnóstico de inventario de ${r.name}`}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  data-testid={`comparison-expand-${r.productId}`}
                                >
                                  {expanded === r.productId ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              </td>
                            </tr>
                            {expanded === r.productId && (
                              <tr>
                                <td colSpan={11} className="px-3 pb-3">
                                  <ProductDiagnosis row={r} storeId={storeId} desdeIso={desdeIso} hastaIso={hastaIso} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {filteredRows.length === 0 && (
                          <tr>
                            <td colSpan={11} className="px-3 py-8 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">
                              Ningún producto coincide con la búsqueda o el filtro activo
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Notas metodológicas (misión §5.2/§7) */}
                <div className="flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground rounded-xl border border-border bg-muted/20 p-3">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p>
                      Ingresos en la valoración canónica del sistema (CUP contable a la tasa de cada venta, netos de descuento y de
                      devoluciones; anulados y borradores excluidos por el agregado oficial). No se mezclan nominales CUP/USD ni se
                      aplican tasas propias. Las unidades se comparan por producto con su unidad de medida — nunca como cantidades
                      agregadas entre productos incompatibles.
                    </p>
                    <p className="mt-1">
                      La comparación reúne el Top (20) del período actual y el Top (20) del anterior: un líder anterior con ventas
                      cero hoy permanece visible. El diagnóstico de inventario usa el mayor real de stock_movements; solo afirma
                      agotamiento cuando el histórico es confiable y concilia con la existencia autoritativa.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              /* ══ TAB: INFORME EJECUTIVO (misión §3-§5) ══ */
              <div className="space-y-4" data-testid="informe-ejecutivo">
                {/* Controles (flujo funcional: generar → previsualizar → exportar) */}
                <div className="flex flex-wrap items-center gap-2" data-testid="informe-controls">
                  <button
                    type="button"
                    onClick={() => void generarInforme(true)}
                    disabled={previewLoading}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-widest min-h-[40px] disabled:opacity-50"
                    data-testid="informe-generar"
                  >
                    {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                    Generar informe
                  </button>
                  <button
                    type="button"
                    onClick={() => void generarInforme(true)}
                    disabled={previewLoading || !informe}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-4 h-10 rounded-xl border text-[11px] font-black uppercase tracking-widest min-h-[40px] disabled:opacity-40',
                      informeStale ? 'border-warning/50 bg-warning/10 text-warning' : 'border-border text-foreground hover:bg-muted',
                    )}
                    title={informeStale ? 'Los datos o filtros cambiaron: regenera el informe' : 'Volver a construir el documento con los datos actuales'}
                    data-testid="informe-actualizar"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Actualizar vista preliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportarInforme()}
                    disabled={!informe || informeStale || exporting}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl border border-border text-[11px] font-black uppercase tracking-widest min-h-[40px] hover:bg-muted disabled:opacity-40"
                    title={!informe ? 'Genera el informe primero' : informeStale ? 'Actualiza la vista preliminar antes de exportar' : 'Descargar el PDF oficial del informe'}
                    data-testid="informe-exportar"
                  >
                    {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar PDF
                  </button>
                  <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest', informeStale ? 'text-warning' : informe ? 'text-success' : 'text-muted-foreground')} data-testid="informe-estado">
                    <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full', informeStale ? 'bg-warning' : informe ? 'bg-success' : 'bg-muted-foreground/40')} />
                    {informeStale ? 'Informe desactualizado — regenéralo con los datos actuales' : informe ? 'Informe actualizado con los datos actuales' : 'Informe no generado todavía'}
                  </span>
                </div>

                {/* Banner de obsolescencia (nunca mostrar silenciosamente datos viejos) */}
                {informeStale && (
                  <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-warning" data-testid="informe-stale-banner">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="flex-1 min-w-[200px]">
                      Cambiaron los datos, los períodos o la tienda: la vista preliminar corresponde a la comparación anterior. Regenera antes de considerar el documento vigente.
                    </span>
                    <button onClick={() => void generarInforme(true)} className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-[10px] font-black uppercase hover:bg-warning/20 shrink-0 min-h-[36px]">
                      Regenerar informe
                    </button>
                  </div>
                )}

                {/* Vista preliminar — espacio principal del tab: reproduce fielmente
                    el documento que se exporta (blob del mismo builder compartido).
                    El contenido analítico vive EXCLUSIVAMENTE en el PDF oficial:
                    la interfaz no duplica texto del informe (misión Informe Gerencial §1). */}
                {previewLoading ? (
                  <div className="p-10 text-center text-muted-foreground" aria-live="polite" data-testid="informe-preview-loading">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs">Generando vista preliminar del informe…</p>
                  </div>
                ) : previewError ? (
                  <div className="p-6 text-center space-y-2" role="alert" data-testid="informe-preview-error">
                    <AlertTriangle className="w-8 h-8 mx-auto text-destructive/60" />
                    <p className="text-xs text-destructive">{previewError}</p>
                    <button onClick={() => void generarInforme(true)} className="rounded-lg border border-border/40 px-3 py-2 text-[10px] font-black uppercase hover:bg-muted min-h-[36px]">Reintentar</button>
                  </div>
                ) : previewUrl ? (
                  <div className="rounded-lg overflow-hidden border border-border/40 bg-white" style={{ height: 'min(78vh, 1080px)' }} data-testid="informe-preview">
                    <iframe
                      key={previewUrl}
                      src={previewUrl}
                      title="Vista previa del Informe Ejecutivo de Desempeño Comercial y Abastecimiento"
                      className="w-full h-full"
                    />
                  </div>
                ) : (
                  <div className="p-10 text-center space-y-2 rounded-xl border border-dashed border-border" data-testid="informe-preview-empty">
                    <FileText className="w-8 h-8 mx-auto text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">
                      Pulsa «Generar informe» para construir el documento institucional (diagnóstico, prioridades, análisis y anexos) y verlo aquí.
                    </p>
                  </div>
                )}
                <p className="text-[9px] text-muted-foreground text-center">
                  La vista preliminar reproduce exactamente el documento que se exporta. El análisis completo —diagnóstico ejecutivo, matriz de prioridades, indicadores de rotación y cobertura, y anexos— vive únicamente en el PDF oficial; esta interfaz no duplica su contenido.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
