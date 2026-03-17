'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Book, HelpCircle, ShoppingCart, Package,
  ShieldCheck, Zap, Cpu, Search, ChevronRight,
  FileText, Calculator, TrendingUp, Info, ArrowLeft,
  Settings, UserCheck, CreditCard, Layout, Download, History, Calendar, CheckCircle2, ChevronLeft, Play, ExternalLink, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';

// Diagrams
import CostFlowDiagram from './help/CostFlowDiagram';
import QuickModeMassiveDiagram from './help/QuickModeMassiveDiagram';
import StickyCartFlowDiagram from './help/StickyCartFlowDiagram';
import MobilePosDiagram from './help/MobilePosDiagram';
import SalesFlowDiagram from './help/SalesFlowDiagram';
import InventoryFlowDiagram from './help/InventoryFlowDiagram';
import InventoryAdjustmentFlowDiagram from './help/InventoryAdjustmentFlowDiagram';
import StoreSkuDiagram from './help/StoreSkuDiagram';
import DarianDiagram from './help/DarianDiagram';
import OfflineSyncDiagram from './help/OfflineSyncDiagram';
import SecurityFlowDiagram from './help/SecurityFlowDiagram';
import IpvFlowDiagram from './help/IpvFlowDiagram';
import RolesDiagram from './help/RolesDiagram';
import KidsOnboarding from './help/KidsOnboarding';
import { useUIStore } from '@/store';
import { ThemeToggle } from '@/components/ThemeToggle';

type HelpSection = 'intro' | 'slideshow' | 'guide' | 'innovation' | 'security' | 'admin' | 'resolutions' | 'updates';

interface HelpSystemData {
  app: string;
  version: string;
  updated_at: string;
  modules: Record<string, string>;
  flows: {
    id: string;
    title: string;
    role: string;
    story: { before: string; now: string; why: string };
    steps: { step: number; title: string; explanation: string }[];
    visuals: { screenshot: string; svg_diagram: { type: string; steps: string[] } };
  }[];
}

