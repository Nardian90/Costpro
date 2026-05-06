'use client';

import React, { useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuditLog } from '@/validation/schemas';
import { getAuditCategory } from './AuditEventIcon';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';

interface AuditTableViewProps {
  logs: any[];
}

export default function AuditTableView({ logs }: AuditTableViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 5,
  });

  return (
    <div className="table-scroll-wrapper border border-border rounded-2xl bg-card overflow-hidden">
      {/* Sticky header */}
      <table className="data-table w-full text-sm text-left">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
            <th className="p-4">Fecha y Hora</th>
            <th className="p-4">Usuario</th>
            <th className="p-4">Acción</th>
            <th className="p-4">Entidad</th>
            <th className="p-4">Detalles</th>
          </tr>
        </thead>
      </table>

      {/* Virtualized body */}
      <div ref={parentRef} className="overflow-auto" style={{ maxHeight: '500px' }}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const log = logs[virtualRow.index];
            const category = getAuditCategory(log.table_name, log.action);
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <table className="data-table w-full text-sm text-left">
                  <tbody className="divide-y divide-border/50">
                    <tr className="hover:bg-muted/30 transition-colors" aria-label={`Evento de auditoría: ${log.action}`}>
                      <td className="p-4 whitespace-nowrap font-medium text-xs">
                        {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm:ss', { locale: es })}
                      </td>
                      <td className="p-4" aria-label="Usuario del evento">
                        <div className="flex flex-col">
                          <span className="font-bold text-foreground">
                            {log.profile?.full_name || 'Sistema / Desconocido'}
                          </span>
                          <span className="text-[10px] uppercase text-muted-foreground font-black tracking-tighter">
                            {log.profile?.role || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter",
                          category === 'sales' ? "bg-green-500/10 text-green-600" :
                          category === 'inventory' ? "bg-blue-500/10 text-blue-600" :
                          category === 'adjustments' ? "bg-amber-500/10 text-amber-600" :
                          category === 'users' ? "bg-purple-500/10 text-purple-600" : "bg-muted text-muted-foreground"
                        )}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-4">
                         <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground uppercase">
                           {log.table_name}
                         </code>
                      </td>
                      <td className="p-4 max-w-xs">
                        <p className="text-xs text-muted-foreground line-clamp-2 italic">
                          {JSON.stringify(log.new_data || log.metadata || log.old_data || {})}
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
