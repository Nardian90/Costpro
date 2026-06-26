'use client';

import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info, Trash2, Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * P3-1: ConfirmDialog — único componente de confirmación para todo el módulo COSTOS.
 *
 * Reemplaza a:
 *   - AlertDialog de Radix (verbose, ~15 líneas por diálogo).
 *   - BaseModal state-driven reimplementado en cada componente.
 *   - Custom div-based dialog en TemplateExplorer (G2-fix).
 *
 * API simple:
 *   <ConfirmDialog
 *     open={!!itemToDelete}
 *     title="Eliminar plantilla"
 *     message="¿Estás seguro? Esta acción no se puede deshacer."
 *     variant="destructive"
 *     confirmLabel="Eliminar"
 *     cancelLabel="Cancelar"
 *     onConfirm={() => { deleteItem(itemToDelete); setItemToDelete(null); }}
 *     onCancel={() => setItemToDelete(null)}
 *   />
 *
 * Mobile-first elderly:
 *   - min-h-[44px] en todos los botones.
 *   - text-xs mínimo.
 *   - Focus trap heredado de BaseModal.
 *   - ESC para cancelar (heredado de BaseModal).
 *   - Click outside para cancelar (heredado de BaseModal).
 *   - aria-label en botones.
 *   - role="alertdialog" semántico para lectores de pantalla.
 */

export type ConfirmDialogVariant = 'default' | 'destructive' | 'warning';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  /** Variante visual del botón de confirmación */
  variant?: ConfirmDialogVariant;
  /** Texto del botón de confirmación (default: "Confirmar") */
  confirmLabel?: string;
  /** Texto del botón de cancelación (default: "Cancelar") */
  cancelLabel?: string;
  /** Callback al confirmar */
  onConfirm: () => void;
  /** Callback al cancelar (ESC, click outside, botón cancelar) */
  onCancel?: () => void;
  /** Deshabilitar el botón de confirmación (ej: durante operación asíncrona) */
  isConfirming?: boolean;
}

const VARIANT_CONFIG: Record<ConfirmDialogVariant, {
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
}: ConfirmDialogProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => { if (!o && onCancel) onCancel(); }}
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
        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs"
            aria-label={cancelLabel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={config.buttonVariant}
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs"
            aria-label={confirmLabel}
          >
            {isConfirming ? 'Procesando...' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="py-2" role="alertdialog" aria-label={title}>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>
    </BaseModal>
  );
}

export default ConfirmDialog;
