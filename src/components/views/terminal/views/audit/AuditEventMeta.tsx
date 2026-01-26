import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AuditEventMetaProps {
  oldData: any;
  newData: any;
  metadata: any;
}

export default function AuditEventMeta({ oldData, newData, metadata }: AuditEventMetaProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasData = oldData || newData || (metadata && Object.keys(metadata).length > 0);

  if (!hasData) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-[10px] font-black uppercase text-muted-foreground hover:text-primary transition-colors"
      >
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {isOpen ? 'Ocultar detalles' : 'Ver detalles'}
      </button>

      {isOpen && (
        <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/50 font-mono text-[10px] space-y-3 overflow-hidden">
          {metadata && Object.keys(metadata).length > 0 && (
            <div>
              <div className="text-primary font-bold mb-1 opacity-70">METADATA</div>
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(metadata, null, 2)}</pre>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {oldData && (
              <div>
                <div className="text-destructive font-bold mb-1 opacity-70 uppercase">Anterior</div>
                <pre className="whitespace-pre-wrap break-all p-2 bg-destructive/5 rounded border border-destructive/10">
                  {JSON.stringify(oldData, null, 2)}
                </pre>
              </div>
            )}
            {newData && (
              <div>
                <div className="text-green-600 font-bold mb-1 opacity-70 uppercase">Nuevo</div>
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
