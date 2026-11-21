'use client';

/**
 * CP-FIN · Vista B — Panel de drilldown de una categoría.
 *
 * Se monta SOLO cuando la fila de la categoría está expandida: carga los
 * primeros 20 movimientos (GET /api/fin/statements/category-detail) y pagina
 * con «Ver más» (offset + 20).
 *
 * CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 (2026-11-18):
 *  · Importe contable SIEMPRE con código de moneda explícito (CUP); el
 *    «Importe original» muestra el nominal registrado en la moneda del
 *    documento (amount_origin/currency_origin escritos por el motor CP-FIN-001)
 *    y en las aperturas (amount con currency ≠ CUP). Cuando el histórico no
 *    conserva el original se presenta explícitamente «No registrado»
 *    (deficiencia de trazabilidad) — NUNCA se reconstruye ni inventa.
 *  · Documento: número documental si existe; si no, el IDENTIFICADOR REAL del
 *    documento (document_id) — jamás se inventa un número.
 *  · «Ver documento» (VENTA): navega al detalle de la venta original en el
 *    Historial de Ventas vía saleDetailNavContext (ID real, permisos de la
 *    vista destino). Si el documento no puede localizarse, el historial
 *    presenta «Documento de origen no disponible».
 *  · Medio de pago: clasificación REAL del asiento (la cuenta de destino de
 *    la línea), no inferencia por moneda.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ExternalLink, FileSpreadsheet, FileText, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { cn, formatLabeledCurrency } from '@/lib/utils';
import { useAuthStore, useUIStore } from '@/store';
import { toast } from 'sonner';
import { fetchCategoryDetail } from './fin-api';
import {
  exportCategoryMovementsExcel,
  exportCategoryMovementsPdf,
  fetchAllCategoryMovements,
} from './movement-exporters';
import { ExportPeriodDialog } from './ExportPeriodDialog';
import { havanaNow, toDateInputValue } from '@/lib/sales-dashboard/periods';
import type { MovementRow } from './types';

const PAGE_SIZE = 20;

interface CategoryDetailPanelProps {
  storeId: string;
  categoryCode: string;
  categoryName: string;
  /** Inicio del rango: 1900-01-01 en el balance (histórico completo), from del período en rendimiento. */
  from: string;
  /** Fin del rango: fecha de corte en el balance, to del período en rendimiento. */
  to: string;
}

const EVENT_LABELS: Record<string, string> = {
  reconocimiento: 'Reconocimiento',
  pago: 'Pago',
  apertura: 'Apertura',
  anulacion: 'Anulación',
  ajuste_manual: 'Ajuste manual',
};

function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? (event ? event.charAt(0).toUpperCase() + event.slice(1) : '—');
}

/**
 * CP-FIN-001 · Medio de pago según la CUENTA contable de la línea (la regla
 * de partida doble debita la cuenta real del medio: efectivo CUP/USD o
 * bancos/transferencias). No se infiere por la moneda.
 */
const PAYMENT_METHOD_BY_CATEGORY: Record<string, string> = {
  ACT_EFECTIVO_CUP: 'Efectivo (CUP)',
  ACT_EFECTIVO_USD: 'Efectivo (USD)',
  ACT_BANCOS: 'Banco / Transferencia',
};

function paymentMethodLabel(categoryCode: string): string {
  const label = PAYMENT_METHOD_BY_CATEGORY[categoryCode];
  if (label) return label;
  // La categoría ya se muestra como contexto del drilldown; para cuentas que
  // no son cuentas financieras el medio de pago no aplica.
  return '—';
}

