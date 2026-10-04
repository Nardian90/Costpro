'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * REMEDIACIÓN (fix/users-multistore-admin-password)
 * SetPasswordModal — el Super Admin establece una contraseña nueva para un
 * usuario existente (aunque esté autenticado). Caso de producto: usuarios
 * finales con baja alfabetización digital que necesitan que administración
 * les entregue una contraseña directamente.
 *
 * Seguridad:
 * - La contraseña viaja SOLO por POST server-side (/api/users/reset-password,
 *   conRole('admin') → auth.admin.updateUserById). Nunca se persiste en
 *   localStorage/sessionStorage/Zustand, ni se loguea, ni se audita.
 * - Validaciones: política existente (mín. 8 — resetPasswordSchema) +
 *   coincidencia + prevención de doble submit.
 * - Accesibilidad: labels asociados, aria-invalid, aria-describedby para
 *   errores, focus del primer campo al abrir.
 */

export interface SetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userId: string, newPassword: string) => Promise<boolean>;
  /** Usuario objetivo (solo identificación: nombre + email). */
  user: { id: string; full_name?: string | null; email?: string | null } | null;
}

const MIN_PASSWORD_LENGTH = 8;

export function SetPasswordModal({ isOpen, onClose, onSubmit, user }: SetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset al abrir/cerrar — la contraseña nunca persiste entre aperturas.
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setError(null);
      setIsSubmitting(false);
      // Focus accesible al primer campo tras montar el diálogo.
      const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit = Boolean(user?.id) && !isSubmitting && password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || isSubmitting) return; // prevención de doble submit

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const success = await onSubmit(user.id, password);
    setIsSubmitting(false);

    if (success) {
      onClose();
    } else {
      // El handler ya muestra el toast del error de servidor; el modal queda
      // abierto para reintentar. Los campos sensibles se limpian por higiene.
      setPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}
      title="Cambiar contraseña"
      description="El usuario usará esta contraseña en su próximo inicio de sesión."
      maxWidth="sm:max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Usuario objetivo — identificación clara, sin datos sensibles */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Usuario
          </p>
          <p className="text-sm font-bold text-foreground truncate">
            {user?.full_name || 'Usuario'}
          </p>
          <p className="text-xs font-mono text-muted-foreground truncate">
            {user?.email || ''}
          </p>
        </div>

        <div>
          <label htmlFor="set-password-new" className="text-xs font-black uppercase text-primary tracking-widest mb-1.5 block">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              ref={firstFieldRef}
              id="set-password-new"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={isSubmitting}
              aria-invalid={Boolean(tooShort)}
              aria-describedby={tooShort ? 'set-password-new-error' : undefined}
              className="w-full h-11 px-3 pr-11 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {tooShort && (
            <p id="set-password-new-error" className="text-xs text-destructive font-bold mt-1">
              La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="set-password-confirm" className="text-xs font-black uppercase text-primary tracking-widest mb-1.5 block">
            Confirmar contraseña
          </label>
          <input
            id="set-password-confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(mismatch)}
            aria-describedby={mismatch ? 'set-password-confirm-error' : undefined}
            className={cn(
              'w-full h-11 px-3 rounded-xl border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50',
              mismatch ? 'border-destructive' : 'border-border'
            )}
            placeholder="Repetir la nueva contraseña"
          />
          {mismatch && (
            <p id="set-password-confirm-error" className="text-xs text-destructive font-bold mt-1">
              Las contraseñas no coinciden.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive font-bold uppercase tracking-wide">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px]"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="min-h-[44px] bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                Confirmar contraseña
              </>
            )}
          </Button>
        </div>
      </form>
    </BaseModal>
  );
}
