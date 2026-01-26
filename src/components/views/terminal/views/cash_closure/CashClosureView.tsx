'use client';

import React from 'react';
import { DollarSign, CreditCard, Layers, Edit, History, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import ActionMenu from '@/components/ui/ActionMenu';

import { useCashClosures } from '@/hooks/useCashClosures';
import { useDashboardData } from '@/hooks/useQueries';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

interface CashClosureViewProps {}

export default function CashClosureView({}: CashClosureViewProps) {
  const { user } = useAuthStore();
  const { data: cashClosuresData } = useCashClosures(user?.storeId, user?.role === 'admin');
  const { data: dashboardData } = useDashboardData(user?.storeId, user?.role === 'admin');

  const summary = dashboardData?.summary || {
    total_billed: 0,
    total_cash: 0,
    total_transfer: 0,
  };
  const cashClosures = cashClosuresData || [];

  const onProcessClosure = () => {
    toast.info('La lógica de cierre de caja se implementará en el futuro.');
  };
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Cierre de Caja</h2>
        <ActionMenu
          actions={[
            { id: 'process', label: 'Procesar Cierre', icon: DollarSign, onClick: onProcessClosure, variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-8 rounded-2xl border border-border bg-card shadow-sm space-y-8">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-xl"><Edit className="w-5 h-5 text-primary" /></div>
             <h3 className="font-black text-lg uppercase tracking-widest">Declaración de Fondos</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Efectivo Físico</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                <input type="number" className="w-full p-4 pl-12 rounded-xl border border-border bg-background text-2xl font-black font-mono focus:ring-1 focus:ring-primary outline-none" placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Transferencias / Otros</label>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                <input type="number" className="w-full p-4 pl-12 rounded-xl border border-border bg-background text-2xl font-black font-mono focus:ring-1 focus:ring-primary outline-none" placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Observaciones</label>
              <textarea className="w-full p-4 rounded-xl border border-border bg-background text-sm font-medium resize-none h-24 focus:ring-1 focus:ring-primary outline-none" placeholder="Notas del turno..." />
            </div>
          </div>
        </div>

        <div className="p-8 rounded-2xl border border-primary/20 bg-primary/5 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/20 rounded-xl"><Layers className="w-5 h-5 text-primary" /></div>
             <h3 className="font-black text-lg uppercase tracking-widest">Balance del Sistema</h3>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Ventas Totales Esperadas', value: summary.total_billed, color: 'text-foreground' },
              { label: 'Efectivo Declarado (Sistema)', value: summary.total_cash, color: 'text-green-600' },
              { label: 'Transferencias (Sistema)', value: summary.total_transfer, color: 'text-primary' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center p-4 rounded-xl bg-background/50 border border-border">
                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{row.label}</span>
                <span className={cn("text-xl font-black font-mono", row.color)}>${row.value.toFixed(2)}</span>
              </div>
            ))}

            <div className="flex justify-between items-center p-6 rounded-2xl bg-primary text-white mt-8 shadow-xl shadow-primary/20">
              <span className="text-xs font-black uppercase tracking-widest">Diferencia de Arqueo</span>
              <span className="text-3xl font-black font-mono">$0.00</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 rounded-2xl border border-border bg-card shadow-sm">
        <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3 mb-8">
          <History className="w-6 h-6 text-primary" />
          Registros de Cierre
        </h3>

        <div className="overflow-x-auto rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
                <th className="p-4 text-left">Fecha</th>
                <th className="p-4 text-left">Operador</th>
                <th className="p-4 text-right">Monto Sistema</th>
                <th className="p-4 text-right">Diferencia</th>
                <th className="p-4 text-center">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {cashClosures.map((closure) => (
                <tr key={closure.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-xs">{new Date(closure.created_at).toLocaleDateString()}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{new Date(closure.created_at).toLocaleTimeString()}</div>
                  </td>
                  <td className="p-4 font-bold text-xs uppercase">{closure.profile?.full_name}</td>
                  <td className="p-4 text-right font-black text-base">${(closure.system_expected_total || closure.system_total || 0).toFixed(2)}</td>
                  <td className="p-4 text-right">
                    <span className={cn(
                      "font-black text-xs px-2 py-1 rounded",
                      (closure.difference || 0) < 0 ? 'text-destructive bg-destructive/10' : 'text-green-600 bg-green-500/10'
                    )}>
                      ${(closure.difference || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center">
                      <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-primary hover:text-white transition-all active:scale-95">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {cashClosures.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground uppercase font-black tracking-widest text-xs">
                    Sin registros de cierre
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
