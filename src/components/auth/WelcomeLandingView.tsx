'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Globe, Moon, Sun, Store, CreditCard, Landmark,
  BarChart3, Network, Cpu, Wallet, LineChart, Download,
  ShoppingBag, Utensils, Truck, Building2, Zap, ShieldCheck,
  Eye, MessageCircle, ExternalLink, HelpCircle, Play,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart,
  History,
  Shield,
  Activity
} from 'lucide-react';
import Link from 'next/link';
import CostProLogo from '@/components/CostProLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
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
  const [revenue, setRevenue] = useState(1000000);
  const [stores, setStores] = useState(12);

  const fugaMensual = revenue * 0.035;
  const fugaAnual = fugaMensual * 12;

  const { isInstallable, installApp } = usePWA();
  const { setCurrentView, setLastQuery } = useUIStore();

  useEffect(() => {
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

  const whatsappLink = "https://wa.me/5353183215";

  if (!isHydrated) return null;

  return (
    <div className="bg-background text-on-surface font-sans selection:bg-primary selection:text-on-primary min-h-screen">
      {/* Top Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="flex justify-between items-center max-w-7xl mx-auto px-6 h-20">
          <div className="text-2xl font-black tracking-tighter text-foreground flex items-center gap-2 font-headline">
            <CostProLogo size={32} animated={false} hideText />
            <span>COSTPRO</span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-semibold tracking-tight">
            <button onClick={goToHelpSlideshow} className="text-primary border-b-2 border-primary pb-1">Protocolo IPV</button>
            <button onClick={goToHelpSlideshow} className="text-muted-foreground hover:text-foreground transition-colors">Seguridad</button>
            <button onClick={goToHelpSlideshow} className="text-muted-foreground hover:text-foreground transition-colors">Integraciones</button>
            <button onClick={goToHelpSlideshow} className="text-muted-foreground hover:text-foreground transition-colors">Casos de Riesgo</button>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              onClick={handleInstallClick}
              className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                isInstallable ? "bg-primary text-on-primary" : "text-muted-foreground border border-outline-variant/20"
              )}
            >
              <Download className="w-4 h-4" />
              <span className="hidden lg:inline">APP</span>
            </button>
            <button onClick={onLoginClick} className="hidden lg:block text-muted-foreground font-semibold px-4 py-2 hover:text-foreground transition-colors">Login</button>
            <button onClick={onLoginClick} className="bg-primary text-on-primary font-bold px-6 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(98,223,125,0.2)]">Solicitar acceso exclusivo</button>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 pb-20 px-6 grid-bg">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <div className="z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-red-500/30 mb-6"
              >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-destructive">Alerta de Integridad Financiera</span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.95] text-foreground mb-8 font-headline"
              >
                Tu contabilidad <span className="text-destructive">NO coincide</span> con tu banco. Y eso te cuesta dinero hoy.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xl text-muted-foreground max-w-lg mb-10 leading-relaxed font-sans"
              >
                El motor IPV de COSTPRO audita cada transacción contra tu estructura de costos para detectar fugas que tus reportes actuales ignoran por completo.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap gap-4"
              >
                <button
                  onClick={onLoginClick}
                  className="bg-primary text-on-primary font-bold px-8 py-4 rounded hover:shadow-[0_0_20px_rgba(98,223,125,0.4)] transition-all uppercase tracking-widest text-sm"
                >
                  Dejar de perder dinero ahora
                </button>
                <button
                  onClick={goToHelpSlideshow}
                  className="border border-outline-variant px-8 py-4 rounded font-bold hover:bg-card transition-all uppercase tracking-widest text-sm"
                >
                  Ver ficha técnica IPV
                </button>
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="relative"
            >
              {/* Real-Time Alert Simulation */}
              <div className="relative glass-panel border border-red-500/30 rounded-xl p-4 shadow-2xl overflow-hidden terminal-glow">
                <div className="flex items-center justify-between mb-4 border-b border-outline-variant/20 pb-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                  </div>
                  <div className="text-[10px] font-mono text-destructive uppercase tracking-widest font-bold">SISTEMA_CRÍTICO : DISCREPANCIA</div>
                </div>
                <div className="bg-muted/60 rounded p-6 font-mono text-sm space-y-4">
                  <div className="flex items-start gap-3 text-destructive animate-pulse">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="font-bold">⚠ DISCREPANCIA DETECTADA: -$400.00</p>
                      <p className="text-[11px] opacity-80 mt-1">Origen: Terminal POS 3 | Sucursal Norte</p>
                    </div>
                  </div>
                  <div className="p-3 bg-red-500/5 border border-red-500/20 rounded">
                    <p className="text-[11px] text-slate-300">Causa: Comisión bancaria no registrada en conciliación interna.</p>
                    <p className="text-[10px] text-slate-500 mt-2">Acción recomendada: Ajuste de ledger inmediato.</p>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/10">
                    <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-tighter">
                      <span>Valor_Banco</span>
                      <span>Valor_Interno</span>
                      <span>Diff</span>
                    </div>
                    <div className="flex justify-between text-foreground font-bold mt-1">
                      <span>$2,450.40</span>
                      <span>$2,850.40</span>
                      <span className="text-destructive">-$400.00</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* LOSS CALCULATOR SECTION */}
        <section className="py-24 px-6 bg-muted/20 border-y border-outline-variant/10">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-black text-foreground uppercase tracking-tight font-headline">Calculadora de Fuga Operativa</h2>
              <p className="text-muted-foreground font-sans mt-2">Dimensiona el impacto de tu ceguera financiera actual.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 bg-card p-8 rounded border border-outline-variant/30 monospaced-data">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs text-primary font-bold mb-2 uppercase tracking-widest">Ingresos Mensuales ($)</label>
                  <input
                    className="w-full bg-background border border-outline-variant rounded p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    type="number"
                    value={revenue}
                    onChange={(e) => setRevenue(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-primary font-bold mb-2 uppercase tracking-widest">Número de Puntos de Venta</label>
                  <input
                    className="w-full bg-background border border-outline-variant rounded p-3 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    type="number"
                    value={stores}
                    onChange={(e) => setStores(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="bg-muted/40 rounded p-6 flex flex-col justify-between border border-primary/20">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Fuga estimada (3.5% avg)</div>
                  <div className="text-4xl font-bold text-destructive">
                    ${fugaMensual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-sm font-normal text-muted-foreground ml-2">/ mes</span>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-outline-variant/20">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Pérdida Anual Proyectada</div>
                  <div className="text-2xl font-bold text-foreground">
                    ${fugaAnual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center mt-8">
              <button
                onClick={onLoginClick}
                className="bg-primary text-on-primary font-bold px-10 py-4 rounded hover:scale-105 transition-all uppercase tracking-widest text-sm"
              >
                Detectar pérdidas ocultas
              </button>
            </div>
          </div>
        </section>

        {/* INVISIBLE LOSS SECTION */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
            <div className="md:w-1/2">
              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-foreground mb-6 font-headline leading-tight">El dinero que estás perdiendo no aparece en tus reportes.</h2>
              <p className="text-xl text-muted-foreground font-sans mb-8">
                Tus márgenes actuales son solo deseos. Sin una auditoría transacción-por-transacción, estás operando con discrepancias bancarias, dobles cargos y comisiones ocultas que erosionan tu capital silenciosamente.
              </p>
              <div className="space-y-6">
                <div className="flex items-start gap-4 p-4 bg-card rounded border-l-4 border-red-500">
                  <XCircle className="w-6 h-6 text-destructive flex-shrink-0" />
                  <div>
                    <h4 className="text-foreground font-bold mb-1">Márgenes Falsos</h4>
                    <p className="text-sm text-muted-foreground">Confiar en el saldo contable sin validar el extracto bancario minuto a minuto genera una ilusión de rentabilidad.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 bg-card rounded border-l-4 border-primary">
                  <History className="w-6 h-6 text-primary flex-shrink-0" />
                  <div>
                    <h4 className="text-foreground font-bold mb-1">Latencia de Decisión</h4>
                    <p className="text-sm text-muted-foreground">Conciliar mensualmente significa que descubres problemas 30 días después de que ocurrieron. Demasiado tarde para recuperar el dinero.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:w-1/2 grid grid-cols-2 gap-4">
              <div className="bg-card p-6 border border-red-500/20 rounded text-center">
                <div className="text-destructive font-mono text-xs mb-2">ERROR_HUMANO_AVG</div>
                <div className="text-4xl font-bold font-mono text-foreground">4.2%</div>
                <div className="text-[10px] text-slate-500 mt-2 uppercase">De facturación total</div>
              </div>
              <div className="bg-card p-6 border border-outline-variant/30 rounded text-center">
                <div className="text-outline font-mono text-xs mb-2">TIEMPO_CONTABLE</div>
                <div className="text-4xl font-bold font-mono text-foreground">120h</div>
                <div className="text-[10px] text-slate-500 mt-2 uppercase">Perdidas en Excel</div>
              </div>
              <div className="col-span-2 bg-red-500/5 p-8 border border-red-500/20 rounded">
                <h4 className="text-foreground font-bold mb-3 text-lg uppercase tracking-tight">Riesgo Operativo Inminente</h4>
                <p className="text-sm text-muted-foreground leading-relaxed italic">"Si tu información financiera tiene más de 24 horas de retraso, no estás dirigiendo una empresa; estás reaccionando a un pasado que ya no puedes cambiar."</p>
              </div>
            </div>
          </div>
        </section>

        {/* IPV MECHANISM */}
        <section className="py-32 px-6 bg-muted/20 border-y border-outline-variant/10">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h4 className="font-mono text-xs uppercase tracking-[0.2em] text-secondary font-bold mb-2">Estructura del Motor</h4>
              <h2 className="text-4xl font-black text-foreground font-headline uppercase tracking-tight">Protocolo de Validación de Integridad (IPV)</h2>
              <p className="text-muted-foreground font-sans max-w-2xl mx-auto mt-4">No usamos IA como buzzword. Auditamos matemáticamente cada flujo de dinero.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-card border border-outline-variant/20 p-8 rounded group">
                <div className="monospaced-data text-xs text-primary mb-4 font-bold">01. INPUT</div>
                <h3 className="text-xl font-bold text-foreground mb-4 font-headline">Ingesta de Datos Crudos</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Conexión directa via API con bancos, terminales POS y ERP. Eliminamos la manipulación humana en la carga de datos.</p>
              </div>
              <div className="bg-primary/5 border border-primary/20 p-8 rounded relative overflow-hidden group">
                <div className="monospaced-data text-xs text-primary mb-4 font-bold">02. PROCESS</div>
                <h3 className="text-xl font-bold text-foreground mb-4 font-headline">Cruce de Transacciones</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Cruzamos cada transacción bancaria contra tu estructura de costos específica. El motor detecta discrepancias a nivel de sub-centavo en milisegundos.</p>
                <div className="absolute -right-4 -bottom-4 opacity-10">
                  <BarChart className="w-[120px] h-[120px] text-primary" />
                </div>
              </div>
              <div className="bg-card border border-outline-variant/20 p-8 rounded group">
                <div className="monospaced-data text-xs text-primary mb-4 font-bold">03. OUTPUT</div>
                <h3 className="text-xl font-bold text-foreground mb-4 font-headline">Justificación Técnica</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Alertas accionables con causa probable. Cada error tiene un log de auditoría inmutable para cierres contables sin fricción.</p>
              </div>
            </div>
          </div>
        </section>

        {/* BEFORE/AFTER COMPARISON */}
        <section className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-4xl font-black text-foreground font-headline text-center mb-16 uppercase tracking-tight">Realidad vs. Protocolo COSTPRO</h2>
            <div className="grid md:grid-cols-2 gap-1px bg-outline-variant/20 border border-outline-variant/20 rounded overflow-hidden">
              <div className="bg-card p-12">
                <h4 className="text-destructive font-mono text-xs font-bold mb-8 uppercase tracking-widest">Estado Actual: Vulnerable</h4>
                <ul className="space-y-6">
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <XCircle className="w-5 h-5 text-destructive/50" />
                    <span>Conciliación manual en hojas de cálculo</span>
                  </li>
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <XCircle className="w-5 h-5 text-destructive/50" />
                    <span>Reportes con 15-30 días de latencia</span>
                  </li>
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <XCircle className="w-5 h-5 text-destructive/50" />
                    <span>Márgenes basados en estimaciones contables</span>
                  </li>
                  <li className="flex items-center gap-3 text-muted-foreground">
                    <XCircle className="w-5 h-5 text-destructive/50" />
                    <span>Fugas detectadas demasiado tarde para recuperar</span>
                  </li>
                </ul>
              </div>
              <div className="bg-card p-12 border-l border-outline-variant/10">
                <h4 className="text-primary font-mono text-xs font-bold mb-8 uppercase tracking-widest">Protocolo IPV: Blindado</h4>
                <ul className="space-y-6">
                  <li className="flex items-center gap-3 text-foreground font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span>Validación en tiempo real sin intervención humana</span>
                  </li>
                  <li className="flex items-center gap-3 text-foreground font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span>Márgenes verificados transacción por transacción</span>
                  </li>
                  <li className="flex items-center gap-3 text-foreground font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span>Alertas de discrepancia inmediatas</span>
                  </li>
                  <li className="flex items-center gap-3 text-foreground font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span>Zero discrepancias ocultas al cierre de mes</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* EXECUTIVE PRESSURE BLOCK */}
        <section className="py-24 px-6 bg-destructive/10 border-y border-red-900/30">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground mb-6 font-headline leading-tight">Si tus datos financieros están retrasados, tus decisiones son incorrectas.</h2>
            <p className="text-xl text-slate-300 font-sans mb-10 max-w-2xl mx-auto">
              Para el CFO que no acepta "aproximaciones". Recupera el control total de cada centavo que entra y sale de tu operation.
            </p>
            <button
              onClick={onLoginClick}
              className="bg-white text-black font-bold px-12 py-5 rounded text-lg hover:opacity-90 transition-all uppercase tracking-tighter"
            >
              Escanear mi operación
            </button>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-32 px-6 text-center bg-gradient-to-b from-background to-primary/10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-foreground mb-8 font-headline leading-none uppercase">
              Blindaje de Flujo de Caja.
            </h2>
            <p className="text-xl text-muted-foreground mb-12 font-sans italic">Acceso limitado a empresas con facturación &gt;$500k/mes.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <button
                onClick={onLoginClick}
                className="bg-primary text-on-primary font-bold px-12 py-5 rounded text-lg hover:scale-105 transition-all shadow-[0_0_30px_rgba(98,223,125,0.3)] uppercase tracking-widest"
              >
                Solicitar acceso exclusivo
              </button>
              <button
                onClick={goToHelpSlideshow}
                className="bg-foreground text-background font-bold px-12 py-5 rounded text-lg hover:opacity-90 transition-all uppercase tracking-widest"
              >
                Hablar con ingeniería
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-background w-full border-t border-border pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="text-xl font-bold text-foreground font-headline mb-4 uppercase tracking-tighter flex items-center gap-2">
              <CostProLogo size={24} animated={false} hideText />
              <span>COSTPRO</span>
            </div>
            <p className="font-mono text-[10px] tracking-widest uppercase text-slate-500 max-w-sm">
              © 2024 COSTPRO Infrastructure Systems. Auditoría de Flujos de Precisión Quirúrgica.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4 md:justify-end items-center">
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-primary transition-colors" href="#">Estado del Sistema</a>
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-primary transition-colors" href="#">Seguridad Bancaria</a>
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-primary transition-colors" href="#">API Documentation</a>
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-primary transition-colors" href="#">Legal</a>
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
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-[60] bg-[#25D366] text-foreground p-5 rounded-full shadow-[0_0_30px_rgba(37,211,102,0.4)] hover:shadow-[0_0_40px_rgba(37,211,102,0.6)] hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
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
