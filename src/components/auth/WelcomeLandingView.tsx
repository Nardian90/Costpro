'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Globe, Moon, Sun, Store, CreditCard, Landmark,
  BarChart3, Network, Cpu, Wallet, LineChart, Download,
  ShoppingBag, Utensils, Truck, Building2, Zap, ShieldCheck,
  Eye, MessageCircle, ExternalLink, HelpCircle, Play
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
    <div className="bg-[#0b1326] text-[#dae2fd] font-sans selection:bg-[#62df7d] selection:text-[#003914] min-h-screen">
      {/* Top Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#060e20]/80 backdrop-blur-xl border-b border-[#2d3449]/30">
        <div className="flex justify-between items-center max-w-7xl mx-auto px-6 h-20">
          <div className="text-2xl font-black tracking-tighter text-slate-100 flex items-center gap-2">
            <CostProLogo size={32} animated={false} hideText />
            <span className="hidden sm:inline">COSTPRO</span>
          </div>
          <div className="hidden md:flex items-center gap-8 font-semibold tracking-tight">
            <button onClick={goToHelpSlideshow} className="text-[#62df7d] border-b-2 border-[#62df7d] pb-1">Plataforma</button>
            <button onClick={goToHelpSlideshow} className="text-slate-400 hover:text-slate-100 transition-colors">Soluciones</button>
            <button onClick={goToHelpSlideshow} className="text-slate-400 hover:text-slate-100 transition-colors">Empresa</button>
            <button onClick={goToHelpSlideshow} className="text-slate-400 hover:text-slate-100 transition-colors">Recursos</button>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              onClick={handleInstallClick}
              className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                isInstallable ? "bg-[#62df7d] text-[#003914]" : "text-slate-400 border border-[#2d3449]"
              )}
            >
              <Download className="w-4 h-4" />
              <span className="hidden lg:inline">APP</span>
            </button>
            <button onClick={onLoginClick} className="hidden lg:block text-slate-400 font-semibold px-4 py-2 hover:text-slate-100 transition-colors">Iniciar Sesión</button>
            <button onClick={onLoginClick} className="bg-[#62df7d] text-[#003914] font-bold px-6 py-2 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(98,223,125,0.2)] text-xs sm:text-base">Empezar Ahora</button>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 pb-32 px-6">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <div className="z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2d3449] border border-[#3e4a3d]/30 mb-6"
              >
                <span className="w-2 h-2 rounded-full bg-[#62df7d] animate-pulse"></span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#4cd7f6]">Nuevo: Motor Multi-Sede 2.0</span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.9] text-slate-100 mb-8 uppercase"
              >
                Inteligencia <span className="text-[#62df7d]">Financiera</span> para Multi-Sede.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xl text-[#bdcaba] max-w-lg mb-10 leading-relaxed"
              >
                El sistema operativo financiero definitivo para empresas multi-sucursal. Control total de costos, conciliación bancaria y visibilidad en tiempo real.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap gap-4"
              >
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#62df7d] text-[#003914] font-bold px-8 py-4 rounded hover:shadow-[0_0_20px_rgba(98,223,125,0.4)] transition-all flex items-center justify-center gap-2 w-full sm:w-auto uppercase tracking-widest"
                >
                  Solicitar Demo
                </a>
                <button
                  onClick={onLoginClick}
                  className="border border-[#3e4a3d] px-8 py-4 rounded font-bold hover:bg-[#171f33] transition-all w-full sm:w-auto uppercase tracking-widest"
                >
                  Ver Plataforma
                </button>
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="relative"
            >
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#62df7d]/10 blur-[120px] rounded-full"></div>
              <div className="relative bg-[#0b1326]/70 backdrop-blur-md border border-[#2d3449]/20 rounded-xl p-4 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between mb-4 border-b border-[#2d3449]/20 pb-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
                  </div>
                  <div className="text-[10px] text-[#879485] uppercase tracking-widest">Centro de Operaciones Global</div>
                </div>
                <img
                  alt="Dashboard"
                  className="rounded border border-[#2d3449]/10 opacity-90 grayscale brightness-75 hover:grayscale-0 transition-all duration-700 w-full"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAFzrna1TYTJ3F3mR56dbN8XuzdRFqmgZoyuWzlidQElys6wvJoywHDwn-YRv9wycSIirqWFbo4HwHSlxKUZl_m8-jnDtnHDXfdxV9kEqxY2p5eEzqLJvfiEolC6U_e0iap1X57oZ4otcUCLj8DD2TPdwXwkgsbqJ4M_YgRndIWAEf-SkzNdxD4rzrhdwe5I83cFY0zLK02pYZEN2_vseLetuQylt1o_2fcoAZLluBjHnwOKLq-xWSi_qdmpyZyQZPwm3b4zy-IaKmE"
                />
                <div className="absolute top-12 right-8 bg-[#0b1326]/70 backdrop-blur-md p-3 border border-[#62df7d]/30 rounded-lg shadow-xl translate-y-4">
                  <div className="text-[10px] text-[#62df7d] font-bold mb-1">FLUJO EN TIEMPO REAL</div>
                  <div className="text-2xl font-bold font-mono tracking-tight">$124,902.45</div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* System Overview */}
        <section className="bg-[#131b2e] py-32 px-6">
          <div className="max-w-7xl mx-auto text-center mb-24">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-100 mb-6 uppercase">Todo conectado. Nada fragmentado.</h2>
            <p className="text-[#bdcaba] max-w-2xl mx-auto">Elimine las islas de datos. Una arquitectura unificada diseñada para la complejidad de las operaciones modernas.</p>
          </div>
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
            <div className="md:col-span-1 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#2d3449] border border-[#3e4a3d] flex items-center justify-center">
                <Store className="text-[#4cd7f6]" />
              </div>
              <span className="text-[10px] font-bold uppercase text-[#879485]">Sucursales</span>
            </div>
            <div className="md:col-span-1 hidden md:flex justify-center">
              <ArrowRight className="text-[#3e4a3d]" />
            </div>
            <div className="md:col-span-1 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#2d3449] border border-[#3e4a3d] flex items-center justify-center">
                <CreditCard className="text-[#62df7d]" />
              </div>
              <span className="text-[10px] font-bold uppercase text-[#879485]">Costos</span>
            </div>
            <div className="md:col-span-1 hidden md:flex justify-center">
              <ArrowRight className="text-[#3e4a3d]" />
            </div>
            <div className="md:col-span-1 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#2d3449] border border-[#3e4a3d] flex items-center justify-center">
                <Landmark className="text-[#4cd7f6]" />
              </div>
              <span className="text-[10px] font-bold uppercase text-[#879485]">Transacciones</span>
            </div>
            <div className="md:col-span-1 hidden md:flex justify-center">
              <ArrowRight className="text-[#3e4a3d]" />
            </div>
            <div className="md:col-span-1 flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-[#62df7d]/20 border border-[#62df7d] flex items-center justify-center shadow-[0_0_30px_rgba(98,223,125,0.2)]">
                <BarChart3 className="text-[#62df7d] scale-125" />
              </div>
              <span className="text-[10px] font-bold uppercase text-[#62df7d]">Insights</span>
            </div>
          </div>
        </section>

        {/* Core Engine (3 Pillars) */}
        <section className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-1">
              {/* Pillar 1 */}
              <div className="bg-[#171f33] p-12 border-l border-t border-[#3e4a3d]/20 hover:bg-[#222a3d] transition-all group">
                <div className="text-[#62df7d] mb-8">
                  <Network size={48} />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-slate-100 uppercase tracking-tighter">Control Multi-Sede</h3>
                <p className="text-[#bdcaba] mb-12 leading-relaxed">Gestione cientos de puntos de venta desde una única interfaz soberana. Consolidación automática de KPIs operativos.</p>
                <div className="pt-8 border-t border-[#3e4a3d]/30">
                  <div className="font-mono text-[11px] text-[#62df7d]/70 mb-2 uppercase tracking-widest">Nodos Operativos</div>
                  <div className="flex justify-between items-end">
                    <span className="text-4xl font-bold text-slate-200">512</span>
                    <span className="text-[#62df7d] text-xs font-bold">+12% CRECIMIENTO</span>
                  </div>
                </div>
              </div>
              {/* Pillar 2 */}
              <div className="bg-[#131b2e] p-12 border-x lg:border-y border-[#3e4a3d]/20 hover:bg-[#171f33] transition-all group lg:scale-105 z-10 shadow-2xl">
                <div className="text-[#4cd7f6] mb-8">
                  <Cpu size={48} />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-slate-100 uppercase tracking-tighter">Inteligencia de Costos</h3>
                <p className="text-[#bdcaba] mb-12 leading-relaxed">Hojas de costos automatizadas. El motor de IA predice desviaciones y detecta fugas de capital en tiempo real.</p>
                <div className="pt-8 border-t border-[#3e4a3d]/30">
                  <div className="font-mono text-[11px] text-[#4cd7f6]/70 mb-2 uppercase tracking-widest">Índice de Precisión</div>
                  <div className="flex justify-between items-end">
                    <span className="text-4xl font-bold text-slate-200">99.98%</span>
                    <span className="text-[#4cd7f6] text-xs font-bold uppercase">Auditado</span>
                  </div>
                </div>
              </div>
              {/* Pillar 3 */}
              <div className="bg-[#171f33] p-12 border-r border-t border-[#3e4a3d]/20 hover:bg-[#222a3d] transition-all group">
                <div className="text-[#62df7d] mb-8">
                  <Wallet size={48} />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-slate-100 uppercase tracking-tighter">Conciliación IPV</h3>
                <p className="text-[#bdcaba] mb-12 leading-relaxed">Análisis bancario profundo. Emparejamiento inteligente de transacciones contra registros de ventas.</p>
                <div className="pt-8 border-t border-[#3e4a3d]/30">
                  <div className="font-mono text-[11px] text-[#62df7d]/70 mb-2 uppercase tracking-widest">Latencia MS</div>
                  <div className="flex justify-between items-end">
                    <span className="text-4xl font-bold text-slate-200">14.2</span>
                    <span className="text-[#62df7d] text-xs font-bold">TIEMPO REAL</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Product Experience / Bento Grid */}
        <section className="py-32 px-6 bg-[#060e20]">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
              <div className="max-w-2xl">
                <h2 className="text-5xl font-black tracking-tight text-slate-100 mb-6 leading-tight uppercase">Diseñado para la precisión quirúrgica.</h2>
                <p className="text-[#bdcaba] text-lg">Nuestra interfaz no es solo un dashboard; es un centro de mando diseñado para analistas soberanos.</p>
              </div>
              <button
                onClick={onLoginClick}
                className="bg-[#62df7d] text-[#003914] font-bold px-8 py-3 rounded-sm text-sm uppercase tracking-widest"
              >
                Lanzar Motor
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto">
              <div className="md:col-span-8 bg-[#171f33] border border-[#2d3449]/20 rounded p-8 relative overflow-hidden group min-h-[300px]">
                <div className="relative z-10">
                  <h4 className="text-xs uppercase tracking-[0.2em] text-[#62df7d] font-bold mb-4">Comando Centralizado</h4>
                  <h3 className="text-3xl font-bold text-slate-100 mb-6 uppercase tracking-tighter">Unificación de Canales</h3>
                </div>
                <img
                  alt="Data Flow"
                  className="absolute bottom-0 right-0 w-3/4 opacity-40 group-hover:scale-105 transition-transform duration-1000"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOpJMbRf5wbACWQ7K79szX98OL9vGIyTdB0uH8Diz53cimbPG8xTXoikR63-UJRRxo726Xlv9vNt-zHrISUNsz-SwJFnKXL9qGHbLscXx3EwonyBxgOrNHt2IX1hqBoxmSfQIyW4cRTuFrf1JXd-6mp4OSrLuEOi7huMxOq72uSp_IOVdtrVUXghSBia4SWOvK5pAqf1k2zl7-y-mJ07jiJM7wF2KmXKoiIvghAH38snqcaLeR9jrQOfEwXWJ3Yi0qOuwcCJ3Cyjk4"
                />
              </div>
              <div className="md:col-span-4 grid grid-rows-2 gap-6">
                <div className="bg-[#222a3d] border border-[#2d3449]/20 rounded p-8 flex flex-col justify-between min-h-[200px]">
                  <LineChart className="text-[#4cd7f6] w-10 h-10" />
                  <div>
                    <h4 className="text-xl font-bold text-slate-100 mb-2 uppercase tracking-tighter">Motor de Matching</h4>
                    <p className="text-sm text-[#bdcaba]">Algoritmos de conciliación patentados con 0.001% de margen de error.</p>
                  </div>
                </div>
                <div className="bg-[#62df7d]/5 border border-[#62df7d]/20 rounded p-8 flex flex-col justify-between min-h-[200px] group">
                  <div className="text-4xl font-bold text-[#62df7d] font-mono tracking-tighter">84.2%</div>
                  <div>
                    <h4 className="text-xl font-bold text-slate-100 mb-2 uppercase tracking-tighter">Reducción de Carga</h4>
                    <p className="text-sm text-[#bdcaba]">Automatización de tareas financieras manuales y repetitivas.</p>
                  </div>
                </div>
              </div>
              <div className="md:col-span-4 bg-[#171f33] border border-[#2d3449]/20 rounded p-8 min-h-[250px]">
                <h4 className="text-xs uppercase tracking-widest text-[#879485] mb-4 font-bold">Capacidades de Exportación</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-[#2d3449] rounded border border-[#2d3449]/20">
                    <span className="text-xs font-mono uppercase tracking-tighter">Reporte_Anual_2024.pdf</span>
                    <Download className="text-xs w-4 h-4" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#2d3449] rounded border border-[#2d3449]/20">
                    <span className="text-xs font-mono uppercase tracking-tighter">Cumplimiento_Fiscal_Q3.xlsx</span>
                    <Download className="text-xs w-4 h-4" />
                  </div>
                </div>
              </div>
              <div className="md:col-span-8 bg-[#222a3d] border border-[#2d3449]/20 rounded p-8 flex flex-col justify-end relative overflow-hidden min-h-[250px]">
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(circle, #62df7d 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                </div>
                <h3 className="text-2xl font-bold text-slate-100 mb-2 z-10 uppercase tracking-tighter">Distribución Inteligente</h3>
                <p className="text-[#bdcaba] z-10">Optimización de inventarios basada en demanda financiera proyectada por sucursal.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Vertical Solutions */}
        <section className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl font-black tracking-tight text-slate-100 mb-4 uppercase">Soluciones Verticales</h2>
              <div className="h-1 w-24 bg-[#62df7d] mx-auto"></div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="text-center p-8 bg-[#131b2e] rounded-lg border border-[#3e4a3d]/10 hover:border-[#62df7d]/40 transition-all">
                <ShoppingBag className="w-10 h-10 text-[#62df7d] mx-auto mb-4" />
                <h4 className="font-bold text-slate-100 mb-2 uppercase tracking-tighter">Cadenas Retail</h4>
                <p className="text-xs text-[#bdcaba]">Gestión de inventarios y ventas consolidadas.</p>
              </div>
              <div className="text-center p-8 bg-[#131b2e] rounded-lg border border-[#3e4a3d]/10 hover:border-[#62df7d]/40 transition-all">
                <Utensils className="w-10 h-10 text-[#62df7d] mx-auto mb-4" />
                <h4 className="font-bold text-slate-100 mb-2 uppercase tracking-tighter">Restaurantes</h4>
                <p className="text-xs text-[#bdcaba]">Escandallos dinámicos y control de mermas.</p>
              </div>
              <div className="text-center p-8 bg-[#131b2e] rounded-lg border border-[#3e4a3d]/10 hover:border-[#62df7d]/40 transition-all">
                <Truck className="w-10 h-10 text-[#62df7d] mx-auto mb-4" />
                <h4 className="font-bold text-slate-100 mb-2 uppercase tracking-tighter">Distribución</h4>
                <p className="text-xs text-[#bdcaba]">Logística financiera y flujos de proveedores.</p>
              </div>
              <div className="text-center p-8 bg-[#131b2e] rounded-lg border border-[#3e4a3d]/10 hover:border-[#62df7d]/40 transition-all">
                <Building2 className="w-10 h-10 text-[#62df7d] mx-auto mb-4" />
                <h4 className="font-bold text-slate-100 mb-2 uppercase tracking-tighter">MiPyMEs</h4>
                <p className="text-xs text-[#bdcaba]">Crecimiento escalable con bases sólidas.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Value Prop */}
        <section className="py-32 px-6 bg-[#222a3d]">
          <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-12">
            <div className="flex flex-col gap-6">
              <div className="w-12 h-12 bg-[#62df7d]/10 rounded flex items-center justify-center">
                <Zap className="text-[#62df7d]" />
              </div>
              <h3 className="text-xl font-bold text-slate-100 uppercase tracking-tighter">Reduzca el trabajo manual</h3>
              <p className="text-[#bdcaba] leading-relaxed">Libere a su equipo de hojas de cálculo infinitas. Automatizamos el 90% de la entrada de datos financieros.</p>
            </div>
            <div className="flex flex-col gap-6">
              <div className="w-12 h-12 bg-[#4cd7f6]/10 rounded flex items-center justify-center">
                <ShieldCheck className="text-[#4cd7f6]" />
              </div>
              <h3 className="text-xl font-bold text-slate-100 uppercase tracking-tighter">Elimine errores</h3>
              <p className="text-[#bdcaba] leading-relaxed">Detección proactiva de discrepancias. Si hay un centavo fuera de lugar, el sistema lo encontrará.</p>
            </div>
            <div className="flex flex-col gap-6">
              <div className="w-12 h-12 bg-[#62df7d]/10 rounded flex items-center justify-center">
                <Eye className="text-[#62df7d]" />
              </div>
              <h3 className="text-xl font-bold text-slate-100 uppercase tracking-tighter">Control en tiempo real</h3>
              <p className="text-[#bdcaba] leading-relaxed">Tome decisiones basadas en hechos, no en intuiciones. Visibilidad instantánea de su salud financiera.</p>
            </div>
          </div>
        </section>

        {/* Trust / Metrics */}
        <section className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="bg-[#0b1326] p-12 border border-[#2d3449]/30 rounded-xl flex flex-col md:flex-row items-center justify-around gap-12 text-center">
              <div>
                <div className="text-5xl font-black text-slate-100 mb-2 font-mono tracking-tighter">+$4.2B</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#62df7d]">Transacciones Gestionadas</div>
              </div>
              <div className="w-px h-16 bg-[#2d3449]/30 hidden md:block"></div>
              <div>
                <div className="text-5xl font-black text-slate-100 mb-2 font-mono tracking-tighter">25k+</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#62df7d]">Sucursales Activas</div>
              </div>
              <div className="w-px h-16 bg-[#2d3449]/30 hidden md:block"></div>
              <div>
                <div className="text-5xl font-black text-slate-100 mb-2 font-mono tracking-tighter">99.9%</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#62df7d]">Garantía de Uptime</div>
              </div>
            </div>
            <div className="mt-20 flex flex-wrap justify-center items-center gap-16 opacity-40 grayscale">
              <span className="font-black text-2xl uppercase tracking-tighter">GLOBAL BANK</span>
              <span className="font-black text-2xl uppercase tracking-tighter">RETAIL CORP</span>
              <span className="font-black text-2xl uppercase tracking-tighter">LOGIS TECH</span>
              <span className="font-black text-2xl uppercase tracking-tighter">FIN CORE</span>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-32 px-6 text-center bg-gradient-to-b from-[#0b1326] to-[#62df7d]/10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-100 mb-8 leading-none uppercase">
              Tome el control de sus operaciones financieras.
            </h2>
            <p className="text-xl text-[#bdcaba] mb-12">Únase a las empresas que ya están operando con inteligencia financiera superior.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <button
                onClick={onLoginClick}
                className="bg-[#62df7d] text-[#003914] font-bold px-12 py-5 rounded text-lg hover:scale-105 transition-all shadow-[0_0_30px_rgba(98,223,125,0.3)] uppercase tracking-widest"
              >
                Empezar Ahora
              </button>
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-slate-100 text-slate-950 font-bold px-12 py-5 rounded text-lg hover:bg-slate-200 transition-all uppercase tracking-widest"
              >
                Hablar con Ventas
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#060e20] w-full border-t border-[#131b2e] pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="text-xl font-bold text-slate-100 mb-4 uppercase tracking-tighter flex items-center gap-2">
              <CostProLogo size={24} animated={false} hideText />
              <span>COSTPRO</span>
            </div>
            <p className="font-mono text-[10px] tracking-widest uppercase text-slate-500 max-w-sm">
              © 2024 COSTPRO Enterprise Systems. Todos los derechos reservados. Inteligencia Financiera Precisa.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4 md:justify-end items-center">
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-[#62df7d] transition-colors duration-200" href="#">Política de Privacidad</a>
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-[#62df7d] transition-colors duration-200" href="#">Términos de Servicio</a>
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-[#62df7d] transition-colors duration-200" href="#">Seguridad</a>
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-[#62df7d] transition-colors duration-200" href="#">Documentación API</a>
            <a className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-[#62df7d] transition-colors duration-200" href={whatsappLink}>Soporte Global</a>
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
