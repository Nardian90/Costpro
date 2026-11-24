'use client';

import React, { useEffect } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertVariant } from './types';

/**
 * CP-UX-FINAL-POLISH-003 §2.2-B — InfoDialog (AlertDialog conceptual).
 *
 * Mensajes importantes de COSTPRO: operación completada, advertencias, errores,
 * restricciones e información relevante. Sustituye a `alert()` nativo con una
 * presentación profesional integrada en el sistema de temas.
 *
 * Accesibilidad:
 *  - `role="alertdialog"` en variantes warning/error; `role="dialog"` en info/success.
 *  - Foco gestionado por BaseModal; Enter/ESC cierran.
 *  - Botón único min-h-[44px].
 */

interface InfoDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  /** Variante (default: «info»). */
  variant?: AlertVariant;
  /** Texto del botón único (default: «Entendido»). */
  confirmLabel?: string;
  onClose: () => void;
}

const VARIANT_CONFIG: Record<AlertVariant, {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  iconBg: string;
  buttonVariant: 'default' | 'destructive';
}> = {
  info: {
    icon: Info,
    iconClass: 'text-info',
    iconBg: 'bg-info/10',
    buttonVariant: 'default',
  },
  success: {
    icon: CheckCircle2,
    iconClass: 'text-success',
    iconBg: 'bg-success/10',
    buttonVariant: 'default',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    iconBg: 'bg-warning/10',
    buttonVariant: 'default',
  },
  error: {
    icon: XCircle,
    iconClass: 'text-destructive',
    iconBg: 'bg-destructive/10',
    buttonVariant: 'destructive',
  },
};

export function InfoDialog({
  open,
  title,
  message,
  variant = 'info',
  confirmLabel = 'Entendido',
  onClose,
}: InfoDialogProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  // Enter cierra (soporte de teclado).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
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
      footer={
        <div className="flex w-full">
          <Button
            variant={config.buttonVariant}
            type="button"
            onClick={onClose}
            className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs"
            aria-label={confirmLabel}
            data-testid="dialog-confirm"
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="py-2" role={variant === 'warning' || variant === 'error' ? 'alertdialog' : 'dialog'} aria-label={title} aria-live="assertive">
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>
    </BaseModal>
  );
}

export default InfoDialog;
