'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Users, ShoppingCart, Package, Shield,
  CheckCircle2, ArrowRight, Info, AlertTriangle,
  Settings, Building2, Receipt, FileText, ChevronRight,
  UserPlus, Store, Key, ListChecks, HelpCircle,
  Wand2, Table2, FileSpreadsheet, History, Target,
  Baby, Zap, Cpu, WifiOff, Search, Newspaper,
  Activity, Scale, CreditCard, ExternalLink, Download,
  Menu, X, Layers, Calculator, ShieldCheck
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore, ViewType } from "@/store";
import { useAuthStore } from "@/store";
import { ThemeToggle } from "@/components/ThemeToggle";

// Diagrams
import RolesDiagram from './help/RolesDiagram';
import UserFlowDiagram from './help/UserFlowDiagram';
import CashFlowDiagram from './help/CashFlowDiagram';
import InventoryFlowDiagram from './help/InventoryFlowDiagram';
import StoreSkuDiagram from './help/StoreSkuDiagram';
import SalesFlowDiagram from './help/SalesFlowDiagram';
import MobilePosDiagram from './help/MobilePosDiagram';
import SecurityFlowDiagram from './help/SecurityFlowDiagram';
import CostFlowDiagram from './help/CostFlowDiagram';
import KidsOnboarding from './help/KidsOnboarding';
import OfflineSyncDiagram from './help/OfflineSyncDiagram';
import EliDiagram from './help/EliDiagram';
import StickyCartFlowDiagram from './help/StickyCartFlowDiagram';
import InventoryAdjustmentFlowDiagram from './help/InventoryAdjustmentFlowDiagram';
import IpvFlowDiagram from './help/IpvFlowDiagram';
import QuickModeMassiveDiagram from './help/QuickModeMassiveDiagram';

const PDF_URL = '/manuals/COSTPRO.pdf';

const SECTIONS = [
  { id: 'main', label: 'Manual Principal', icon: BookOpen, category: 'INTRODUCCIÓN', description: 'Acceso al manual oficial de CostPro Enterprise.' },
  { id: 'onboarding', label: 'CostPro para Niños', icon: Baby, category: 'INTRODUCCIÓN', description: 'Aprende con el cuento de Juan y Pedro.' },
  { id: 'admin', label: 'Gestión y Usuarios', icon: Settings, category: 'VISTAS DEL SISTEMA', description: 'Alta de usuarios y configuración de tiendas.' },
  { id: 'pos', label: 'Ventas y POS', icon: ShoppingCart, category: 'VISTAS DEL SISTEMA', description: 'Operativa de caja y cierres diarios.' },
  { id: 'inventory', label: 'Almacén', icon: Package, category: 'VISTAS DEL SISTEMA', description: 'Control de stock y recepciones.' },
  { id: 'costs', label: 'Gestión de Costos', icon: FileText, category: 'GESTIÓN DE COSTOS', description: 'Motor de cálculo y fichas de costo.' },
  { id: 'ipv', label: 'Conciliación (IPV)', icon: Activity, category: 'GESTIÓN DE COSTOS', description: 'Conciliación bancaria automática.' },
  { id: 'roles', label: 'Jerarquía y Roles', icon: Users, category: 'SEGURIDAD Y CONTROL', description: 'Permisos y estructura organizacional.' },
  { id: 'security', label: 'Seguridad', icon: Shield, category: 'SEGURIDAD Y CONTROL', description: 'Protección de datos y auditoría.' },
  { id: 'innovation', label: 'Innovación AI', icon: Zap, category: 'TECNOLOGÍA', description: 'Asistente Eli y modo Offline.' },
  { id: 'history', label: 'Historial', icon: History, category: 'TECNOLOGÍA', description: 'Registro de cambios del sistema.' },
];

