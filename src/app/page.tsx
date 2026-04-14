'use client';

import { Suspense, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Calculator, ShoppingCart, Package, BarChart3,
  Store, ShieldCheck, Users,
  CheckCircle2, Sparkles
} from 'lucide-react';
import CyberShell from '@/components/ui/CyberShell';
import TerminalShell from '@/components/views/TerminalShell';
import DataDecryption from '@/components/ui/DataDecryption';
import LoginForm from '@/components/auth/LoginForm';
import { useAuthStore } from '@/store';

/* ── Feature data ── */
const features = [
  {
    icon: Calculator,
    title: 'Control de Costos',
    desc: 'Calcula costos precisos con motor de fórmulas avanzado y auditoría por transacción.',
  },
  {
    icon: ShoppingCart,
    title: 'Punto de Venta',
    desc: 'Terminal POS rápida e intuitiva con soporte para múltiples métodos de pago.',
  },
  {
    icon: Package,
    title: 'Inventario Inteligente',
    desc: 'Gestión automatizada de stock con alertas de reorden y recepciones.',
  },
  {
    icon: BarChart3,
    title: 'Reportes en Tiempo Real',
    desc: 'Dashboard ejecutivo con KPIs en vivo y exportación a PDF/Excel.',
  },
  {
    icon: Store,
    title: 'Multi-Tienda',
    desc: 'Administra múltiples sucursales desde una sola plataforma centralizada.',
  },
  {
    icon: ShieldCheck,
    title: 'Seguridad Total',
    desc: 'Roles granulares, auditoría de acciones y protección de datos empresariales.',
  },
];

const stats = [
  { value: '10K+', label: 'Usuarios activos' },
  { value: '500+', label: 'Tiendas' },
  { value: '2M+', label: 'Transacciones' },
];

/* ── Animation helpers ── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' as any },
  }),
};

const fadeIn = (delay = 0) => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { delay, duration: 0.6 } },
});

const slideRight = (delay = 0) => ({
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { delay, duration: 0.5, ease: 'easeOut' as any } },
});

/* ── Auth-aware page ── */
export default function HomePage() {
  const { user, status } = useAuthStore();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsub = useAuthStore.subscribe((state) => {
      if (!state.loading) {
        setIsReady(true);
        setIsAuthenticated(!!state.user && state.status !== 'unauthenticated');
      }
    });

    const timer = setTimeout(() => {
      const state = useAuthStore.getState();
      if (state.loading) {
        console.warn('[HomePage] Auth check timeout, forcing ready state');
        useAuthStore.getState().setLoading(false);
        useAuthStore.getState().setStatus('unauthenticated');
        setIsReady(true);
        setIsAuthenticated(false);
      }
    }, 5000);

    // Use subscribe callback for initial state to avoid synchronous setState in effect
    const currentState = useAuthStore.getState();
    if (!currentState.loading) {
      // Schedule the update via microtask to satisfy react-hooks/set-state-in-effect
      queueMicrotask(() => {
        setIsReady(true);
        setIsAuthenticated(!!useAuthStore.getState().user && useAuthStore.getState().status !== 'unauthenticated');
      });
    }

    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  const showLogin = !isReady || !isAuthenticated;

  if (showLogin) {
    return <LandingPage />;
  }

  return (
    <CyberShell>
      <Suspense fallback={<DataDecryption />}>
        <TerminalShell />
      </Suspense>
    </CyberShell>
  );
}

/* ── Landing / Login Split Screen ── */
function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#f8fafc] dark:bg-[#0a0f1a]">
      {/* ─── LEFT PANEL (Hero) ─── */}
      <div className="relative flex-1 lg:flex-[3] xl:flex-[3] overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#052e16] via-[#064e3b] to-[#0f172a] dark:from-[#0a0f1a] dark:via-[#0c1829] dark:to-[#020617]" />

        {/* Decorative dots pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        {/* Decorative gradient orb */}
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#22c55e]/10 blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-60 -left-40 w-[400px] h-[400px] rounded-full bg-[#10b981]/8 blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-between min-h-[auto] lg:min-h-screen p-6 sm:p-10 lg:p-12 xl:p-16">
          {/* Top: Logo + nav */}
          <motion.div
            variants={fadeIn(0)}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#22c55e]" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white font-[family-name:var(--font-space-grotesk)]">
                Cost<span className="text-[#22c55e]">Pro</span>
              </span>
            </div>
          </motion.div>

          {/* Middle: Features grid */}
          <div className="flex-1 flex flex-col justify-center py-10 lg:py-0">
            <motion.div
              variants={slideRight(0.1)}
              initial="hidden"
              animate="visible"
              className="mb-8 max-w-lg"
            >
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-white leading-[1.15] font-[family-name:var(--font-space-grotesk)]">
                Gestiona tu negocio con{' '}
                <span className="text-[#22c55e]">precisión total</span>
              </h1>
              <p className="mt-4 text-base sm:text-lg text-white/60 leading-relaxed">
                Control de costos, punto de venta, inventario y reportes — todo en una plataforma.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  className="group flex items-start gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] hover:border-[#22c55e]/20 transition-all duration-300"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#22c55e]/10 flex items-center justify-center shrink-0 group-hover:bg-[#22c55e]/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-[#22c55e]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white/90 mb-0.5">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-white/40 leading-relaxed line-clamp-2">
                      {feature.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Bottom: Stats + tagline */}
          <motion.div
            variants={fadeIn(0.5)}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {/* Stats bar */}
            <div className="flex items-center gap-6 sm:gap-10">
              {stats.map((stat) => (
                <div key={stat.label} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
                  <div>
                    <span className="text-lg sm:text-xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
                      {stat.value}
                    </span>
                    <span className="text-xs text-white/40 ml-1.5 hidden sm:inline">
                      {stat.label}
                    </span>
                    <span className="text-[10px] text-white/40 ml-1 sm:hidden">
                      {stat.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Tagline */}
            <p className="text-xs text-white/30 font-medium tracking-wide uppercase">
              Protege tus costos y precios
            </p>
          </motion.div>
        </div>
      </div>

      {/* ─── RIGHT PANEL (Auth Form) ─── */}
      <div className="relative flex-1 lg:flex-[2] xl:flex-[2] flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-white dark:bg-[#0f1729] border-l-0 lg:border-l border-gray-200 dark:border-white/5">
        {/* Light decorative bg */}
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-[#22c55e]/5 blur-[100px] pointer-events-none" />

        <motion.div
          variants={slideRight(0.2)}
          initial="hidden"
          animate="visible"
          className="relative z-10 w-full max-w-[420px]"
        >
          {/* Mobile-only logo (shown when stacked) */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#22c55e]" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground font-[family-name:var(--font-space-grotesk)]">
              Cost<span className="text-[#22c55e]">Pro</span>
            </span>
          </div>

          {/* Form card */}
          <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-white/[0.06] shadow-lg shadow-black/[0.03] dark:shadow-black/20">
            <Suspense fallback={<DataDecryption />}>
              <LoginForm />
            </Suspense>
          </div>

          {/* Trust badges below form */}
          <motion.div
            variants={fadeIn(0.6)}
            initial="hidden"
            animate="visible"
            className="mt-8 flex items-center justify-center gap-6 text-[11px] text-muted-foreground"
          >
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#22c55e]" />
              <span>SSL Seguro</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#22c55e]" />
              <span>SOPHOS Protected</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
