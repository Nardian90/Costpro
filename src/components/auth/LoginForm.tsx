'use client';

import { useState, useRef } from 'react';
import { useAuthStore } from '@/store';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { UserFactory } from '@/contracts';
import { safeNavigate } from '@/lib/navigation';
import { userService } from '@/services/user-service';
import { mapProfileToContract } from '@/contracts/user';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const login = useAuthStore((state) => state.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    logger.info('AUTH', 'LOGIN_ATTEMPT', { email });

    try {
      if (!email || !password) {
        throw new Error('Por favor completa todos los campos');
      }

      // BYPASS: Mock login for admin/demo1234
      if (email.toLowerCase().trim() === 'admin' && password === 'demo1234') {
        logger.warn('AUTH', 'MOCK_LOGIN_TRIGGERED', { email });

        const mockUser = UserFactory.create({
          id: 'mock-admin-id',
          email: 'admin@local.test',
          fullName: 'Administrador Local',
          role: 'admin',
          roles: ['admin'],
          isActive: true,
          activeStoreId: 'mock-store-id',
          memberships: [
            {
              store_id: 'mock-store-id',
              role: 'admin',
              store: { name: 'Sucursal Local (Mock)' }
            } as any
          ]
        });

        login(mockUser, 'mock-token', 'authenticated_valid', true);
        toast.success('¡Bienvenido (Modo Local)!');
        safeNavigate.push(router, '/');
        return;
      }

      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password,
      });

      if (authError) {
        throw new Error(authError.message === 'Invalid login credentials'
          ? 'Credenciales inválidas'
          : authError.message);
      }

      if (!authData.user) {
        throw new Error('Error al obtener datos del usuario');
      }

      // 2. Fetch user profile and memberships from profiles table via service
      const profileData = await userService.getUserProfile(authData.user.id);

      if (!profileData) {
        await supabase.auth.signOut();
        throw new Error('Perfil de usuario no encontrado o inactivo');
      }

      // 3. Update Zustand store with complete user data
      const userData = mapProfileToContract(profileData);

      login(userData, authData.session.access_token, 'authenticated_valid');

      logger.info('AUTH', 'LOGIN_SUCCESS', { userId: userData.id, email: userData.email });

      toast.success(`¡Bienvenido, ${userData.fullName}!`);
      safeNavigate.push(router, '/');
    } catch (err: any) {
      logger.error('AUTH', 'LOGIN_FAILED', { email, error: err.message });
      setError(err.message || 'Error al iniciar sesión');
      toast.error(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="neu-card w-full max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-6 text-center">
        Iniciar Sesión
      </h2>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">
            Correo Electrónico
          </label>
          <input
            id="email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="neu-input w-full"
            placeholder="tu@email.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="neu-input w-full pr-12"
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="neu-raised-sm p-3 text-danger text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="neu-btn neu-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Cargando...
            </>
          ) : (
            <>
              <LogIn className="w-5 h-5" />
              Iniciar Sesión
            </>
          )}
        </button>
      </form>

    </div>
  );
}
