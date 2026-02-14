'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2, UserPlus, ArrowLeft, Mail, Lock } from 'lucide-react';
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
        email: email.toLowerCase().trim(),
        password: password,
      });

      if (error) throw error;

      toast.success('¡Registro exitoso! Por favor revisa tu correo para confirmar tu cuenta.');
      onBackToLogin();
    } catch (err: any) {
      logger.error('AUTH', 'REGISTER_FAILED', { email, error: err.message });
      toast.error(err.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBackToLogin}
          className="p-3.5 hover:bg-muted rounded-full transition-colors"
          aria-label="Volver al login"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-semibold">Crear Cuenta</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Regístrate para acceder al sistema de gestión de costos.
      </p>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Correo Electrónico
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="neu-input w-full"
            placeholder="tu@email.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Contraseña
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="neu-input w-full"
            placeholder="••••••••"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Confirmar Contraseña
          </label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="neu-input w-full"
            placeholder="••••••••"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="neu-btn neu-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 h-12"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <UserPlus className="w-5 h-5" />
              Registrarse
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onBackToLogin}
          className="w-full text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-all flex items-center justify-center gap-2 mt-4"
        >
          ¿Ya tienes cuenta? Inicia Sesión
        </button>
      </form>
    </div>
  );
}
