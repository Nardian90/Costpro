'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, CheckCircle2, ShoppingCart, Package,
  Shield, TrendingUp, BarChart3, FileText,
  Check, Play, MousePointer2, ExternalLink,
  Store, Utensils, Factory, Briefcase, Zap,
  MessageCircle
} from 'lucide-react';
import CostProLogo from '@/components/CostProLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import AutomationWorkflowDiagram from './diagrams/AutomationWorkflowDiagram';
import SpeedScaleDiagram from './diagrams/SpeedScaleDiagram';

interface WelcomeLandingViewProps {
  onLoginClick: () => void;
}

export default function WelcomeLandingView({ onLoginClick }: WelcomeLandingViewProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

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
      desc: "Asistente Jules para análisis predictivo y consultas en tiempo real.",
      icon: <BarChart3 className="w-5 h-5" />,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10"
    }
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header / Nav */}
      <header className={`sticky top-0 z-50 bg-background/80 ${isHydrated ? 'backdrop-blur-[10px]' : ''} border-b border-border/50 transition-all duration-500`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <CostProLogo size={40} animated={false} />
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
          </div>
          <button
            onClick={onLoginClick}
            className="neu-btn neu-btn-primary px-8 py-2.5 text-xs font-black uppercase tracking-widest flex items-center gap-2 group shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all"
          >
            Acceso al Sistema
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              v5.7.24 Hardened Enterprise Release
            </div>

            <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-[0.9] uppercase text-foreground">
              Control <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-lime-400 italic">Total</span> <br />
              de su Negocio.
            </h1>

            <p className="text-xl text-muted-foreground font-medium max-w-xl leading-relaxed">
              La plataforma integral de gestión diseñada para escalar MiPyMEs con precisión técnica, automatización de costos y operativa móvil de alto rendimiento.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button
                onClick={onLoginClick}
                className="neu-btn neu-btn-primary h-14 px-10 text-sm font-black uppercase tracking-widest shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:shadow-[0_0_40px_rgba(16,185,129,0.35)] transition-all"
              >
                Comenzar Ahora
              </button>
              <button className="h-14 px-10 text-sm font-black uppercase tracking-widest border border-border rounded-xl hover:bg-muted/50 transition-colors">
                Ver Demo Online
              </button>
            </div>

            <div className="flex items-center gap-6 pt-8 grayscale opacity-50">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Aislamiento RLS</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Escalabilidad Cloud</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-square rounded-[3rem] bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent border border-primary/10 overflow-hidden relative group">
              <div className="absolute inset-0 flex items-center justify-center">
                 <CostProLogo size={240} animated className="opacity-10 scale-150 rotate-12 group-hover:rotate-0 transition-transform duration-1000" />
              </div>

              {/* Floating Cards Mockup */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className={`absolute top-10 right-10 p-6 rounded-3xl bg-background/80 ${isHydrated ? 'backdrop-blur-2xl' : ''} border border-border/50 shadow-[0_20px_50px_rgba(0,0,0,0.1)] space-y-4 w-64 z-10 transition-all duration-700`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ventas Hoy</span>
                  <BadgeCheck className="w-4 h-4 text-primary" />
                </div>
                <div className="text-3xl font-black tracking-tight">$42,950.00</div>
                <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "75%" }}
                    className="h-full bg-primary"
                  />
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity }}
                className="absolute bottom-10 left-10 p-6 rounded-3xl bg-primary text-white shadow-[0_20px_50px_rgba(16,185,129,0.3)] space-y-4 w-64 z-10"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Stock Crítico</span>
                  <Package className="w-4 h-4 opacity-70" />
                </div>
                <div className="text-3xl font-black tracking-tight">12 Items</div>
                <p className="text-[10px] font-bold opacity-80 uppercase leading-tight">Acción inmediata requerida en sucursal Norte.</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1 }}
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 rounded-3xl bg-background/40 ${isHydrated ? 'backdrop-blur-xl' : ''} border border-white/10 shadow-2xl w-48 text-center space-y-2 transition-all duration-700`}
              >
                <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto text-violet-500">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="text-xs font-black uppercase tracking-widest">Inteligencia AI</div>
                <div className="text-[10px] text-muted-foreground font-medium">Jules analizando tendencias...</div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Sectors Trust Signals */}
      <section className="py-12 border-y border-border/50 bg-muted/10 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 flex overflow-x-auto md:flex-wrap justify-start md:justify-between items-center gap-8 md:gap-4 opacity-50 grayscale no-scrollbar scroll-smooth">
          <div className="flex items-center gap-3 shrink-0">
            <Utensils className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Restauración</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Store className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Retail & Comercio</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Factory className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Manufactura</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Briefcase className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Servicios Prof.</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <TrendingUp className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Franquicias</span>
          </div>
        </div>
        <style jsx>{`
          .no-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>
      </section>

      {/* Modules Grid - Bento Layout */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-4xl font-black uppercase tracking-tighter">Ecosistema Integrado</h2>
            <p className="text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
              Módulos técnicos desarrollados bajo estándares de arquitectura empresarial para garantizar la integridad de sus datos y la velocidad operativa.
            </p>
          </div>

          <div className="grid md:grid-cols-6 md:grid-rows-2 gap-4 h-full lg:h-[600px]">
            {/* Main Feature - Bento 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="md:col-span-3 md:row-span-2 p-10 rounded-[2.5rem] bg-background border border-border hover:border-primary/20 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-600 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                  <FileText className="w-7 h-7" />
                </div>
                <h3 className="text-3xl font-black uppercase tracking-tight mb-4">Gestión de Costos</h3>
                <p className="text-lg text-muted-foreground leading-relaxed font-medium mb-8">
                  Motor de ingeniería con 14 secciones de gasto, 5 anexos técnicos y validación de ciclos en tiempo real.
                </p>
              </div>
              <div className="aspect-video rounded-2xl bg-muted/50 border border-border/50 overflow-hidden relative p-4">
                <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/5 to-transparent" />
                <div className="space-y-2 relative z-10">
                  <div className="h-4 w-3/4 bg-violet-500/20 rounded-full animate-pulse" />
                  <div className="h-4 w-1/2 bg-violet-500/10 rounded-full animate-pulse delay-75" />
                  <div className="h-4 w-2/3 bg-violet-500/10 rounded-full animate-pulse delay-150" />
                </div>
              </div>
            </motion.div>

            {/* Bento 2 - POS */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="md:col-span-3 md:row-span-1 p-8 rounded-[2.5rem] bg-background border border-border hover:border-primary/20 transition-all group flex gap-8 items-center"
            >
              <div className="shrink-0 w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:rotate-12 transition-transform">
                <ShoppingCart className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight mb-2">Punto de Venta</h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                  TPV móvil optimizado para operaciones de alta velocidad con sincronización offline.
                </p>
              </div>
            </motion.div>

            {/* Bento 3 - Inventory */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="md:col-span-3 md:row-span-1 lg:col-span-2 p-8 rounded-[2.5rem] bg-background border border-border hover:border-primary/20 transition-all group"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-4 group-hover:-translate-y-1 transition-transform">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight mb-2">Inventario Multi-Sede</h3>
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
              className="md:col-span-3 md:row-span-1 lg:col-span-1 p-8 rounded-[2.5rem] bg-foreground text-background transition-all group flex items-center justify-center"
            >
              <div className="text-center">
                <Zap className="w-8 h-8 mx-auto mb-2 text-primary animate-pulse" />
                <div className="text-[10px] font-black uppercase tracking-widest">Jules AI</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SMB Feature Spotlight: Massive Cost Sheets */}
      <section className="py-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div className="order-2 lg:order-1 space-y-12">
              <div className="space-y-6">
                <div className="inline-block px-4 py-2 rounded-xl bg-violet-500/10 text-violet-600 text-[10px] font-black uppercase tracking-widest">
                  Caso de Éxito MiPyME
                </div>
                <h2 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-none">
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

              <button
                onClick={onLoginClick}
                className="neu-btn border-2 border-violet-600 text-violet-600 h-14 px-10 text-sm font-black uppercase tracking-widest hover:bg-violet-600 hover:text-white transition-all flex items-center gap-2"
              >
                Ver esta funcionalidad
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="order-1 lg:order-2 space-y-8">
              <AutomationWorkflowDiagram />
              <SpeedScaleDiagram />
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto p-12 lg:p-20 rounded-[4rem] bg-foreground text-background relative overflow-hidden text-center space-y-10">
          <div className="absolute inset-0 opacity-10">
            <CostProLogo size={400} className="absolute -bottom-20 -right-20 rotate-12" />
          </div>

          <div className="relative z-10 space-y-6">
            <h2 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-none">
              ¿Listo para modernizar su gestión?
            </h2>
            <p className="text-lg opacity-70 font-medium max-w-xl mx-auto">
              Únase a las MiPyMEs que ya optimizan sus márgenes con CostPro.
            </p>
          </div>

          <div className="relative z-10">
            <button
              onClick={onLoginClick}
              className="px-12 py-5 bg-primary text-white rounded-2xl text-base font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-2xl"
            >
              Acceso Inmediato de Clientes
            </button>
          </div>

          <div className="relative z-10 flex flex-wrap justify-center gap-8 pt-8 opacity-50 text-[10px] font-black uppercase tracking-[0.2em]">
            <span>Seguridad Bancaria</span>
            <span>Nube Distribuida</span>
            <span>Soporte 24/7</span>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <CostProLogo size={30} animated={false} className="grayscale" />
            <span className="text-xs font-bold text-muted-foreground">© 2026 CostPro Enterprise. Todos los derechos reservados.</span>
          </div>
          <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <a
              href="https://wa.me/5353183215"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              Soporte WhatsApp
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
            <a href="#" className="hover:text-primary transition-colors">Términos</a>
            <a href="#" className="hover:text-primary transition-colors">Privacidad</a>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp CTA */}
      <AnimatePresence>
        {isHydrated && (
          <motion.a
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            href="https://wa.me/5353183215"
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-[60] bg-[#25D366] text-white p-4 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
            aria-label="Contactar por WhatsApp"
          >
            <MessageCircle className="w-6 h-6 fill-current" />
            <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 transition-all duration-500 whitespace-nowrap font-bold text-[10px] uppercase tracking-widest">
              Soporte MiPyME
            </span>
          </motion.a>
        )}
      </AnimatePresence>
    </div>
  );
}

function BadgeCheck({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-full bg-emerald-500/20 p-1 ${className}`}>
      <Check className="w-3 h-3 text-emerald-600" />
    </div>
  );
}
