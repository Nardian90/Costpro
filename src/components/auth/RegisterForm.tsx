'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, UserPlus, ArrowLeft, Mail, Lock, User, Info, Eye, EyeOff, Chrome, Check, X } from 'lucide-react';
import { logger } from '@/lib/logger';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface RegisterFormProps {
  onBackToLogin: () => void;
}

const inputFocusClasses =
  'transition-all duration-200 focus:ring-2 focus:ring-[#22c55e]/20 focus:ring-offset-1 focus:scale-[1.01]';

const strengthLabels = ['Débil', 'Regular', 'Buena', 'Fuerte'] as const;
const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e'] as const;

const containerVariants: any = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' as any },
  },
};

const passwordRequirements = [
  { label: 'Al menos 6 caracteres', test: (pw: string) => pw.length >= 6 },
  { label: 'Una letra mayúscula', test: (pw: string) => /[A-Z]/.test(pw) },
  { label: 'Un número', test: (pw: string) => /[0-9]/.test(pw) },
  { label: 'Un carácter especial', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
] as const;

export default function RegisterForm({ onBackToLogin }: RegisterFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    // Map 0-5 score to 0-3
    if (score <= 1) return 0;
    if (score === 2) return 1;
    if (score === 3) return 2;
    return 3;
  }, [password]);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        queueMicrotask(() => setShowSuccess(false));
        onBackToLogin();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess, onBackToLogin]);

  const handlePasswordFocus = useCallback(() => setPasswordFocused(true), []);
  const handlePasswordBlur = useCallback(() => setPasswordFocused(false), []);

  const handleGoogleSignUp = useCallback(async () => {
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
      toast.error('Error al registrarse con Google: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName || !email || !password || !confirmPassword) {
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

    if (!termsAccepted) {
      toast.error('Debes aceptar los términos y condiciones');
      return;
    }

    setLoading(true);
    logger.info('AUTH', 'REGISTER_ATTEMPT', { email });

    try {
      const { data, error } = await supabase.auth.signUp({
        options: {
          data: {
            full_name: fullName.trim() || email.split('@')[0],
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
      queueMicrotask(() => setShowSuccess(true));
    } catch (err: any) {
      logger.error('AUTH', 'REGISTER_FAILED', { email, error: err.message });
      toast.error(err.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-md relative"
    >
      {/* Success Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm rounded-lg"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-[#15803d] to-[#22c55e] flex items-center justify-center shadow-lg shadow-green-500/30 mb-4"
            >
              <Check className="w-8 h-8 text-white" strokeWidth={3} />
            </motion.div>
            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl font-bold text-foreground"
            >
              ¡Cuenta creada!
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="text-sm text-muted-foreground mt-1"
            >
              Revisa tu correo para confirmar
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="space-y-1">
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Volver al login
          </button>
          <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#15803d] to-[#22c55e] bg-clip-text text-transparent">
            Crear cuenta
          </h2>
          <p className="text-sm text-muted-foreground">
            Únete a CostPro y empieza a gestionar tu negocio
          </p>
        </motion.div>

        {/* Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex gap-3 p-3 rounded-lg bg-[#22c55e]/5 border border-[#22c55e]/15"
        >
          <Info className="w-4 h-4 text-[#22c55e] shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Las cuentas nuevas se asignan automáticamente al rol{' '}
            <span className="text-[#22c55e] font-semibold">Costo</span>.
            Un administrador podrá elevar tus permisos posteriormente.
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          variants={itemVariants}
          onSubmit={handleRegister}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium">
              Nombre completo
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`pl-10 ${inputFocusClasses}`}
                placeholder="Tu nombre"
                autoComplete="name"
              />
            </div>
          </div>

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
                className={`pl-10 ${inputFocusClasses}`}
                placeholder="tu@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={handlePasswordFocus}
                  onBlur={handlePasswordBlur}
                  className={`pl-10 pr-10 ${inputFocusClasses}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
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

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.25 }}
                  className="pt-1 space-y-1.5"
                >
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3].map((level) => (
                      <motion.div
                        key={level}
                        className="h-1.5 flex-1 rounded-full"
                        initial={{ scaleX: 0 }}
                        animate={{
                          scaleX: 1,
                          backgroundColor:
                            level <= passwordStrength
                              ? strengthColors[Math.min(passwordStrength, 3) as 0|1|2|3]
                              : 'hsl(var(--muted))',
                        }}
                        transition={{
                          duration: 0.3,
                          delay: level * 0.05,
                        }}
                        style={{ originX: 0 }}
                      />
                    ))}
                  </div>
                  <p
                    className="text-[11px] font-medium"
                    style={{ color: strengthColors[Math.min(passwordStrength, 3) as 0|1|2|3] }}
                  >
                    {strengthLabels[Math.min(passwordStrength, 3) as 0|1|2|3]}
                  </p>
                </motion.div>
              )}

              {/* Password Requirements Checklist */}
              <AnimatePresence>
                {passwordFocused && password.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1 pt-1">
                      {passwordRequirements.map((req, idx) => {
                        const met = req.test(password);
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="flex items-center gap-1.5"
                          >
                            <motion.span
                              key={met ? 'pass' : 'fail'}
                              initial={{ scale: 0.5 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                            >
                              {met ? (
                                <Check className="w-3 h-3 text-[#22c55e]" />
                              ) : (
                                <X className="w-3 h-3 text-red-400" />
                              )}
                            </motion.span>
                            <span
                              className={`text-[11px] transition-colors duration-200 ${
                                met ? 'text-[#22c55e]' : 'text-muted-foreground'
                              }`}
                            >
                              {req.label}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirmar
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`pl-10 pr-10 ${inputFocusClasses}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-start gap-2"
          >
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => queueMicrotask(() => setTermsAccepted(checked === true))}
              className="mt-0.5 data-[state=checked]:bg-[#15803d] data-[state=checked]:border-[#15803d]"
            />
            <label
              htmlFor="terms"
              className="text-xs text-muted-foreground leading-relaxed cursor-pointer"
            >
              Acepto los{' '}
              <button
                type="button"
                className="text-[#22c55e] hover:text-[#16a34a] font-medium underline underline-offset-2 decoration-green-500/40 hover:decoration-green-500 transition-colors"
              >
                términos y condiciones
              </button>{' '}
              y la{' '}
              <button
                type="button"
                className="text-[#22c55e] hover:text-[#16a34a] font-medium underline underline-offset-2 decoration-green-500/40 hover:decoration-green-500 transition-colors"
              >
                política de privacidad
              </button>
            </label>
          </motion.div>

          <Button
            type="submit"
            disabled={loading || !termsAccepted}
            className="w-full h-11 bg-gradient-to-r from-[#15803d] to-[#22c55e] hover:from-[#15803d] hover:to-[#16a34a] shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/30 transition-all duration-300 text-white font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Crear cuenta
              </>
            )}
          </Button>
        </motion.form>

        {/* Divider */}
        <motion.div className="relative" variants={itemVariants}>
          <div className="absolute inset-0 flex items-center">
            <span className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-card px-3 text-muted-foreground font-medium tracking-wider">
              O registrarse con
            </span>
          </div>
        </motion.div>

        {/* Social Sign-up */}
        <motion.div variants={itemVariants}>
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignUp}
            disabled={loading}
            className="w-full h-11 font-medium text-sm hover:shadow-md hover:shadow-blue-500/10 hover:border-blue-200 transition-all duration-300"
          >
            <Chrome className="w-4 h-4 text-[#4285F4]" />
            Registrarse con Google
          </Button>
        </motion.div>

        {/* Login Link */}
        <motion.p
          variants={itemVariants}
          className="text-center text-sm text-muted-foreground"
        >
          ¿Ya tienes una cuenta?{' '}
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-[#22c55e] hover:text-[#16a34a] font-semibold transition-colors hover:underline underline-offset-4 decoration-green-500"
          >
            Inicia sesión
          </button>
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
