import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Package, TrendingUp, ChevronRight, Target, Info, History, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchingTrace } from '@/lib/dexie';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ActionBadgesProps {
  appliedRules?: string[];
  trace?: MatchingTrace[];
  className?: string;
}

export function ActionBadges({ appliedRules, trace, className }: ActionBadgesProps) {
  if (!appliedRules || appliedRules.length === 0) return null;

  const badges = [
    { rule: 'HARD_REF', icon: <Target className="w-3 h-3" />, label: 'HARD_REF', color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { rule: 'EXACT_SUM', icon: <Target className="w-3 h-3" />, label: 'EXACT_SUM', color: 'text-green-600 bg-green-50 border-green-200' },
    { rule: 'PRICE_FLEX', icon: <TrendingUp className="w-3 h-3" />, label: 'PRICE_FLEX', color: 'text-orange-600 bg-orange-50 border-orange-200' },
    { rule: 'WILDCARDS', icon: <Package className="w-3 h-3" />, label: 'WILDCARDS', color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { rule: 'TOLERANCE', icon: <Info className="w-3 h-3" />, label: 'TOLERANCE', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
    { rule: 'CASH_FILL', icon: <ChevronRight className="w-3 h-3" />, label: 'CASH_FILL', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  ];

  return (
    <div className={cn("flex flex-wrap gap-1 items-center", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <div className="flex flex-wrap gap-1 cursor-pointer hover:opacity-80 transition-opacity">
            {badges.filter(b => appliedRules.includes(b.rule)).map((b, idx) => (
              <Badge key={idx} variant="outline" className={cn("px-1 h-5 text-[9px] font-black flex items-center gap-1 uppercase", b.color)}>
                {b.icon}
                {b.label}
              </Badge>
            ))}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 shadow-2xl rounded-2xl border-primary/20 overflow-hidden" align="end">
          <div className="bg-primary/5 p-3 border-b border-primary/10 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">Traza del Matching</span>
            </div>
            <Badge variant="outline" className="text-[10px] font-black">{appliedRules.length} Reglas</Badge>
          </div>
          <ScrollArea className="h-64">
            <div className="p-3 space-y-3">
              {trace && trace.length > 0 ? (
                trace.map((t, idx) => (
                  <div key={idx} className={cn("flex gap-3 relative pb-3", idx < trace.length - 1 && "border-l-2 border-muted ml-2 pl-4")}>
                    {idx < trace.length - 1 && <div className="absolute top-2 -left-[9px] w-4 h-4 rounded-full bg-background border-2 border-muted flex items-center justify-center">
                      <div className={cn("w-1.5 h-1.5 rounded-full", t.status === 'SUCCESS' ? 'bg-green-500' : 'bg-red-500')} />
                    </div>}
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className={cn("text-[10px] font-black uppercase", t.status === 'SUCCESS' ? 'text-green-600' : 'text-red-500')}>{t.rule}</span>
                        <span className="text-[9px] text-muted-foreground font-medium"><Clock className="w-2 h-2 inline mr-1" />{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <p className="text-[11px] font-bold text-foreground leading-tight">{t.reason || (t.status === 'SUCCESS' ? 'Regla aplicada exitosamente' : 'Fallo al aplicar regla')}</p>
                      {t.details && (
                        <div className="bg-muted/30 p-1.5 rounded text-[10px] font-mono text-muted-foreground break-all">
                          {JSON.stringify(t.details)}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-xs text-muted-foreground font-bold uppercase italic">Sin detalles de traza disponibles</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
