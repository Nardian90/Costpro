import React, { useMemo } from 'react';
import { AuditLog } from '@/types';
import AuditEventCard from './AuditEventCard';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDate } from '@/lib/utils';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface AuditTimelineProps {
  logs: AuditLog[];
}

export default function AuditTimeline({ logs }: AuditTimelineProps) {
  const prefersReducedMotion = useReducedMotion();
  const [visibleCount, setVisibleCount] = React.useState(50);

  const groupedLogs = useMemo(() => {
    const groups: Record<string, AuditLog[]> = {};

    logs.forEach(log => {
      const date = new Date(log.created_at);
      let dateStr = format(date, 'yyyy-MM-dd');

      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(log);
    });

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  const visibleLogIds = useMemo(() => new Set(logs.slice(0, visibleCount).map(l => l.id)), [logs, visibleCount]);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
          <span className="text-4xl">🔍</span>
        </div>
        <h3 className="text-xl font-black uppercase text-foreground mb-2">Sin actividad</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          No se encontraron eventos de auditoría que coincidan con los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <AnimatePresence mode="popLayout">
        {groupedLogs.map(([dateStr, items]) => {
          // Filter items to only those that are within the visibleCount
          const itemsToShow = items.filter(item => visibleLogIds.has(item.id));
          if (itemsToShow.length === 0) return null;

          const date = new Date(dateStr + 'T00:00:00');
          let displayDate = formatDate(date);

          if (isToday(date)) displayDate = 'Hoy';
          else if (isYesterday(date)) displayDate = 'Ayer';

          return (
            <motion.div
              key={dateStr}
              initial={{ opacity: 0, y: 20 }}
              animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95 }}
              className="mb-12 last:mb-0"
            >
              <div className="sticky top-0 z-20 py-2 bg-background/80 backdrop-blur-md mb-6">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary bg-primary/5 px-3 py-1.5 rounded-full inline-block border border-primary/10">
                  {displayDate}
                </h3>
              </div>

              <div className="space-y-0">
                {itemsToShow.map((log) => (
                  <AuditEventCard key={log.id} log={log} />
                ))}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {visibleCount < logs.length && (
        <div className="flex justify-center mt-8 pb-10">
          <button type="button"
            onClick={() => setVisibleCount(prev => prev + 50)}
            className="px-8 py-3 rounded-full bg-primary/10 text-primary border border-primary/20 font-black uppercase text-xs tracking-widest hover:bg-primary hover:text-foreground transition-all shadow-lg hover:shadow-primary/25"
          >
            Cargar más eventos (+{Math.min(50, logs.length - visibleCount)})
          </button>
        </div>
      )}
    </div>
  );
}
