'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import CostProLogo from '@/components/CostProLogo';
import SplashScreen from '@/components/SplashScreen';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { UserContract, UserFactory } from '@/contracts';

export default function LoginPage() {
  const [showSplash, setShowSplash] = useState(true);
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

      // 2. Fetch user profile from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        throw new Error('Error al cargar el perfil del usuario');
      }

      // Check if user is active
      if (!profileData.is_active) {
        await supabase.auth.signOut();
        throw new Error('Usuario inactivo. Contacte al administrador.');
      }

      // 3. Update Zustand store with complete user data using Factory to ensure all fields
      const userData: UserContract = UserFactory.create({
        id: profileData.id,
        email: profileData.email,
        fullName: profileData.full_name,
        role: profileData.role,
        roles: profileData.roles,
        storeId: profileData.store_id,
        activeStoreId: profileData.active_store_id || profileData.store_id,
        maxStoresLimit: profileData.max_stores_limit,
        maxUsersLimit: profileData.max_users_limit,
        createdBy: profileData.created_by,
        isActive: profileData.is_active,
        createdAt: profileData.created_at,
        updatedAt: profileData.updated_at,
      });

      login(userData, authData.session.access_token);

      logger.info('AUTH', 'LOGIN_SUCCESS', { userId: userData.id, email: userData.email });

      toast.success(`¡Bienvenido, ${userData.fullName}!`);
      router.push('/');
    } catch (err: any) {
      logger.error('AUTH', 'LOGIN_FAILED', { email, error: err.message });
      setError(err.message || 'Error al iniciar sesión');
      toast.error(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    { email: 'admin@demo.com', role: 'Admin' },
    { email: 'encargado@demo.com', role: 'Encargado' },
    { email: 'cajero@demo.com', role: 'Cajero' },
    { email: 'almacen@demo.com', role: 'Almacén' },
  ];

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 animate-in fade-in duration-700 allow-animations">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 space-y-4">
          <CostProLogo size={80} animated={false} />
        </div>

        <div className="neu-card">
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
                type="email"
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

          <div className="mt-6 pt-6 border-t border-border" translate="no">
            <p className="text-xs text-muted-foreground mb-3 text-center">
              Cuentas de Demo (contraseña: demo123)
            </p>
            <div className="space-y-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={demoLoading === account.email}
                  onClick={() => {
                    setDemoLoading(account.email);
                    setEmail(account.email);
                    setPassword('demo123');
                    setTimeout(() => {
                      formRef.current?.requestSubmit();
                    }, 100);
                  }}
                  className="neu-raised-sm w-full text-left p-2 hover:bg-accent transition-colors text-sm flex items-center justify-center disabled:opacity-75"
                >
                  {demoLoading === account.email ? (
                    <div className="flex items-center justify-center gap-2 w-full">
                      <div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                      <span>Cargando...</span>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center w-full">
                      <span className="font-medium">{account.email}</span>
                      <span className="neu-badge">{account.role}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          © 2026 POS Enterprise. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