export default function HelpView() {
  const [selectedSection, setSelectedSection] = useState('main');
  const { setCurrentView } = useUIStore();
  const { user } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = PDF_URL;
    link.download = 'COSTPRO-Manual.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenNewTab = (page: number = 1) => {
    window.open(`${PDF_URL}#page=${page}`, '_blank');
  };

  const categories = Array.from(new Set(SECTIONS.map(s => s.category)));

  const renderSidebar = () => (
    <div className="p-6 space-y-6">
      <p className="text-[10px] font-black text-primary/50 uppercase px-3 tracking-[0.3em]">Centro de Ayuda</p>

      {categories.map(category => (
        <div key={category} className="space-y-1">
          <h4 className="px-3 text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-2">{category}</h4>
          {SECTIONS.filter(s => s.category === category).map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSelectedSection(item.id);
                setSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-bold min-h-[44px] transition-all group border border-transparent mb-1",
                selectedSection === item.id
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "hover:bg-primary/5 text-muted-foreground hover:text-primary"
              )}
            >
              <item.icon className={cn("w-4 h-4", selectedSection === item.id ? "text-white" : "group-hover:scale-110 transition-transform")} />
              <span className="flex-1 text-left uppercase tracking-wider">{item.label}</span>
            </button>
          ))}
        </div>
      ))}

      <div className="mt-8 pt-6 border-t border-border/50">
        <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
          <div className="flex items-center gap-2 text-primary mb-3">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Documento Oficial</span>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold leading-relaxed uppercase">
            Versión 5.7.25 Enterprise
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen min-h-[600px] overflow-hidden bg-background relative">

      {/* Enhanced Integro Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur-3xl z-40 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl hover:bg-primary/10 hover:text-primary transition-all"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="h-6 w-px bg-border/50 mx-2" />
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-primary flex items-center gap-3">
              Ayuda
              {user?.name && (
                <span className="text-muted-foreground/40 font-medium tracking-widest text-[10px] hidden sm:inline">
                  | {user.name}
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 mr-4">
            <ThemeToggle />
          </div>
          <Badge variant="outline" className="hidden md:flex bg-primary/5 text-primary border-primary/20 font-black text-[10px] uppercase shadow-sm">
            v5.7.25
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 px-4 font-black uppercase text-[10px] tracking-widest text-primary hover:bg-primary/10"
            onClick={() => setCurrentView('dashboard')}
          >
            Salir de Ayuda
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar */}
        <div className={cn(
          "absolute lg:relative inset-y-0 left-0 w-72 bg-card border-r z-30 transition-all duration-500 ease-in-out bg-card/50 backdrop-blur-3xl overflow-y-auto no-scrollbar",
          sidebarOpen ? "translate-x-0 opacity-100 w-72" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 lg:pointer-events-none"
        )}>
          {renderSidebar()}
        </div>

        {/* Backdrop for mobile sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-20 lg:hidden backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 sm:p-10 lg:p-16 no-scrollbar overscroll-contain bg-background/30">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-5xl mx-auto pb-12"
            >
              {selectedSection === 'main' ? (
                /* LANDING PAGE */
                <div className="space-y-12">
                   {/* Hero Section */}
                  <div className="text-center space-y-6 pt-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 mb-4">
                      <Zap className="w-4 h-4 fill-primary animate-pulse" />
                      <span className="text-xs font-black uppercase tracking-widest">Recurso de Capacitación</span>
                    </div>
                    <h1 className="text-[clamp(2rem,8vw,4rem)] font-black uppercase tracking-tighter text-foreground leading-[0.9]">
                      Manual de Operaciones <br />
                      <span className="text-primary">CostPro Enterprise</span>
                    </h1>
                    <p className="text-muted-foreground text-lg font-medium max-w-2xl mx-auto leading-relaxed">
                      Accede a la guía detallada paso a paso para dominar todas las funcionalidades de tu plataforma de gestión empresarial.
                    </p>
                  </div>

                  {/* Main Action Cards */}
                  <div className="grid sm:grid-cols-2 gap-8">
                    <div
                      onClick={() => handleOpenNewTab(1)}
                      className="group p-10 rounded-[3rem] bg-card/50 border border-border/50 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                        <BookOpen className="w-48 h-48 text-primary" />
                      </div>
                      <div className="relative z-10 space-y-6">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                          <ExternalLink className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Leer Online</h3>
                          <p className="text-base text-muted-foreground font-medium mt-2">Visualiza el manual directamente en una nueva pestaña interactiva con buscador integrado.</p>
                        </div>
                        <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest pt-4">
                          Abrir ahora <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={handleDownload}
                      className="group p-10 rounded-[3rem] bg-primary text-white hover:shadow-2xl hover:shadow-primary/20 transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                        <Download className="w-48 h-48" />
                      </div>
                      <div className="relative z-10 space-y-6">
                        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-500">
                          <Download className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tight">Descargar PDF</h3>
                          <p className="text-base text-white/80 font-medium mt-2">Guarda una copia física del manual para consulta offline y archivado corporativo.</p>
                        </div>
                        <div className="flex items-center gap-2 text-white text-xs font-black uppercase tracking-widest pt-4">
                          Descargar <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Grid Reference (Stitch) */}
                  <div className="pt-12 border-t border-border/50">
                    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground mb-8">Navegación por Módulos</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {SECTIONS.filter(s => s.id !== 'main').map((section) => (
                        <button
                          key={section.id}
                          onClick={() => setSelectedSection(section.id)}
                          className="flex flex-col items-start p-6 rounded-[2rem] min-h-[100px] bg-card border border-border/50 hover:border-primary/30 hover:shadow-xl transition-all group text-left"
                        >
                          <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform mb-4">
                            <section.icon className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-black uppercase tracking-wider leading-tight text-foreground">{section.label}</span>
                          <span className="text-[10px] text-muted-foreground font-medium mt-1 line-clamp-1">{section.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* SECTION CONTENT */
                <div className="space-y-8">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div className="space-y-1">
                      <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground flex items-center gap-3">
                        {(() => {
                          const Icon = SECTIONS.find(s => s.id === selectedSection)?.icon || Info;
                          return <Icon className="w-8 h-8 text-primary" />;
                        })()}
                        {SECTIONS.find(s => s.id === selectedSection)?.label}
                      </h2>
                      <p className="text-muted-foreground font-medium">
                        {SECTIONS.find(s => s.id === selectedSection)?.description}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSection('main')}
                      className="h-10 px-4 rounded-full border-primary/20 text-primary hover:bg-primary hover:text-white"
                    >
                      <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                      Volver al Manual
                    </Button>
                  </div>

                  {/* Render content based on ID */}
                  {selectedSection === 'onboarding' && <KidsOnboarding />}

                  {selectedSection === 'roles' && (
                    <div className="space-y-8">
                      <RolesDiagram />
                      <div className="grid md:grid-cols-3 gap-6">
                        <div className="p-6 rounded-3xl bg-muted/30 border border-border">
                          <h4 className="font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                            <ListChecks className="w-4 h-4" />
                            Checklist de Roles
                          </h4>
                          <div className="space-y-6">
                            <div>
                              <Badge className="bg-primary mb-2">ADMIN</Badge>
                              <p className="text-xs font-medium text-muted-foreground leading-tight">Control total, creación de tiendas, reportes financieros globales.</p>
                            </div>
                            <div>
                              <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20 mb-2 uppercase text-[10px]">Encargado</Badge>
                              <p className="text-xs font-medium text-muted-foreground leading-tight">Administra usuarios y tiendas asignadas.</p>
                            </div>
                          </div>
                        </div>
                        <div className="md:col-span-2 p-6 rounded-3xl bg-primary/5 border border-primary/10">
                          <h4 className="text-sm font-black text-primary uppercase mb-4">Caso: La Empresa "Global-Tech"</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            <span className="font-black text-primary">JUAN (Admin Global):</span> Es el dueño. Crea tres "Encargados" para sus sucursales principales.
                            Pedro gestiona Tienda Norte, María gestiona Tienda Sur.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedSection === 'admin' && (
                    <div className="space-y-12">
                      <UserFlowDiagram />
                      <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="step-1" className="border-b border-primary/10">
                          <AccordionTrigger className="hover:no-underline py-6">
                            <div className="flex items-center gap-4 text-left">
                              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black">1</div>
                              <div>
                                <h4 className="font-black text-sm uppercase text-foreground">Registro del Usuario</h4>
                                <p className="text-xs text-muted-foreground">Alta inicial en la base de datos central.</p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-6 pl-14 text-sm text-muted-foreground">
                            Accede a Usuarios y haz clic en "Nuevo Usuario". Solo necesitas el Nombre y Correo Electrónico.
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  )}

                  {selectedSection === 'costs' && (
                    <div className="space-y-8">
                       <CostFlowDiagram />
                       <div className="grid md:grid-cols-2 gap-8 items-center bg-amber-500/5 border border-amber-500/10 p-8 rounded-[2rem]">
                          <div className="space-y-4">
                            <h4 className="font-black text-amber-600 text-xs uppercase tracking-[0.2em]">Modo Rápido & Gen. Masiva</h4>
                            <p className="text-sm font-medium leading-relaxed text-amber-800/70">
                              Eli se encarga de generar todas las fichas masivamente en un solo clic. Tú pones lo que necesitas y el sistema llena todos los formularios técnicos automáticamente.
                            </p>
                          </div>
                          <QuickModeMassiveDiagram />
                       </div>
                    </div>
                  )}

                  {selectedSection === 'pos' && (
                    <div className="space-y-12">
                      <div className="grid lg:grid-cols-2 gap-8 items-center">
                        <div className="space-y-4">
                          <h3 className="font-black text-xl flex items-center gap-2 text-primary uppercase tracking-tighter">
                            <ShoppingCart className="w-6 h-6" />
                            Arquitectura Móvil
                          </h3>
                          <p className="text-sm font-medium leading-relaxed">
                            Diseñado para operativa fluida en dispositivos táctiles. El carrito reside en un Panel Inferior accesible desde la zona del pulgar.
                          </p>
                        </div>
                        <div className="space-y-4">
                          <StickyCartFlowDiagram />
                          <MobilePosDiagram />
                        </div>
                      </div>
                      <SalesFlowDiagram />
                      <CashFlowDiagram />
                    </div>
                  )}

                  {selectedSection === 'inventory' && (
                    <div className="space-y-12">
                      <InventoryFlowDiagram />
                      <div className="grid lg:grid-cols-2 gap-8 items-center bg-primary/5 p-8 rounded-[2.5rem]">
                        <div className="space-y-4">
                          <h4 className="font-black text-primary text-xs uppercase">Ajuste Rápido</h4>
                          <p className="text-sm font-medium">Controles táctiles de gran tamaño, botones stepper para incrementar unidades sin usar teclado.</p>
                        </div>
                        <InventoryAdjustmentFlowDiagram />
                      </div>
                      <StoreSkuDiagram />
                    </div>
                  )}

                  {selectedSection === 'innovation' && (
                    <div className="grid lg:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="p-8 rounded-[2.5rem] bg-violet-500/5 border border-violet-500/10">
                          <h4 className="text-lg font-black text-violet-600 uppercase mb-4 flex items-center gap-2">
                            <Cpu className="w-5 h-5" />
                            Eli: Asistente AI
                          </h4>
                          <p className="text-sm font-medium leading-relaxed mb-4 text-muted-foreground">
                            Analiza datos en tiempo real y ofrece respuestas precisas sobre tu inventario y métricas.
                          </p>
                        </div>
                        <EliDiagram />
                      </div>
                      <div className="space-y-6">
                         <div className="p-8 rounded-[2.5rem] bg-amber-500/5 border border-amber-500/10">
                          <h4 className="text-lg font-black text-amber-600 uppercase mb-4 flex items-center gap-2">
                            <WifiOff className="w-5 h-5" />
                            Modo Offline
                          </h4>
                          <p className="text-sm font-medium leading-relaxed mb-4 text-muted-foreground">
                            CostPro guarda todo en un "cuaderno digital" y sincroniza automáticamente al recuperar la conexión.
                          </p>
                        </div>
                        <OfflineSyncDiagram />
                      </div>
                    </div>
                  )}

                  {selectedSection === 'security' && (
                    <div className="space-y-8">
                      <SecurityFlowDiagram />
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="p-8 rounded-[2.5rem] bg-primary text-white">
                          <h4 className="font-black uppercase tracking-widest text-xs mb-4 opacity-80">Row-Level Security (RLS)</h4>
                          <p className="text-sm font-medium leading-relaxed">
                            Aislamiento total de sucursales. Un empleado de la Tienda A no puede acceder a los datos de la Tienda B.
                          </p>
                        </div>
                        <div className="p-8 rounded-[2.5rem] bg-card border border-border">
                           <h4 className="font-black uppercase tracking-widest text-xs text-primary mb-4 flex items-center gap-2">
                            <Search className="w-4 h-4" />
                            Audit Inspector
                          </h4>
                          <p className="text-xs font-medium text-muted-foreground">Trazabilidad total: registra cada pregunta hecha a la base de datos.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedSection === 'ipv' && (
                    <div className="space-y-12">
                      <div className="bg-blue-500/10 border border-blue-500/20 p-8 rounded-[2.5rem]">
                        <h4 className="font-black text-blue-600 text-xs uppercase mb-4 flex items-center gap-2">IPV Builder</h4>
                        <p className="text-sm font-medium leading-relaxed">
                          Sincroniza tus ventas registradas con los movimientos reales de tu banco en segundos.
                        </p>
                      </div>
                      <IpvFlowDiagram />
                    </div>
                  )}

                  {selectedSection === 'history' && (
                    <div className="space-y-8">
                      <div className="relative pl-8 border-l-2 border-primary/20 space-y-8">
                        {[
                          { ver: 'v5.7.25', date: '14 de Marzo, 2026', title: 'Modo Rápido y Gen. Masiva', active: true },
                          { ver: 'v5.7.24', date: '06 de Marzo, 2026', title: 'Next-Gen Welcome Landing', active: false },
                          { ver: 'v5.7.19', date: '27 de Febrero, 2026', title: 'Lanzamiento IPV Builder', active: false },
                        ].map((v, i) => (
                          <div key={i} className="relative">
                            <div className={cn("absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-background", v.active ? "bg-primary" : "bg-muted")} />
                            <div className="flex items-center gap-3 mb-2">
                              <Badge className={v.active ? "bg-primary" : "bg-muted text-muted-foreground"}>{v.ver}</Badge>
                              <span className="text-[10px] font-black text-muted-foreground uppercase">{v.date}</span>
                            </div>
                            <div className="bg-card/50 rounded-2xl p-6 border border-border">
                              <h4 className="font-black text-xs uppercase text-primary">{v.title}</h4>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Support - Minimalist */}
      <div className="px-8 py-4 border-t bg-card/10 flex flex-col sm:flex-row items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">¿Necesitas soporte técnico?</span>
        </div>
        <button className="text-[10px] font-black text-primary uppercase tracking-[0.2em] hover:underline underline-offset-4">
          Contactar Equipo CostPro
        </button>
      </div>
    </div>
  );
}
