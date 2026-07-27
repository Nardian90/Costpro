'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, X, Loader2, CheckCircle2, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FailedOp {
  id: string;
  type: string;
  payload: any;
  error: string;
  timestamp: string;
}

interface OfflineConflictResolverProps {
  className?: string;
}

/**
 * OfflineConflictResolver — C3 FIX: UI para resolver operaciones offline fallidas.
 *
 * Muestra operaciones que fallaron al sincronizar (stock insuficiente, duplicadas, etc.)
 * y permite al usuario: reintentar, crear devolución, o descartar.
 */
export function OfflineConflictResolver({ className }: OfflineConflictResolverProps) {
  const [failedOps, setFailedOps] = useState<FailedOp[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    loadFailedOps();
  }, []);

  async function loadFailedOps() {
    setLoading(true);
    try {
      // Leer del Dexie/localStorage las ops con status 'failed'
      const stored = localStorage.getItem('offline-failed-ops');
      if (stored) {
        const ops = JSON.parse(stored) as FailedOp[];
        setFailedOps(ops);
      }
    } catch {
      // Si no hay Dexie o localStorage, no hay ops fallidas
      setFailedOps([]);
    } finally {
      setLoading(false);
    }
  }

  function removeOp(id: string) {
    const updated = failedOps.filter(op => op.id !== id);
    setFailedOps(updated);
    localStorage.setItem('offline-failed-ops', JSON.stringify(updated));
  }

  async function handleRetry(op: FailedOp) {
    setResolving(op.id);
    try {
      const response = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: [{ id: op.id, type: op.type, payload: op.payload }] }),
      });

      if (response.ok) {
        toast.success('Operación sincronizada correctamente');
        removeOp(op.id);
      } else {
        const data = await response.json();
        toast.error(`No se pudo sincronizar: ${data.error || 'Error desconocido'}`);
      }
    } catch (e) {
      toast.error('Error de conexión al reintentar');
    } finally {
      setResolving(null);
    }
  }

  async function handleDiscard(op: FailedOp) {
    if (!confirm('¿Descartar esta operación? No se podrá recuperar.')) return;
    removeOp(op.id);
    toast.success('Operación descartada');
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Verificando conflictos...</span>
      </div>
    );
  }

  if (failedOps.length === 0) {
    return null; // No mostrar nada si no hay conflictos
  }

  return (
    <div className={cn('rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2', className)}>
      <div className="flex items-center gap-2 text-warning">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-xs font-black uppercase tracking-widest">
          {failedOps.length} operación(es) offline con conflicto
        </span>
      </div>

      {failedOps.map(op => (
        <div key={op.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-card border border-border">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase">{op.type}</p>
            <p className="text-[10px] text-muted-foreground truncate">{op.error}</p>
            <p className="text-[10px] text-muted-foreground">{new Date(op.timestamp).toLocaleString('es-CU')}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => handleRetry(op)}
              disabled={resolving === op.id}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all active:scale-95 disabled:opacity-50"
              title="Reintentar sincronización"
              aria-label="Reintentar"
            >
              {resolving === op.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => handleDiscard(op)}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive hover:text-white transition-all active:scale-95"
              title="Descartar operación"
              aria-label="Descartar"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
