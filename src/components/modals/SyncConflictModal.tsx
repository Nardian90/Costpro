'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, RefreshCw, Server, Laptop, ChevronRight } from 'lucide-react';
import { PrimaryButton } from '@/components/ui/atomic';
import { offlineStorage } from '@/lib/sync/offline-storage';
import { useSyncContext } from '@/components/providers/SyncProvider';

export function SyncConflictModal() {
  const { status, processQueue } = useSyncContext();
  const [isOpen, setIsOpen] = useState(false);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [editingPayload, setEditingPayload] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'conflict') {
      loadConflicts();
    }
  }, [status]);

  const loadConflicts = async () => {
    const queue = await offlineStorage.getQueue();
    const conflictOps = queue.filter(op => op.status === 'failed' && op.lastError?.includes('Conflict'));
    setConflicts(conflictOps);
    if (conflictOps.length > 0) setIsOpen(true);
  };

  const resolveConflict = async (idempotencyKey: string, strategy: 'client' | 'server') => {
    if (strategy === 'client') {
      // Mark as pending to retry
      await offlineStorage.updateOperationStatus(idempotencyKey, 'pending');
    } else {
      // Mark as synced to skip
      await offlineStorage.updateOperationStatus(idempotencyKey, 'synced');
    }

    const remaining = conflicts.filter(c => c.idempotencyKey !== idempotencyKey);
    setConflicts(remaining);

    if (remaining.length === 0) {
      setIsOpen(false);
      processQueue();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl !rounded-3xl border-white/5 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-danger">
            <AlertTriangle className="w-6 h-6" />
            Conflictos de Sincronización
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <p className="text-sm text-muted-foreground">
            Se han detectado cambios que entran en conflicto con la versión del servidor.
            Por favor, elige cómo resolver cada uno.
          </p>

          <div className="max-h-[40vh] overflow-y-auto space-y-4 pr-2">
            {conflicts.map((conflict) => (
              <div key={conflict.idempotencyKey} className="neu-card !p-4 border-danger/20">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {conflict.entity}
                    </span>
                    <h4 className="font-bold mt-1 text-sm">Op: {conflict.idempotencyKey.substring(0, 8)}</h4>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{new Date(conflict.createdAt).toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
                      <Laptop className="w-3 h-3" /> Tu Cambio (Local)
                    </div>
                    {editingPayload && activeKey === conflict.idempotencyKey ? (
                      <textarea
                        value={editingPayload}
                        onChange={(e) => setEditingPayload(e.target.value)}
                        className="text-[10px] bg-black/20 p-2 rounded w-full h-32 font-mono"
                      />
                    ) : (
                      <pre className="text-[10px] bg-black/20 p-2 rounded overflow-x-auto max-h-32">
                        {JSON.stringify(conflict.payload, null, 2)}
                      </pre>
                    )}
                    {!editingPayload && (
                      <button
                        onClick={() => {
                          setEditingPayload(JSON.stringify(conflict.payload, null, 2));
                          setActiveKey(conflict.idempotencyKey);
                        }}
                        className="text-[9px] text-primary hover:underline font-bold"
                      >
                        Editar campos
                      </button>
                    )}
                    {editingPayload && activeKey === conflict.idempotencyKey && (
                      <button
                        onClick={async () => {
                          try {
                            const newPayload = JSON.parse(editingPayload);
                            await offlineStorage.updateOperation(conflict.idempotencyKey, {
                              payload: newPayload,
                              status: 'pending'
                            });
                            setEditingPayload(null);
                            setActiveKey(null);
                            loadConflicts();
                          } catch (e) {
                            alert('JSON inválido');
                          }
                        }}
                        className="text-[9px] text-success hover:underline font-bold"
                      >
                        Guardar cambios
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
                      <Server className="w-3 h-3" /> Versión Servidor
                    </div>
                    <pre className="text-[10px] bg-black/10 p-2 rounded overflow-x-auto max-h-32">
                      {JSON.stringify(conflict.serverData || { message: "Sin datos del servidor" }, null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => resolveConflict(conflict.idempotencyKey, 'server')}
                    className="flex-1 neu-btn text-[10px] font-black uppercase py-2 hover:bg-muted"
                  >
                    Mantener Servidor
                  </button>
                  <button
                    onClick={() => resolveConflict(conflict.idempotencyKey, 'client')}
                    className="flex-1 neu-btn-primary text-[10px] font-black uppercase py-2"
                  >
                    Sobrescribir con Local
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="sm:justify-between flex-row gap-4">
          <button
            onClick={() => setIsOpen(false)}
            className="neu-btn px-6 py-2 text-xs font-black uppercase"
          >
            Cerrar
          </button>
          <PrimaryButton
            label="Procesar Restantes"
            icon={RefreshCw}
            onClick={() => {
              setIsOpen(false);
              processQueue();
            }}
            className="flex-1"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
