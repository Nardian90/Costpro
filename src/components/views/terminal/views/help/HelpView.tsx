'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Book, HelpCircle, ShoppingCart, Package,
  ShieldCheck, Zap, Cpu, Search, ChevronRight,
  FileText, Calculator, TrendingUp, Info, ArrowLeft,
  Settings, UserCheck, CreditCard, Layout, Download, History, Calendar, CheckCircle2
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
import EliDiagram from './help/EliDiagram';
import OfflineSyncDiagram from './help/OfflineSyncDiagram';
import SecurityFlowDiagram from './help/SecurityFlowDiagram';
import IpvFlowDiagram from './help/IpvFlowDiagram';
import RolesDiagram from './help/RolesDiagram';
import KidsOnboarding from './help/KidsOnboarding';
import { useUIStore } from '@/store';
import { ThemeToggle } from '@/components/ThemeToggle';

type HelpSection = 'intro' | 'costs' | 'pos' | 'inventory' | 'innovation' | 'security' | 'ipv' | 'admin' | 'kids' | 'resolutions' | 'updates';

export default function HelpView() {
  const [selectedSection, setSelectedSection] = useState<HelpSection>('intro');
  const { previousView, setCurrentView } = useUIStore();

  const sections = [
    { id: 'intro', label: 'Inicio', icon: Book, color: 'text-blue-500' },
    { id: 'costs', label: 'Fichas de Costo', icon: FileText, color: 'text-violet-500' },
    { id: 'pos', label: 'Punto de Venta', icon: ShoppingCart, color: 'text-primary' },
    { id: 'inventory', label: 'Inventario', icon: Package, color: 'text-amber-500' },
    { id: 'innovation', label: 'Inteligencia AI', icon: Cpu, color: 'text-emerald-500' },
    { id: 'ipv', label: 'Conciliación IPV', icon: CreditCard, color: 'text-blue-600' },
    { id: 'security', label: 'Seguridad RLS', icon: ShieldCheck, color: 'text-rose-500' },
    { id: 'admin', label: 'Administración', icon: Settings, color: 'text-slate-500' },
    { id: 'kids', label: 'Simplificando', icon: UserCheck, color: 'text-pink-500' },
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
              <h1 className="text-xl font-black uppercase tracking-tighter">Centro de Ayuda Profesional</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">Documentación Técnica CostPro v5.7</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />

            <Button
              onClick={() => window.open("/manuals/COSTPRO.pdf", "_blank")}
              variant="ghost" size="sm" className="font-bold text-xs uppercase tracking-widest gap-2"
            >
               <Download className="w-4 h-4" />
               Manual PDF
            </Button>
            {previousView && (
              <Button
                onClick={() => setCurrentView(previousView)}
                variant="default" size="sm" className="bg-primary text-white font-black text-xs uppercase tracking-widest gap-2 rounded-xl px-6 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
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
                "flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap font-black text-[10px] uppercase tracking-widest",
                selectedSection === section.id
                  ? "bg-primary text-white"
                  : "bg-background border border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <section.icon className="w-3.5 h-3.5" />
              {section.label}
            </button>
          ))}
        </div>
        {/* Navigation Sidebar border-r */}
        <div className="w-80 border-r bg-muted/5 hidden lg:flex flex-col p-6 gap-2 overflow-y-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setSelectedSection(section.id as HelpSection)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left",
                selectedSection === section.id
                  ? "bg-primary text-white shadow-xl shadow-primary/20"
                  : "hover:bg-primary/5 text-muted-foreground"
              )}
            >
              <section.icon className={cn("w-5 h-5", selectedSection === section.id ? "text-white" : section.color)} />
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
              {selectedSection === 'intro' && (
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
                          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-black shrink-0 text-xs">{i+1}</div>
                          <div>
                            <h4 className="font-black text-xs uppercase tracking-tight">{step.t}</h4>
                            <p className="text-xs text-muted-foreground mt-1">{step.d}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedSection === 'costs' && (
                <div className="space-y-12">
                   <div className="space-y-4">
                      <h2 className="text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase tracking-tighter leading-tight">Ingeniería de Costos v5</h2>
                      <p className="text-muted-foreground font-medium">Cumplimiento total con normativas vigentes y precisión decimal extendida.</p>
                   <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        La Ficha de Costo en CostPro no es solo un documento contable; es el núcleo estratégico de su negocio. Basada en la <span className="text-primary font-bold">Resolución 148/2023</span>, permite demostrar las bases de sus precios con total transparencia. El sistema automatiza el cálculo de los 14 niveles de gasto, integrando materias primas (Anexo I), fuerza de trabajo (Anexo II) y gastos indirectos mediante coeficientes precisos, garantizando la racionalidad y legalidad en cada ficha.
                      </p>
                   </div>
                   </div>

                   <CostFlowDiagram />

                   <div className="grid md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="font-black text-primary text-xs uppercase tracking-widest">Los 14 Niveles de Gasto</h4>
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="item-1">
                            <AccordionTrigger className="text-xs font-bold uppercase">1. Materias Primas y Materiales</AccordionTrigger>
                            <AccordionContent className="text-xs text-muted-foreground">Consumo normado de insumos directos extraídos automáticamente del Anexo I.</AccordionContent>
                          </AccordionItem>
                          <AccordionItem value="item-2">
                            <AccordionTrigger className="text-xs font-bold uppercase">2. Fuerza de Trabajo Directa</AccordionTrigger>
                            <AccordionContent className="text-xs text-muted-foreground">Salarios directos vinculados a la producción (Anexo II).</AccordionContent>
                          </AccordionItem>
                          <AccordionItem value="item-3">
                            <AccordionTrigger className="text-xs font-bold uppercase">4-7. Gastos Indirectos</AccordionTrigger>
                            <AccordionContent className="text-xs text-muted-foreground">Aplicación dinámica del Coeficiente de Gasto Indirecto (Máximo 1.5 para producción).</AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>

                      <div className="p-8 rounded-[2.5rem] bg-amber-500/5 border border-amber-500/10 space-y-4">
                        <Zap className="w-8 h-8 text-amber-500" />
                        <h4 className="font-black text-xs uppercase">Generación Masiva</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Utilice el "Modo Rápido" para inyectar datos técnicos de cientos de productos en segundos mediante plantillas pre-configuradas.
                        </p>
                        <QuickModeMassiveDiagram />
                      </div>
                   </div>
                </div>
              )}

              {selectedSection === 'pos' && (
                <div className="space-y-12">
                  <div className="space-y-4">
                    <h2 className="text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase tracking-tighter leading-tight">Punto de Venta Móvil</h2>
                    <p className="text-muted-foreground font-medium">Diseñado para entornos de alto tráfico con controles táctiles optimizados.</p>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-3xl bg-card border border-border">
                      <h4 className="font-black text-[10px] uppercase tracking-widest text-primary mb-2">Velocidad Operativa</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">Cada milisegundo cuenta. El POS utiliza una arquitectura de "Estado Local Primero", permitiendo registrar ventas incluso con latencia de red, sincronizando en segundo plano.</p>
                    </div>
                    <div className="p-6 rounded-3xl bg-card border border-border">
                      <h4 className="font-black text-[10px] uppercase tracking-widest text-primary mb-2">Ergonomía Táctil</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">El "Sticky Cart" o Carrito Inteligente está diseñado para el pulgar, facilitando la operación con una sola mano en dispositivos móviles durante picos de trabajo.</p>
                    </div>
                    <div className="p-6 rounded-3xl bg-card border border-border">
                      <h4 className="font-black text-[10px] uppercase tracking-widest text-primary mb-2">Integración de Caja</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">Vinculación directa con el flujo de efectivo y conciliación IPV, asegurando que cada venta tenga un respaldo financiero rastreable.</p>
                    </div>
                  </div>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                      <div className="flex gap-4 items-start">
                        <div className="p-2 rounded-xl bg-primary/10"><Layout className="w-5 h-5 text-primary" /></div>
                        <div>
                          <h4 className="font-black text-xs uppercase">Carrito Inteligente</h4>
                          <p className="text-xs text-muted-foreground">Ubicado en la zona inferior para facilitar la operación con el pulgar en móviles.</p>
                        </div>
                      </div>
                      <StickyCartFlowDiagram />
                    </div>
                    <MobilePosDiagram />
                  </div>

                  <SalesFlowDiagram />
                </div>
              )}

              {selectedSection === 'inventory' && (
                <div className="space-y-12">
                   <div className="space-y-4">
                    <h2 className="text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase tracking-tighter leading-tight">Gestión de Almacenes</h2>
                    <p className="text-muted-foreground font-medium">Trazabilidad total de existencias y control de merma.</p>
                  <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/10">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      El módulo de inventario implementa un sistema de <span className="text-amber-600 font-bold">Burbujas de Contexto</span>. Cada sucursal mantiene su propia existencia aislada, evitando errores de cruce de mercancía. La trazabilidad incluye el registro de lotes, fechas de vencimiento y un control riguroso de mermas, permitiendo auditorías precisas en tiempo real.
                    </p>
                  </div>
                  </div>

                  <InventoryFlowDiagram />

                  <div className="grid md:grid-cols-2 gap-8 items-center bg-primary/5 p-8 rounded-[2.5rem]">
                    <div className="space-y-4">
                      <h4 className="font-black text-primary text-xs uppercase">Ajuste y Recepción</h4>
                      <p className="text-sm font-medium">Controles táctiles de gran tamaño, botones stepper para incrementar unidades sin usar teclado.</p>
                      <InventoryAdjustmentFlowDiagram />
                    </div>
                    <StoreSkuDiagram />
                  </div>
                </div>
              )}

              {selectedSection === 'innovation' && (
                <div className="space-y-12">
                   <div className="space-y-6">
                      <div className="p-10 rounded-[3rem] bg-card dark:bg-slate-950 text-card-foreground dark:text-white border border-border dark:border-white/10 shadow-2xl shadow-primary/10">
                        <div className="flex items-center gap-6 mb-8">
                          <div className="p-4 rounded-2xl bg-primary/10">
                            <Cpu className="w-12 h-12 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-3xl font-black uppercase tracking-tighter">Eli: Inteligencia Aumentada</h3>
                            <p className="text-primary font-bold text-xs uppercase tracking-[0.2em]">Orquestador de Decisiones CostPro</p>
                          </div>
                        </div>
                        <p className="text-lg font-medium leading-relaxed opacity-80 max-w-2xl">
                          Eli no es solo un chat; es un motor de análisis que integra sus estados financieros,
                          inventario crítico y tendencias de mercado para ofrecer una visión 360° de su negocio,
                          incluso sin conexión a internet.
                        </p>
                      </div>
                      <EliDiagram />
                   </div>
                </div>
              )}

              {selectedSection === 'security' && (
                <div className="space-y-12">
                   <div className="space-y-4">
                    <h2 className="text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase tracking-tighter leading-tight">Arquitectura de Seguridad</h2>
                    <p className="text-muted-foreground font-medium">Privacidad de grado empresarial mediante Row-Level Security.</p>
                  <div className="p-6 rounded-3xl bg-rose-500/5 border border-rose-500/10">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      La seguridad en CostPro no es opcional, está integrada en el ADN de la base de datos. Mediante <span className="text-rose-600 font-bold">Row-Level Security (RLS)</span>, garantizamos que un usuario solo pueda acceder a los datos de las sucursales para las que tiene permiso explícito. Ni siquiera errores en el código frontend pueden exponer datos sensibles de otros clientes.
                    </p>
                  </div>
                  </div>

                  <SecurityFlowDiagram />

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
              )}

              {selectedSection === 'ipv' && (
                <div className="space-y-12">
                   <div className="space-y-4">
                    <h2 className="text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase tracking-tighter leading-tight">Conciliación Bancaria IPV</h2>
                    <p className="text-muted-foreground font-medium">Sincronización automática entre ventas POS y movimientos de cuenta.</p>
                  </div>
                  <IpvFlowDiagram />
                </div>
              )}

              {selectedSection === 'admin' && (
                <div className="space-y-12">
                   <div className="space-y-4">
                    <h2 className="text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase tracking-tighter leading-tight">Panel de Administración</h2>
                    <p className="text-muted-foreground font-medium">Gestión centralizada de usuarios, roles y sucursales.</p>
                  </div>
                  <RolesDiagram />

                  <div className="bg-primary/5 p-8 rounded-[2.5rem] space-y-4">
                    <h4 className="font-black text-xs uppercase tracking-[0.3em] text-primary">Gestión de Usuarios</h4>
                    <p className="text-sm font-medium">
                      Como administrador, puede crear usuarios con roles específicos (Admin, Encargado, Cajero, Costo) y asignarles sucursales activas.
                    </p>
                  </div>
                </div>
              )}

              {selectedSection === "kids" && <KidsOnboarding />}

              {selectedSection === "resolutions" && (
                <div className="space-y-12">
                  <div className="space-y-4">
                    <h2 className="text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase tracking-tighter leading-tight">Base Normativa</h2>
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
                          variant="ghost" size="icon" className="rounded-full group-hover:bg-primary group-hover:text-white transition-all"
                        >
                          <Download className="w-5 h-5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedSection === 'updates' && (
                <div className="space-y-12">
                  <div className="space-y-4">
                    <h2 className="text-[clamp(1.75rem,7vw,2.5rem)] font-black uppercase tracking-tighter leading-tight">Historial de Actualizaciones</h2>
                    <p className="text-muted-foreground font-medium">Registro cronológico de mejoras y nuevas funcionalidades en CostPro.</p>
                  </div>

                  <div className="space-y-8">
                    {[
                      {
                        version: "v5.7.25",
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
                      },
                      {
                        version: "v5.7.24",
                        date: "6 de Marzo, 2026",
                        title: "Next-Gen Welcome Landing",
                        description: "Reposicionamiento estratégico del punto de entrada al sistema.",
                        changes: [
                          "Nueva Landing Page de Bienvenida con diseño Bento.",
                          "Desacoplamiento del flujo de autenticación (Login Modal).",
                          "Optimizaciones de performance en assets estáticos.",
                          "Nuevas narrativas de automatización visuales."
                        ],
                        status: "Estable",
                        score: "9.45"
                      },
                      {
                        version: "v5.7.23",
                        date: "2 de Marzo, 2026",
                        title: "Hardening & Observability",
                        description: "Fortalecimiento de la integridad de datos y trazabilidad universal.",
                        changes: [
                          "Validación estricta de contratos de API con Zod.",
                          "Cobertura del 100% de hooks con logging estructurado.",
                          "Eliminación de ambigüedades en tipos de datos.",
                          "Mejora en la trazabilidad de transacciones SQL."
                        ],
                        status: "Estable",
                        score: "9.35"
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
                            <div className="flex items-center gap-2">
                               <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tech Score:</div>
                               <div className="text-sm font-black text-primary">{update.score}</div>
                            </div>
                          </div>

                          <div>
                            <h3 className="text-xl font-black uppercase tracking-tight mb-2">{update.title}</h3>
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
              )}


            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t bg-card/50 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-5 h-5 text-primary" />
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">¿Necesita asistencia técnica personalizada?</span>
        </div>
        <div className="flex gap-4">
          <Button
            onClick={() => window.open("https://wa.me/5353183215", "_blank")}
            className="h-11 rounded-xl font-bold text-xs uppercase tracking-widest px-8"
          >
            Chat con Soporte
          </Button>
        </div>
      </div>
    </div>
  );
}
