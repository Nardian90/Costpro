'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn, X } from 'lucide-react';
import CostProLogo from '@/components/CostProLogo';
import SplashScreen from '@/components/SplashScreen';
import WelcomeLanding from '@/components/WelcomeLanding';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { UserFactory } from '@/contracts';
import { safeNavigate } from '@/lib/navigation';
import { userService } from '@/services/user-service';
import { mapProfileToContract } from '@/contracts/user';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

export default function LoginPage() {
  const [showSplash, setShowSplash] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { login, user, status } = useAuthStore();
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

  const demoAccounts = [
    { email: 'admin@demo.com', role: 'Admin' },
    { email: 'encargado@demo.com', role: 'Encargado' },
    { email: 'cajero@demo.com', role: 'Cajero' },
    { email: 'almacen@demo.com', role: 'Almacén' },
  ];

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  const handleStart = () => {
    if (status === 'authenticated_valid' || status === 'authenticated_invalid_profile') {
      safeNavigate.push(router, '/');
    } else {
      setShowLoginModal(true);
    }
  };

  return (
    <>
      <WelcomeLanding
        onStart={handleStart}
        isAuthenticated={status === 'authenticated_valid'}
      />

      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-none bg-transparent shadow-2xl">
          <div className="relative w-full p-4">
             <div className="absolute top-8 right-8 z-10">
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
             </div>

             <div className="w-full max-w-md mx-auto pt-8">
                <div className="text-center mb-8 space-y-4">
                  <CostProLogo size={80} animated={false} />
                </div>

                <div className="neu-card bg-background/95 backdrop-blur-xl border border-border shadow-2xl">
                  <h2 className="text-xl font-black uppercase tracking-tight mb-6 text-center">
                    Acceso al Sistema
                  </h2>

                  <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="email" className="block text-[10px] font-black uppercase tracking-widest mb-2 text-muted-foreground">
                        Correo Electrónico
                      </label>
                      <input
                        id="email"
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="neu-input w-full bg-muted/30"
                        placeholder="tu@email.com"
                        autoComplete="email"
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-widest mb-2 text-muted-foreground">
                        Contraseña
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="neu-input w-full pr-12 bg-muted/30"
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
                      <div className="neu-raised-sm p-3 text-danger text-xs font-bold uppercase border border-danger/20 bg-danger/5">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="neu-btn neu-btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50 font-black uppercase tracking-widest text-xs"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <LogIn className="w-4 h-4" />
                          Entrar
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 pt-6 border-t border-border" translate="no">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 text-center">
                      Cuentas de Acceso Rápido (Demo)
                    </p>
                    <div className="grid grid-cols-1 gap-2">
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
                          className="neu-raised-sm w-full text-left p-3 hover:bg-accent transition-all text-xs flex items-center justify-between group disabled:opacity-75 rounded-xl border border-border"
                        >
                          {demoLoading === account.email ? (
                            <div className="flex items-center justify-center gap-2 w-full">
                              <div className="w-3 h-3 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                              <span className="font-black uppercase tracking-widest text-[10px]">Cargando...</span>
                            </div>
                          ) : (
                            <>
                              <span className="font-bold text-muted-foreground group-hover:text-foreground">{account.email}</span>
                              <span className="neu-badge scale-75 font-black uppercase tracking-tighter">{account.role}</span>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mt-6">
                  © 2026 CostPro Enterprise
                </p>
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
