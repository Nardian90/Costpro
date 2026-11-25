'use client';

import React, { useId } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConfirmVariant } from './types';

/**
 * CP-UX-FINAL-POLISH-003 §2.2 — ConfirmDialog compartido de COSTPRO.
 *
 * Versión promovida desde `views/cost_sheet/ConfirmDialog.tsx` (P3-1) para servir
 * a toda la aplicación como reemplazo de `confirm()` nativo en confirmaciones
 * simples. Para eliminaciones graves con verificación tipo-escribir, usar
 * `DestructiveConfirmModal`.
 *
 * Accesibilidad:
 *  - `role="alertdialog"` semántico para lectores de pantalla.
 *  - Foco inicial y trap heredados de BaseModal (Radix Dialog).
 *  - Enter confirma, ESC cancela (Radix), click fuera cancela.
 *  - Botones min-h-[44px] (mobile-first elderly).
 *  - Bloqueo de confirmaciones duplicadas vía `isConfirming`.
 */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  /** Variante visual del botón de confirmación. */
  variant?: ConfirmVariant;
  /** Texto del botón de confirmación (default: «Confirmar»). */
  confirmLabel?: string;
  /** Texto del botón de cancelación (default: «Cancelar»). */
  cancelLabel?: string;
  /** Callback al confirmar (también via Enter). */
  onConfirm: () => void;
  /** Callback al cancelar (ESC, click fuera, botón). */
  onCancel?: () => void;
  /** Deshabilitar acciones durante operación asíncrona. */
  isConfirming?: boolean;
  /** Ocultar el botón X del encabezado (default: false, como en cost_sheet). */
  showCloseButton?: boolean;
}

const VARIANT_CONFIG: Record<ConfirmVariant, {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  iconBg: string;
  buttonVariant: 'default' | 'destructive';
}> = {
  default: {
    icon: Info,
    iconClass: 'text-primary',
    iconBg: 'bg-primary/10',
    buttonVariant: 'default',
  },
  destructive: {
    icon: Trash2,
    iconClass: 'text-destructive',
    iconBg: 'bg-destructive/10',
    buttonVariant: 'destructive',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    iconBg: 'bg-warning/10',
    buttonVariant: 'default',
  },
};

export function ConfirmDialog({
  open,
  title,
  message,
  variant = 'default',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  isConfirming = false,
  showCloseButton = true,
}: ConfirmDialogProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;
  const formId = useId();

  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => { if (!o && !isConfirming && onCancel) onCancel(); }}
      title={
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', config.iconBg)}>
            <Icon className={cn('w-5 h-5', config.iconClass)} aria-hidden="true" />
          </div>
          <span className="text-base font-black uppercase tracking-tight text-foreground">{title}</span>
        </div>
      }
      maxWidth="sm:max-w-md"
      aria-label={title}
      showCloseButton={showCloseButton}
      footer={
        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs"
            aria-label={cancelLabel}
            data-testid="dialog-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={config.buttonVariant}
            type="submit"
            form={formId}
            disabled={isConfirming}
            className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs"
            aria-label={confirmLabel}
            data-testid="dialog-confirm"
          >
            {isConfirming ? 'Procesando...' : confirmLabel}
          </Button>
        </div>
      }
    >
      {/* Form invisible: Enter confirma (soporte de teclado completo). */}
      <form id={formId} onSubmit={(e) => { e.preventDefault(); if (!isConfirming) onConfirm(); }}>
        <div className="py-2" role="alertdialog" aria-label={title}>
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>
      </form>
    </BaseModal>
  );
}

export default ConfirmDialog;
