'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, RotateCcw, Loader2, FileText, X, Undo2, Copy } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { DocumentStatusBadge, canReverse } from '@/components/ui/DocumentStatusBadge';
import { canReverseDocumentInStore } from '@/lib/roles';
import { ReverseDocumentModal } from '@/components/ui/ReverseDocumentModal';
import { DuplicateDocumentModal } from '@/components/ui/DuplicateDocumentModal';
// MISIÓN FECHAS DE TRABAJO (2026-10-18): selector de fecha operativa visible
// (gap del informe del PR #1422 §10.5: la API soportaba operation_date pero
// la UI nunca lo exponía). Mismo picker reutilizable + misma convención de
// envío del proyecto (hoy → no se envía, servidor estampa NOW(); ≠ hoy →
// mediodía local vía resolvePosOperationDate).
import { OperationDatePicker } from '@/components/ui/OperationDatePicker';
import { useApplyWorkDateDefault } from '@/hooks/ui/useWorkDateDefault';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
import { resolvePosOperationDate } from '@/lib/pos/operation-date';

const touch = 'min-h-[44px]';

export function DevolutionsView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [devolutions, setDevolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  // V2.2: modal de reversión
  const [reverseTarget, setReverseTarget] = useState<{ id: string; label: string } | null>(null);
  // V2.4: modal de duplicación
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; label: string; itemCount?: number } | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/devolutions?store_id=${storeId}&limit=50`);
      setDevolutions(data.data || []);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const filtered = devolutions.filter(d =>
    !search || d.devolution_number?.toLowerCase().includes(search.toLowerCase()) ||
    d.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.reason?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">Devoluciones</h1>
          <p className="text-xs text-muted-foreground">Notas de crédito y devoluciones de productos</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90', touch)}>
          <Plus className="w-4 h-4" /> Nueva Devolución
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por número, cliente, motivo..."
            className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>
        <button onClick={load} className={cn('p-2 rounded-xl border border-border hover:bg-muted', touch)} aria-label="Recargar">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <RotateCcw className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No hay devoluciones registradas</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(d => (
            <div key={d.id} className="p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-black text-primary">{d.devolution_number}</span>
                    <DocumentStatusBadge type="devolution" status={d.status} size="xs" />
                  </div>
                  <p className="text-sm font-bold truncate">{d.reason}</p>
                  {d.customer_name && <p className="text-xs text-muted-foreground">Cliente: {d.customer_name}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(d.processed_at).toLocaleString('es-CU')}</p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                  <div>
                    <p className="font-mono font-black text-sm">{formatCurrency(Number(d.total_amount))}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{d.payment_method}</p>
                  </div>
                  {/* V2.2: botón Revertir devolución completada */}
                  {/* W9.5 B-10: gate de rol (espejo can_reverse_document) — membresía activa */}
                  {canReverse('devolution', d.status) && canReverseDocumentInStore(user, storeId ?? '', 'devolution') && (
                    <button
                      type="button"
                      onClick={() => setReverseTarget({
                        id: d.id,
                        label: `Devolución ${d.devolution_number} • ${formatCurrency(Number(d.total_amount))}`,
                      })}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-purple-500/40 bg-purple-500/5 text-purple-500 dark:text-purple-400 hover:bg-purple-500 hover:text-white dark:hover:text-black transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest"
                      title="Revertir devolución (descuenta stock restaurado)"
                      aria-label="Revertir devolución"
                    >
                      <Undo2 className="w-3 h-3" />
                      Revertir
                    </button>
                  )}
                  {/* V2.4: botón Duplicar — abre modal de confirmación */}
                  <button
                    type="button"
                    onClick={() => setDuplicateTarget({
                      id: d.id,
                      label: `Devolución ${d.devolution_number} • ${formatCurrency(Number(d.total_amount))}`,
                      itemCount: d.items?.length,
                    })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-500/40 bg-blue-500/5 text-blue-500 hover:bg-blue-500 hover:text-white transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest"
                    title="Duplicar devolución (crea nueva con mismos items)"
                    aria-label="Duplicar devolución"
                  >
                    <Copy className="w-3 h-3" />
                    Duplicar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateDevolutionModal onClose={() => setShowCreate(false)} onCreated={() => { load(); setShowCreate(false); }} storeId={storeId!} />}

      {/* V2.2: Modal de Reversión Contable */}
      <ReverseDocumentModal
        isOpen={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        type="devolution"
        docId={reverseTarget?.id || ''}
        docLabel={reverseTarget?.label}
      />

      {/* V2.4: Modal de Duplicación */}
      <DuplicateDocumentModal
        isOpen={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        type="devolution"
        docId={duplicateTarget?.id || ''}
        docInfo={{
          docLabel: duplicateTarget?.label,
          itemCount: duplicateTarget?.itemCount,
        }}
      />
    </div>
  );
}

function CreateDevolutionModal({ onClose, onCreated, storeId }: { onClose: () => void; onCreated: () => void; storeId: string }) {
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; name: string; quantity: number; unit_price: number }>>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // REVISIÓN FINAL v2.24.1: clave de idempotencia estable POR APERTURA del
  // modal — reintentos del mismo envío (doble clic, reintento tras error de
  // red) reutilizan la clave; el RPC v2.24.1 compara hash del payload.
  const [idempotencyKey] = useState(() => `dev-${crypto.randomUUID()}`);
  // MISIÓN CAJA v2.24.0 (§8-C): el RPC create_devolution_v2 EXIGE la venta
  // original (ERR_DEVOLUTION_NO_ORIGINAL) — el modal anterior NO la enviaba y
  // TODA devolución manual fallaba. Además: método del reembolso y su MONEDA
  // real (v2.24: p_refund_currency — el reembolso en USD registra USD nativo
  // con tasa servidor; ya no se hardcodea CUP×1.0).
  const [saleQuery, setSaleQuery] = useState('');
  const [saleResults, setSaleResults] = useState<any[]>([]);
  const [originalSale, setOriginalSale] = useState<any | null>(null);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'transfer' | 'zelle' | 'store_credit'>('cash');
  // MISIÓN DE CIERRE (§6): 'AS_PAID' = multi-moneda «según lo pagado» (solo
  // efectivo): el servidor emite un componente por moneda en una transacción
  // atómica. La moneda única sigue disponible para CUP/USD y, desde esta
  // misión, TAMBIÉN para los rieles bancarios (zelle=USD, transfer=CUP/USD).
  const [refundCurrency, setRefundCurrency] = useState<'CUP' | 'USD' | 'AS_PAID'>('CUP');
  // Composición de pagos de la venta seleccionada (lectura RLS de tienda):
  // pagado por moneda + reembolsado no recuperado → reembolsable por moneda.
  const [saleComposition, setSaleComposition] = useState<{ paidCup: number; paidUsd: number; refundedCup: number; refundedUsd: number } | null>(null);
  // MISIÓN FECHAS DE TRABAJO: fecha operativa de la devolución. Default HOY
  // (día de negocio Habana — no la fecha UTC del navegador) o la preferencia
  // de trabajo del usuario para este tipo si es válida.
  const todayBd = useMemo(() => todayBusinessDay(), []);
  const [devolutionDate, setDevolutionDate] = useState(todayBd);
  const [dateTouched, setDateTouched] = useState(false);
  useApplyWorkDateDefault('devolution', !dateTouched && devolutionDate === todayBd, (d) => setDevolutionDate(d));

  async function searchSales(q: string) {
    setSaleQuery(q);
    if (q.trim().length < 4) { setSaleResults([]); return; }
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      let query = supabase
        .from('transactions')
        .select('id, invoice_number, total_amount, customer_name, payment_method, sale_currency, created_at')
        .eq('store_id', storeId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(8);
      const isUuid = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(q.trim());
      if (isUuid) query = query.eq('id', q.trim());
      else query = query.ilike('invoice_number', `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      setSaleResults(data || []);
    } catch { setSaleResults([]); }
  }

  async function searchProducts(q: string) {
    setProductSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await apiFetch(`/api/inventory/products?storeId=${storeId}&search=${encodeURIComponent(q)}&limit=5`);
      setSearchResults(data.data || data.products || []);
    } catch { setSearchResults([]); }
  }

  function addProduct(p: any) {
    setItems(prev => [...prev, { product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.price) }]);
    setProductSearch(''); setSearchResults([]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // MISIÓN DE CIERRE (§6): composición de pagos de la venta (pagado neto por
  // moneda según las MISMAS fuentes que el tope del RPC: filas de pago reales
  // + liquidación) y reembolsos no recuperados (refund − recovery). Solo lectura
  // informativa: la validación DEFINITIVA es del servidor (fail-closed).
  async function loadSaleComposition(saleId: string) {
    setSaleComposition(null);
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      const [payRes, refundRes, saleRes] = await Promise.all([
        supabase.from('payment_transactions')
          .select('payment_method, currency, amount, direction')
          .eq('transaction_id', saleId)
          .eq('ref_type', 'sale'),
        supabase.from('payment_transactions')
          .select('currency, amount, direction')
          .eq('transaction_id', saleId)
          .eq('ref_type', 'devolution')
          .in('direction', ['refund', 'recovery']),
        supabase.from('transactions')
          .select('cash_received_cup, cash_received_usd, change_given_cup, change_given_usd')
          .eq('id', saleId).single(),
      ]);
      const pays = (payRes.data ?? []) as Array<{ payment_method: string; currency: string; amount: number }>;
      const refundRows = (refundRes.data ?? []) as Array<{ currency: string; amount: number; direction: string }>;
      const settle = saleRes.data as { cash_received_cup: number | null; cash_received_usd: number | null; change_given_cup: number | null; change_given_usd: number | null } | null;
      let paidCup = 0, paidUsd = 0;
      const rowsCup = pays.filter(p => p.currency === 'CUP').reduce((s2, p) => s2 + Number(p.amount), 0);
      const rowsUsd = pays.filter(p => p.currency === 'USD').reduce((s2, p) => s2 + Number(p.amount), 0);
      const bankCup = pays.filter(p => (p.payment_method === 'transfer' || p.payment_method === 'zelle') && p.currency === 'CUP').reduce((s2, p) => s2 + Number(p.amount), 0);
      const bankUsd = pays.filter(p => (p.payment_method === 'transfer' || p.payment_method === 'zelle') && p.currency === 'USD').reduce((s2, p) => s2 + Number(p.amount), 0);
      const hasSettle = settle && (settle.cash_received_cup != null || settle.cash_received_usd != null || settle.change_given_cup != null || settle.change_given_usd != null);
      if (hasSettle && settle) {
        paidCup = (Number(settle.cash_received_cup ?? 0) - Number(settle.change_given_cup ?? 0)) + bankCup;
        paidUsd = (Number(settle.cash_received_usd ?? 0) - Number(settle.change_given_usd ?? 0)) + bankUsd;
      } else if (rowsUsd > 0) {
        paidCup = rowsCup + bankCup;
        paidUsd = rowsUsd + bankUsd;
      } else if (pays.length > 0) {
        paidCup = rowsCup + bankCup;  // legacy canónico: el RPC hace el carve por ítems
        paidUsd = bankUsd;
      }
      const refundedCup = refundRows.filter(r => r.currency === 'CUP').reduce((s2, r) => s2 + (r.direction === 'refund' ? Number(r.amount) : -Number(r.amount)), 0);
      const refundedUsd = refundRows.filter(r => r.currency === 'USD').reduce((s2, r) => s2 + (r.direction === 'refund' ? Number(r.amount) : -Number(r.amount)), 0);
      setSaleComposition({ paidCup, paidUsd, refundedCup, refundedUsd });
    } catch {
      setSaleComposition(null);
    }
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  async function handleSubmit() {
    if (!reason.trim() || items.length === 0) { toast.error('Motivo y al menos 1 producto requeridos'); return; }
    // MISIÓN CAJA v2.24.0 (§8-C): la venta original es OBLIGATORIA (el RPC
    // rechaza sin ella — devolución comercial, no vuelto de cobro).
    if (!originalSale?.id) { toast.error('Vincula la venta original de la devolución'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/api/devolutions', {
        method: 'POST',
        body: JSON.stringify({
          store_id: storeId,
          reason,
          items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
          // Venta original obligatoria + método y moneda real del reembolso
          original_transaction_id: originalSale.id,
          payment_method: refundMethod,
          refund_currency: refundCurrency,
          // REVISIÓN FINAL v2.24.1: idempotencia cooperativa (estable por apertura)
          idempotency_key: idempotencyKey,
          // MISIÓN FECHAS DE TRABAJO: convención canónica — hoy → undefined
          // (el servidor estampa NOW()); ≠ hoy → ISO mediodía. La ruta
          // revalida (checkNotFutureOperationDate) y el RPC aplica el gate.
          operation_date: resolvePosOperationDate(devolutionDate, todayBd),
        }),
      });
      toast.success('Devolución creada');
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black uppercase">Nueva Devolución</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Motivo</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Producto defectuoso"
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>

        {/* MISIÓN CAJA v2.24.0 (§8-C): venta original OBLIGATORIA (trazabilidad
            venta→devolución; el RPC la exige y topea lo ya devuelto DF-07) */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Venta original (obligatoria)</label>
          {originalSale ? (
            <div className="mt-1 flex items-center justify-between gap-2 p-2 rounded-lg border border-success/30 bg-success/5">
              <div className="min-w-0 text-xs">
                <p className="font-black truncate">{originalSale.invoice_number || originalSale.id.slice(0, 8)} · {formatCurrency(originalSale.total_amount)}</p>
                <p className="text-muted-foreground truncate">{originalSale.customer_name || 'Cliente eventual'} · {formatDate(originalSale.created_at)}</p>
              </div>
              <button type="button" onClick={() => { setOriginalSale(null); setSaleComposition(null); }} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0" aria-label="Quitar venta original">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="relative mt-1">
              <input value={saleQuery} onChange={e => searchSales(e.target.value)} placeholder="Nº de factura o ID de la venta…"
                className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm', touch)} />
              {saleResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 rounded-xl border border-border bg-card shadow-lg max-h-44 overflow-y-auto">
                  {saleResults.map(s => (
                    <button key={s.id} type="button" onClick={() => { setOriginalSale(s); setSaleResults([]); setSaleQuery(''); }}
                      className="w-full text-left p-2 hover:bg-muted text-xs border-b border-border/30 last:border-0">
                      <span className="font-black">{s.invoice_number || s.id.slice(0, 8)}</span>
                      <span className="ml-2">{formatCurrency(s.total_amount)}</span>
                      <span className="text-muted-foreground ml-2">{s.customer_name || 'Cliente eventual'} · {formatDate(s.created_at)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {originalSale && saleComposition && (
          <div data-testid="sale-payment-composition" className="p-2.5 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
            <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Composición del pago</p>
            <p className="font-mono">
              Pagado neto: {saleComposition.paidCup > 0 ? `${saleComposition.paidCup.toLocaleString('es-CU')} CUP` : ''}
              {saleComposition.paidCup > 0 && saleComposition.paidUsd > 0 ? ' + ' : ''}
              {saleComposition.paidUsd > 0 ? `${saleComposition.paidUsd.toLocaleString('es-CU')} USD` : ''}
              {saleComposition.paidCup === 0 && saleComposition.paidUsd === 0 ? 'indeterminable — el reembolso monetario queda bloqueado' : ''}
            </p>
            {(saleComposition.refundedCup > 0 || saleComposition.refundedUsd > 0) && (
              <p className="font-mono text-muted-foreground">
                Ya reembolsado (no recuperado): {[
                  saleComposition.refundedCup > 0 ? `${saleComposition.refundedCup.toLocaleString('es-CU')} CUP` : '',
                  saleComposition.refundedUsd > 0 ? `${saleComposition.refundedUsd.toLocaleString('es-CU')} USD` : '',
                ].filter(Boolean).join(' + ')}
                {' → reembolsable: '}
                {[
                  (saleComposition.paidCup - saleComposition.refundedCup) > 0 ? `${(saleComposition.paidCup - saleComposition.refundedCup).toLocaleString('es-CU')} CUP` : '',
                  (saleComposition.paidUsd - saleComposition.refundedUsd) > 0 ? `${(saleComposition.paidUsd - saleComposition.refundedUsd).toLocaleString('es-CU')} USD` : '',
                ].filter(Boolean).join(' + ') || '0'}
              </p>
            )}
            {saleComposition.paidCup > 0 && saleComposition.paidUsd > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Pago mixto: para devolver TODO lo restante use «Según lo pagado (CUP + USD)».
              </p>
            )}
          </div>
        )}

        {/* MISIÓN CAJA v2.24.0: método + moneda REAL del reembolso (§8-B/C) */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reembolso por</label>
            <select value={refundMethod} onChange={e => setRefundMethod(e.target.value as typeof refundMethod)}
              className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm font-bold', touch)}>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="zelle">Transf. Exterior</option>
              <option value="store_credit">Crédito de tienda</option>
            </select>
          </div>
          <div>
            <label htmlFor="devolution-refund-currency" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Moneda del reembolso</label>
            <select id="devolution-refund-currency" value={refundCurrency} onChange={e => setRefundCurrency(e.target.value as 'CUP' | 'USD' | 'AS_PAID')} disabled={refundMethod === 'store_credit'}
              className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm font-bold disabled:opacity-50', touch)}>
              <option value="CUP">CUP</option>
              <option value="USD">USD (tasa histórica de la venta)</option>
              {refundMethod === 'cash' && <option value="AS_PAID">Según lo pagado (CUP + USD)</option>}
            </select>
            {refundMethod === 'zelle' && <p className="text-[10px] text-muted-foreground mt-1">Zelle opera en USD.</p>}
            {refundMethod === 'store_credit' && <p className="text-[10px] text-muted-foreground mt-1">El crédito de tienda se emite en CUP canónico.</p>}
          </div>
        </div>

        {/* MISIÓN FECHAS DE TRABAJO: fecha operativa visible y seleccionable.
            Min per-store (forward-only inclusivo por día) · max HOY Habana. */}
        <OperationDatePicker
          value={devolutionDate}
          onChange={(d) => { setDateTouched(true); setDevolutionDate(d); }}
          label="Fecha de la devolución"
          storeId={storeId}
          max={todayBd}
          inputId="devolution-create-fecha"
        />

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Buscar producto</label>
          <div className="relative mt-1">
            <input value={productSearch} onChange={e => searchProducts(e.target.value)} placeholder="Nombre del producto..."
              className={cn('w-full px-3 rounded-xl border border-border bg-background text-sm', touch)} />
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-xl border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left p-2 hover:bg-muted text-sm border-b border-border/30 last:border-0">
                    <span className="font-bold">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">${p.price}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" min="0.0001" step="0.0001" inputMode="decimal" aria-label={`Cantidad a devolver de ${item.name}`} value={item.quantity} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) } : it))}
                      className="w-16 px-2 py-1 rounded border border-border text-xs tabular-nums" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <span className="text-xs font-mono">${item.unit_price}</span>
                    <span className="text-xs text-muted-foreground">=</span>
                    <span className="text-xs font-mono font-bold">{formatCurrency(item.quantity * item.unit_price)}</span>
                  </div>
                </div>
                <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><X className="w-3 h-3" /></button>
              </div>
            ))}
            <div className="flex justify-between p-2 rounded-lg bg-muted/30">
              <span className="text-sm font-black uppercase">Total</span>
              <span className="font-mono font-black">{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting || !reason.trim() || items.length === 0 || !originalSale}
          className={cn('w-full rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2', touch)}>
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando...</> : <><RotateCcw className="w-4 h-4" /> Crear Devolución</>}
        </button>
      </div>
    </div>
  );
}