/** Celda «Importe original»: datos reales del registro; sin reconstrucciones. */
function originalAmountCell(m: MovementRow): { text: string; title?: string } {
  // Aperturas/saldos: el importe de la línea YA está en la moneda del saldo
  // (currency ≠ CUP con exchange_rate registrado; amount_cup es el equivalente).
  if (m.currency && m.currency !== 'CUP') {
    return { text: formatLabeledCurrency(m.amount, m.currency) };
  }
  if (m.currency_origin && m.currency_origin !== 'CUP') {
    if (m.amount_origin != null && m.amount_origin > 0) {
      return {
        text: formatLabeledCurrency(m.amount_origin, m.currency_origin),
        title: 'Importe original registrado por el motor para el documento de origen',
      };
    }
    return {
      text: 'No registrado',
      title:
        `Deficiencia de trazabilidad: el registro histórico no conserva el importe original en ${m.currency_origin} ` +
        '(rectificación histórica pendiente de autorización del propietario).',
    };
  }
  // Moneda original CUP (o no identificada): no duplica el importe contable.
  return { text: '—' };
}

export function CategoryDetailPanel({
  storeId,
  categoryCode,
  categoryName,
  from,
  to,
}: CategoryDetailPanelProps) {
  const token = useAuthStore((s) => s.token);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const setSaleDetailNavContext = useUIStore((s) => s.setSaleDetailNavContext);
  // CP-FIN-003 (misión §6.2): acceso contextual «Ver configuración contable»
  // desde cada movimiento → abre la Configuración de Documentos preseleccionada
  // en el tipo documental que generó el asiento (regla, cuentas, criterios).
  const setFinancialOpeningNavContext = useUIStore((s) => s.setFinancialOpeningNavContext);
  const canConfigure = useAuthStore((s) => ['admin', 'manager'].includes(s.user?.role ?? ''));
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CP-FIN-001 §10.17: ordenamiento por importe en la moneda correspondiente.
  // La moneda contable del drilldown es única (CUP): ordenar por amount_cup es
  // determinista y no mezcla monedas. El orden canónico (fecha/posted) es el
  // default del ledger.
  const [amountSort, setAmountSort] = useState<'none' | 'desc' | 'asc'>('none');
  // CP-FIN-REC-001/PR B: exportación documental del mayor completo.
  const [exportingExcel, setExportingExcel] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const TODAY = () => toDateInputValue(havanaNow());

  const exportCtx = {
    storeName: categoryCode, // el nombre real de la tienda lo aporta la vista contenedora vía contexto de usuario si existe; se usa el código como fallback identificable
    categoryName,
    categoryCode,
    from,
    to,
    esCorte: from === '1900-01-01',
  };

  /** Excel: TODOS los movimientos del servidor (no solo los cargados). */
  const handleExportExcel = useCallback(async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const result = await fetchAllCategoryMovements(storeId, categoryCode, from, to, token);
      await exportCategoryMovementsExcel(result, exportCtx);
      toast.success(`Excel generado: ${result.movimientos.length} de ${result.total} movimientos (hojas Movimientos + Resumen)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al exportar a Excel');
    } finally {
      setExportingExcel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, categoryCode, from, to, token, exportingExcel, categoryName]);

  /** PDF: se genera SOLO tras confirmar el período en el diálogo (misión §7.1). */
  const handleGeneratePdf = useCallback(async (pdfFrom: string, pdfTo: string) => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const result = await fetchAllCategoryMovements(storeId, categoryCode, pdfFrom, pdfTo, token);
      await exportCategoryMovementsPdf(result, { ...exportCtx, from: pdfFrom, to: pdfTo });
      setPdfDialogOpen(false);
      toast.success(`PDF generado: ${result.movimientos.length} movimientos (${pdfFrom} — ${pdfTo})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al generar el PDF');
    } finally {
      setExportingPdf(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, categoryCode, token, exportingPdf, categoryName]);

  const load = useCallback(
    async (offset: number) => {
      if (offset === 0) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const d = await fetchCategoryDetail(storeId, categoryCode, from, to, PAGE_SIZE, offset, token);
        setTotal(d.total ?? 0);
        setMovements((prev) => (offset === 0 ? d.movimientos ?? [] : [...prev, ...(d.movimientos ?? [])]));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar el detalle');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [storeId, categoryCode, from, to, token],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  /**
   * CP-FIN-001 §6: abre el documento de origen en su vista, usando el
   * identificador real del documento (document_id) y respetando los permisos
   * de la vista destino (el historial consulta por tienda activa con RLS).
   */
  const openOriginDocument = useCallback(
    (m: MovementRow) => {
      if (!m.document_id) return;
      if (m.document_type === 'VENTA') {
        setSaleDetailNavContext({ transactionId: m.document_id, setAt: Date.now() });
        setCurrentView('sales');
        return;
      }
      // Tipos documentales sin vista de detalle navegable: aviso explícito
      // (sin enlaces construidos con fecha/tipo — misión §6).
      toast.info('Documento de origen no disponible para navegación directa en este tipo documental.');
    },
    [setCurrentView, setSaleDetailNavContext],
  );

  /**
   * CP-FIN-003 §6.2: abre la configuración contable del tipo documental que
   * generó el movimiento (regla activa, débito/crédito, métricas, vigencia).
   * Conserva contexto: tipo + código + evento (misión §6.2).
   */
  const openAccountingConfig = useCallback(
    (m: MovementRow) => {
      if (!m.document_type) return;
      setFinancialOpeningNavContext({
        openOpeningBalances: false,
        focusDocumentType: m.document_type,
        setAt: Date.now(),
      });
      setCurrentView('document-config');
    },
    [setCurrentView, setFinancialOpeningNavContext],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs font-bold uppercase tracking-widest">Cargando movimientos…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center space-y-2">
        <p className="text-xs text-destructive font-bold">{error}</p>
        <button
          type="button"
          onClick={() => load(0)}
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:underline"
        >
          <RefreshCw className="w-3 h-3" /> Reintentar
        </button>
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Sin movimientos de «{categoryName}» en el rango consultado.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-xs min-w-[820px]">
          <thead className="bg-muted/50">
            <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <th className="px-2.5 py-2 text-left">Fecha</th>
              <th className="px-2.5 py-2 text-left">Documento</th>
              <th className="px-2.5 py-2 text-left">Tipo</th>
              <th className="px-2.5 py-2 text-left">Evento</th>
              <th className="px-2.5 py-2 text-center">Débito/Crédito</th>
              <th className="px-2.5 py-2 text-right">
                <button
                  type="button"
                  onClick={() =>
                    setAmountSort((s) => (s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none'))
                  }
                  className={cn(
                    'inline-flex items-center gap-1 uppercase tracking-widest hover:text-foreground transition-colors min-h-[28px] px-1 rounded',
                    amountSort !== 'none' && 'text-primary',
                  )}
                  title="Ordenar por importe contable (CUP) — la moneda única del drilldown"
                  data-testid="sort-importe-contable"
                >
                  Importe contable (CUP)
                  {amountSort === 'desc' ? ' ↓' : amountSort === 'asc' ? ' ↑' : ''}
                </button>
              </th>
              <th className="px-2.5 py-2 text-right hidden md:table-cell">Importe original</th>
              <th className="px-2.5 py-2 text-left hidden lg:table-cell">Medio de pago</th>
              <th className="px-2.5 py-2 text-left">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {[...movements]
              .sort((a, b) =>
                amountSort === 'none'
                  ? 0
                  : amountSort === 'desc'
                    ? b.amount_cup - a.amount_cup
                    : a.amount_cup - b.amount_cup,
              )
              .map((m) => {
              const originalCell = originalAmountCell(m);
              const hasNavigation = !!m.document_id;
              return (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{m.economic_date}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="font-mono font-bold"
                        title={
                          m.document_number
                            ? m.document_number
                            : m.document_id
                              ? `ID real del documento: ${m.document_id}`
                              : undefined
                        }
                      >
                        {m.document_number || (m.document_id ? m.document_id.slice(0, 8) : '—')}
                      </span>
                      {hasNavigation && (
                        <button
                          type="button"
                          onClick={() => openOriginDocument(m)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors min-h-[28px]"
                          title={
                            m.document_type === 'VENTA'
                              ? 'Abrir el detalle de la venta original en Historial de Ventas'
                              : 'Ver el documento de origen de este movimiento'
                          }
                          data-testid={`ver-documento-${m.id}`}
                        >
                          <ExternalLink className="w-3 h-3" /> Ver documento
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    {m.document_type}
                    {canConfigure && m.document_type && (
                      <button
                        type="button"
                        onClick={() => openAccountingConfig(m)}
                        className="inline-flex items-center gap-1 ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors min-h-[28px]"
                        title={`Ver la regla contable de ${m.document_type}: cuentas de débito/crédito, métricas, criterios y vigencia`}
                        data-testid={`ver-config-contable-${m.id}`}
                      >
                        <Settings2 className="w-3 h-3" /> Config. contable
                      </button>
                    )}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{eventLabel(m.event)}</td>
                  <td className="px-2.5 py-2 text-center">
                    <span
                      className={cn(
                        'inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider',
                        m.sense === 'debito'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {m.sense === 'debito' ? 'Débito' : 'Crédito'}
                    </span>
                  </td>
                  {/* Importe CONTABLE: siempre con el código de moneda explícito.
                      Convención §8 intacta: no se cambian signos ni columnas. */}
                  <td
                    className={cn(
                      'px-2.5 py-2 text-right tabular-nums font-bold whitespace-nowrap',
                      m.amount_cup < 0 && 'text-destructive',
                    )}
                  >
                    {formatLabeledCurrency(m.amount_cup, 'CUP')}
                  </td>
                  {/* Importe ORIGINAL: nominal en la moneda del documento cuando
                      el registro lo conserva; «No registrado» cuando no existe
                      (deficiencia explícita, nunca conversión inventada). */}
                  <td
                    className={cn(
                      'px-2.5 py-2 text-right tabular-nums whitespace-nowrap hidden md:table-cell',
                      originalCell.text === 'No registrado' ? 'text-muted-foreground italic' : 'text-foreground',
                    )}
                    title={originalCell.title}
                    data-testid={`importe-original-${m.id}`}
                  >
                    {originalCell.text}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-muted-foreground hidden lg:table-cell">
                    {paymentMethodLabel(categoryCode)}
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground max-w-[220px] truncate" title={m.description ?? ''}>
                    {(m.description ?? '').trim() || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {movements.length} de {total} movimiento{total !== 1 ? 's' : ''}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={exportingExcel || total === 0}
            title="Exportar TODOS los movimientos del servidor a Excel (hojas Movimientos + Resumen)"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:bg-muted transition-colors min-h-[36px] disabled:opacity-50"
            data-testid="btn-export-excel-movimientos"
          >
            {exportingExcel ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
            Exportar movimientos a Excel
          </button>
          <button
            type="button"
            onClick={() => setPdfDialogOpen(true)}
            disabled={exportingPdf}
            title="Exportar los movimientos de un período a PDF (solicita fechas)"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground hover:bg-muted transition-colors min-h-[36px] disabled:opacity-50"
            data-testid="btn-export-pdf-movimientos"
          >
            {exportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            Exportar movimientos a PDF
          </button>
          {movements.length < total && (
            <button
              type="button"
              onClick={() => load(movements.length)}
              disabled={loadingMore}
              className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:underline disabled:opacity-50 min-h-[36px]"
            >
              {loadingMore ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Ver más
            </button>
          )}
        </div>
      </div>
      <ExportPeriodDialog
        open={pdfDialogOpen}
        defaultFrom={from === '1900-01-01' ? '2026-01-01' : from}
        defaultTo={to}
        maxTo={TODAY()}
        categoryLabel={`${categoryCode} · ${categoryName}`}
        onClose={() => setPdfDialogOpen(false)}
        onGenerate={(f, t) => void handleGeneratePdf(f, t)}
        busy={exportingPdf}
      />
    </div>
  );
}
