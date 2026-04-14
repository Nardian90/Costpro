import React from 'react';
import { StatusBadge } from './StatusBadge';

interface FileStatusTableProps {
  data: Array<{
    name: string;
    path: string;
    status: 'success' | 'warning' | 'destructive' | 'quarantine' | 'processing';
    confidence: number;
    lastUpdated: string;
  }>;
}

export const FileStatusTable: React.FC<FileStatusTableProps> = ({ data: files }) => {
  const translateStatus = (status: string) => {
    const map: Record<string, string> = {
      success: 'Completado',
      warning: 'Advertencia',
      destructive: 'Crítico',
      quarantine: 'Cuarentena',
      processing: 'Procesando'
    };
    return map[status] || status;
  };

  return (
    <div className="overflow-x-auto rounded-[32px] border border-border/50 bg-card">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-muted/30 border-b border-border/50">
            <th className="px-3 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Artefacto</th>
            <th className="hidden sm:table-cell px-3 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ruta</th>
            <th className="px-3 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Estado</th>
            <th className="px-3 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Confianza</th>
            <th className="hidden sm:table-cell px-3 sm:px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Actualizado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {files.map((file, idx) => (
            <tr key={idx} className="hover:bg-muted/10 transition-colors group">
              <td className="px-3 sm:px-6 py-4">
                <div className="font-black text-xs uppercase tracking-tight">{file.name}</div>
              </td>
              <td className="hidden sm:table-cell px-3 sm:px-6 py-4">
                <div className="font-mono text-[9px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded truncate max-w-[200px]" title={file.path}>
                  {file.path}
                </div>
              </td>
              <td className="px-3 sm:px-6 py-4 text-center">
                <StatusBadge status={file.status} label={translateStatus(file.status)} />
              </td>
              <td className="px-3 sm:px-6 py-4 text-center">
                <div className="text-xs font-black tracking-tighter">{(file.confidence * 100).toFixed(0)}%</div>
              </td>
              <td className="hidden sm:table-cell px-3 sm:px-6 py-4 text-right">
                <div className="text-[9px] font-bold text-muted-foreground uppercase">{file.lastUpdated}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
