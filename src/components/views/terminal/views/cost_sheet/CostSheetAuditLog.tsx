'use client';


import React, { memo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AuditEntry } from '@/lib/cost-engine/types';
import { Clock, Info, AlertTriangle, Zap, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostSheetAuditLogProps {
  audits: AuditEntry[];
}

export const CostSheetAuditLog: React.FC<CostSheetAuditLogProps> = memo(({ audits }) => {
  if (!audits || audits.length === 0) return null;

  return (
    <Card className="mt-8 border-primary/10 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-primary">
                <Clock className="w-4 h-4" />
                Bitácora de Auditoría (Motor Declarativo)
            </CardTitle>
            <Badge variant="outline" className="text-xs font-bold border-primary/20 text-primary">
                {audits.length} EVENTOS
            </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-3">
            {audits.map((audit, i) => (
              <div
                key={i}
                className="group flex gap-4 p-3 bg-background/50 border border-border/50 rounded-xl text-xs items-start hover:border-primary/30 transition-all"
              >
                 <div className="mt-1">
                     <StatusIcon type={audit.type} />
                 </div>
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-primary uppercase">Fila {audit.rowId}</span>
                      <Badge variant="secondary" className="text-xs h-4 uppercase tracking-tighter">
                        {audit.type}
                      </Badge>
                   </div>
                   <p className="text-muted-foreground font-medium line-clamp-2 group-hover:line-clamp-none transition-all">
                     {audit.note}
                   </p>
                   {audit.prev !== undefined && (
                      <div className="mt-2 font-mono text-xs bg-primary/5 p-1.5 rounded-lg border border-primary/10 inline-flex items-center gap-2">
                        <span className="text-muted-foreground">{audit.prev}</span>
                        <Zap className="w-2.5 h-2.5 text-primary opacity-50" />
                        <span className="text-primary font-bold">{audit.now}</span>
                      </div>
                   )}
                 </div>
                 <div className="text-xs font-bold text-muted-foreground/50 tabular-nums">
                   {(() => {
                      const d = new Date(audit.ts);
                      return isNaN(d.getTime()) ? '--:--:--' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                   })()}
                 </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
});

function StatusIcon({ type }: { type: AuditEntry['type'] }) {
    switch (type) {
        case 'ERROR': return <AlertTriangle className="w-4 h-4 text-destructive" />;
        case 'WARNING': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
        case 'RULE_APPLIED': return <Zap className="w-4 h-4 text-green-500" />;
        case 'CYCLE_DETECTED': return <RefreshCw className="w-4 h-4 text-purple-500 animate-spin-slow" />;
        default: return <Info className="w-4 h-4 text-primary/50" />;
    }
}
