'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Download, DollarSign, TrendingUp, TrendingDown, Wallet, ChevronDown, ChevronRight, Eye, Trash2, Save, RotateCcw, Settings, Sparkles, FileText } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import type { CashReport } from '@/types';
import jsPDF from 'jspdf';

interface CashReportModalProps { open: boolean; onClose: () => void; }
interface StoreInfo { name: string; logo_url: string | null; address: string | null; phone: string | null; email: string | null; reeup: string | null; nit: string | null; }
interface SavedBreakdown { id: string; label: string; date: string; breakdown: Record<number, string>; deliveredBy: string; recipientName: string; total: number; }

const ALL_DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const USD_DENOMS = [100, 50, 20, 10, 5, 1];
const SK_DEL = 'costpro_cash_delivered_by';
const SK_REC = 'costpro_cash_recipient';
const SK_DENOMS = 'costpro_cash_denoms_cup';
const SK_HIST = 'costpro_cash_breakdown_history';

function safeParse<T>(raw: string | null, fallback: T): T { if (!raw) return fallback; try { return JSON.parse(raw) as T; } catch { return fallback; } }

type PdfTemplate = 'estandar' | 'simple';
const TEMPLATES: { id: PdfTemplate; label: string; desc: string }[] = [
  { id: 'estandar', label: 'Estándar', desc: 'Cuadre CUP+USD con desglose de billetes' },
  { id: 'simple', label: 'Simple', desc: 'Resumen básico sin desglose' },
];

