'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, CheckCircle2, ShoppingCart, Package,
  Shield, TrendingUp, BarChart3, FileText,
  Check, Play, MousePointer2, ExternalLink,
  Store, Utensils, Factory, Briefcase, Zap,
  MessageCircle, Smartphone, Download, HelpCircle
} from 'lucide-react';
import Link from 'next/link';
import CostProLogo from '@/components/CostProLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import AutomationWorkflowDiagram from './diagrams/AutomationWorkflowDiagram';
import SpeedScaleDiagram from './diagrams/SpeedScaleDiagram';
import { usePWA } from '@/hooks/ui/usePWA';
import { cn } from '@/lib/utils';
import { PWAInstallModal } from '@/components/ui/PWAInstallModal';
import { useUIStore } from '@/store';

interface WelcomeLandingViewProps {
  onLoginClick: () => void;
}

export default function WelcomeLandingView({ onLoginClick }: WelcomeLandingViewProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isPWAModalOpen, setIsPWAModalOpen] = useState(false);
  const [randomDiagram, setRandomDiagram] = useState<number>(0);
  const { isInstallable, installApp } = usePWA();
  const { setCurrentView, setLastQuery } = useUIStore();

  useEffect(() => {
    setRandomDiagram(Math.random() > 0.5 ? 1 : 2);
    setIsHydrated(true);
  }, []);

  const handleInstallClick = async () => {
    const result = await installApp();
    if (result === false) {
      setIsPWAModalOpen(true);
    }
  };

  const goToHelpSlideshow = () => {
    setLastQuery('slideshow', 'help');
    setCurrentView('help');
  };

  const modules = [
    {
      title: "Gestión de Costos",
      desc: "Motor de ingeniería con 14 secciones de gasto y 5 anexos técnicos.",
      icon: <FileText className="w-5 h-5" />,
      color: "text-violet-600",
      bg: "bg-violet-500/10"
    },
    {
      title: "Punto de Venta",
      desc: "TPV móvil optimizado para operaciones de alta velocidad.",
      icon: <ShoppingCart className="w-5 h-5" />,
      color: "text-primary",
      bg: "bg-primary/10"
    },
    {
      title: "Inventario Multi-Sede",
      desc: "Control total de stock con aislamiento de datos por sucursal.",
      icon: <Package className="w-5 h-5" />,
      color: "text-amber-600",
      bg: "bg-amber-500/10"
    },
    {
      title: "Inteligencia AI",
      desc: "Asistente Darian para análisis predictivo y consultas en tiempo real.",
      icon: <BarChart3 className="w-5 h-5" />,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10"
    }
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header / Nav */}
      <header className={`sticky top-0 z-50 bg-background/80 ${isHydrated ? 'backdrop-blur-[10px]' : ''} border-b border-border/50 transition-all duration-500`}>
        <div className="max-w-7xl mx-auto px-2 sm:px-6 h-20 flex items-center justify-between gap-1 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-8 shrink-0">
            <CostProLogo size={32} animated={false} className="sm:scale-100 scale-90 shrink-0" />
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
             <button
              onClick={goToHelpSlideshow}
              className="h-11 px-2.5 sm:px-6 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-1 sm:gap-2 text-muted-foreground hover:bg-muted transition-all active:scale-95 group shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">¿Qué es CostPro?</span>
            </button>
            <button
              onClick={onLoginClick}
              className="h-11 px-2.5 sm:px-6 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-1 sm:gap-2 border-2 border-border bg-background/50 hover:bg-muted transition-all active:scale-95 group shrink-0 shadow-sm"
            >
              <span>Acceso<span className="hidden sm:inline"> al Sistema</span></span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform shrink-0" />
            </button>
            <button
              onClick={handleInstallClick}
              className={cn(
                "flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-6 h-11 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shrink-0",
                isInstallable
                  ? "bg-primary text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  : "bg-muted text-muted-foreground border border-border"
              )}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">App</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 sm:pt-20 pb-20 sm:pb-32 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto text-center space-y-8 sm:space-y-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl bg-primary/5 border border-primary/10 text-primary text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] sm:tracking-[0.3em]"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            CostPro Profesional v5.8.0
          </motion.div>

          <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[clamp(2.5rem,10vw,5.5rem)] font-black uppercase tracking-tighter leading-[0.9] text-foreground"
            >
              Domine su <br /> <span className="text-primary italic">Rentabilidad</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg sm:text-xl md:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed"
            >
              La plataforma definitiva para MiPyMEs que buscan precisión matemática en sus costos y agilidad total en sus ventas.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 pt-4"
          >
            <button
              onClick={onLoginClick}
              className="w-full sm:w-auto px-10 py-5 bg-foreground text-background rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-105 transition-all shadow-2xl active:scale-95"
            >
              Empezar Ahora
            </button>
            <button
              onClick={goToHelpSlideshow}
              className="w-full sm:w-auto px-10 py-5 bg-background border-2 border-border rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-muted transition-all flex items-center justify-center gap-2 group"
            >
              <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
              Ver Demo Visual
            </button>
          </motion.div>
        </div>
      </section>

      {/* Bento Showcase */}
      <section className="py-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-4 gap-4 sm:gap-6 auto-rows-[200px] sm:auto-rows-[250px]">
            {/* Bento 1 - Costs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="md:col-span-3 lg:col-span-2 p-6 sm:p-10 rounded-[2.5rem] bg-violet-500/5 border border-violet-500/10 hover:border-violet-500/30 transition-all group flex flex-col justify-between"
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center mb-4 group-hover:-translate-y-1 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Ingeniería de Costos</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed font-medium">
                  Motor declarativo con 14 niveles de gasto alineado a la Res. 148/2023.
                </p>
              </div>
            </motion.div>

            {/* Bento 2 - POS */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="md:col-span-3 lg:col-span-1 p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] bg-primary/5 border border-primary/10 hover:border-primary/30 transition-all group"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3 sm:mb-4 group-hover:-translate-y-1 transition-transform">
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-tight mb-1 sm:mb-2">TPV Móvil</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                Operaciones ultra rápidas con carrito inteligente.
              </p>
            </motion.div>

            {/* Bento 3 - Multi-Store */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="md:col-span-3 md:row-span-1 lg:col-span-2 p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] bg-background border border-border hover:border-primary/20 transition-all group"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-3 sm:mb-4 group-hover:-translate-y-1 transition-transform">
                <Package className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-tight mb-1 sm:mb-2">Inventario Multi-Sede</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                Control total de stock con aislamiento RLS.
              </p>
            </motion.div>

             {/* Bento 4 - AI */}
             <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="md:col-span-3 md:row-span-1 lg:col-span-1 p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] bg-foreground text-background transition-all group flex items-center justify-center"
            >
              <div className="text-center">
                <Zap className="w-8 h-8 mx-auto mb-2 text-primary animate-pulse" />
                <div className="text-xs font-black uppercase tracking-widest">Darian AI</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SMB Feature Spotlight: Massive Cost Sheets */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="order-1 lg:order-1 space-y-8 sm:space-y-12">
              <div className="space-y-4 sm:space-y-6">
                <div className="inline-block px-4 py-2 rounded-xl bg-violet-500/10 text-violet-600 text-xs font-black uppercase tracking-widest">
                  Caso de Éxito MiPyME
                </div>
                <h2 className="text-[clamp(1.75rem,8vw,3.5rem)] font-black uppercase tracking-tighter leading-none">
                  La Transformación <br /> de los <span className="text-violet-600 italic">Lunes</span>
                </h2>
                <div className="space-y-4 text-muted-foreground font-medium leading-relaxed">
                  <p>
                    Recibir **100 productos nuevos** a la semana y crear sus fichas de costo manualmente solía tomar hasta 20 horas de trabajo propenso a errores.
                  </p>
                  <p className="text-foreground">
                    Con CostPro, sube un Excel con precios unitarios y observa cómo el sistema genera automáticamente el 100% de las fichas en menos de <span className="font-black text-violet-600">5 minutos</span>.
                  </p>
                </div>
              </div>

              <div className="grid gap-6">
                <div className="flex gap-4 p-6 rounded-3xl bg-muted/50 border border-border">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black uppercase text-xs tracking-widest mb-1">95% Ahorro de Tiempo</h4>
                    <p className="text-xs text-muted-foreground font-medium">Automatiza tareas administrativas repetitivas y libera a tu equipo para vender.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-6 rounded-3xl bg-muted/50 border border-border">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center">
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black uppercase text-xs tracking-widest mb-1">Precisión Matemática</h4>
                    <p className="text-xs text-muted-foreground font-medium">Elimina errores humanos en el cálculo de impuestos, seguridad social y márgenes.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                 <Link href="/demo/executive">
                  <button
                    className="neu-btn border-2 border-violet-600 text-violet-600 h-14 px-10 text-sm font-black uppercase tracking-widest hover:bg-violet-600 hover:text-white transition-all flex items-center gap-2"
                  >
                    Ver esta funcionalidad
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
                <button
                  onClick={goToHelpSlideshow}
                  className="h-14 px-10 rounded-2xl bg-muted text-muted-foreground text-sm font-black uppercase tracking-widest hover:bg-muted/70 transition-all"
                >
                  Ver Resumen General
                </button>
              </div>
            </div>

            <div className="order-2 lg:order-2 space-y-8">
              {/* Desktop: Show both */}
              <div className="hidden lg:block space-y-8">
                <AutomationWorkflowDiagram />
                <SpeedScaleDiagram />
              </div>

              {/* Mobile: Show only one randomly to optimize performance */}
              <div className="lg:hidden">
                {isHydrated && (
                  randomDiagram === 1 ? <AutomationWorkflowDiagram /> : <SpeedScaleDiagram />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 sm:px-6 overflow-x-auto">
        <div className="max-w-4xl mx-auto p-8 sm:p-12 lg:p-20 rounded-[4rem] bg-foreground text-background relative overflow-hidden text-center space-y-10">
          <div className="absolute inset-0 opacity-10">
            <CostProLogo size={400} className="absolute -bottom-20 -right-20 rotate-12" />
          </div>

          <div className="relative z-10 space-y-6">
            <h2 className="text-[clamp(1.75rem,8vw,4rem)] font-black uppercase tracking-tighter leading-none">
              ¿Listo para modernizar su gestión?
            </h2>
            <p className="text-lg opacity-70 font-medium max-w-xl mx-auto">
              Únase a las MiPyMEs que ya optimizan sus márgenes con CostPro.
            </p>
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onLoginClick}
              className="w-full sm:w-auto px-12 py-5 bg-primary text-white rounded-2xl text-base font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-2xl"
            >
              Acceso Inmediato
            </button>
            <button
              onClick={goToHelpSlideshow}
              className="w-full sm:w-auto px-12 py-5 bg-background text-foreground rounded-2xl text-base font-black uppercase tracking-widest hover:bg-muted transition-all border border-border"
            >
              Ver qué incluye
            </button>
          </div>

          <div className="relative z-10 flex flex-wrap justify-center gap-8 pt-8 opacity-50 text-xs font-black uppercase tracking-[0.2em]">
            <span>Seguridad Bancaria</span>
            <span>Nube Distribuida</span>
            <span>Soporte 24/7</span>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-8 md:gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <CostProLogo size={30} animated={false} className="grayscale" />
            <span className="text-xs font-bold text-muted-foreground">© 2026 CostPro Enterprise. Todos los derechos reservados.</span>
          </div>
          <div className="w-full md:w-auto overflow-x-auto no-scrollbar">
            <div className="flex flex-nowrap md:flex-wrap justify-center gap-x-8 gap-y-2 text-xs font-black uppercase tracking-widest text-muted-foreground min-w-max md:min-w-0 px-4 md:px-0">
              <a
                href="https://wa.me/5353183215"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors flex items-center gap-1 min-h-[44px]"
              >
                Soporte WhatsApp
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <a href="#" className="hover:text-primary transition-colors flex items-center min-h-[44px]">Términos</a>
              <a href="#" className="hover:text-primary transition-colors flex items-center min-h-[44px]">Privacidad</a>
            </div>
          </div>
        </div>
      </footer>

      {/* PWA Install Instructions Modal */}
      <PWAInstallModal
        isOpen={isPWAModalOpen}
        onClose={() => setIsPWAModalOpen(false)}
      />

      {/* Floating WhatsApp CTA */}
      <AnimatePresence>
        {isHydrated && (
          <motion.a
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            href="https://wa.me/5353183215"
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-[60] bg-[#25D366] text-white p-5 rounded-full shadow-[0_0_30px_rgba(37,211,102,0.4)] hover:shadow-[0_0_40px_rgba(37,211,102,0.6)] hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
            aria-label="Contactar por WhatsApp"
          >
            <div className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-20" />
            <MessageCircle className="w-7 h-7 fill-current relative z-10" />
            <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-3 transition-all duration-500 whitespace-nowrap font-black text-xs uppercase tracking-widest relative z-10">
              Soporte MiPyME
            </span>
          </motion.a>
        )}
      </AnimatePresence>
    </div>
  );
}
