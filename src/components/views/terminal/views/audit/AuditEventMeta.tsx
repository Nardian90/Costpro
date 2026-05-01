import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AuditEventMetaProps {
  oldData: any;
  newData: any;
  metadata: any;
}

import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function AuditEventMeta({ oldData, newData, metadata }: AuditEventMetaProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasData = oldData || newData || (metadata && Object.keys(metadata).length > 0);

  if (!hasData) return null;

  const renderDiff = () => {
    if (!oldData || !newData) return null;

    const changes: React.ReactNode[] = [];
    const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    const labelMap: Record<string, string> = {
      'price': 'Precio Venta',
      'sale_price': 'Precio Venta',
      'cost_price': 'Costo',
      'cost': 'Costo Promedio',
      'full_name': 'Nombre Completo',
      'role': 'Rol',
      'quantity': 'Stock',
      'is_active': 'Estado Activo',
      'active_store_id': 'ID Tienda Activa',
      'name': 'Nombre'
    };

    const formatValue = (key: string, val: any) => {
        if (val === null || val === undefined) return 'N/A';
        if (typeof val === 'boolean') return val ? 'SÍ' : 'NO';
        if (['price', 'sale_price', 'cost_price', 'cost'].includes(key)) return formatCurrency(val);
        return String(val);
    };

    for (const key of keys) {
      if (oldData[key] !== newData[key] && key !== 'updated_at') {
        changes.push(
          <div key={key} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
            <span className="font-bold text-muted-foreground w-24 shrink-0 uppercase tracking-tighter text-xs">
                {labelMap[key] || key.replace(/_/g, ' ')}:
            </span>
            <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-destructive line-through truncate">{formatValue(key, oldData[key])}</span>
                <ArrowRight size={10} className="text-muted-foreground shrink-0" />
                <span className="text-green-600 font-black truncate">{formatValue(key, newData[key])}</span>
            </div>
          </div>
        );
      }
    }

    if (changes.length === 0) return null;

    return (
      <div className="bg-background/50 rounded-xl p-3 border border-border/50 mb-3">
        <div className="text-xs font-black text-primary/70 uppercase tracking-widest mb-2 border-b border-primary/10 pb-1">Cambios Detectados</div>
        <div className="space-y-0.5">
          {changes}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs font-black uppercase text-muted-foreground hover:text-primary transition-colors"
      >
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {isOpen ? 'Ocultar detalles' : 'Ver detalles'}
      </button>

      {isOpen && (
        <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/50 font-mono text-xs space-y-3 overflow-hidden">
          {renderDiff()}

          {metadata && Object.keys(metadata).length > 0 && (
            <div>
              <div className="text-primary font-bold mb-1 opacity-70">METADATA</div>
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(metadata, null, 2)}</pre>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {oldData && (
              <div>
                <div className="text-destructive font-bold mb-1 opacity-70 uppercase">Anterior (JSON)</div>
                <pre className="whitespace-pre-wrap break-all p-2 bg-destructive/5 rounded border border-destructive/10">
                  {JSON.stringify(oldData, null, 2)}
                </pre>
              </div>
            )}
            {newData && (
              <div>
                <div className="text-green-600 font-bold mb-1 opacity-70 uppercase">Nuevo (JSON)</div>
                <pre className="whitespace-pre-wrap break-all p-2 bg-green-500/5 rounded border border-green-500/10">
                  {JSON.stringify(newData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
