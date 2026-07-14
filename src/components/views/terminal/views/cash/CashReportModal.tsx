'use client';

import React, { useState, useEffect } from 'react';
import { Download, Printer, DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import type { CashReport } from '@/types';
import jsPDF from 'jspdf';

interface CashReportModalProps {
  open: boolean;
  onClose: () => void;
}

export function CashReportModal({ open, onClose }: CashReportModalProps) {
  const [report, setReport] = useState<CashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  // FIX: desglose de billetes que ingresa el usuario para la entrega
  const [userBreakdown, setUserBreakdown] = useState<Record<number, string>>({});
  const [recipientName, setRecipientName] = useState('');
  const [deliveredBy, setDeliveredBy] = useState('');

  const denominations = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

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

  // Calcular total que el usuario está entregando
  const userBreakdownTotal = Object.entries(userBreakdown).reduce((sum, [denom, count]) => {
    return sum + (Number(denom) * (Number(count) || 0));
  }, 0);

  const expectedTotal = report?.cash_balance_cup ?? 0;
  const difference = userBreakdownTotal - expectedTotal;

  const handleExportPDF = () => {
    if (!report) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header con logo simulado
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(34, 197, 94);
    doc.text('CostPro', 14, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Reporte de Caja — Entrega de Dinero', 14, 27);

    // Línea separadora
    doc.setDrawColor(34, 197, 94);
    doc.setLineWidth(0.5);
    doc.line(14, 30, pageWidth - 14, 30);

    // Info general
    doc.setFontSize(9);
    doc.setTextColor(0);
    let y = 40;
    doc.text(`Periodo: ${startDate} a ${endDate}`, 14, y);
    y += 6;
    if (deliveredBy) { doc.text(`Entrega: ${deliveredBy}`, 14, y); y += 6; }
    if (recipientName) { doc.text(`Recibe: ${recipientName}`, 14, y); y += 6; }
    doc.text(`Generado: ${new Date().toLocaleString('es-CU')}`, 14, y);
    y += 10;

    // Resumen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen', 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ingresos (Ventas): ${formatCurrency(report?.totals?.sales_total_cup ?? 0)}`, 14, y); y += 5;
    doc.text(`Egresos (Pagos): ${formatCurrency(report?.totals?.payments_total_cup ?? 0)}`, 14, y); y += 5;
    doc.text(`Comisiones: ${formatCurrency(report?.totals?.commissions_total_cup ?? 0)}`, 14, y); y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text(`Balance CUP: ${formatCurrency(report?.totals?.balance_cup ?? 0)}`, 14, y); y += 10;

    // Ventas por método
    doc.setFontSize(12);
    doc.text('Ventas por Método', 14, y); y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    (report.sales || []).forEach((s: any) => {
      doc.text(`  ${s.payment_method} (${s.currency}): ${s.transaction_count} trans. - ${formatCurrency(s.total)}`, 14, y);
      y += 5;
    });
    y += 5;

    // Pagos a proveedores
    if ((report.payments || []).length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Pagos a Proveedores', 14, y); y += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      (report.payments || []).forEach((p: any) => {
        doc.text(`  ${p.payment_method} (${p.currency}): ${p.payment_count} pagos - ${formatCurrency(p.total)}`, 14, y);
        y += 5;
      });
      y += 5;
    }

    // Desglose de entrega
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Desglose para Entrega (Efectivo CUP)', 14, y); y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    if ((report.cash_breakdown || []).length > 0) {
      doc.text('Sugerido:', 14, y); y += 5;
      (report.cash_breakdown || []).forEach((d: any) => {
        doc.text(`  $${d.denom} × ${d.count} = ${formatCurrency(d.total)}`, 14, y);
        y += 5;
      });
      y += 3;
    }

    // Desglose del usuario
    const userEntries = Object.entries(userBreakdown).filter(([, c]) => Number(c) > 0);
    if (userEntries.length > 0) {
      doc.text('Entregado:', 14, y); y += 5;
      userEntries.forEach(([denom, count]) => {
        doc.text(`  $${denom} × ${count} = ${formatCurrency(Number(denom) * Number(count))}`, 14, y);
        y += 5;
      });
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.text(`Total entregado: ${formatCurrency(userBreakdownTotal)}`, 14, y); y += 5;
      doc.text(`Diferencia: ${formatCurrency(difference)} ${difference === 0 ? '(cuadrado)' : difference > 0 ? '(sobrante)' : '(faltante)'}`, 14, y);
    }

    // Firmas
    y += 20;
    doc.setDrawColor(200);
    doc.line(14, y, 80, y);
    doc.line(pageWidth - 80, y, pageWidth - 14, y);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Entrega', 14, y + 5);
    doc.text('Recibe', pageWidth - 80, y + 5);

    doc.save(`reporte_caja_${startDate}_${endDate}.pdf`);
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
          {/* Selectores de fecha (sin duplicar) */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Desde:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 rounded-lg border border-border/40 bg-background text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground">Hasta:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 rounded-lg border border-border/40 bg-background text-xs"
              />
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

            {/* Sugerencia de desglose automática */}
            {(report?.cash_breakdown?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">
                  Desglose Sugerido (Efectivo CUP)
                </h3>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
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
              </div>
            )}

            {/* Desglose que ingresa el usuario para la entrega */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">
                Desglose para Entrega (ingresar billetes contados)
              </h3>
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-[9px] font-black uppercase text-muted-foreground">Entrega</label>
                    <input
                      type="text"
                      value={deliveredBy}
                      onChange={(e) => setDeliveredBy(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs"
                      placeholder="Nombre de quien entrega"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-muted-foreground">Recibe</label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-border/40 bg-background text-xs"
                      placeholder="Nombre de quien recibe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {denominations.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-12">${denom}</span>
                      <span className="text-[10px] text-muted-foreground">×</span>
                      <input
                        type="number"
                        min="0"
                        value={userBreakdown[denom] || ''}
                        onChange={(e) => setUserBreakdown(prev => ({ ...prev, [denom]: e.target.value }))}
                        className="w-full px-1.5 py-1 rounded border border-border/40 bg-background text-xs font-mono"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>

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
                    <span className={cn(
                      "font-mono font-black",
                      difference === 0 ? "text-success" : "text-destructive"
                    )}>
                      {formatCurrency(Math.abs(difference))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Botón Exportar PDF */}
            <button
              onClick={handleExportPDF}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
