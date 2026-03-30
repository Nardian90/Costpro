"use client";
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, TrendingUp, TrendingDown, History, Info } from 'lucide-react';
import { Pick3LedgerEntry, Pick3Profile } from '@/types/pick3';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BankrollDashboardProps {
  profile: Pick3Profile;
  ledger: Pick3LedgerEntry[];
}

export function BankrollDashboard({ profile, ledger }: BankrollDashboardProps) {
  const formatMoney = (cents: number) => {
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  const netProfit = profile.current_bankroll - profile.initial_bankroll;
  const roi = (netProfit / (profile.initial_bankroll || 1)) * 100;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-[28px] bg-primary text-white border-none shadow-xl overflow-hidden relative group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest opacity-80 flex items-center gap-2">
              <Wallet className="w-3 h-3" /> Capital Actual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black italic">{formatMoney(profile.current_bankroll)}</div>
            <p className="text-[10px] font-bold mt-1 opacity-70 italic uppercase">Balance Transaccional Protegido</p>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              {netProfit >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
              Ganancia Neta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-black italic", netProfit >= 0 ? "text-emerald-500" : "text-red-500")}>
              {netProfit >= 0 ? "+" : ""}{formatMoney(netProfit)}
            </div>
            <Badge variant="outline" className={cn("mt-2 font-black italic", netProfit >= 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100")}>
              ROI: {roi.toFixed(2)}%
            </Badge>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <History className="w-3 h-3 text-blue-500" /> Capital Inicial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black italic opacity-60">{formatMoney(profile.initial_bankroll)}</div>
            <p className="text-[10px] font-bold mt-1 text-muted-foreground italic uppercase">Desde: {format(new Date(profile.updated_at), 'dd MMM yyyy')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Ledger */}
      <Card className="rounded-[32px] border-border shadow-lg">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Historial de Libro Mayor (Ledger)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ScrollArea className="h-[300px] px-6">
            <div className="space-y-4 pb-4">
              {ledger.length === 0 ? (
                <div className="text-center py-12 opacity-40">
                  <Info className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-xs font-black uppercase">No hay transacciones registradas</p>
                </div>
              ) : (
                ledger.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-4 rounded-2xl bg-muted/20 border border-border/50 group hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border-2",
                        entry.type === 'win' ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" :
                        entry.type === 'bet' ? "bg-orange-500/10 border-orange-500 text-orange-500" :
                        "bg-blue-500/10 border-blue-500 text-blue-500"
                      )}>
                         {entry.type === 'win' ? <TrendingUp className="w-4 h-4" /> : entry.type === 'bet' ? <TrendingDown className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-tight">
                          {entry.type === 'initial_deposit' ? 'Depósito Inicial' :
                           entry.type === 'bet' ? 'Apuesta Realizada' :
                           entry.type === 'win' ? 'Premio Cobrado' : 'Ajuste de Saldo'}
                        </div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">
                          {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm')}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        "text-sm font-black italic",
                        entry.type === 'win' || entry.type === 'initial_deposit' ? "text-emerald-500" : "text-red-500"
                      )}>
                        {entry.type === 'win' || entry.type === 'initial_deposit' ? "+" : "-"}{formatMoney(Math.abs(entry.amount))}
                      </div>
                      <div className="text-[9px] font-bold text-muted-foreground uppercase">
                        Saldo: {formatMoney(entry.balance_after)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Risk Disclaimer Fixed */}
      <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20">
         <p className="text-[10px] font-black text-red-600 uppercase flex items-center gap-2">
            <ShieldAlert className="w-3 h-3" /> Advertencia Ética
         </p>
         <p className="text-[9px] font-bold text-red-600/70 italic mt-1 leading-relaxed">
            Este sistema es una herramienta de simulación estadística. El juego conlleva riesgos financieros. No existe garantía de lucro.
         </p>
      </div>
    </div>
  );
}

// Re-using ShieldAlert icon
function ShieldAlert(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 14 4-4" />
      <path d="m16 14-4-4" />
      <path d="M12 3a12 12 0 0 0-8.5 3.5L2 9l.5 2" />
      <path d="M12 21a12 12 0 0 1-8.5-3.5L2 15l.5-2" />
      <path d="M12 3a12 12 0 0 1 8.5 3.5L22 9l-.5 2" />
      <path d="M12 21a12 12 0 0 0 8.5-3.5L22 15l-.5-2" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}
