'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import type { AuditLog } from '@/types';

interface AuditLogsViewProps {
  logs: AuditLog[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  dateRange: { from: string; to: string };
  onDateRangeChange: (range: { from: string; to: string }) => void;
}

export default function AuditLogsView({
  logs,
  searchTerm,
  onSearchChange,
  dateRange,
  onDateRangeChange
}: AuditLogsViewProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Auditoría</h2>

      <SearchBar
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Buscar logs por recurso o acción..."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Rango de Fechas</label>
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="date"
                        className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                        value={dateRange.from}
                        onChange={e => onDateRangeChange({ ...dateRange, from: e.target.value })}
                    />
                    <input
                        type="date"
                        className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                        value={dateRange.to}
                        onChange={e => onDateRangeChange({ ...dateRange, to: e.target.value })}
                    />
                </div>
            </div>
        </div>
      </SearchBar>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
              <th className="p-4 text-left">Fecha / Hora</th>
              <th className="p-4 text-left">Operador</th>
              <th className="p-4 text-left">Acción</th>
              <th className="p-4 text-left">Recurso</th>
              <th className="p-4 text-left">ID Registro</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="p-4">
                  <div className="font-bold text-xs">{new Date(log.created_at).toLocaleDateString()}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{new Date(log.created_at).toLocaleTimeString()}</div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-black border border-primary/20">
                      {((log as any).profile?.full_name || 'S')?.charAt(0)}
                    </div>
                    <div className="font-bold text-xs">{(log as any).profile?.full_name || 'Sistema'}</div>
                  </div>
                </td>
                <td className="p-4">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                    ['INSERT', 'CREATE', 'ADD'].includes(log.action) ? 'bg-green-500/10 text-green-600' :
                    ['UPDATE', 'EDIT'].includes(log.action) ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive'
                  )}>
                    {log.action}
                  </span>
                </td>
                <td className="p-4">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-muted/50 px-1.5 py-0.5 rounded">{log.table_name}</span>
                </td>
                <td className="p-4 font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
                  {log.record_id}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-muted-foreground uppercase font-black tracking-widest text-xs">
                  Sin registros de auditoría
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
