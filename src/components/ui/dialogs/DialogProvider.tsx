'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { InfoDialog } from './InfoDialog';
import { PromptDialog } from './PromptDialog';
import type { AlertOptions, ConfirmOptions, PromptOptions } from './types';

/**
 * CP-UX-FINAL-POLISH-003 §2.2 — Infraestructura compartida de diálogos COSTPRO.
 *
 * API imperativa con promesas que sustituye a los diálogos nativos del navegador:
 *
 *   const dialogs = useDialogs();
 *   if (!(await dialogs.confirm({ title, message, variant: 'destructive' }))) return;
 *   const motivo = await dialogs.prompt({ title: 'Motivo', optional: true });
 *   await dialogs.alert({ title: 'Error al exportar', message, variant: 'error' });
 *
 * Características:
 *  - Cola FIFO: un solo diálogo visible a la vez (sin modales apilados sin control).
 *  - Sin confirmaciones duplicadas: mientras hay trabajo asíncrono (opts.onConfirm)
 *    el diálogo muestra «Procesando...» y bloquea acciones y cierre.
 *  - Temas Light/Dark vía tokens de COSTPRO (BaseModal/Radix + sonner-like UX).
 *  - Foco y teclado gestionados (Enter/ESC, focus trap de BaseModal).
 *  - Montado una sola vez en `src/app/layout.tsx`.
 */

type Request =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (value: boolean) => void; id: number }
  | { kind: 'alert'; opts: AlertOptions; resolve: () => void; id: number }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (value: string | null) => void; id: number };

interface DialogsApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogsContext = createContext<DialogsApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const [busy, setBusy] = useState(false);
  const queueRef = useRef<Request[]>([]);
  const seqRef = useRef(0);
  queueRef.current = queue;

  const current = queue[0] ?? null;

  const settle = useCallback((result: boolean | string | null) => {
    const req = queueRef.current[0];
    if (!req) return;
    setBusy(false);
    setQueue((q) => {
      const [, ...rest] = q;
      return rest;
    });
    switch (req.kind) {
      case 'confirm':
        req.resolve(result === true);
        break;
      case 'prompt':
        req.resolve(typeof result === 'string' ? result : null);
        break;
      case 'alert':
        req.resolve();
        break;
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (busy) return; // sin cierre durante procesamiento
    settle(false);
  }, [busy, settle]);

  const handleConfirm = useCallback(async () => {
    const req = queueRef.current[0];
    if (!req || busy) return;
    if (req.kind === 'confirm' && typeof req.opts.onConfirm === 'function') {
      try {
        setBusy(true);
        await req.opts.onConfirm();
      } finally {
        setBusy(false);
      }
    }
    settle(true);
  }, [busy, settle]);

  const handlePromptConfirm = useCallback((value: string) => {
    settle(value);
  }, [settle]);

  const api = useMemo<DialogsApi>(() => ({
    confirm: (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const id = ++seqRef.current;
        setQueue((q) => [...q, { kind: 'confirm', opts, resolve, id }]);
      }),
    alert: (opts: AlertOptions) =>
      new Promise<void>((resolve) => {
        const id = ++seqRef.current;
        setQueue((q) => [...q, { kind: 'alert', opts, resolve, id }]);
      }),
    prompt: (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        const id = ++seqRef.current;
        setQueue((q) => [...q, { kind: 'prompt', opts, resolve, id }]);
      }),
  }), []);

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {current?.kind === 'confirm' && (
        <ConfirmDialog
          key={`dialog-${current.id}`}
          open
          title={current.opts.title}
          message={current.opts.message}
          variant={current.opts.variant}
          confirmLabel={current.opts.confirmLabel}
          cancelLabel={current.opts.cancelLabel}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={busy}
        />
      )}
      {current?.kind === 'alert' && (
        <InfoDialog
          key={`dialog-${current.id}`}
          open
          title={current.opts.title}
          message={current.opts.message}
          variant={current.opts.variant}
          confirmLabel={current.opts.confirmLabel}
          onClose={() => settle(true)}
        />
      )}
      {current?.kind === 'prompt' && (
        <PromptDialog
          key={`dialog-${current.id}`}
          open
          title={current.opts.title}
          message={current.opts.message}
          label={current.opts.label}
          placeholder={current.opts.placeholder}
          initialValue={current.opts.initialValue}
          type={current.opts.type}
          optional={current.opts.optional}
          confirmLabel={current.opts.confirmLabel}
          cancelLabel={current.opts.cancelLabel}
          validate={current.opts.validate}
          onConfirm={handlePromptConfirm}
          onCancel={handleCancel}
          isConfirming={busy}
        />
      )}
    </DialogsContext.Provider>
  );
}

/**
 * Hook de acceso al sistema unificado de diálogos. Debe usarse dentro de
 * `<DialogProvider>` (montado en el layout raíz de la aplicación).
 */
export function useDialogs(): DialogsApi {
  const ctx = useContext(DialogsContext);
  if (!ctx) {
    throw new Error('useDialogs debe usarse dentro de <DialogProvider> (montado en src/app/layout.tsx).');
  }
  return ctx;
}
