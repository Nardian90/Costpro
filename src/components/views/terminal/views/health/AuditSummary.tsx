'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, History, User, Terminal, Calendar } from 'lucide-react';
import { useAuditLogs } from '@/hooks/api/useAuditLogs';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function AuditSummary() {
  const { data: logs, isLoading } = useAuditLogs({ limit: 5 });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-card/50 rounded-xl w-1/3" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-card/30 rounded-2xl border border-border/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Resultados de Auditoría</h3>
        </div>
        <div className="text-[10px] font-black text-muted-foreground bg-background/50 px-2 py-1 rounded-md border border-border/30 uppercase tracking-widest">
          Últimas 5 acciones
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {logs && logs.length > 0 ? (
          logs.map((log, idx) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="group p-4 rounded-2xl bg-card/30 border border-border/50 hover:border-primary/30 transition-all flex items-center gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />

              <div className="w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center shrink-0 border border-border/50 group-hover:scale-110 transition-transform">
                <Terminal className="w-5 h-5 text-primary/60 group-hover:text-primary transition-colors" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary truncate mr-2">
                    {log.action.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Calendar className="w-3 h-3 text-muted-foreground/40" />
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">
                      {format(new Date(log.created_at), 'HH:mm:ss', { locale: es })}
                    </span>
                  </div>
                </div>

                <div className="text-xs font-bold text-foreground/80 truncate mb-1">
                  {log.description}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 opacity-60">
                    <User className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">
                      {log.profile?.full_name || 'Sistema'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-40">
                    <History className="w-3 h-3" />
                    <span className="text-[9px] font-bold uppercase tracking-tighter">
                      {log.entity_name}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="py-10 text-center bg-card/20 rounded-3xl border border-dashed border-border/50 opacity-40">
            <p className="text-[10px] font-black uppercase tracking-widest">Sin eventos recientes</p>
          </div>
        )}
      </div>
    </div>
  );
}