export default function HelpView() {
  const [selectedSection, setSelectedSection] = useState<HelpSection>('intro');
  const { previousView, setCurrentView, viewQueries } = useUIStore();
  const [helpData, setHelpData] = useState<HelpSystemData | null>(null);

  useEffect(() => {
    fetch('/docs/help/help_system.json')
      .then(res => res.json())
      .then(data => setHelpData(data))
      .catch(err => console.error('Error loading help system:', err));
  }, []);

  useEffect(() => {
    // If we come from landing with a specific view request
    if (viewQueries.help === 'slideshow') {
      setSelectedSection('slideshow');
    }
  }, [viewQueries.help]);

  const sections = [
    { id: 'intro', label: 'Inicio', icon: Book, color: 'text-blue-500' },
    { id: 'slideshow', label: 'Vistazo Rápido', icon: Play, color: 'text-pink-500' },
    { id: 'guide', label: 'Guía Operativa', icon: FileText, color: 'text-violet-500' },
    { id: 'innovation', label: 'Inteligencia AI', icon: Cpu, color: 'text-emerald-500' },
    { id: 'security', label: 'Seguridad RLS', icon: ShieldCheck, color: 'text-rose-500' },
    { id: 'admin', label: 'Administración', icon: Settings, color: 'text-slate-500' },
    { id: 'resolutions', label: 'Resoluciones', icon: Info, color: 'text-blue-400' },
    { id: 'updates', label: 'Actualizaciones', icon: History, color: 'text-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="md:hidden"><ThemeToggle /></div>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <HelpCircle className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-[clamp(1.1rem,4vw,1.25rem)] font-black uppercase tracking-tighter leading-tight">Centro de Ayuda Profesional</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">Documentación Técnica CostPro v5.8</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />

            <Button
              onClick={() => window.open("/manuals/COSTPRO.pdf", "_blank")}
              variant="ghost" size="sm" className="h-11 font-bold text-xs uppercase tracking-widest gap-2"
            >
               <Download className="w-4 h-4" />
               Manual PDF
            </Button>
            {previousView && (
              <Button
                onClick={() => setCurrentView(previousView)}
                variant="default" size="sm" className="h-11 bg-primary text-foreground font-black text-xs uppercase tracking-widest gap-2 rounded-xl px-6 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Mobile Navigation */}
        <div className="lg:hidden flex overflow-x-auto p-4 border-b bg-muted/5 gap-2 no-scrollbar">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setSelectedSection(section.id as HelpSection)}
              className={cn(
                "flex-shrink-0 flex items-center gap-2 px-4 h-11 rounded-xl transition-all whitespace-nowrap font-black text-[10px] uppercase tracking-widest",
                selectedSection === section.id
                  ? "bg-primary text-foreground"
                  : "bg-background border border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <section.icon className="w-3.5 h-3.5" />
              {section.label}
            </button>
          ))}
        </div>

        {/* Navigation Sidebar */}
        <div className="w-80 border-r bg-muted/5 hidden lg:flex flex-col p-6 gap-2 overflow-y-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setSelectedSection(section.id as HelpSection)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left",
                selectedSection === section.id
                  ? "bg-primary text-foreground shadow-xl shadow-primary/20"
                  : "hover:bg-primary/5 text-muted-foreground"
              )}
            >
              <section.icon className={cn("w-5 h-5", selectedSection === section.id ? "text-foreground" : section.color)} />
              <span className="text-xs font-black uppercase tracking-widest">{section.label}</span>
              {selectedSection === section.id && <ChevronRight className="w-4 h-4 ml-auto" />}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto"
            >
              {selectedSection === 'intro' && <IntroSection />}
              {selectedSection === 'slideshow' && <FeatureSlideshow />}
              {selectedSection === 'guide' && <HelpSystemVisor data={helpData} />}
              {selectedSection === 'innovation' && <InnovationSection />}
              {selectedSection === 'security' && <SecuritySection />}
              {selectedSection === 'admin' && <AdminSection />}
              {selectedSection === 'resolutions' && <ResolutionsSection />}
              {selectedSection === 'updates' && <UpdatesSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}

function IntroSection() {
  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <h2 className="text-[clamp(2rem,8vw,3rem)] font-black uppercase tracking-tighter leading-tight">Bienvenido al Ecosistema CostPro</h2>
        <p className="text-lg text-muted-foreground font-medium leading-relaxed">
          Esta guía le proporcionará los conocimientos necesarios para operar la plataforma líder en gestión de costos y operativa comercial para MiPyMEs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-8 rounded-[2.5rem] bg-violet-500/5 border border-violet-500/10 space-y-4">
           <FileText className="w-10 h-10 text-violet-500" />
           <h3 className="text-lg font-black uppercase">Ingeniería de Costos</h3>
           <p className="text-sm text-muted-foreground leading-relaxed">Desglose técnico de 14 secciones de gasto alineado con la Resolución 148/2023.</p>
        </div>
        <div className="p-8 rounded-[2.5rem] bg-primary/5 border border-primary/10 space-y-4">
           <ShoppingCart className="w-10 h-10 text-primary" />
           <h3 className="text-lg font-black uppercase">Punto de Venta Pro</h3>
           <p className="text-sm text-muted-foreground leading-relaxed">Operativa móvil de alta velocidad con gestión de inventario en tiempo real.</p>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Flujo de Trabajo Sugerido</h3>
        <div className="space-y-4">
          {[
            { t: '1. Configuración de Sucursales', d: 'Defina sus puntos de venta y almacenes centrales.' },
            { t: '2. Elaboración de Fichas', d: 'Cree sus estructuras de costos base para cada producto o servicio.' },
            { t: '3. Carga de Inventario', d: 'Inyecte existencias iniciales mediante recepción de productos.' },
            { t: '4. Operativa de Venta', d: 'Registre transacciones y observe la actualización automática de stock.' }
          ].map((step, i) => (
            <div key={i} className="flex gap-4 p-6 rounded-2xl bg-card border border-border">
              <div className="w-8 h-8 rounded-full bg-primary text-foreground flex items-center justify-center font-black shrink-0 text-xs">{i+1}</div>
              <div>
                <h4 className="font-black text-xs uppercase tracking-tight">{step.t}</h4>
                <p className="text-xs text-muted-foreground mt-1">{step.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureSlideshow() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: "Ingeniería de Costos Pro",
      content: "Basada en la Resolución 148/2023, permite demostrar las bases de sus precios con total transparencia. El sistema automatiza el cálculo de los 14 niveles de gasto.",
      diagram: <CostFlowDiagram />,
      color: "bg-violet-500/5",
      borderColor: "border-violet-500/10"
    },
    {
      title: "TPV de Alta Velocidad",
      content: "Carrito de ventas persistente, búsqueda instantánea y gestión de stock en tiempo real. Optimizado para dispositivos móviles con touch targets de 44px.",
      diagram: <SalesFlowDiagram />,
      color: "bg-primary/5",
      borderColor: "border-primary/10"
    },
    {
      title: "Control de Almacén",
      content: "Trazabilidad completa de entradas y salidas. El sistema previene stock negativo y emite alertas de bajo nivel automáticas.",
      diagram: <InventoryFlowDiagram />,
      color: "bg-amber-500/5",
      borderColor: "border-amber-500/10"
    },
    {
      title: "Conciliación Bancaria IPV",
      content: "Motor de matching multi-pass que vincula transferencias con ventas. Separa Efectivo, Transferencia y QR para una claridad financiera absoluta.",
      diagram: <IpvFlowDiagram />,
      color: "bg-blue-500/5",
      borderColor: "border-blue-500/10"
    },
    {
      title: "Darian: IA Contextual",
      content: "Asistente inteligente que entiende su negocio. Consulta stock, analiza tendencias y ayuda con las regulaciones vigentes en lenguaje natural.",
      diagram: <DarianDiagram />,
      color: "bg-emerald-500/5",
      borderColor: "border-emerald-500/10"
    },
    {
      title: "Simplicidad Operativa",
      content: "Diseñado para que cualquier miembro del equipo pueda operar el sistema en minutos, con flujos guiados y validaciones constantes.",
      diagram: <KidsOnboarding />,
      color: "bg-pink-500/5",
      borderColor: "border-pink-500/10"
    }
  ];

  const next = () => setCurrentSlide((s) => (s + 1) % slides.length);
  const prev = () => setCurrentSlide((s) => (s - 1 + slides.length) % slides.length);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
         <h2 className="text-[clamp(1.5rem,7vw,2.25rem)] font-black uppercase tracking-tighter leading-tight">Vistazo al Ecosistema</h2>
         <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prev} className="rounded-full h-11 w-11">
               <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button variant="outline" size="icon" onClick={next} className="rounded-full h-11 w-11">
               <ChevronRight className="w-5 h-5" />
            </Button>
         </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className={cn(
            "p-8 md:p-12 rounded-[3rem] border transition-colors space-y-8",
            slides[currentSlide].color,
            slides[currentSlide].borderColor
          )}
        >
          <div className="space-y-4 text-center max-w-2xl mx-auto">
             <Badge variant="outline" className="rounded-lg font-black bg-background border-border">
                {currentSlide + 1} / {slides.length}
             </Badge>
             <h3 className="text-3xl font-black uppercase tracking-tight">{slides[currentSlide].title}</h3>
             <p className="text-muted-foreground font-medium leading-relaxed">
               {slides[currentSlide].content}
             </p>
          </div>

          <div className="bg-background/40 backdrop-blur-sm rounded-[2.5rem] p-4 border border-border/50 overflow-hidden">
             {slides[currentSlide].diagram}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-center gap-2">
         {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                currentSlide === i ? "w-8 bg-primary" : "w-2 bg-muted hover:bg-muted-foreground/30"
              )}
            />
         ))}
      </div>
    </div>
  );
}

