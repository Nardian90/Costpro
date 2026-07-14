'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  breakdown: Record<number, string>; deliveredBy: string; recipientName: string;
  total: number;
}

const ALL_DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const USD_DENOMS = [100, 50, 20, 10, 5, 1];
const STORAGE_KEY = 'costpro_cash_delivered_by';
const STORAGE_KEY_REC = 'costpro_cash_recipient';
const STORAGE_KEY_DENOMS = 'costpro_cash_denoms';
const STORAGE_KEY_HISTORY = 'costpro_cash_breakdown_history';

export function CashReportModal({ open, onClose }: CashReportModalProps) {
  const { user } = useAuthStore();
  const [report, setReport] = useState<CashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Persistir Entrega/Recibe en localStorage
  const [deliveredBy, setDeliveredBy] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEY) || '';
  });
  const [recipientName, setRecipientName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEY_REC) || '';
  });

  useEffect(() => {
    if (deliveredBy) localStorage.setItem(STORAGE_KEY, deliveredBy);
  }, [deliveredBy]);
  useEffect(() => {
    if (recipientName) localStorage.setItem(STORAGE_KEY_REC, recipientName);
  }, [recipientName]);

  // Desglose CUP y USD separados
  const [cupBreakdown, setCupBreakdown] = useState<Record<number, string>>({});
  const [usdBreakdown, setUsdBreakdown] = useState<Record<number, string>>({});

  // Denominaciones configurables
  const [cupDenoms, setCupDenoms] = useState<number[]>(() => {
    if (typeof window === 'undefined') return ALL_DENOMS;
    const saved = localStorage.getItem(STORAGE_KEY_DENOMS + '_cup');
    return saved ? JSON.parse(saved) : ALL_DENOMS;
  });
  const [showConfig, setShowConfig] = useState(false);

  // Historial de desgloses guardados (max 10)
  const [savedHistory, setSavedHistory] = useState<SavedBreakdown[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);

  // Accordion de ventas/pagos
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [itemDetails, setItemDetails] = useState<Record<string, any[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [showSuggested, setShowSuggested] = useState(false);

  // Obtener info de la tienda
  useEffect(() => {
    if (!open || !user?.activeStoreId) return;
    const fetchStore = async () => {
      try {
        const data = await apiFetch(`/api/stores?status=all`);
        const stores = data?.data || data || [];
        const store = Array.isArray(stores) ? stores.find((s: any) => s.id === user.activeStoreId) : null;
        if (store) {
          setStoreInfo({
            name: store.name || 'Tienda', logo_url: store.logo_url || null,
            address: store.address || null, phone: store.phone || null,
            email: store.email || null, reeup: store.reeup || null, nit: store.nit || null,
          });
        }
      } catch {}
    };
    fetchStore();
  }, [open, user?.activeStoreId]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const startISO = new Date(startDate + 'T00:00:00').toISOString();
      const endISO = new Date(endDate + 'T23:59:59').toISOString();
      const data = await apiFetch(`/api/cash-report?start_date=${encodeURIComponent(startISO)}&end_date=${encodeURIComponent(endISO)}`);
      setReport(data);
    } catch (e: any) { toast.error(e.message || 'Error al generar reporte'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) fetchReport(); }, [open, startDate, endDate]);

  // Cálculos
  const cupTotal = Object.entries(cupBreakdown).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0);
  const usdTotal = Object.entries(usdBreakdown).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0);
  const expectedCup = report?.cash_balance_cup ?? 0;
  const cupDifference = cupTotal - expectedCup;

  // Sugerir desglose CUP
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

  // Limpiar desglose
  const handleClear = () => { setCupBreakdown({}); setUsdBreakdown({}); };

  // Guardar desglose en historial (max 10)
  const handleSave = () => {
    const entry: SavedBreakdown = {
      id: Date.now().toString(),
      label: `${new Date().toLocaleDateString('es-CU')} ${deliveredBy || 'Sin nombre'}`,
      date: new Date().toISOString(),
      breakdown: cupBreakdown, deliveredBy, recipientName, total: cupTotal,
    };
    const updated = [entry, ...savedHistory].slice(0, 10);
    setSavedHistory(updated);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
    toast.success(`Desglose guardado (${updated.length}/10)`);
  };

  // Restaurar del historial
  const handleRestore = (entry: SavedBreakdown) => {
    setCupBreakdown(entry.breakdown);
    setDeliveredBy(entry.deliveredBy);
    setRecipientName(entry.recipientName);
    setShowHistory(false);
    toast.success('Desglose restaurado');
  };

  // Guardar config de denominaciones
  const toggleDenom = (denom: number) => {
    const updated = cupDenoms.includes(denom)
      ? cupDenoms.filter(d => d !== denom)
      : [...cupDenoms, denom].sort((a, b) => b - a);
    setCupDenoms(updated);
    localStorage.setItem(STORAGE_KEY_DENOMS + '_cup', JSON.stringify(updated));
  };

  // Toggle accordion
  const toggleAccordion = async (key: string, type: 'sale' | 'payment', method: string, currency: string, refType?: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
      setExpandedItems(newExpanded);
      return;
    }
    newExpanded.add(key);
    setExpandedItems(newExpanded);

    // Cargar detalles si no están cacheados
    if (!itemDetails[key]) {
      const newLoading = new Set(loadingDetails);
      newLoading.add(key);
      setLoadingDetails(newLoading);
      try {
        const startISO = new Date(startDate + 'T00:00:00').toISOString();
        const endISO = new Date(endDate + 'T23:59:59').toISOString();
        let url = `/api/cash-report/details?type=${type}&method=${method}&currency=${currency}&start_date=${startISO}&end_date=${endISO}`;
        if (refType) url += `&ref_type=${refType}`;
        const data = await apiFetch(url);
        setItemDetails(prev => ({ ...prev, [key]: Array.isArray(data) ? data : (data?.data || []) }));
      } catch { setItemDetails(prev => ({ ...prev, [key]: [] })); }
      finally {
        const nl = new Set(loadingDetails); nl.delete(key); setLoadingDetails(nl);
      }
    }
  };

  // Exportar PDF
  const handleExportPDF = () => {
    if (!report) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 20;
    const storeName = storeInfo?.name || 'Tienda';

    if (storeInfo?.logo_url) { try { doc.addImage(storeInfo.logo_url, 'PNG', margin, y - 5, 25, 25); } catch {} }

    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(storeName, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 5;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    if (storeInfo?.address) { doc.text(storeInfo.address, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.phone) { doc.text(`Tel: ${storeInfo.phone}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.reeup) { doc.text(`REEUP: ${storeInfo.reeup}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.nit) { doc.text(`NIT: ${storeInfo.nit}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    y += 3; doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(margin, y, pageWidth - margin, y); y += 8;

    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text('Reporte de Caja — Entrega de Dinero', margin, y); y += 6;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(`Periodo: ${startDate} a ${endDate}`, margin, y); y += 4;
    if (deliveredBy) { doc.text(`Entrega: ${deliveredBy}`, margin, y); y += 4; }
    if (recipientName) { doc.text(`Recibe: ${recipientName}`, margin, y); y += 4; }
    doc.text(`Generado: ${new Date().toLocaleString('es-CU')}`, margin, y); y += 8;

    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Resumen', margin, y); y += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Ingresos (Ventas):  ${formatCurrency(report?.totals?.sales_total_cup ?? 0)}`, margin, y); y += 4;
    doc.text(`Egresos (Pagos):    ${formatCurrency(report?.totals?.payments_total_cup ?? 0)}`, margin, y); y += 4;
    doc.text(`Comisiones:         ${formatCurrency(report?.totals?.commissions_total_cup ?? 0)}`, margin, y); y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(`Balance CUP:        ${formatCurrency(report?.totals?.balance_cup ?? 0)}`, margin, y); y += 8;

    // Desglose CUP
    doc.setFontSize(9); doc.text('Desglose para Entrega (Efectivo CUP)', margin, y); y += 5;
    const cupEntries = Object.entries(cupBreakdown).filter(([, c]) => Number(c) > 0);
    if (cupEntries.length > 0) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      cupEntries.forEach(([denom, count]) => {
        doc.text(`  $${denom} x ${count} = ${formatCurrency(Number(denom) * Number(count))}`, margin, y); y += 4;
      });
      y += 2; doc.setFont('helvetica', 'bold');
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
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text('Desglose para Entrega (Efectivo USD)', margin, y); y += 5;
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      Object.entries(usdBreakdown).filter(([, c]) => Number(c) > 0).forEach(([denom, count]) => {
        doc.text(`  $${denom} x ${count} = $${(Number(denom) * Number(count)).toFixed(2)}`, margin, y); y += 4;
      });
      y += 2; doc.setFont('helvetica', 'bold');
      doc.text(`Total USD: $${usdTotal.toFixed(2)}`, margin, y); y += 8;
    }

    // Firmas
    doc.setDrawColor(120); doc.setLineWidth(0.3);
    const sigY = Math.max(y + 10, doc.internal.pageSize.getHeight() - 30);
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

  const renderAccordionItem = (key: string, icon: string, label: string, sublabel: string, amount: number, currency: string, isNegative: boolean = false, refType?: string) => (
    <div key={key} className="rounded-lg border border-border/30 overflow-hidden">
      <button
        onClick={() => toggleAccordion(key, isNegative ? 'payment' : 'sale', label.split(' ')[0].toLowerCase(), currency, refType)}
        className="w-full flex items-center justify-between p-2.5 bg-muted/10 hover:bg-muted/20 transition-colors"
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
          {expandedItems.has(key) ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>
      {expandedItems.has(key) && (
        <div className="border-t border-border/20 p-2 bg-background">
          {loadingDetails.has(key) ? (
            <p className="text-xs text-muted-foreground text-center py-2">Cargando documentos...</p>
          ) : (itemDetails[key]?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Sin documentos detallados</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {itemDetails[key]?.map((doc: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[11px] py-1 px-2 rounded hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-primary" />
                    <span className="font-mono">{doc.date || doc.created_at?.slice(0,10) || '—'}</span>
                    <span className="text-muted-foreground">{doc.reference || doc.reference_doc || doc.supplier || ''}</span>
                  </div>
                  <span className="font-mono tabular-nums">{fmt(Number(doc.amount || doc.total || 0), currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-widest">Reporte de Caja — Entrega</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><span className="text-lg">✕</span></button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Desde:</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-2 py-1 rounded-lg border border-border/40 bg-background text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Hasta:</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-2 py-1 rounded-lg border border-border/40 bg-background text-xs" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Cargando reporte...</div>
        ) : !report ? (
          <div className="p-8 text-center text-muted-foreground">Sin datos</div>
        ) : (
          <div className="p-4 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-center">
                <TrendingUp className="w-4 h-4 mx-auto text-success mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Ingresos</p>
                <p className="text-lg font-mono font-black tabular-nums text-success">{formatCurrency(report?.totals?.sales_total_cup ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center">
                <TrendingDown className="w-4 h-4 mx-auto text-destructive mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Egresos</p>
                <p className="text-lg font-mono font-black tabular-nums text-destructive">{formatCurrency(report?.totals?.payments_total_cup ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
                <DollarSign className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Balance</p>
                <p className="text-lg font-mono font-black tabular-nums text-primary">{formatCurrency(report?.totals?.balance_cup ?? 0)}</p>
              </div>
            </div>

            {/* Ventas por Método — accordion */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Ventas por Método</h3>
              <div className="space-y-1">
                {(report?.sales?.length ?? 0) === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin ventas</p> :
                  report.sales.map((s, i) => renderAccordionItem(
                    `sale-${s.payment_method}-${s.currency}-${i}`,
                    methodIcon(s.payment_method), methodLabel(s.payment_method), `${s.transaction_count} transacciones`,
                    s.total, s.currency
                  ))
                }
              </div>
            </div>

            {/* Pagos — accordion */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Pagos a Proveedores</h3>
              <div className="space-y-1">
                {(report?.payments?.length ?? 0) === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin pagos</p> :
                  report.payments.map((p, i) => renderAccordionItem(
                    `pay-${p.payment_method}-${p.currency}-${p.ref_type}-${i}`,
                    methodIcon(p.payment_method), methodLabel(p.payment_method), `${p.payment_count} pagos`,
                    p.total, p.currency, true, p.ref_type
                  ))
                }
              </div>
            </div>

            {/* Comisiones */}
            {report?.commissions && report.commissions.length > 0 && (
              <div>
                <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Comisiones a Trabajadores</h3>
                <div className="space-y-1">
                  {report.commissions.map((c, i) => renderAccordionItem(
                    `com-${c.payment_method}-${c.currency}-${i}`,
                    methodIcon(c.payment_method), methodLabel(c.payment_method), `${c.commission_count} comisiones`,
                    c.total, c.currency, true
                  ))}
                </div>
              </div>
            )}

            {/* Desglose Sugerido — colapsable */}
            {(report?.cash_breakdown?.length ?? 0) > 0 && (
              <div>
                <button onClick={() => setShowSuggested(!showSuggested)} className="w-full flex items-center gap-2 text-[11px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors">
                  {showSuggested ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
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

            {/* Desglose para Entrega CUP — con botones */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-black uppercase text-muted-foreground">Desglose para Entrega — CUP</h3>
                <div className="flex items-center gap-1">
                  <button onClick={handleSuggest} title="Sugerir" className="p-1.5 rounded-lg border border-border/40 hover:bg-muted"><Sparkles className="w-3.5 h-3.5 text-primary" /></button>
                  <button onClick={handleClear} title="Limpiar" className="p-1.5 rounded-lg border border-border/40 hover:bg-muted"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  <button onClick={() => setShowConfig(!showConfig)} title="Configurar" className="p-1.5 rounded-lg border border-border/40 hover:bg-muted"><Settings className="w-3.5 h-3.5" /></button>
                  <button onClick={handleSave} title="Guardar" className="p-1.5 rounded-lg border border-border/40 hover:bg-muted"><Save className="w-3.5 h-3.5 text-primary" /></button>
                  <button onClick={() => setShowHistory(!showHistory)} title="Restaurar" className="p-1.5 rounded-lg border border-border/40 hover:bg-muted"><RotateCcw className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Configuración de denominaciones */}
              {showConfig && (
                <div className="mb-2 p-3 rounded-xl border border-border/30 bg-muted/10">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Denominaciones a mostrar:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_DENOMS.map(d => (
                      <button key={d} onClick={() => toggleDenom(d)}
                        className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border",
                          cupDenoms.includes(d) ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground")}>
                        ${d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Historial */}
              {showHistory && (
                <div className="mb-2 p-3 rounded-xl border border-border/30 bg-muted/10 max-h-40 overflow-y-auto">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Historial ({savedHistory.length}/10):</p>
                  {savedHistory.length === 0 ? <p className="text-xs text-muted-foreground">Sin guardados</p> :
                    savedHistory.map(h => (
                      <button key={h.id} onClick={() => handleRestore(h)}
                        className="w-full flex items-center justify-between p-1.5 rounded hover:bg-muted/30 text-left">
                        <span className="text-[10px]">{h.label}</span>
                        <span className="text-[10px] font-mono">{formatCurrency(h.total)}</span>
                      </button>
                    ))
                  }
                </div>
              )}

              {/* Campos Entrega/Recibe */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[9px] font-black uppercase text-muted-foreground">Entrega</label>
                  <input type="text" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs" placeholder="Nombre de quien entrega" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-muted-foreground">Recibe</label>
                  <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs" placeholder="Nombre de quien recibe" />
                </div>
              </div>

              {/* Denominaciones CUP */}
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {cupDenoms.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-12">${denom}</span>
                      <span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={cupBreakdown[denom] || ''}
                        onChange={(e) => setCupBreakdown(prev => ({ ...prev, [denom]: e.target.value }))}
                        className="w-full px-1.5 py-1 rounded border border-border/40 bg-background text-xs font-mono" placeholder="0" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 pt-2 space-y-1">
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Total CUP:</span><span className="font-mono font-black">{formatCurrency(cupTotal)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Esperado:</span><span className="font-mono font-black text-primary">{formatCurrency(expectedCup)}</span></div>
                  <div className={cn("flex items-center justify-between rounded-lg px-2 py-1", cupDifference === 0 ? "bg-success/10" : "bg-destructive/10")}>
                    <span className="text-xs font-black uppercase">{cupDifference === 0 ? 'Cuadrado' : cupDifference > 0 ? 'Sobrante' : 'Faltante'}:</span>
                    <span className={cn("font-mono font-black", cupDifference === 0 ? "text-success" : "text-destructive")}>{formatCurrency(Math.abs(cupDifference))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desglose para Entrega USD */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Desglose para Entrega — USD</h3>
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {USD_DENOMS.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-12">${denom}</span>
                      <span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={usdBreakdown[denom] || ''}
                        onChange={(e) => setUsdBreakdown(prev => ({ ...prev, [denom]: e.target.value }))}
                        className="w-full px-1.5 py-1 rounded border border-border/40 bg-background text-xs font-mono" placeholder="0" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 pt-2">
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Total USD:</span><span className="font-mono font-black">${usdTotal.toFixed(2)}</span></div>
                </div>
              </div>
            </div>

            {/* Exportar PDF */}
            <button onClick={handleExportPDF} className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
