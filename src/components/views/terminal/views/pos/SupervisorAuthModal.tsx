'use client';

import React, { useState } from 'react';
import { Shield, Lock, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
 */

interface SupervisorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorize: () => void;
  discountPercent: number;
  discountValue: number;
  maxAllowed: number;
}

export function SupervisorAuthModal({
  isOpen,
  onClose,
  onAuthorize,
  discountPercent,
  discountValue,
  maxAllowed,
}: SupervisorAuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAuthorize = async () => {
    setLoading(true);
    setError(null);
    try {
      // Validar credenciales contra Supabase Auth
      // V2.12.26 fix: supabaseClient.ts exporta `supabase` (no `createClient`)
      const { supabase } = await import('@/lib/supabaseClient');
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data.user) {
        setError('Credenciales inválidas');
        return;
      }

      // Verificar que el usuario tiene rol admin o manager en alguna store
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
        // Verificar si es manager de alguna tienda
        const { data: membership } = await supabase
          .from('user_store_memberships')
          .select('role')
          .eq('user_id', data.user.id)
          .eq('status', 'active')
          .in('role', ['admin', 'manager'])
          .limit(1);

        if (!membership || membership.length === 0) {
          setError('El usuario no tiene permisos de supervisor');
          return;
        }
      }

      // Autorización exitosa
      onAuthorize();
      onClose();
      // Limpiar
      setEmail('');
      setPassword('');
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
                Descuento de {discountPercent.toFixed(1)}% excede el máximo permitido ({maxAllowed}%)
              </p>
              <p className="text-[10px] text-muted-foreground">
                Monto del descuento: {discountValue.toFixed(2)} CUP
              </p>
              <p className="text-[10px] text-muted-foreground">
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
                onKeyDown={(e) => e.key === 'Enter' && handleAuthorize()}
                placeholder="••••••••"
                className="w-full h-12 bg-background border border-border/50 rounded-lg px-3 text-sm font-bold"
                autoComplete="current-password"
              />
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
              disabled={loading || !email || !password}
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
