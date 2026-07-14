'use client';

import React, { useState, useEffect } from 'react';
import { Download, Printer, DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from 'sonner';
import type { CashReport } from '@/types';

interface CashReportModalProps {
  open: boolean;
  onClose: () => void;
}

export function CashReportModal({ open, onClose }: CashReportModalProps) {
  const [report, setReport] = useState<CashReport | null>(null);
  const [loading, setLoading] = useState(true);
  // FIX (2026-07-14): fechas en formato HTML date input (YYYY-MM-DD)
  // Default: fecha actual en ambos
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString().slice(0, 10);
  });

  const fetchReport = async () => {
    setLoading(true);
    try {
      // FIX: usar apiFetch con token JWT + enviar fechas como ISO
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

  const handlePrint = () => {
    window.print();
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
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-widest">Reporte de Caja — Entrega</h2>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handlePrint} className="p-2 rounded-lg hover:bg-muted" aria-label="Imprimir">
                <Printer className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar">
                <span className="text-lg">✕</span>
              </button>
            </div>
          </div>
          {/* FIX (2026-07-14): selectores de fecha inicio/fin */}
          <div className="flex items-center gap-2">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Desde</label>
                <input
                  type="datetime-local"
                  value={startDate.slice(0, 16)}
                  onChange={(e) => setStartDate(new Date(e.target.value).toISOString())}
                  className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Hasta</label>
                <input
                  type="datetime-local"
                  value={endDate.slice(0, 16)}
                  onChange={(e) => setEndDate(new Date(e.target.value).toISOString())}
                  className="w-full h-10 bg-background border border-border/50 rounded-lg px-3 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-center">
                <TrendingUp className="w-4 h-4 mx-auto text-success mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Ingresos</p>
                <p className="text-lg font-mono font-black tabular-nums text-success">{formatCurrency(report.totals.sales_total_cup)}</p>
              </div>
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center">
                <TrendingDown className="w-4 h-4 mx-auto text-destructive mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Egresos</p>
                <p className="text-lg font-mono font-black tabular-nums text-destructive">{formatCurrency(report.totals.payments_total_cup)}</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
                <DollarSign className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Balance</p>
                <p className="text-lg font-mono font-black tabular-nums text-primary">{formatCurrency(report.totals.balance_cup)}</p>
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Ventas por Método</h3>
              <div className="space-y-1">
                {report.sales.length === 0 ? (
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

            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Pagos a Proveedores</h3>
              <div className="space-y-1">
                {report.payments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Sin pagos</p>
                ) : (
                  report.payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border/30 p-2.5 bg-muted/10">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{methodIcon(p.payment_method)}</span>
                        <div>
                          <p className="text-xs font-bold">
                            {methodLabel(p.payment_method)} ({p.currency})
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {p.ref_type === 'receipt' ? '📦 Recepción' : '🔧 Servicio'}
                            </span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">{p.payment_count} pagos</p>
                        </div>
                      </div>
                      <p className="text-sm font-mono font-black tabular-nums text-destructive">−{formatCurrency(p.total)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* FIX-COMMISSION (2026-07-12): Comisiones pagadas a trabajadores */}
            {report.commissions && report.commissions.length > 0 && (
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

            {report.cash_breakdown_cup.total > 0 && (
              <div>
                <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">
                  Desglose para Entrega (Efectivo CUP)
                </h3>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase">Total a entregar:</span>
                    <span className="text-lg font-mono font-black text-primary tabular-nums">
                      {formatCurrency(report.cash_breakdown_cup.total)}
                    </span>
                  </div>
                  <div className="border-t border-primary/20 pt-2 space-y-1">
                    {report.cash_breakdown_cup.denominations.map((d) => (
                      <div key={d.denomination} className="flex items-center justify-between text-sm">
                        <span className="font-bold">${d.denomination} × {d.count}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">{formatCurrency(d.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Imprimir / PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
