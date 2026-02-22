'use client';

import { useState, useRef } from 'react';
import { useAuthStore } from '@/store';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn, UserPlus, Mail, ShieldCheck, Chrome, Info } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import RegisterForm from './RegisterForm';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';
import { UserFactory } from '@/contracts';
import { safeNavigate } from '@/lib/navigation';
import { userService } from '@/services/user-service';
import { mapProfileToContract } from '@/contracts/user';

export default function LoginForm() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const login = useAuthStore((state) => state.login);
  const router = useRouter();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error('Error al iniciar con Google: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Por favor ingresa tu correo electrónico en el campo superior primero');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?type=recovery`,
      });
      if (error) throw error;
      toast.success('Se ha enviado un enlace de recuperación a tu correo');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    logger.info('AUTH', 'LOGIN_ATTEMPT', { email });

    try {
      if (!email || !password) {
        throw new Error('Por favor completa todos los campos');
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password,
      });

      if (authError) {
        throw new Error(authError.message === 'Invalid login credentials' ? 'Credenciales inválidas' : authError.message);
      }

      if (!authData.user || !authData.session) {
        throw new Error('Error al obtener datos del usuario');
      }

      const profileData = await userService.getUserProfile(authData.user.id);
      if (!profileData) {
        await supabase.auth.signOut();
        throw new Error('Perfil de usuario no encontrado o inactivo');
      }

      const userData = mapProfileToContract(profileData);
      login(userData, authData.session.access_token, 'authenticated_valid');
      toast.success(`¡Bienvenido, ${userData.fullName}!`);
      safeNavigate.push(router, '/');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
      toast.error(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  if (isRegistering) {
    return (
      <div className="neu-card w-full max-w-md mx-auto p-0 overflow-hidden">
        <RegisterForm onBackToLogin={() => setIsRegistering(false)} />
      </div>
    );
  }

  return (
    <div className="neu-card w-full max-w-md mx-auto p-6 sm:p-8 space-y-8 bg-card border border-border shadow-2xl">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/20">
           <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-[clamp(1.5rem,8vw,1.875rem)] font-black tracking-tighter uppercase text-foreground">
          Acceso Terminal
        </h2>
        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
          Ingresa tus credenciales para continuar
        </p>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="email" className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] ml-1">
            Correo Electrónico
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="neu-input w-full !pl-12"
              placeholder="admin@costpro.com"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between ml-1">
            <label htmlFor="password" className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">
              Contraseña
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-[9px] font-black uppercase tracking-tighter text-primary hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <div className="relative">
            <LogIn className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="neu-input w-full !pl-12 pr-12"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
            <Info className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="neu-btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-primary/20 uppercase font-black text-xs tracking-widest"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Entrar al sistema
            </>
          )}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border"></span>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-card px-4 text-muted-foreground font-bold tracking-[0.3em]">O continuar con</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full h-12 flex items-center justify-center gap-3 bg-white text-black rounded-xl hover:bg-gray-100 transition-all active:scale-95 border border-gray-200 font-bold text-sm shadow-sm"
      >
        <Chrome className="w-5 h-5 text-[#4285F4]" />
        Google
      </button>

      <div className="text-center pt-2">
        <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-tight">
          ¿No tienes una cuenta?{" "}
          <button
            type="button"
            onClick={() => setIsRegistering(true)}
            className="text-primary font-black hover:underline ml-1"
          >
            Regístrate aquí
          </button>
        </p>
      </div>
    </div>
  );
}
