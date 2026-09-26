'use client';

import React, { useState } from 'react';
import { Shield, Lock, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setSupervisorAuth, getSupervisorAuth, type SupervisorScopeEntry } from './supervisor-auth-store';
import { useAuthStore } from '@/store';

/**
 * SupervisorAuthModal — Pide PIN de supervisor para autorizar descuentos
 * que exceden el umbral configurado por tienda.
 *
 * V2.12.25: Implementa control de prevención de pérdidas estándar en POS
 * empresariales (Square, Shopify POS, SAP Retail).
 *
 * Flujo:
 * 1. El cajero intenta aplicar un descuento > max_discount_without_authorization
 * 2. Se abre este modal pidiendo PIN de supervisor/manager
 * 3. El PIN se valida contra user_store_memberships (role IN admin, manager)
 * 4. Si es válido, se autoriza el descuento; si no, se rechaza
 *
 * Por ahora el PIN es simple (password del usuario). En el futuro se puede
 * migrar a un PIN de 4 dígitos dedicado.
 *
 * E-SEC-FINAL (D2/D3 — decisión del responsable funcional):
 *   - D2: textarea de MOTIVO obligatorio (1..500 tras trim). El motivo viaja
 *     al checkout (`discount_reason`), se valida server-side y se almacena en
 *     la auditoría asociada a la línea/operación autorizada. Solo se muestra
 *     cuando el descuento excede el umbral (este modal SOLO se abre entonces).
 *   - D3: `scopeEntry` (opcional) — la línea autorizada en esta emisión
 *     (product_id, variant_id, unit_price resultante). El modal envía a
 *     supervisor-check el scope acumulado + esta entrada; el token firmado
 *     porta el scope completo y create_sale_v2 lo hace cumplir server-side.
 */

interface SupervisorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorize: (supervisorUserId?: string) => void;
  /** % del descuento (para percentage) o % efectivo calculado (para fixed).
   *  V2.12.30: antes solo se usaba para mostrar, ahora refleja el % efectivo
   *  real cuando el descuento es fijo (ej: $50 sobre $60 = 83.3%). */
  discountPercent: number;
  discountValue: number;
  maxAllowed: number;
  /** Tipo de descuento para mostrar el label correcto en el modal.
   *  V2.12.30: 'fixed' muestra "Descuento fijo de $X (Y% efectivo)" */
  discountType?: 'percentage' | 'fixed';
  /** E-SEC-FINAL (D3): línea autorizada en esta emisión (null = sin líneas,
   *  p.ej. descuento global del carrito). */
  scopeEntry?: SupervisorScopeEntry | null;
}

export function SupervisorAuthModal({
  isOpen,
  onClose,
  onAuthorize,
  discountPercent,
  discountValue,
  maxAllowed,
  discountType = 'percentage',
  scopeEntry = null,
}: SupervisorAuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= 1 && trimmedReason.length <= 500;

  const handleAuthorize = async () => {
    // E-SEC-FINAL (D2): el motivo es obligatorio en la autorización.
    if (!reasonValid) {
      setError('El motivo del descuento es obligatorio (1–500 caracteres).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Iteración 11.2: Server-side supervisor auth (no expone credenciales en cliente)
      const { supabase } = await import('@/lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      // E-SEC-FINAL (D3): scope acumulado de autorizaciones previas + la
      // entrada de esta emisión. El servidor lo firma dentro del token.
      const accumulatedScope = getSupervisorAuth()?.scope ?? [];
      const scope = [...accumulatedScope, ...(scopeEntry ? [scopeEntry] : [])];
      const response = await fetch('/api/auth/supervisor-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          email,
          password,
          // FIX E-SEC-FINAL (bloqueo del flujo D1-D3): la clave localStorage
          // 'activeStoreId' NUNCA es escrita por la app → store_id='' → 400
          // "Invalid data" en TODA autorización por UI desde la iteración 11.2.
          // La fuente de verdad del store activo es useAuthStore (la misma que
          // usa usePOSCheckout para el checkout).
          store_id: useAuthStore.getState().user?.activeStoreId || '',
          ...(scope.length > 0 ? { scope } : {}),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Error de validación' }));
        setError(err.error || 'Credenciales inválidas');
        return;
      }

      const data = await response.json();
      if (!data.valid) {
        setError(data.error || 'El usuario no tiene permisos de supervisor');
        return;
      }

      // Autorización exitosa — REM-INV-4A-R (RC-1): almacenar la prueba de
      // autorización firmada (token HMAC ligado a supervisor+operador+tienda)
      // que el checkout verificará server-side, y pasar el id al caller.
      // E-SEC-FINAL (D2/D3): almacena también el motivo y el scope acumulado.
      setSupervisorAuth(data.supervisor_user_id, data.supervisor_token, trimmedReason, scope);
      onAuthorize(data.supervisor_user_id);
      onClose();
      setEmail('');
      setPassword('');
      setReason('');
    } catch (e: any) {
      setError(e.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-amber-500/5">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-black uppercase tracking-widest">Autorización de Supervisor</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Advertencia */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-500">
                {discountType === 'fixed' ? (
                  <>
                    Descuento fijo de {discountValue.toFixed(2)} ({discountPercent.toFixed(1)}% efectivo)
                    {' '}excede el máximo permitido ({maxAllowed}%)
                  </>
                ) : (
                  <>
                    Descuento de {discountPercent.toFixed(1)}% excede el máximo permitido ({maxAllowed}%)
                  </>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {discountType === 'fixed' && (
                  <>Monto del descuento: {discountValue.toFixed(2)} CUP<br /></>
                )}
                Se requiere autorización de un supervisor o gerente.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">
                Email del supervisor
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="supervisor@costpro.com"
                className="w-full h-12 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-muted-foreground block mb-1">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && reasonValid && handleAuthorize()}
                placeholder="••••••••"
                className="w-full h-12 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold"
                autoComplete="current-password"
              />
            </div>
            {/* E-SEC-FINAL (D2): motivo obligatorio del descuento autorizado */}
            <div>
              <label htmlFor="supervisor-discount-reason" className="text-[10px] font-black uppercase text-muted-foreground block mb-1">
                Motivo del descuento <span className="text-destructive">*</span>
              </label>
              <textarea
                id="supervisor-discount-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Ej: cliente frecuente, mercancía dañada, liquidación autorizada..."
                className={cn(
                  'w-full bg-background border rounded-lg px-3 py-2 text-sm font-bold resize-none',
                  reason.trim().length > 0 ? 'border-border/50' : 'border-amber-500/50'
                )}
              />
              <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                {trimmedReason.length}/500 — se registra en la auditoría
              </p>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive font-bold">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 h-12 min-h-[44px] rounded-lg border border-border text-xs font-black uppercase hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={handleAuthorize}
              disabled={loading || !email || !password || !reasonValid}
              className="flex-1 h-12 min-h-[44px] rounded-lg bg-amber-500 text-white text-xs font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Lock className="w-3.5 h-3.5 animate-pulse" /> Verificando...</>
              ) : (
                <><Shield className="w-3.5 h-3.5" /> Autorizar</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
