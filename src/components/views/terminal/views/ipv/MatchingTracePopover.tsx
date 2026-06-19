'use client';

import React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  CircleDashed,
  Clock,
  Info,
  ChevronRight,
  TrendingUp,
  Target,
  Search,
  Zap,
  Package
} from 'lucide-react';
import { type MatchingTrace } from '@/lib/dexie';
import { cn } from '@/lib/utils';

interface MatchingTracePopoverProps {
  trace?: MatchingTrace[];
  confidence?: number;
  children: React.ReactNode;
}

export function MatchingTracePopover({ trace, confidence, children }: MatchingTracePopoverProps) {
  if (!trace || trace.length === 0) return <>{children}</>;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'FAIL': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'SKIPPED': return <CircleDashed className="w-4 h-4 text-muted-foreground/40" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRuleIcon = (rule: string) => {
    switch (rule) {
      case 'HARD_REF': return <Search className="w-3 h-3" />;
      case 'EXACT_SUM': return <Target className="w-3 h-3" />;
      case 'PRICE_FLEX': return <TrendingUp className="w-3 h-3" />;
      case 'WILDCARDS': return <Zap className="w-3 h-3" />;
      case 'TOLERANCE': return <Info className="w-3 h-3" />;
      case 'CASH_FILL': return <ChevronRight className="w-3 h-3" />;
      case 'AUTO_COMPLETE': return <CheckCircle2 className="w-3 h-3" />;
      default: return <Package className="w-3 h-3" />;
    }
  };

  const formatConfidence = (score?: number) => {
    if (score === undefined) return null;
    const percent = Math.round(score * 100);
    let color = 'text-destructive bg-red-50';
    if (percent >= 90) color = 'text-success bg-green-50';
    else if (percent >= 70) color = 'text-primary bg-blue-50';
    else if (percent >= 50) color = 'text-warning bg-orange-50';

    return (
        <Badge variant="outline" className={cn("text-[10px] font-black uppercase tracking-tighter px-1 h-4", color)}>
            Confianza: {percent}%
        </Badge>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="cursor-help">
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-2xl rounded-2xl border-primary/20 bg-card" align="center">
        <div className="p-4 border-b bg-muted/20">
          <div className="flex justify-between items-center mb-1">
            <h4 className="text-sm font-black uppercase tracking-tight">Trazabilidad del Motor</h4>
            {formatConfidence(confidence)}
          </div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase opacity-60">Auditoría paso a paso de la decisión</p>
        </div>

        <ScrollArea className="max-h-[400px]">
          <div className="p-4 space-y-6 relative">
            {/* Timeline Line */}
            <div className="absolute left-6 top-6 bottom-6 w-px bg-border/50" />

            {trace.map((item, idx) => (
              <div key={idx} className="relative pl-8 group">
                {/* Status Dot */}
                <div className={cn(
                  "absolute left-[18px] top-1 -translate-x-1/2 w-3 h-3 rounded-full border-2 bg-background z-10 transition-transform group-hover:scale-125",
                  item.status === 'SUCCESS' ? 'border-success' :
                  item.status === 'FAIL' ? 'border-red-400' : 'border-muted-foreground/30'
                )} />

                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[9px] font-black h-4 px-1 bg-muted/30">
                    PASS {item.pass}
                  </Badge>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground">
                    {getRuleIcon(item.rule)}
                    {item.rule.replace('_', ' ')}
                  </div>
                  <div className="ml-auto">
                    {getStatusIcon(item.status)}
                  </div>
                </div>

                {item.reason && (
                  <p className={cn(
                    "text-[10px] font-medium leading-relaxed",
                    item.status === 'SUCCESS' ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {item.reason}
                  </p>
                )}

                {item.details && (
                  <div className="mt-2 p-2 rounded-lg bg-muted/30 border border-border/30 overflow-hidden">
                    <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap">
                      {JSON.stringify(item.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 bg-muted/10 border-t">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase">
            <span>Algoritmo Pro matching v2.0</span>
            <span className="opacity-50 tracking-tighter">Powered by Jules Engine</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