export function CashReportModal({ open, onClose }: CashReportModalProps) {
  const { user } = useAuthStore();
  const [report, setReport] = useState<CashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [deliveredBy, setDeliveredBy] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem(SK_DEL) || '');
  const [recipientName, setRecipientName] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem(SK_REC) || '');
  useEffect(() => { if (deliveredBy) localStorage.setItem(SK_DEL, deliveredBy); }, [deliveredBy]);
  useEffect(() => { if (recipientName) localStorage.setItem(SK_REC, recipientName); }, [recipientName]);

  const [cupBreakdown, setCupBreakdown] = useState<Record<number, string>>({});
  const [usdBreakdown, setUsdBreakdown] = useState<Record<number, string>>({});
  const [cupDenoms, setCupDenoms] = useState<number[]>(() => typeof window === 'undefined' ? ALL_DENOMS : safeParse(localStorage.getItem(SK_DENOMS), ALL_DENOMS));
  const [showConfig, setShowConfig] = useState(false);
  const [savedHistory, setSavedHistory] = useState<SavedBreakdown[]>(() => typeof window === 'undefined' ? [] : safeParse(localStorage.getItem(SK_HIST), []));
  const [showHistory, setShowHistory] = useState(false);

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [itemDetails, setItemDetails] = useState<Record<string, any[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [showSuggested, setShowSuggested] = useState(false);

  // Filtros
  const [filterCurrency, setFilterCurrency] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('');

  // Plantilla PDF
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>('estandar');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !user?.activeStoreId) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const data = await apiFetch(`/api/stores?status=all`);
        const stores = data?.data || data || [];
        const store = Array.isArray(stores) ? stores.find((s: any) => s.id === user.activeStoreId) : null;
        if (store && !ctrl.signal.aborted) {
          setStoreInfo({ name: store.name || 'Tienda', logo_url: store.logo_url || null, address: store.address || null, phone: store.phone || null, email: store.email || null, reeup: store.reeup || null, nit: store.nit || null });
        }
      } catch {}
    })();
    return () => ctrl.abort();
  }, [open, user?.activeStoreId]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const s = new Date(startDate + 'T00:00:00').toISOString();
        const e = new Date(endDate + 'T23:59:59').toISOString();
        const data = await apiFetch(`/api/cash-report?start_date=${encodeURIComponent(s)}&end_date=${encodeURIComponent(e)}`);
        if (!ctrl.signal.aborted) setReport(data);
      } catch (e: any) { if (!ctrl.signal.aborted) toast.error(e.message || 'Error'); }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    })();
    return () => ctrl.abort();
  }, [open, startDate, endDate]);

  const cupTotal = Object.entries(cupBreakdown).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0);
  const usdTotal = Object.entries(usdBreakdown).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0);
  const expectedCup = report?.cash_balance_cup ?? report?.totals?.balance_cup ?? 0;
  const cupDifference = cupTotal - expectedCup;

  const handleSuggest = () => { const s: Record<number, string> = {}; let r = Math.max(0, expectedCup); for (const d of cupDenoms) { const c = Math.floor(r / d); if (c > 0) { s[d] = String(c); r -= c * d; } } setCupBreakdown(s); toast.success('Sugerido aplicado'); };
  const handleClear = () => { setCupBreakdown({}); setUsdBreakdown({}); };
  const handleSave = () => { const e: SavedBreakdown = { id: Date.now().toString(), label: `${new Date().toLocaleDateString('es-CU')} ${deliveredBy || ''}`, date: new Date().toISOString(), breakdown: cupBreakdown, deliveredBy, recipientName, total: cupTotal }; const u = [e, ...savedHistory].slice(0, 10); setSavedHistory(u); localStorage.setItem(SK_HIST, JSON.stringify(u)); toast.success(`Guardado (${u.length}/10)`); };
  const handleRestore = (e: SavedBreakdown) => { setCupBreakdown(e.breakdown); setDeliveredBy(e.deliveredBy); setRecipientName(e.recipientName); setShowHistory(false); toast.success('Restaurado'); };
  const toggleDenom = (d: number) => { const u = cupDenoms.includes(d) ? cupDenoms.filter(x => x !== d) : [...cupDenoms, d].sort((a, b) => b - a); setCupDenoms(u); localStorage.setItem(SK_DENOMS, JSON.stringify(u)); };

  const toggleAccordion = async (key: string, type: 'sale' | 'payment', method: string, currency: string, refType?: string) => {
    const n = new Set(expandedItems);
    if (n.has(key)) { n.delete(key); setExpandedItems(n); return; }
    n.add(key); setExpandedItems(n);
    if (!itemDetails[key]) {
      const nl = new Set(loadingDetails); nl.add(key); setLoadingDetails(nl);
      try {
        const s = new Date(startDate + 'T00:00:00').toISOString();
        const e = new Date(endDate + 'T23:59:59').toISOString();
        let url = `/api/cash-report/details?type=${type}&method=${method}&currency=${currency}&start_date=${s}&end_date=${e}`;
        if (refType) url += `&ref_type=${refType}`;
        const data = await apiFetch(url);
        setItemDetails(prev => ({ ...prev, [key]: Array.isArray(data) ? data : (data?.data || []) }));
      } catch { setItemDetails(prev => ({ ...prev, [key]: [] })); toast.error('Error al cargar documentos'); }
      finally { const nl2 = new Set(loadingDetails); nl2.delete(key); setLoadingDetails(nl2); }
    }
  };

  // ===== PDF PLANTILLA ESTÁNDAR =====
  const handleExportPDF = async () => {
    if (!report) return;
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 14; let y = 20;
    const sn = storeInfo?.name || 'Tienda';
    const es = (need: number) => { if (y + need > ph - m) { doc.addPage(); y = m; } };

    // Logo
    if (storeInfo?.logo_url) { try { const r = await fetch(storeInfo.logo_url); const b = await r.blob(); const du = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b); }); doc.addImage(du, 'PNG', m, y - 5, 25, 25); } catch {} }

    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(sn, m + (storeInfo?.logo_url ? 30 : 0), y); y += 5;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    if (storeInfo?.address) { es(4); doc.text(storeInfo.address, m + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.phone) { es(4); doc.text(`Tel: ${storeInfo.phone}`, m + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.reeup) { es(4); doc.text(`REEUP: ${storeInfo.reeup}`, m + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.nit) { es(4); doc.text(`NIT: ${storeInfo.nit}`, m + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    y += 3; es(8); doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(m, y, pw - m, y); y += 8;

    es(15);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Reporte de Caja — Entrega de Dinero', m, y); y += 6;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(`Periodo: ${startDate} a ${endDate}`, m, y); y += 4;
    if (deliveredBy) { es(4); doc.text(`Entrega: ${deliveredBy}`, m, y); y += 4; }
    if (recipientName) { es(4); doc.text(`Recibe: ${recipientName}`, m, y); y += 4; }
    doc.text(`Generado: ${new Date().toLocaleString('es-CU')}`, m, y); y += 8;

    if (pdfTemplate === 'simple') {
      // Simple: solo resumen
      es(20);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Resumen', m, y); y += 5;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Ingresos:  ${formatCurrency(report?.totals?.sales_total_cup ?? 0)}`, m, y); y += 4;
      doc.text(`Egresos:    ${formatCurrency(report?.totals?.payments_total_cup ?? 0)}`, m, y); y += 4;
      doc.text(`Balance:    ${formatCurrency(expectedCup)}`, m, y); y += 8;
    } else {
      // ===== PLANTILLA ESTÁNDAR: Cuadre CUP =====
      const sales = report.sales || [];
      const payments = report.payments || [];
      const commissions = report.commissions || [];

      const cupCashSales = sales.filter((s: any) => s.payment_method === 'cash' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
      const cupTransferSales = sales.filter((s: any) => s.payment_method === 'transfer' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
      const cupZelleSales = sales.filter((s: any) => s.payment_method === 'zelle' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
      const cupCashPayments = payments.filter((p: any) => p.payment_method === 'cash' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
      const cupCashCommissions = commissions.filter((c: any) => c.payment_method === 'cash' && c.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);

      es(10);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text('CUADRE CUP', m, y); y += 6;

      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Ventas Efectivo CUP:        ${formatCurrency(cupCashSales)}`, m, y); y += 4;
      doc.text(`Ventas Transferencia CUP:   ${formatCurrency(cupTransferSales)}`, m, y); y += 4;
      if (cupZelleSales > 0) { doc.text(`Ventas Zelle CUP:            ${formatCurrency(cupZelleSales)}`, m, y); y += 4; }
      doc.text(`Total Ventas CUP:           ${formatCurrency(cupCashSales + cupTransferSales + cupZelleSales)}`, m, y); y += 5;
      doc.text(`(−) Transferencias:          ${formatCurrency(cupTransferSales)}`, m, y); y += 4;
      doc.text(`(−) Pagos en Efectivo:       ${formatCurrency(cupCashPayments)}`, m, y); y += 4;
      doc.text(`(−) Comisiones en Efectivo:  ${formatCurrency(cupCashCommissions)}`, m, y); y += 5;
      doc.setFont('helvetica', 'bold');
      const dineroEntregar = cupCashSales - cupCashPayments - cupCashCommissions;
      doc.text(`Dinero a Entregar CUP:      ${formatCurrency(dineroEntregar)}`, m, y); y += 8;

      // Desglose CUP
      es(10);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Desglose de Billetes CUP', m, y); y += 5;
      const cupEntries = Object.entries(cupBreakdown).filter(([, c]) => Number(c) > 0);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      if (cupEntries.length > 0) {
        cupEntries.forEach(([d, c]) => { es(4); doc.text(`  $${d} × ${c} = ${formatCurrency(Number(d) * Number(c))}`, m, y); y += 4; });
        y += 2; doc.setFont('helvetica', 'bold');
        es(6); doc.text(`Total contado: ${formatCurrency(cupTotal)}`, m, y); y += 4;
        es(4); const dl = cupDifference === 0 ? '(cuadrado)' : cupDifference > 0 ? '(sobrante)' : '(faltante)';
        doc.text(`Diferencia: ${formatCurrency(Math.abs(cupDifference))} ${dl}`, m, y);
      } else {
        doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
        doc.text('  (Sin desglose ingresado)', m, y);
      }
      y += 10;

      // ===== CUADRE USD =====
      const usdCashSales = sales.filter((s: any) => s.payment_method === 'cash' && s.currency === 'USD').reduce((s: number, x: any) => s + Number(x.total), 0);
      const usdTransferSales = sales.filter((s: any) => s.payment_method === 'transfer' && s.currency === 'USD').reduce((s: number, x: any) => s + Number(x.total), 0);
      const usdCashPayments = payments.filter((p: any) => p.payment_method === 'cash' && p.currency === 'USD').reduce((s: number, x: any) => s + Number(x.total), 0);

      if (usdCashSales > 0 || usdTransferSales > 0 || usdTotal > 0) {
        es(10);
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
        doc.text('CUADRE USD', m, y); y += 6;
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(`Ventas Efectivo USD:        $${usdCashSales.toFixed(2)}`, m, y); y += 4;
        doc.text(`Ventas Transferencia USD:   $${usdTransferSales.toFixed(2)}`, m, y); y += 4;
        doc.text(`(−) Pagos en Efectivo USD:   $${usdCashPayments.toFixed(2)}`, m, y); y += 5;
        doc.setFont('helvetica', 'bold');
        const usdEntregar = usdCashSales - usdCashPayments;
        doc.text(`Dinero a Entregar USD:      $${usdEntregar.toFixed(2)}`, m, y); y += 8;

        // Desglose USD
        es(10);
        doc.setFontSize(9); doc.text('Desglose de Billetes USD', m, y); y += 5;
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        const usdEntries = Object.entries(usdBreakdown).filter(([, c]) => Number(c) > 0);
        if (usdEntries.length > 0) {
          usdEntries.forEach(([d, c]) => { es(4); doc.text(`  $${d} × ${c} = $${(Number(d) * Number(c)).toFixed(2)}`, m, y); y += 4; });
          y += 2; doc.setFont('helvetica', 'bold');
          es(4); doc.text(`Total contado USD: $${usdTotal.toFixed(2)}`, m, y);
        } else {
          doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
          doc.text('  (Sin desglose ingresado)', m, y);
        }
        y += 10;
      }
    }

    // Firmas
    es(20);
    doc.setDrawColor(120); doc.setLineWidth(0.3);
    const sigY = Math.max(y + 10, ph - 30);
    doc.line(m, sigY, m + 70, sigY);
    doc.line(pw - m - 70, sigY, pw - m, sigY);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(deliveredBy || 'Entrega', m, sigY + 4);
    doc.text(recipientName || 'Recibe', pw - m - 70, sigY + 4);

    doc.save(`reporte_caja_${sn.replace(/\s+/g, '_')}_${startDate}.pdf`);
    setShowTemplateSelector(false);
  };

  if (!open) return null;

  const methodIcon = (m: string) => m === 'cash' ? '💵' : m === 'transfer' ? '📱' : '💳';
  const methodLabel = (m: string) => m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle';
  const fmt = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;
  const touch = 'min-h-[44px]';
  const btnIcn = `p-2 rounded-lg border border-border/40 hover:bg-muted ${touch} flex items-center justify-center`;

  // FIX: pasar payment_method real al accordion (no label traducido)
  const renderAccordionItem = (key: string, pm: string, currency: string, sublabel: string, amount: number, isNeg: boolean = false, refType?: string) => (
    <div key={key} className="rounded-lg border border-border/30 overflow-hidden">
      <button onClick={() => toggleAccordion(key, isNeg ? 'payment' : 'sale', pm, currency, refType)}
        aria-expanded={expandedItems.has(key)} aria-controls={`p-${key}`}
        className={`w-full flex items-center justify-between p-3 bg-muted/10 hover:bg-muted/20 transition-colors ${touch}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{methodIcon(pm)}</span>
          <div className="text-left">
            <p className="text-xs font-bold">{methodLabel(pm)} ({currency}){refType ? ` · ${refType}` : ''}</p>
            <p className="text-[10px] text-muted-foreground">{sublabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className={`text-sm font-mono font-black tabular-nums ${isNeg ? 'text-destructive' : ''}`}>{isNeg ? '−' : ''}{fmt(amount, currency)}</p>
          {expandedItems.has(key) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expandedItems.has(key) && (
        <div id={`p-${key}`} role="region" className="border-t border-border/20 p-2 bg-background">
          {loadingDetails.has(key) ? <p className="text-xs text-muted-foreground text-center py-2">Cargando documentos...</p>
          : (itemDetails[key]?.length ?? 0) === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin documentos</p>
          : <div className="space-y-1 max-h-48 overflow-y-auto">
              {itemDetails[key]?.map((doc: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[11px] py-1.5 px-2 rounded hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground cursor-pointer hover:text-primary" />
                    <span className="font-mono">{doc.date || doc.created_at?.slice(0,10) || doc.payment_date?.slice(0,10) || '—'}</span>
                    <span className="text-muted-foreground truncate max-w-[120px]">{doc.reference || doc.reference_doc || doc.supplier || ''}</span>
                  </div>
                  <span className="font-mono tabular-nums">{fmt(Number(doc.amount || doc.total || doc.total_amount || 0), currency)}</span>
                </div>
              ))}
            </div>}
        </div>
      )}
    </div>
  );

  // Filtrar items por moneda/método
  const filterSales = (s: any) => (!filterCurrency || s.currency === filterCurrency) && (!filterMethod || s.payment_method === filterMethod);
  const filterPayments = (p: any) => (!filterCurrency || p.currency === filterCurrency) && (!filterMethod || p.payment_method === filterMethod);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="cash-title" tabIndex={-1}
        className="w-full max-w-2xl max-h-[95vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl focus:outline-none"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 id="cash-title" className="text-sm font-black uppercase tracking-widest">Reporte de Caja — Entrega</h2>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className={`p-2 rounded-lg hover:bg-muted ${touch} flex items-center justify-center`}><span className="text-lg">✕</span></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label htmlFor="sd" className="text-[10px] font-black uppercase text-muted-foreground">Desde:</label>
              <input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touch}`} />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="ed" className="text-[10px] font-black uppercase text-muted-foreground">Hasta:</label>
              <input id="ed" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touch}`} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Cargando reporte...</p>
          </div>
        ) : !report ? (
          <div className="p-8 text-center text-muted-foreground">Sin datos</div>
        ) : (
          <div className="p-3 sm:p-4 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-center">
                <TrendingUp className="w-4 h-4 mx-auto text-success mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Ingresos</p>
                <p className="text-base sm:text-lg font-mono font-black tabular-nums text-success">{formatCurrency(report?.totals?.sales_total_cup ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center">
                <TrendingDown className="w-4 h-4 mx-auto text-destructive mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Egresos</p>
                <p className="text-base sm:text-lg font-mono font-black tabular-nums text-destructive">{formatCurrency(report?.totals?.payments_total_cup ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
                <DollarSign className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Balance</p>
                <p className="text-base sm:text-lg font-mono font-black tabular-nums text-primary">{formatCurrency(expectedCup)}</p>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)} className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touch}`}>
                <option value="">Todas las monedas</option>
                <option value="CUP">CUP</option>
                <option value="USD">USD</option>
                <option value="MLC">MLC</option>
              </select>
              <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touch}`}>
                <option value="">Todos los métodos</option>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="zelle">Zelle</option>
              </select>
            </div>

            {/* Ventas */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Ventas por Método</h3>
              <div className="space-y-1">
                {(report.sales || []).filter(filterSales).length === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin ventas</p> :
                  (report.sales || []).filter(filterSales).map((s, i) => renderAccordionItem(`s-${s.payment_method}-${s.currency}-${i}`, s.payment_method, s.currency, `${s.transaction_count} transacciones`, s.total))
                }
              </div>
            </div>

            {/* Pagos */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Pagos a Proveedores</h3>
              <div className="space-y-1">
                {(report.payments || []).filter(filterPayments).length === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin pagos</p> :
                  (report.payments || []).filter(filterPayments).map((p, i) => renderAccordionItem(`p-${p.payment_method}-${p.currency}-${p.ref_type}-${i}`, p.payment_method, p.currency, `${p.payment_count} pagos`, p.total, true, p.ref_type))
                }
              </div>
            </div>

            {/* Comisiones */}
            {report.commissions && report.commissions.length > 0 && (
              <div>
                <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Comisiones a Trabajadores</h3>
                <div className="space-y-1">
                  {report.commissions.filter(filterSales).map((c, i) => renderAccordionItem(`c-${c.payment_method}-${c.currency}-${i}`, c.payment_method, c.currency, `${c.commission_count} comisiones`, c.total, true))}
                </div>
              </div>
            )}

            {/* Desglose Sugerido colapsable */}
            {(report?.cash_breakdown?.length ?? 0) > 0 && (
              <div>
                <button onClick={() => setShowSuggested(!showSuggested)} aria-expanded={showSuggested} className="w-full flex items-center gap-2 text-[11px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors py-2">
                  {showSuggested ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Desglose Sugerido (CUP)
                </button>
                {showSuggested && (
                  <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
                    {(report?.cash_breakdown ?? []).map((d: any) => (
                      <div key={d.denom} className="flex items-center justify-between text-sm">
                        <span className="font-bold">${d.denom} × {d.count}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">{formatCurrency(d.total)}</span>
                      </div>
                    ))}
                    <div className="border-t border-primary/20 pt-2 flex items-center justify-between">
                      <span className="text-xs font-black uppercase">Total sugerido:</span>
                      <span className="font-mono font-black text-primary">{formatCurrency(expectedCup)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Desglose CUP */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-[11px] font-black uppercase text-muted-foreground">Desglose para Entrega — CUP</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={handleSuggest} aria-label="Sugerir" className={btnIcn}><Sparkles className="w-4 h-4 text-primary" /></button>
                  <button onClick={handleClear} aria-label="Limpiar" className={btnIcn}><Trash2 className="w-4 h-4 text-destructive" /></button>
                  <button onClick={() => setShowConfig(!showConfig)} aria-label="Configurar" aria-expanded={showConfig} className={btnIcn}><Settings className="w-4 h-4" /></button>
                  <button onClick={handleSave} aria-label="Guardar" className={btnIcn}><Save className="w-4 h-4 text-primary" /></button>
                  <button onClick={() => setShowHistory(!showHistory)} aria-label="Restaurar" aria-expanded={showHistory} className={btnIcn}><RotateCcw className="w-4 h-4" /></button>
                </div>
              </div>
              {showConfig && (
                <div className="mb-2 p-3 rounded-xl border border-border/30 bg-muted/10">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Denominaciones:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_DENOMS.map(d => (
                      <button key={d} onClick={() => toggleDenom(d)} aria-label={`$${d}`} aria-pressed={cupDenoms.includes(d)} className={`px-3 py-2 rounded-lg text-[10px] font-bold border min-h-[36px] ${cupDenoms.includes(d) ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>${d}</button>
                    ))}
                  </div>
                </div>
              )}
              {showHistory && (
                <div className="mb-2 p-3 rounded-xl border border-border/30 bg-muted/10 max-h-40 overflow-y-auto">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Historial ({savedHistory.length}/10):</p>
                  {savedHistory.length === 0 ? <p className="text-xs text-muted-foreground">Sin guardados</p> :
                    savedHistory.map(h => (
                      <button key={h.id} onClick={() => handleRestore(h)} className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/30 text-left min-h-[36px]">
                        <span className="text-[10px]">{h.label}</span><span className="text-[10px] font-mono">{formatCurrency(h.total)}</span>
                      </button>
                    ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label htmlFor="db" className="text-[9px] font-black uppercase text-muted-foreground">Entrega</label>
                  <input id="db" type="text" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)} className={`w-full px-3 py-2 rounded border border-border/40 bg-background text-xs ${touch}`} placeholder="Quien entrega" />
                </div>
                <div>
                  <label htmlFor="rn" className="text-[9px] font-black uppercase text-muted-foreground">Recibe</label>
                  <input id="rn" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={`w-full px-3 py-2 rounded border border-border/40 bg-background text-xs ${touch}`} placeholder="Quien recibe" />
                </div>
              </div>
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {cupDenoms.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-10">${denom}</span><span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={cupBreakdown[denom] || ''} aria-label={`$${denom} CUP`} onChange={(e) => setCupBreakdown(p => ({ ...p, [denom]: e.target.value }))} className={`w-full px-2 py-2 rounded border border-border/40 bg-background text-xs font-mono ${touch}`} placeholder="0" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 pt-2 space-y-1">
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Total CUP:</span><span className="font-mono font-black">{formatCurrency(cupTotal)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Esperado:</span><span className="font-mono font-black text-primary">{formatCurrency(expectedCup)}</span></div>
                  <div className={cn("flex items-center justify-between rounded-lg px-2 py-1.5", cupDifference === 0 ? "bg-success/10" : "bg-destructive/10")}>
                    <span className="text-xs font-black uppercase">{cupDifference === 0 ? 'Cuadrado' : cupDifference > 0 ? 'Sobrante' : 'Faltante'}:</span>
                    <span className={cn("font-mono font-black", cupDifference === 0 ? "text-success" : "text-destructive")}>{formatCurrency(Math.abs(cupDifference))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desglose USD */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Desglose para Entrega — USD</h3>
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {USD_DENOMS.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-10">${denom}</span><span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={usdBreakdown[denom] || ''} aria-label={`$${denom} USD`} onChange={(e) => setUsdBreakdown(p => ({ ...p, [denom]: e.target.value }))} className={`w-full px-2 py-2 rounded border border-border/40 bg-background text-xs font-mono ${touch}`} placeholder="0" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 pt-2"><div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Total USD:</span><span className="font-mono font-black">${usdTotal.toFixed(2)}</span></div></div>
              </div>
            </div>

            {/* Selector de plantilla + Exportar */}
            {showTemplateSelector && (
              <div className="p-3 rounded-xl border border-border/30 bg-muted/10 space-y-2">
                <p className="text-[10px] font-black uppercase text-muted-foreground">Plantilla PDF:</p>
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setPdfTemplate(t.id)} className={cn("w-full flex items-center gap-2 p-2 rounded-lg border text-left", pdfTemplate === t.id ? "border-primary bg-primary/10" : "border-border/40")}>
                    <FileText className="w-4 h-4" />
                    <div><p className="text-xs font-bold">{t.label}</p><p className="text-[10px] text-muted-foreground">{t.desc}</p></div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowTemplateSelector(!showTemplateSelector)} className={`px-3 rounded-xl border border-border/40 text-xs font-black uppercase hover:bg-muted flex items-center gap-1.5 ${touch}`}>
                <FileText className="w-4 h-4" /> {TEMPLATES.find(t => t.id === pdfTemplate)?.label}
              </button>
              <button onClick={handleExportPDF} className={`flex-1 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2 ${touch}`}>
                <Download className="w-4 h-4" /> Exportar PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
