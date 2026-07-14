'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, DollarSign, TrendingUp, TrendingDown, Wallet, ChevronDown, ChevronRight, Eye, Trash2, Save, RotateCcw, Settings, Sparkles } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import type { CashReport } from '@/types';
import jsPDF from 'jspdf';

interface CashReportModalProps {
  open: boolean;
  onClose: () => void;
}

interface StoreInfo {
  name: string; logo_url: string | null; address: string | null;
  phone: string | null; email: string | null; reeup: string | null; nit: string | null;
}

interface SavedBreakdown {
  id: string; label: string; date: string;
  breakdown: Record<number, string>; deliveredBy: string; recipientName: string; total: number;
}

const ALL_DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const USD_DENOMS = [100, 50, 20, 10, 5, 1];
const STORAGE_KEY_DEL = 'costpro_cash_delivered_by';
const STORAGE_KEY_REC = 'costpro_cash_recipient';
const STORAGE_KEY_DENOMS = 'costpro_cash_denoms_cup';
const STORAGE_KEY_HISTORY = 'costpro_cash_breakdown_history';

// FIX-F1: safeParse para localStorage
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function CashReportModal({ open, onClose }: CashReportModalProps) {
  const { user } = useAuthStore();
  const [report, setReport] = useState<CashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // FIX: persistir en localStorage con safeParse
  const [deliveredBy, setDeliveredBy] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem(STORAGE_KEY_DEL) || '');
  const [recipientName, setRecipientName] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem(STORAGE_KEY_REC) || '');

  useEffect(() => { if (deliveredBy) localStorage.setItem(STORAGE_KEY_DEL, deliveredBy); }, [deliveredBy]);
  useEffect(() => { if (recipientName) localStorage.setItem(STORAGE_KEY_REC, recipientName); }, [recipientName]);

  const [cupBreakdown, setCupBreakdown] = useState<Record<number, string>>({});
  const [usdBreakdown, setUsdBreakdown] = useState<Record<number, string>>({});

  // FIX-F1: safeParse en denominaciones e historial
  const [cupDenoms, setCupDenoms] = useState<number[]>(() => typeof window === 'undefined' ? ALL_DENOMS : safeParse(localStorage.getItem(STORAGE_KEY_DENOMS), ALL_DENOMS));
  const [showConfig, setShowConfig] = useState(false);

  const [savedHistory, setSavedHistory] = useState<SavedBreakdown[]>(() => typeof window === 'undefined' ? [] : safeParse(localStorage.getItem(STORAGE_KEY_HISTORY), []));
  const [showHistory, setShowHistory] = useState(false);

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [itemDetails, setItemDetails] = useState<Record<string, any[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [showSuggested, setShowSuggested] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // FIX-E3: focus trap + Escape
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // FIX-D2: AbortController en fetchStore
  useEffect(() => {
    if (!open || !user?.activeStoreId) return;
    const ctrl = new AbortController();
    const fetchStore = async () => {
      try {
        const data = await apiFetch(`/api/stores?status=all`);
        const stores = data?.data || data || [];
        const store = Array.isArray(stores) ? stores.find((s: any) => s.id === user.activeStoreId) : null;
        if (store && !ctrl.signal.aborted) {
          setStoreInfo({
            name: store.name || 'Tienda', logo_url: store.logo_url || null,
            address: store.address || null, phone: store.phone || null,
            email: store.email || null, reeup: store.reeup || null, nit: store.nit || null,
          });
        }
      } catch {}
    };
    fetchStore();
    return () => ctrl.abort();
  }, [open, user?.activeStoreId]);

  // FIX-D2: AbortController en fetchReport
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const fetchReport = async () => {
      setLoading(true);
      try {
        const startISO = new Date(startDate + 'T00:00:00').toISOString();
        const endISO = new Date(endDate + 'T23:59:59').toISOString();
        const data = await apiFetch(`/api/cash-report?start_date=${encodeURIComponent(startISO)}&end_date=${encodeURIComponent(endISO)}`);
        if (!ctrl.signal.aborted) setReport(data);
      } catch (e: any) { if (!ctrl.signal.aborted) toast.error(e.message || 'Error al generar reporte'); }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    };
    fetchReport();
    return () => ctrl.abort();
  }, [open, startDate, endDate]);

  const cupTotal = Object.entries(cupBreakdown).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0);
  const usdTotal = Object.entries(usdBreakdown).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0);
  const expectedCup = report?.cash_balance_cup ?? report?.totals?.balance_cup ?? 0;
  const cupDifference = cupTotal - expectedCup;

  const handleSuggest = () => {
    const suggested: Record<number, string> = {};
    let remaining = Math.max(0, expectedCup);
    for (const denom of cupDenoms) {
      const count = Math.floor(remaining / denom);
      if (count > 0) { suggested[denom] = String(count); remaining -= count * denom; }
    }
    setCupBreakdown(suggested);
    toast.success('Desglose sugerido aplicado');
  };

  const handleClear = () => { setCupBreakdown({}); setUsdBreakdown({}); };

  const handleSave = () => {
    const entry: SavedBreakdown = {
      id: Date.now().toString(), label: `${new Date().toLocaleDateString('es-CU')} ${deliveredBy || 'Sin nombre'}`,
      date: new Date().toISOString(), breakdown: cupBreakdown, deliveredBy, recipientName, total: cupTotal,
    };
    const updated = [entry, ...savedHistory].slice(0, 10);
    setSavedHistory(updated);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
    toast.success(`Desglose guardado (${updated.length}/10)`);
  };

  const handleRestore = (entry: SavedBreakdown) => {
    setCupBreakdown(entry.breakdown); setDeliveredBy(entry.deliveredBy);
    setRecipientName(entry.recipientName); setShowHistory(false);
    toast.success('Desglose restaurado');
  };

  const toggleDenom = (denom: number) => {
    const updated = cupDenoms.includes(denom) ? cupDenoms.filter(d => d !== denom) : [...cupDenoms, denom].sort((a, b) => b - a);
    setCupDenoms(updated); localStorage.setItem(STORAGE_KEY_DENOMS, JSON.stringify(updated));
  };

  const toggleAccordion = async (key: string, type: 'sale' | 'payment', method: string, currency: string, refType?: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) { newExpanded.delete(key); setExpandedItems(newExpanded); return; }
    newExpanded.add(key); setExpandedItems(newExpanded);
    if (!itemDetails[key]) {
      const nl = new Set(loadingDetails); nl.add(key); setLoadingDetails(nl);
      try {
        const startISO = new Date(startDate + 'T00:00:00').toISOString();
        const endISO = new Date(endDate + 'T23:59:59').toISOString();
        let url = `/api/cash-report/details?type=${type}&method=${method}&currency=${currency}&start_date=${startISO}&end_date=${endISO}`;
        if (refType) url += `&ref_type=${refType}`;
        const data = await apiFetch(url);
        setItemDetails(prev => ({ ...prev, [key]: Array.isArray(data) ? data : (data?.data || []) }));
      } catch { setItemDetails(prev => ({ ...prev, [key]: [] })); toast.error('Error al cargar documentos'); }
      finally { const nl2 = new Set(loadingDetails); nl2.delete(key); setLoadingDetails(nl2); }
    }
  };

  // FIX-C2: logo via fetch→dataURL + FIX-C3: paginación
  const handleExportPDF = async () => {
    if (!report) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = 20;
    const storeName = storeInfo?.name || 'Tienda';

    // FIX-C3: helper paginación
    const ensureSpace = (needed: number) => { if (y + needed > pageHeight - margin) { doc.addPage(); y = margin; } };

    // FIX-C2: logo via fetch→blob→dataURL
    if (storeInfo?.logo_url) {
      try {
        const res = await fetch(storeInfo.logo_url);
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader(); fr.onload = () => resolve(fr.result as string);
          fr.onerror = reject; fr.readAsDataURL(blob);
        });
        doc.addImage(dataUrl, 'PNG', margin, y - 5, 25, 25);
      } catch (e) { console.warn('[pdf] logo no cargado:', e); }
    }

    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(storeName, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 5;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    if (storeInfo?.address) { ensureSpace(4); doc.text(storeInfo.address, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.phone) { ensureSpace(4); doc.text(`Tel: ${storeInfo.phone}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.reeup) { ensureSpace(4); doc.text(`REEUP: ${storeInfo.reeup}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.nit) { ensureSpace(4); doc.text(`NIT: ${storeInfo.nit}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    y += 3; ensureSpace(8); doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(margin, y, pageWidth - margin, y); y += 8;

    ensureSpace(20);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text('Reporte de Caja — Entrega de Dinero', margin, y); y += 6;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(`Periodo: ${startDate} a ${endDate}`, margin, y); y += 4;
    if (deliveredBy) { ensureSpace(4); doc.text(`Entrega: ${deliveredBy}`, margin, y); y += 4; }
    if (recipientName) { ensureSpace(4); doc.text(`Recibe: ${recipientName}`, margin, y); y += 4; }
    doc.text(`Generado: ${new Date().toLocaleString('es-CU')}`, margin, y); y += 8;

    ensureSpace(20);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Resumen', margin, y); y += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Ingresos (Ventas):  ${formatCurrency(report?.totals?.sales_total_cup ?? 0)}`, margin, y); y += 4;
    doc.text(`Egresos (Pagos):    ${formatCurrency(report?.totals?.payments_total_cup ?? 0)}`, margin, y); y += 4;
    doc.text(`Comisiones:         ${formatCurrency(report?.totals?.commissions_total_cup ?? 0)}`, margin, y); y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(`Balance CUP:        ${formatCurrency(expectedCup)}`, margin, y); y += 8;

    // Ventas
    ensureSpace(10);
    doc.setFontSize(9); doc.text('Ventas por Metodo', margin, y); y += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    (report.sales || []).forEach((s: any) => {
      ensureSpace(5);
      const label = s.payment_method === 'cash' ? 'Efectivo' : s.payment_method === 'transfer' ? 'Transferencia' : 'Zelle';
      doc.text(`  ${label} (${s.currency}): ${s.transaction_count} trans. - ${formatCurrency(s.total)}`, margin, y); y += 4;
    });
    y += 4;

    // Pagos
    if ((report.payments || []).length > 0) {
      ensureSpace(10);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('Pagos a Proveedores', margin, y); y += 5;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      (report.payments || []).forEach((p: any) => {
        ensureSpace(5);
        const label = p.payment_method === 'cash' ? 'Efectivo' : p.payment_method === 'transfer' ? 'Transferencia' : 'Zelle';
        doc.text(`  ${label} (${p.currency}) ${p.ref_type}: ${p.payment_count} pagos - ${formatCurrency(p.total)}`, margin, y); y += 4;
      });
      y += 4;
    }

    // Desglose CUP (obligatorio)
    ensureSpace(15);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('Desglose para Entrega (Efectivo CUP)', margin, y); y += 5;
    const cupEntries = Object.entries(cupBreakdown).filter(([, c]) => Number(c) > 0);
    if (cupEntries.length > 0) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      cupEntries.forEach(([denom, count]) => { ensureSpace(5); doc.text(`  $${denom} x ${count} = ${formatCurrency(Number(denom) * Number(count))}`, margin, y); y += 4; });
      y += 2; doc.setFont('helvetica', 'bold');
      ensureSpace(8);
      doc.text(`Total CUP: ${formatCurrency(cupTotal)}`, margin, y); y += 4;
      const diffLabel = cupDifference === 0 ? '(cuadrado)' : cupDifference > 0 ? '(sobrante)' : '(faltante)';
      doc.text(`Diferencia: ${formatCurrency(Math.abs(cupDifference))} ${diffLabel}`, margin, y);
    } else {
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
      doc.text('  (Sin desglose CUP ingresado)', margin, y);
    }
    y += 8;

    // Desglose USD
    if (Object.values(usdBreakdown).some(c => Number(c) > 0)) {
      ensureSpace(15);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text('Desglose para Entrega (Efectivo USD)', margin, y); y += 5;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      Object.entries(usdBreakdown).filter(([, c]) => Number(c) > 0).forEach(([denom, count]) => {
        ensureSpace(5); doc.text(`  $${denom} x ${count} = $${(Number(denom) * Number(count)).toFixed(2)}`, margin, y); y += 4;
      });
      y += 2; doc.setFont('helvetica', 'bold');
      doc.text(`Total USD: $${usdTotal.toFixed(2)}`, margin, y); y += 8;
    }

    // Firmas
    ensureSpace(20);
    doc.setDrawColor(120); doc.setLineWidth(0.3);
    const sigY = Math.max(y + 10, pageHeight - 30);
    doc.line(margin, sigY, margin + 70, sigY);
    doc.line(pageWidth - margin - 70, sigY, pageWidth - margin, sigY);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(deliveredBy || 'Entrega', margin, sigY + 4);
    doc.text(recipientName || 'Recibe', pageWidth - margin - 70, sigY + 4);

    doc.save(`reporte_caja_${storeName.replace(/\s+/g, '_')}_${startDate}.pdf`);
  };

  if (!open) return null;

  const methodIcon = (m: string) => m === 'cash' ? '💵' : m === 'transfer' ? '📱' : '💳';
  const methodLabel = (m: string) => m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle';
  const fmt = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;

  // FIX-A1: touch target class
  const touchTarget = 'min-h-[44px]';
  const btnIcon = 'p-2 rounded-lg border border-border/40 hover:bg-muted ' + touchTarget + ' flex items-center justify-center';

  const renderAccordionItem = (key: string, icon: string, label: string, sublabel: string, amount: number, currency: string, isNegative: boolean = false, refType?: string) => (
    <div key={key} className="rounded-lg border border-border/30 overflow-hidden">
      <button
        onClick={() => toggleAccordion(key, isNegative ? 'payment' : 'sale', label.split(' ')[0].toLowerCase(), currency, refType)}
        aria-expanded={expandedItems.has(key)}
        aria-controls={`panel-${key}`}
        className={`w-full flex items-center justify-between p-3 bg-muted/10 hover:bg-muted/20 transition-colors ${touchTarget}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div className="text-left">
            <p className="text-xs font-bold">{label} ({currency}){refType ? ` · ${refType}` : ''}</p>
            <p className="text-[10px] text-muted-foreground">{sublabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className={`text-sm font-mono font-black tabular-nums ${isNegative ? 'text-destructive' : ''}`}>
            {isNegative ? '−' : ''}{fmt(amount, currency)}
          </p>
          {expandedItems.has(key) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expandedItems.has(key) && (
        <div id={`panel-${key}`} role="region" className="border-t border-border/20 p-2 bg-background">
          {loadingDetails.has(key) ? (
            <p className="text-xs text-muted-foreground text-center py-2">Cargando documentos...</p>
          ) : (itemDetails[key]?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Sin documentos detallados</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
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
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-report-title"
        tabIndex={-1}
        className="w-full max-w-2xl max-h-[95vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl focus:outline-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 id="cash-report-title" className="text-sm font-black uppercase tracking-widest">Reporte de Caja — Entrega</h2>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className={`p-2 rounded-lg hover:bg-muted ${touchTarget} flex items-center justify-center`}>
              <span className="text-lg">✕</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label htmlFor="start-date" className="text-[10px] font-black uppercase text-muted-foreground">Desde:</label>
              <input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touchTarget}`} />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="end-date" className="text-[10px] font-black uppercase text-muted-foreground">Hasta:</label>
              <input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touchTarget}`} />
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

            {/* Ventas */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Ventas por Método</h3>
              <div className="space-y-1">
                {(report?.sales?.length ?? 0) === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin ventas</p> :
                  report.sales.map((s, i) => renderAccordionItem(`sale-${s.payment_method}-${s.currency}-${i}`, methodIcon(s.payment_method), methodLabel(s.payment_method), `${s.transaction_count} transacciones`, s.total, s.currency))
                }
              </div>
            </div>

            {/* Pagos */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Pagos a Proveedores</h3>
              <div className="space-y-1">
                {(report?.payments?.length ?? 0) === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin pagos</p> :
                  report.payments.map((p, i) => renderAccordionItem(`pay-${p.payment_method}-${p.currency}-${p.ref_type}-${i}`, methodIcon(p.payment_method), methodLabel(p.payment_method), `${p.payment_count} pagos`, p.total, p.currency, true, p.ref_type))
                }
              </div>
            </div>

            {/* Comisiones */}
            {report?.commissions && report.commissions.length > 0 && (
              <div>
                <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Comisiones a Trabajadores</h3>
                <div className="space-y-1">
                  {report.commissions.map((c, i) => renderAccordionItem(`com-${c.payment_method}-${c.currency}-${i}`, methodIcon(c.payment_method), methodLabel(c.payment_method), `${c.commission_count} comisiones`, c.total, c.currency, true))}
                </div>
              </div>
            )}

            {/* Desglose Sugerido colapsable */}
            {(report?.cash_breakdown?.length ?? 0) > 0 && (
              <div>
                <button onClick={() => setShowSuggested(!showSuggested)} aria-expanded={showSuggested}
                  className="w-full flex items-center gap-2 text-[11px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors py-2">
                  {showSuggested ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Desglose Sugerido (Efectivo CUP)
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

            {/* Desglose CUP con botones */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-[11px] font-black uppercase text-muted-foreground">Desglose para Entrega — CUP</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={handleSuggest} aria-label="Sugerir desglose" className={btnIcon}><Sparkles className="w-4 h-4 text-primary" /></button>
                  <button onClick={handleClear} aria-label="Limpiar desglose" className={btnIcon}><Trash2 className="w-4 h-4 text-destructive" /></button>
                  <button onClick={() => setShowConfig(!showConfig)} aria-label="Configurar denominaciones" aria-expanded={showConfig} className={btnIcon}><Settings className="w-4 h-4" /></button>
                  <button onClick={handleSave} aria-label="Guardar desglose en historial" className={btnIcon}><Save className="w-4 h-4 text-primary" /></button>
                  <button onClick={() => setShowHistory(!showHistory)} aria-label="Restaurar del historial" aria-expanded={showHistory} className={btnIcon}><RotateCcw className="w-4 h-4" /></button>
                </div>
              </div>

              {showConfig && (
                <div className="mb-2 p-3 rounded-xl border border-border/30 bg-muted/10">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Denominaciones a mostrar:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_DENOMS.map(d => (
                      <button key={d} onClick={() => toggleDenom(d)} aria-label={`Toggle $${d}`} aria-pressed={cupDenoms.includes(d)}
                        className={`px-3 py-2 rounded-lg text-[10px] font-bold border min-h-[36px] ${cupDenoms.includes(d) ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>
                        ${d}
                      </button>
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
                        <span className="text-[10px]">{h.label}</span>
                        <span className="text-[10px] font-mono">{formatCurrency(h.total)}</span>
                      </button>
                    ))
                  }
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label htmlFor="delivered-by" className="text-[9px] font-black uppercase text-muted-foreground">Entrega</label>
                  <input id="delivered-by" type="text" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)}
                    className={`w-full px-3 py-2 rounded border border-border/40 bg-background text-xs ${touchTarget}`} placeholder="Nombre de quien entrega" />
                </div>
                <div>
                  <label htmlFor="recipient-name" className="text-[9px] font-black uppercase text-muted-foreground">Recibe</label>
                  <input id="recipient-name" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                    className={`w-full px-3 py-2 rounded border border-border/40 bg-background text-xs ${touchTarget}`} placeholder="Nombre de quien recibe" />
                </div>
              </div>

              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {cupDenoms.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-10">${denom}</span>
                      <span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={cupBreakdown[denom] || ''} aria-label={`Billetes de $${denom}`}
                        onChange={(e) => setCupBreakdown(prev => ({ ...prev, [denom]: e.target.value }))}
                        className={`w-full px-2 py-2 rounded border border-border/40 bg-background text-xs font-mono ${touchTarget}`} placeholder="0" />
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
                      <span className="text-[10px] font-bold w-10">${denom}</span>
                      <span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={usdBreakdown[denom] || ''} aria-label={`Billetes USD de $${denom}`}
                        onChange={(e) => setUsdBreakdown(prev => ({ ...prev, [denom]: e.target.value }))}
                        className={`w-full px-2 py-2 rounded border border-border/40 bg-background text-xs font-mono ${touchTarget}`} placeholder="0" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 pt-2">
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Total USD:</span><span className="font-mono font-black">${usdTotal.toFixed(2)}</span></div>
                </div>
              </div>
            </div>

            {/* Exportar PDF */}
            <button onClick={handleExportPDF} className={`w-full rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2 ${touchTarget}`}>
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
