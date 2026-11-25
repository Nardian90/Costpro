'use client';

import React, { useEffect, useId, useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PromptOptions } from './types';

/**
 * CP-UX-FINAL-POLISH-003 §2.2-C — PromptDialog.
 *
 * Solicitud de un valor o texto al usuario mediante un formulario integrado en
 * la aplicación (sustituye a `prompt()` nativo). No es un input improvisado:
 * valida, muestra el error en línea, bloquea la confirmación inválida y gestiona
 * foco y teclado (Enter confirma, ESC cancela).
 */

interface PromptDialogProps extends PromptOptions {
  open: boolean;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
  isConfirming?: boolean;
}

export function PromptDialog({
  open,
  title,
  message,
  label,
  placeholder,
  initialValue = '',
  type = 'text',
  optional = false,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  validate,
  onConfirm,
  onCancel,
  isConfirming = false,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  // Reinicia el estado del formulario cada vez que se abre (sin residuos).
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConfirming) return;
    const trimmed = value.trim();
    if (!optional && !trimmed) {
      setError('Este campo es obligatorio.');
      return;
    }
    const validationError = validate?.(trimmed) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }
    onConfirm(trimmed);
  };

  const handleChange = (next: string) => {
    setValue(next);
    if (error) setError(null);
  };

  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => { if (!o && !isConfirming && onCancel) onCancel(); }}
      title={<span className="text-base font-black uppercase tracking-tight text-foreground">{title}</span>}
      description={message}
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
            type="submit"
            form={formId}
            disabled={isConfirming}
            className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs"
            aria-label={confirmLabel}
          >
            {isConfirming ? 'Procesando...' : confirmLabel}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="py-2 space-y-3">
        {label && (
          <label htmlFor={`${formId}-input`} className="text-xs font-black uppercase tracking-widest text-muted-foreground block">
            {label}
            {optional && <span className="normal-case font-medium text-muted-foreground/70"> (opcional)</span>}
          </label>
        )}
        {type === 'textarea' ? (
          <textarea
            id={`${formId}-input`}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            autoFocus
            disabled={isConfirming}
            className={cn(
              'w-full px-3 py-2 rounded-xl border bg-background text-sm min-h-[44px] resize-y',
              error ? 'border-destructive focus-visible:outline-destructive/40' : 'border-border',
            )}
          />
        ) : (
          <input
            id={`${formId}-input`}
            type={type}
            inputMode={type === 'number' ? 'decimal' : undefined}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
            disabled={isConfirming}
            data-testid="dialog-input"
            className={cn(
              'w-full px-3 py-2 rounded-xl border bg-background text-sm min-h-[44px]',
              error ? 'border-destructive focus-visible:outline-destructive/40' : 'border-border',
            )}
          />
        )}
        {error && (
          <p role="alert" className="text-xs font-bold text-destructive">{error}</p>
        )}
      </form>
    </BaseModal>
  );
}

export default PromptDialog;
