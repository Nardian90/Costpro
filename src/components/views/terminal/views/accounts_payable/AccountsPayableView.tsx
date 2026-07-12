'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, CheckCircle2, Wallet, TrendingDown } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

interface PayableItem {
  id: string;
  ref_type: 'receipt' | 'service';
  ref_id: string;
  supplier: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  due_date: string | null;
  payment_status: 'unpaid' | 'partial' | 'paid';
  days_until_due: number | null;
  is_overdue: boolean;
  reference: string | null;
}

export default function AccountsPayableView() {
  const { user } = useAuthStore();
  const [payables, setPayables] = useState<PayableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'upcoming' | 'paid'>('all');

  useEffect(() => {
    if (!user?.activeStoreId) return;
    fetchPayables();
  }, [user?.activeStoreId]);

  const fetchPayables = async () => {
    if (!user?.activeStoreId) return;
    setLoading(true);
    try {
      const { data: receipts, error: rErr } = await supabase
        .from('receipts')
        .select('id, supplier, total_cost, paid_amount, due_date, payment_status, reference_doc, status')
        .eq('store_id', user.activeStoreId)
        .neq('status', 'voided')
        .order('due_date', { ascending: true, nullsFirst: false });

      const { data: services, error: sErr } = await supabase
        .from('received_services')
        .select('id, supplier, total_amount, paid_amount, due_date, payment_status, reference_doc, status')
        .eq('store_id', user.activeStoreId)
        .neq('status', 'voided')
        .order('due_date', { ascending: true, nullsFirst: false });

      if (rErr || sErr) throw rErr || sErr;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allPayables: PayableItem[] = [
        ...(receipts || []).map((r: any) => ({
          id: `receipt-${r.id}`,
          ref_type: 'receipt' as const,
          ref_id: r.id,
          supplier: r.supplier,
          total: Number(r.total_cost) || 0,
          paid_amount: Number(r.paid_amount) || 0,
          balance: Number(r.total_cost) - Number(r.paid_amount || 0),
          due_date: r.due_date,
          payment_status: r.payment_status || 'unpaid',
          days_until_due: r.due_date ? Math.ceil((new Date(r.due_date).getTime() - today.getTime()) / 86400000) : null,
          is_overdue: r.due_date ? new Date(r.due_date) < today && r.payment_status !== 'paid' : false,
          reference: r.reference_doc,
        })),
        ...(services || []).map((s: any) => ({
          id: `service-${s.id}`,
          ref_type: 'service' as const,
          ref_id: s.id,
          supplier: s.supplier,
          total: Number(s.total_amount) || 0,
          paid_amount: Number(s.paid_amount) || 0,
          balance: Number(s.total_amount) - Number(s.paid_amount || 0),
          due_date: s.due_date,
          payment_status: s.payment_status || 'unpaid',
          days_until_due: s.due_date ? Math.ceil((new Date(s.due_date).getTime() - today.getTime()) / 86400000) : null,
          is_overdue: s.due_date ? new Date(s.due_date) < today && s.payment_status !== 'paid' : false,
          reference: s.reference_doc,
        })),
      ];

      setPayables(allPayables);
    } catch (e: any) {
      toast.error('Error al cargar cuentas por pagar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = payables.filter(p => {
    if (filter === 'overdue') return p.is_overdue;
    if (filter === 'upcoming') return !p.is_overdue && p.payment_status !== 'paid' && (p.days_until_due !== null && p.days_until_due <= 7);
    if (filter === 'paid') return p.payment_status === 'paid';
    return true;
  });

  const totalOverdue = payables.filter(p => p.is_overdue).reduce((s, p) => s + p.balance, 0);
  const totalUpcoming = payables.filter(p => !p.is_overdue && p.payment_status !== 'paid' && p.days_until_due !== null && p.days_until_due <= 7).reduce((s, p) => s + p.balance, 0);
  const totalPending = payables.filter(p => p.payment_status !== 'paid').reduce((s, p) => s + p.balance, 0);
  const totalPaid = payables.filter(p => p.payment_status === 'paid').reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-2xl font-black uppercase tracking-tight">Cuentas por Pagar</h2>
        <p className="text-xs text-muted-foreground mt-1">Vencimientos de recepciones y servicios recibidos</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={cn("rounded-xl border p-3", totalOverdue > 0 ? "border-destructive/30 bg-destructive/5" : "border-border/30")}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={cn("w-4 h-4", totalOverdue > 0 ? "text-destructive" : "text-muted-foreground")} />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Vencido</span>
          </div>
          <p className={cn("text-lg font-mono font-black tabular-nums", totalOverdue > 0 ? "text-destructive" : "")}>{formatCurrency(totalOverdue)}</p>
        </div>
        <div className={cn("rounded-xl border p-3", totalUpcoming > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border/30")}>
          <div className="flex items-center gap-2 mb-1">
            <Clock className={cn("w-4 h-4", totalUpcoming > 0 ? "text-amber-500" : "text-muted-foreground")} />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Próx. 7 días</span>
          </div>
          <p className={cn("text-lg font-mono font-black tabular-nums", totalUpcoming > 0 ? "text-amber-500" : "")}>{formatCurrency(totalUpcoming)}</p>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Total Pendiente</span>
          </div>
          <p className="text-lg font-mono font-black tabular-nums text-primary">{formatCurrency(totalPending)}</p>
        </div>
        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-[10px] font-black uppercase text-muted-foreground">Pagado</span>
          </div>
          <p className="text-lg font-mono font-black tabular-nums text-success">{formatCurrency(totalPaid)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { id: 'all', label: 'Todas' },
          { id: 'overdue', label: 'Vencidas' },
          { id: 'upcoming', label: 'Próximas' },
          { id: 'paid', label: 'Pagadas' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-colors",
              filter === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-8 text-muted-foreground">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Wallet className="w-8 h-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">No hay cuentas por pagar en esta categoría</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/30">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-[10px] font-black uppercase text-muted-foreground">
                <th className="p-3 text-left">Proveedor</th>
                <th className="p-3 text-center">Tipo</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Saldo</th>
                <th className="p-3 text-center">Vence</th>
                <th className="p-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border/20 hover:bg-muted/10">
                  <td className="p-3">
                    <p className="font-bold text-xs">{p.supplier || 'Sin proveedor'}</p>
                    <p className="text-[10px] text-muted-foreground">{p.reference || 'Sin ref'}</p>
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-xs">{p.ref_type === 'receipt' ? '📦 Recepción' : '🔧 Servicio'}</span>
                  </td>
                  <td className="p-3 text-right font-mono font-bold tabular-nums">{formatCurrency(p.total)}</td>
                  <td className="p-3 text-right font-mono font-black tabular-nums text-primary">{formatCurrency(p.balance)}</td>
                  <td className="p-3 text-center">
                    {p.due_date ? (
                      <div>
                        <p className={cn("text-xs font-bold", p.is_overdue ? "text-destructive" : "")}>
                          {new Date(p.due_date).toLocaleDateString()}
                        </p>
                        {p.days_until_due !== null && p.payment_status !== 'paid' && (
                          <p className={cn("text-[10px]", p.is_overdue ? "text-destructive" : p.days_until_due <= 7 ? "text-amber-500" : "text-muted-foreground")}>
                            {p.is_overdue ? `Vencido ${Math.abs(p.days_until_due)}d` : `${p.days_until_due}d`}
                          </p>
                        )}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-center">
                    <span className={cn(
                      "px-2 py-1 rounded text-[10px] font-black uppercase",
                      p.payment_status === 'paid' ? "bg-success/10 text-success"
                      : p.payment_status === 'partial' ? "bg-amber-500/10 text-amber-500"
                      : "bg-destructive/10 text-destructive"
                    )}>
                      {p.payment_status === 'paid' ? '💰' : p.payment_status === 'partial' ? '⚖️' : '⏳'} {p.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
