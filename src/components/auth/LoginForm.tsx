'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, LogIn, Mail, Chrome, Info, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import RegisterForm from './RegisterForm';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { mapProfileToContract } from '@/contracts/user';
import { safeNavigate } from '@/lib/navigation';
import { userService } from '@/services/user-service';

const containerVariants: any = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as any },
  },
};

const shakeVariants: any = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 15,
    },
  },
  shake: {
    x: [0, -6, 6, -4, 4, -2, 2, 0],
    transition: {
      duration: 0.5,
      ease: 'easeInOut',
    },
  },
};

interface LoginFormProps {
  onBack?: () => void;
  defaultTab?: 'login' | 'register';
}

export default function LoginForm({ onBack, defaultTab }: LoginFormProps) {
  const [isRegistering, setIsRegistering] = useState(defaultTab === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  // FIX #010: Rate limiting — cooldown timer
  useEffect(() => {
    if (cooldownUntil <= 0) return;
    const timer = setInterval(() => {
      const remaining = cooldownUntil - Date.now();
      if (remaining <= 0) {
        setCooldownUntil(0);
        setFailedAttempts(0);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

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
        redirectTo: `${window.location.origin}/?type=recovery`,
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

    // FIX #011: Mask email in logs to protect PII
    const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    logger.info('AUTH', 'LOGIN_ATTEMPT', { email: maskedEmail });

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
      setFailedAttempts(prev => prev + 1);
      if (failedAttempts >= 2) {
        setCooldownUntil(Date.now() + 30000); // 30s cooldown
        toast.error('Demasiados intentos', { description: 'Por seguridad, espera 30 segundos antes de intentar de nuevo.' });
      }
      setError(err.message || 'Error al iniciar sesión');
      toast.error(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  if (isRegistering) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="register"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <RegisterForm onBackToLogin={() => setIsRegistering(false)} />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="login"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={containerVariants}
        className="w-full max-w-md"
      >
        <div className="space-y-6">
          {/* Header */}
          <motion.div className="space-y-1" variants={itemVariants}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                Volver
              </button>
            )}
            <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#15803d] to-[#22c55e] bg-clip-text text-transparent">
              Iniciar sesión
            </h2>
            <p className="text-sm text-muted-foreground">
              Ingresa tus credenciales para acceder a tu cuenta
            </p>
          </motion.div>

          {/* Form */}
          <motion.form ref={formRef} onSubmit={handleSubmit} className="space-y-4" variants={itemVariants}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Correo electrónico
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-[#22c55e]/20 focus:ring-offset-1 focus:scale-[1.01]"
                  placeholder="tu@email.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Contraseña
                </Label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 transition-all duration-200 focus:ring-2 focus:ring-[#22c55e]/20 focus:ring-offset-1 focus:scale-[1.01]"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial="hidden"
                animate={["visible", "shake"]}
                variants={shakeVariants}
                key={`error-${error}`}
                className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                <Info className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            <Button
              type="submit"
              disabled={loading || cooldownUntil > 0}
              className="w-full h-11 bg-gradient-to-r from-[#15803d] to-[#22c55e] hover:from-[#15803d] hover:to-[#16a34a] text-white font-semibold tracking-wide shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/30 transition-all duration-300"
              size="default"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Entrar al sistema
                </>
              )}
            </Button>
            {cooldownUntil > 0 && (
              <p className="text-xs text-center text-amber-600 dark:text-amber-400 mt-2">
                Espera {Math.ceil((cooldownUntil - Date.now()) / 1000)}s antes de intentar de nuevo
              </p>
            )}
          </motion.form>

          {/* Divider */}
          <motion.div className="relative" variants={itemVariants}>
            <div className="absolute inset-0 flex items-center">
              <span className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-card px-3 text-muted-foreground font-medium tracking-wider">
                O continuar con
              </span>
            </div>
          </motion.div>

          {/* Social Login */}
          <motion.div variants={itemVariants}>
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full h-11 font-medium text-sm hover:shadow-md hover:shadow-blue-500/10 hover:border-blue-200 transition-all duration-300"
            >
              <Chrome className="w-4 h-4 text-[#4285F4]" />
              Continuar con Google
            </Button>
          </motion.div>

          {/* FIX #014: Terms & Conditions */}
          <motion.p className="text-center text-xs text-muted-foreground/60" variants={itemVariants}>
            Al continuar, aceptas los{' '}
            <a href="#" className="text-primary hover:underline underline-offset-4" onClick={(e) => { e.preventDefault(); toast.info('Próximamente', { description: 'Los Términos y Condiciones estarán disponibles próximamente.' }); }}>
              Términos de Servicio
            </a>{' '}y{' '}
            <a href="#" className="text-primary hover:underline underline-offset-4" onClick={(e) => { e.preventDefault(); toast.info('Próximamente', { description: 'La Política de Privacidad estará disponible próximamente.' }); }}>
              Política de Privacidad
            </a>
          </motion.p>
          {/* Register Link */}
          <motion.p className="text-center text-sm text-muted-foreground" variants={itemVariants}>
            ¿No tienes una cuenta?{' '}
            <button
              type="button"
              onClick={() => setIsRegistering(true)}
              className="text-[#22c55e] hover:text-[#16a34a] font-semibold transition-colors hover:underline underline-offset-4 decoration-green-500"
            >
              Regístrate aquí
            </button>
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