function HelpSystemVisor({ data }: { data: HelpSystemData | null }) {
  if (!data) return <div className="flex items-center justify-center p-20"><Zap className="w-8 h-8 animate-pulse text-primary" /></div>;

  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge className="rounded-lg font-black bg-primary/10 text-primary border-primary/20">Guía v{data.version}</Badge>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed flex items-center gap-2">
            <Calendar className="w-3 h-3" />
            Actualizado: {new Date(data.updated_at).toLocaleDateString()}
          </span>
        </div>
        <h2 className="text-[clamp(1.5rem,7vw,2.25rem)] font-black uppercase tracking-tighter leading-tight">Guía Operativa del Sistema</h2>
        <p className="text-muted-foreground font-medium">Instrucciones detalladas de los flujos de trabajo core del negocio.</p>
      </div>

      <div className="grid gap-16">
        {data.flows.map((flow) => (
          <section key={flow.id} className="space-y-8">
            <div className="flex flex-col gap-6">
               <div className="flex items-center gap-4">
                  <div className="w-1.5 h-12 bg-primary rounded-full" />
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">{flow.title}</h3>
                    <Badge variant="secondary" className="mt-1 font-black uppercase tracking-widest text-[10px]">Rol: {flow.role}</Badge>
                  </div>
               </div>

               <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-6 rounded-3xl bg-rose-500/5 border border-rose-500/10 space-y-2">
                     <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-rose-600">Antes</h4>
                     <p className="text-xs font-medium text-rose-900/70">{flow.story.before}</p>
                  </div>
                  <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
                     <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-emerald-600">Ahora</h4>
                     <p className="text-xs font-medium text-emerald-900/70">{flow.story.now}</p>
                  </div>
                  <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 space-y-2">
                     <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-primary">Por qué</h4>
                     <p className="text-xs font-medium text-primary/70">{flow.story.why}</p>
                  </div>
               </div>
            </div>

            <div className="space-y-6">
              <h4 className="font-black text-sm uppercase tracking-widest text-muted-foreground">Pasos del Proceso</h4>
              <div className="grid sm:grid-cols-2 gap-4">
                {flow.steps.map((step) => (
                  <div key={step.step} className="p-6 rounded-3xl bg-card border border-border group hover:border-primary/30 transition-all flex gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-muted group-hover:bg-primary group-hover:text-foreground flex items-center justify-center font-black text-sm transition-colors shrink-0">
                      {step.step}
                    </div>
                    <div>
                       <h5 className="font-black text-sm uppercase tracking-tight mb-1">{step.title}</h5>
                       <p className="text-xs text-muted-foreground font-medium leading-relaxed">{step.explanation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-muted/30 border border-border/50">
               <div className="flex items-center gap-3 mb-6">
                  <Layout className="w-5 h-5 text-primary" />
                  <h4 className="font-black text-[10px] uppercase tracking-widest">Diagrama Visual de Flujo</h4>
               </div>
               <div className="flex flex-wrap items-center gap-3">
                  {flow.visuals.svg_diagram.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                       <div className="px-4 py-2 rounded-xl bg-background border border-border text-[10px] font-black uppercase tracking-widest shadow-sm">
                          {s}
                       </div>
                       {i < flow.visuals.svg_diagram.steps.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground/30" />}
                    </div>
                  ))}
               </div>
            </div>
            <div className="h-px bg-border/50 w-full" />
          </section>
        ))}
      </div>
    </div>
  );
}

function InnovationSection() {
  return (
    <div className="space-y-12">
       <div className="space-y-4">
          <h2 className="text-[clamp(1.5rem,7vw,2.25rem)] font-black uppercase tracking-tighter leading-tight">Innovación: Asistente Darian</h2>
          <p className="text-muted-foreground font-medium">Inteligencia artificial diseñada para potenciar su toma de decisiones.</p>
       </div>

       <div className="space-y-12">
          <div className="p-8 md:p-12 rounded-[3rem] bg-emerald-500/5 border border-emerald-500/10 space-y-8">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Cpu className="w-12 h-12 text-emerald-600" />
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500 text-foreground border-none rounded-md px-2 py-0.5 text-[10px] font-black uppercase">Online / Offline</Badge>
                  <p className="text-primary font-bold text-xs uppercase tracking-[0.2em] mt-2">Orquestador de Decisiones CostPro</p>
                </div>
                <p className="text-lg font-medium leading-relaxed opacity-80 max-w-2xl">
                  Darian no es solo un chat; es un motor de análisis que integra sus estados financieros,
                  inventario crítico y tendencias de mercado para ofrecer una visión 360° de su negocio,
                  incluso sin conexión a internet.
                </p>
              </div>
            </div>
            <div className="bg-background/40 backdrop-blur-sm rounded-[2.5rem] p-4 border border-border/50 overflow-hidden">
               <DarianDiagram />
            </div>
          </div>
       </div>
    </div>
  );
}

function SecuritySection() {
  return (
    <div className="space-y-12">
       <div className="space-y-4">
        <h2 className="text-[clamp(1.5rem,7vw,2.25rem)] font-black uppercase tracking-tighter leading-tight">Arquitectura de Seguridad</h2>
        <p className="text-muted-foreground font-medium">Privacidad de grado empresarial mediante Row-Level Security.</p>
      <div className="p-6 rounded-3xl bg-rose-500/5 border border-rose-500/10">
        <p className="text-sm leading-relaxed text-muted-foreground">
          La seguridad en CostPro no es opcional, está integrada en el ADN de la base de datos. Mediante <span className="text-rose-600 font-bold">Row-Level Security (RLS)</span>, garantizamos que un usuario solo pueda acceder a los datos de las sucursales para las que tiene permiso explícito. Ni siquiera errores en el código frontend pueden exponer datos sensibles de otros clientes.
        </p>
      </div>
      </div>

      <div className="bg-background/40 backdrop-blur-sm rounded-[2.5rem] p-4 border border-border/50 overflow-hidden">
         <SecurityFlowDiagram />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
         <div className="p-6 rounded-3xl bg-card border border-border">
            <h4 className="font-black text-[10px] uppercase tracking-widest text-primary mb-2">Aislamiento</h4>
            <p className="text-xs text-muted-foreground">Cada sucursal opera en su propio contenedor lógico de datos.</p>
         </div>
         <div className="p-6 rounded-3xl bg-card border border-border">
            <h4 className="font-black text-[10px] uppercase tracking-widest text-primary mb-2">Auditoría</h4>
            <p className="text-xs text-muted-foreground">Registro inmutable de cada transacción y modificación de precios.</p>
         </div>
         <div className="p-6 rounded-3xl bg-card border border-border">
            <h4 className="font-black text-[10px] uppercase tracking-widest text-primary mb-2">RBAC</h4>
            <p className="text-xs text-muted-foreground">Control de acceso basado en roles jerárquicos estrictos.</p>
         </div>
      </div>
    </div>
  );
}

function AdminSection() {
  return (
    <div className="space-y-12">
       <div className="space-y-4">
        <h2 className="text-[clamp(1.5rem,7vw,2.25rem)] font-black uppercase tracking-tighter leading-tight">Panel de Administración</h2>
        <p className="text-muted-foreground font-medium">Gestión centralizada de usuarios, roles y sucursales.</p>
      </div>
      <div className="bg-background/40 backdrop-blur-sm rounded-[2.5rem] p-4 border border-border/50 overflow-hidden">
         <RolesDiagram />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-primary/5 p-8 rounded-[2.5rem] space-y-4">
          <h4 className="font-black text-xs uppercase tracking-[0.3em] text-primary">Gestión de Usuarios</h4>
          <p className="text-sm font-medium">
            Como administrador, puede crear usuarios con roles específicos y asignarles sucursales activas. La seguridad RLS garantiza que cada quien vea solo lo que le corresponde.
          </p>
        </div>
        <div className="bg-violet-500/5 p-8 rounded-[2.5rem] space-y-4">
          <h4 className="font-black text-xs uppercase tracking-[0.3em] text-violet-500">Store Selector</h4>
          <p className="text-sm font-medium">
            Navegue entre múltiples sucursales sin cerrar sesión. El selector persistente en la cabecera mantiene su contexto de trabajo en todo momento.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResolutionsSection() {
  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <h2 className="text-[clamp(1.5rem,7vw,2.25rem)] font-black uppercase tracking-tighter leading-tight">Base Normativa</h2>
        <p className="text-muted-foreground font-medium">Resoluciones y leyes que rigen la ingeniería de costos en Cuba.</p>
      </div>

      <div className="grid gap-4">
        {[
          { name: "Resolución 148/2023", file: "Res1482023.pdf", desc: "Metodología para la formación de precios y tarifas." },
          { name: "Resolución 209/2024", file: "Res2092024.pdf", desc: "Actualización de márgenes y coeficientes de gastos." },
          { name: "Norma Contabilidad 12", file: "Norma de contabilidad numero 12 Costo RES-0935-18.pdf", desc: "Tratamiento contable de los costos de producción." },
          { name: "Manual de Usuario CostPro", file: "COSTPRO.pdf", desc: "Guía completa de operación del sistema." }
        ].map((res, i) => (
          <div key={i} className="p-6 rounded-3xl bg-card border border-border flex items-center justify-between group hover:border-primary/50 transition-colors">
            <div className="flex gap-4 items-center">
              <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-sm uppercase">{res.name}</h4>
                <p className="text-xs text-muted-foreground">{res.desc}</p>
              </div>
            </div>
            <Button
              onClick={() => window.open(`/manuals/${res.file}`, "_blank")}
              variant="ghost" size="icon" className="rounded-full group-hover:bg-primary group-hover:text-foreground transition-all"
            >
              <Download className="w-5 h-5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpdatesSection() {
  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <h2 className="text-[clamp(1.5rem,7vw,2.25rem)] font-black uppercase tracking-tighter leading-tight">Historial de Actualizaciones</h2>
        <p className="text-muted-foreground font-medium">Registro cronológico de mejoras y nuevas funcionalidades en CostPro.</p>
      </div>

      <div className="space-y-8">
        {[
          {
            version: "v5.8.0",
            date: "25 de Marzo, 2026",
            title: "Advanced IPV & Multi-Store Control",
            description: "Salto evolutivo en la conciliación financiera y control multi-sucursal.",
            changes: [
              "Clasificación avanzada de transacciones (Efectivo/Transferencia/QR).",
              "Selector de sucursales persistente en cabecera global.",
              "Branding automático con logos en recibos SC-3-01.",
              "Refuerzo de accesibilidad: touch targets de 44px en toda la App."
            ],
            status: "Saludable",
            score: "9.80"
          },
          {
            version: "v5.8.6",
            date: "14 de Marzo, 2026",
            title: "Express Generation & Quick Mode",
            description: "Optimización drástica en la eficiencia operativa de la ingeniería de costos.",
            changes: [
              "Implementación del Modo Rápido para entrada express de datos.",
              "Integración de Generación Masiva pre-poblada.",
              "Documentación didáctica visual mediante diagramas SVG.",
              "Sincronización total de versiones en metadatos y UI."
            ],
            status: "Saludable",
            score: "9.65"
          }
        ].map((update, i) => (
          <div key={i} className="relative pl-8 border-l-2 border-primary/20 pb-8 last:pb-0">
            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary ring-4 ring-background" />
            <div className="flex flex-col gap-4 bg-card border border-border p-8 rounded-[2.5rem] hover:border-primary/30 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="rounded-lg font-black bg-primary/10 text-primary border-primary/20">
                    {update.version}
                  </Badge>
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    <Calendar className="w-3 h-3" />
                    {update.date}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[clamp(1.1rem,4vw,1.25rem)] font-black uppercase tracking-tight mb-2">{update.title}</h3>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">{update.description}</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {update.changes.map((change, j) => (
                  <div key={j} className="flex gap-3 items-start">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-xs font-medium text-foreground/80">{change}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="p-6 border-t bg-card/50">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3 text-center sm:text-left">
          <HelpCircle className="w-5 h-5 text-primary shrink-0" />
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-relaxed">¿Necesita asistencia técnica personalizada?</span>
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <Button
            onClick={() => window.open("https://wa.me/5353183215", "_blank")}
            className="h-11 w-full sm:w-auto rounded-xl font-bold text-xs uppercase tracking-widest px-8 active:scale-95 transition-transform"
          >
            Chat con Soporte
          </Button>
        </div>
      </div>
    </div>
  );
}
