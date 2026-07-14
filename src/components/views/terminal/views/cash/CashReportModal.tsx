'use client';

import React, { useState, useEffect } from 'react';
import { Download, DollarSign, TrendingUp, TrendingDown, Wallet, ChevronDown, ChevronRight } from 'lucide-react';
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
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  reeup: string | null;
  nit: string | null;
}

export function CashReportModal({ open, onClose }: CashReportModalProps) {
  const { user } = useAuthStore();
  const [report, setReport] = useState<CashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [userBreakdown, setUserBreakdown] = useState<Record<number, string>>({});
  const [recipientName, setRecipientName] = useState('');
  const [deliveredBy, setDeliveredBy] = useState('');
  const [showSuggested, setShowSuggested] = useState(false);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);

  const denominations = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

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
            name: store.name || 'Tienda',
            logo_url: store.logo_url || null,
            address: store.address || null,
            phone: store.phone || null,
            email: store.email || null,
            reeup: store.reeup || null,
            nit: store.nit || null,
          });
        }
      } catch { /* fallback a nombre genérico */ }
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
    } catch (e: any) {
      toast.error(e.message || 'Error al generar reporte');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchReport();
  }, [open, startDate, endDate]);

  const userBreakdownTotal = Object.entries(userBreakdown).reduce((sum, [denom, count]) => {
    return sum + (Number(denom) * (Number(count) || 0));
  }, 0);

  const expectedTotal = report?.cash_balance_cup ?? 0;
  const difference = userBreakdownTotal - expectedTotal;

  const handleExportPDF = () => {
    if (!report) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 20;

    // ── HEADER: nombre de la tienda + logo + info ──
    const storeName = storeInfo?.name || 'Tienda';

    // Logo (si existe)
    if (storeInfo?.logo_url) {
      try {
        doc.addImage(storeInfo.logo_url, 'PNG', margin, y - 5, 25, 25);
      } catch { /* si falla, no poner logo */ }
    }

    // Nombre de la tienda (NO "COSTPRO")
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(storeName, margin + (storeInfo?.logo_url ? 30 : 0), y);
    y += 5;

    // Info de la tienda
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    if (storeInfo?.address) { doc.text(storeInfo.address, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.phone) { doc.text(`Tel: ${storeInfo.phone}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.reeup) { doc.text(`REEUP: ${storeInfo.reeup}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }
    if (storeInfo?.nit) { doc.text(`NIT: ${storeInfo.nit}`, margin + (storeInfo?.logo_url ? 30 : 0), y); y += 3.5; }

    // Línea separadora
    y += 3;
    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // ── Título del reporte ──
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Reporte de Caja — Entrega de Dinero', margin, y);
    y += 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(`Periodo: ${startDate} a ${endDate}`, margin, y);
    y += 4;
    if (deliveredBy) { doc.text(`Entrega: ${deliveredBy}`, margin, y); y += 4; }
    if (recipientName) { doc.text(`Recibe: ${recipientName}`, margin, y); y += 4; }
    doc.text(`Generado: ${new Date().toLocaleString('es-CU')}`, margin, y);
    y += 8;

    // ── Resumen ──
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Resumen', margin, y); y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ingresos (Ventas):  ${formatCurrency(report?.totals?.sales_total_cup ?? 0)}`, margin, y); y += 4;
    doc.text(`Egresos (Pagos):    ${formatCurrency(report?.totals?.payments_total_cup ?? 0)}`, margin, y); y += 4;
    doc.text(`Comisiones:         ${formatCurrency(report?.totals?.commissions_total_cup ?? 0)}`, margin, y); y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(`Balance CUP:        ${formatCurrency(report?.totals?.balance_cup ?? 0)}`, margin, y); y += 8;

    // ── Ventas por método ──
    doc.setFontSize(9);
    doc.text('Ventas por Metodo', margin, y); y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    (report.sales || []).forEach((s: any) => {
      const label = s.payment_method === 'cash' ? 'Efectivo' : s.payment_method === 'transfer' ? 'Transferencia' : 'Zelle';
      doc.text(`  ${label} (${s.currency}): ${s.transaction_count} trans. - ${formatCurrency(s.total)}`, margin, y);
      y += 4;
    });
    y += 4;

    // ── Pagos a proveedores ──
    if ((report.payments || []).length > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Pagos a Proveedores', margin, y); y += 5;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      (report.payments || []).forEach((p: any) => {
        const label = p.payment_method === 'cash' ? 'Efectivo' : p.payment_method === 'transfer' ? 'Transferencia' : 'Zelle';
        doc.text(`  ${label} (${p.currency}): ${p.payment_count} pagos - ${formatCurrency(p.total)}`, margin, y);
        y += 4;
      });
      y += 4;
    }

    // ── Desglose para Entrega (OBLIGATORIO en PDF) ──
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Desglose para Entrega (Efectivo CUP)', margin, y); y += 5;

    // Sugerido (si existe)
    if ((report.cash_breakdown || []).length > 0) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120);
      doc.text('Sugerido:', margin, y); y += 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);
      (report.cash_breakdown || []).forEach((d: any) => {
        if (d.count > 0) {
          doc.text(`  $${d.denom} x ${d.count} = ${formatCurrency(d.total)}`, margin, y);
          y += 3.5;
        }
      });
      y += 2;
    }

    // Desglose del usuario (OBLIGATORIO)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Entregado:', margin, y); y += 4;
    doc.setFont('helvetica', 'normal');

    const userEntries = Object.entries(userBreakdown).filter(([, c]) => Number(c) > 0);
    if (userEntries.length > 0) {
      userEntries.forEach(([denom, count]) => {
        doc.text(`  $${denom} x ${count} = ${formatCurrency(Number(denom) * Number(count))}`, margin, y);
        y += 4;
      });
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.text(`Total entregado: ${formatCurrency(userBreakdownTotal)}`, margin, y); y += 4;
      const diffLabel = difference === 0 ? '(cuadrado)' : difference > 0 ? '(sobrante)' : '(faltante)';
      doc.text(`Diferencia: ${formatCurrency(Math.abs(difference))} ${diffLabel}`, margin, y);
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120);
      doc.text('  (Sin desglose ingresado)', margin, y);
    }
    y += 10;

    // ── Firmas ──
    doc.setDrawColor(120);
    doc.setLineWidth(0.3);
    const sigY = Math.max(y + 10, doc.internal.pageSize.getHeight() - 30);
    doc.line(margin, sigY, margin + 70, sigY);
    doc.line(pageWidth - margin - 70, sigY, pageWidth - margin, sigY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(deliveredBy || 'Entrega', margin, sigY + 4);
    doc.text(recipientName || 'Recibe', pageWidth - margin - 70, sigY + 4);

    doc.save(`reporte_caja_${storeName.replace(/\s+/g, '_')}_${startDate}.pdf`);
  };

  if (!open) return null;

  const methodIcon = (m: string) => m === 'cash' ? '💵' : m === 'transfer' ? '📱' : '💳';
  const methodLabel = (m: string) => m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-widest">Reporte de Caja — Entrega</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar">
              <span className="text-lg">✕</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Desde:</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 rounded-lg border border-border/40 bg-background text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Hasta:</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 rounded-lg border border-border/40 bg-background text-xs" />
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

            {/* Ventas */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Ventas por Método</h3>
              <div className="space-y-1">
                {(report?.sales?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Sin ventas</p>
                ) : (
                  report.sales.map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border/30 p-2.5 bg-muted/10">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{methodIcon(s.payment_method)}</span>
                        <div>
                          <p className="text-xs font-bold">{methodLabel(s.payment_method)} ({s.currency})</p>
                          <p className="text-[10px] text-muted-foreground">{s.transaction_count} transacciones</p>
                        </div>
                      </div>
                      <p className="text-sm font-mono font-black tabular-nums">{formatCurrency(s.total)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pagos */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Pagos a Proveedores</h3>
              <div className="space-y-1">
                {(report?.payments?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Sin pagos</p>
                ) : (
                  report.payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border/30 p-2.5 bg-muted/10">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{methodIcon(p.payment_method)}</span>
                        <div>
                          <p className="text-xs font-bold">{methodLabel(p.payment_method)} ({p.currency}) · {p.ref_type}</p>
                          <p className="text-[10px] text-muted-foreground">{p.payment_count} pagos</p>
                        </div>
                      </div>
                      <p className="text-sm font-mono font-black tabular-nums text-destructive">−{formatCurrency(p.total)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Comisiones */}
            {report?.commissions && report.commissions.length > 0 && (
              <div>
                <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Comisiones a Trabajadores</h3>
                <div className="space-y-1">
                  {report.commissions.map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border/30 p-2.5 bg-muted/10">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{methodIcon(c.payment_method)}</span>
                        <div>
                          <p className="text-xs font-bold">{methodLabel(c.payment_method)} ({c.currency})</p>
                          <p className="text-[10px] text-muted-foreground">{c.commission_count} comisiones</p>
                        </div>
                      </div>
                      <p className="text-sm font-mono font-black tabular-nums text-destructive">−{formatCurrency(c.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Desglose Sugerido — COLAPSABLE (accordion) */}
            {(report?.cash_breakdown?.length ?? 0) > 0 && (
              <div>
                <button
                  onClick={() => setShowSuggested(!showSuggested)}
                  className="w-full flex items-center gap-2 text-[11px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors"
                >
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
                      <span className="font-mono font-black text-primary">{formatCurrency(expectedTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Desglose para Entrega (input del usuario — OBLIGATORIO en PDF) */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">
                Desglose para Entrega (ingresar billetes contados)
              </h3>
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                {/* Campos Entrega/Recibe */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-[9px] font-black uppercase text-muted-foreground">Entrega</label>
                    <input type="text" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs"
                      placeholder="Nombre de quien entrega" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-muted-foreground">Recibe</label>
                    <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs"
                      placeholder="Nombre de quien recibe" />
                  </div>
                </div>

                {/* Denominaciones */}
                <div className="grid grid-cols-3 gap-1.5">
                  {denominations.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-12">${denom}</span>
                      <span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={userBreakdown[denom] || ''}
                        onChange={(e) => setUserBreakdown(prev => ({ ...prev, [denom]: e.target.value }))}
                        className="w-full px-1.5 py-1 rounded border border-border/40 bg-background text-xs font-mono"
                        placeholder="0" />
                    </div>
                  ))}
                </div>

                {/* Resumen del desglose */}
                <div className="border-t border-border/40 pt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase">Total contado:</span>
                    <span className="font-mono font-black">{formatCurrency(userBreakdownTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase">Esperado:</span>
                    <span className="font-mono font-black text-primary">{formatCurrency(expectedTotal)}</span>
                  </div>
                  <div className={cn(
                    "flex items-center justify-between rounded-lg px-2 py-1",
                    difference === 0 ? "bg-success/10" : "bg-destructive/10"
                  )}>
                    <span className="text-xs font-black uppercase">
                      {difference === 0 ? 'Cuadrado' : difference > 0 ? 'Sobrante' : 'Faltante'}:
                    </span>
                    <span className={cn("font-mono font-black", difference === 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(Math.abs(difference))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Botón Exportar PDF */}
            <button onClick={handleExportPDF}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
