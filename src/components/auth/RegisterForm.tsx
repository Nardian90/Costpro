'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2, UserPlus, ArrowLeft, Mail, Lock, ShieldCheck, Info } from 'lucide-react';
import { logger } from '@/lib/logger';
import { Input } from '@/components/ui/input';

interface RegisterFormProps {
  onBackToLogin: () => void;
}

export default function RegisterForm({ onBackToLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || !confirmPassword) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    logger.info('AUTH', 'REGISTER_ATTEMPT', { email });

    try {
      const { data, error } = await supabase.auth.signUp({
        options: {
          data: {
            full_name: email.split('@')[0],
            role: 'costo'
          },
          emailRedirectTo: window.location.origin
        },
        email: email.toLowerCase().trim(),
        password: password,
      });

      if (error) throw error;

      toast.success('¡Registro exitoso! Revisa tu correo (incluso en SPAM) para confirmar tu cuenta.', {
        duration: 8000
      });
      onBackToLogin();
    } catch (err: any) {
      logger.error('AUTH', 'REGISTER_FAILED', { email, error: err.message });
      toast.error(err.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-8 bg-card border border-border shadow-2xl">
      <div className="flex items-center gap-4">
        <button
          onClick={onBackToLogin}
          className="p-2 hover:bg-muted rounded-xl transition-all active:scale-90 border border-border"
          aria-label="Volver al login"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="space-y-1">
          <h2 className="text-2xl font-black uppercase tracking-tighter text-foreground flex items-center gap-2">
             Crear Cuenta
          </h2>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
            Únete a la red Costpro
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Las cuentas nuevas se asignan automáticamente al rol <span className="text-primary font-bold">Costo</span>. Un administrador podrá elevar tus permisos posteriormente.
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-5">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] ml-1">
            Correo Electrónico
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="neu-input w-full pl-10"
              placeholder="tu@email.com"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] ml-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="neu-input w-full pl-10"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] ml-1">
              Confirmar
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="neu-input w-full pl-10"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="neu-btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-primary/20 uppercase font-black text-xs tracking-widest"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Crear Cuenta
            </>
          )}
        </button>
      </form>

      <div className="text-center pt-2">
        <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-tight">
          ¿Ya tienes una cuenta?{" "}
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-primary font-black hover:underline ml-1"
          >
            Inicia Sesión
          </button>
        </p>
      </div>
    </div>
  );
}
