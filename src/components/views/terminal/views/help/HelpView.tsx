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
  Activity, Scale, CreditCard
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HorizontalScroll } from '@/components/ui/HorizontalScroll';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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

export default function HelpView() {
  return (
    <div className="space-y-8 pb-12">
      {/* Header with Versioning */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-primary/10 pb-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-[clamp(1.5rem,6vw,1.875rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-3">
            <BookOpen className="w-8 h-8" />
            Centro de Capacitación CostPro
          </h2>
          <p className="text-muted-foreground font-medium max-w-2xl">
            Guía profesional para la gestión de costos, ventas y multi-sucursales.
          </p>
        </div>
        <div className="flex flex-col items-end">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black">
            VERSIÓN 5.7.25 (EXPRESS GEN)
          </Badge>
          <span className="text-xs text-muted-foreground font-bold uppercase mt-1">Última actualización: 14 Mar 2026</span>
        </div>
      </div>

      <Tabs defaultValue="roles" className="w-full">
        <div className="mb-8">
          <HorizontalScroll containerClassName="bg-muted/50 rounded-2xl p-1">
            <TabsList className="flex bg-transparent border-none w-max min-w-full h-auto p-0 gap-1">
              <TabsTrigger value="onboarding" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <Baby className="w-4 h-4 mr-2 hidden sm:block" />
                Niños
              </TabsTrigger>
              <TabsTrigger value="roles" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <Users className="w-4 h-4 mr-2 hidden sm:block" />
                Jerarquía
              </TabsTrigger>
              <TabsTrigger value="admin" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <Settings className="w-4 h-4 mr-2 hidden sm:block" />
                Gestión
              </TabsTrigger>
              <TabsTrigger value="costs" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <FileText className="w-4 h-4 mr-2 hidden sm:block" />
                Costos
              </TabsTrigger>
              <TabsTrigger value="pos" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <ShoppingCart className="w-4 h-4 mr-2 hidden sm:block" />
                Ventas
              </TabsTrigger>
              <TabsTrigger value="inventory" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <Package className="w-4 h-4 mr-2 hidden sm:block" />
                Almacén
              </TabsTrigger>
              <TabsTrigger value="innovation" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <Zap className="w-4 h-4 mr-2 hidden sm:block" />
                Innovación
              </TabsTrigger>
              <TabsTrigger value="security" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <Shield className="w-4 h-4 mr-2 hidden sm:block" />
                Seguridad
              </TabsTrigger>
              <TabsTrigger value="ipv" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <Activity className="w-4 h-4 mr-2 hidden sm:block" />
                Conciliación (IPV)
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-xl py-3 min-h-[44px] data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs sm:text-xs shrink-0 px-6">
                <History className="w-4 h-4 mr-2 hidden sm:block" />
                Historial
              </TabsTrigger>
            </TabsList>
          </HorizontalScroll>
        </div>

        {/* --- COSTPRO PARA NIÑOS (ONBOARDING) --- */}
        <TabsContent value="onboarding" className="space-y-8">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">CostPro para Niños (Storytelling)</CardTitle>
              <CardDescription className="text-base font-medium">
                Aprende los conceptos fundamentales de CostPro a través de la historia de Juan y Pedro.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <KidsOnboarding />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- JERARQUÍA Y ROLES --- */}
        <TabsContent value="roles" className="space-y-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-none shadow-none bg-transparent">
                <CardHeader className="px-0">
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Modelo Multi-Tienda y Jerarquía</CardTitle>
                  <CardDescription className="text-base font-medium">
                    CostPro permite una estructura flexible donde la autoridad se delega en cascada.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <RolesDiagram />
                </CardContent>
              </Card>

              <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10">
                <h4 className="text-lg font-black text-primary uppercase mb-6 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  CostPro para Niños: El Cuento de Juan y Pedro
                </h4>
                <div className="mb-8 p-6 bg-background/50 rounded-2xl border border-primary/20">
                  <p className="text-sm font-medium leading-relaxed mb-4">
                    <span className="text-xl mr-2">🍭</span>
                    Imagina que tienes una dulcería. <span className="font-black text-primary">JUAN</span> es el dueño global. Él decide cuántas tiendas abrir y quiénes pueden ayudarle.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-2">
                      <p><span className="font-bold">EL TRUCO DE LOS ESTANTES:</span> Cada tienda es un estante diferente. Juan no quiere que los dulces de la "Tienda Norte" se mezclen con los de la "Tienda Sur".</p>
                      <p><span className="font-bold">LA LLAVE MÁGICA:</span> Para mover dulces (hacer una <span className="font-bold">Recepción</span>), primero debes elegir qué estante vas a llenar. Si no eliges uno, ¡la caja no se abre!</p>
                    </div>
                    <div className="space-y-2">
                      <p><span className="font-black text-violet-600">PEDRO (El Ayudante):</span> Juan le dio a Pedro permiso para cuidar el estante Norte. Pedro solo ve lo que hay ahí. Así, Juan está tranquilo porque sabe que nadie se confunde.</p>
                      <p className="font-bold text-primary italic">"En CostPro, elegir tu tienda es como elegir qué juego vas a jugar hoy. ¡Todo queda en su lugar!"</p>
                    </div>
                  </div>
                </div>

                <h4 className="text-lg font-black text-primary uppercase mb-6 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Caso Demostrativo: La Empresa "Global-Tech"
                </h4>
                <div className="grid md:grid-cols-2 gap-8 text-sm leading-relaxed">
                  <div className="space-y-4">
                    <p>
                      <span className="font-black text-primary">JUAN (Admin Global):</span> Es el dueño. Crea tres "Encargados" para sus sucursales principales.
                    </p>
                    <ul className="space-y-2 pl-4 border-l-2 border-primary/20">
                      <li>• <span className="font-bold">Pedro:</span> Gestiona Tienda Norte.</li>
                      <li>• <span className="font-bold">María:</span> Gestiona Tienda Sur.</li>
                      <li>• <span className="font-bold">Luisa:</span> Gestiona el Almacén Central.</li>
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <p>
                      <span className="font-black text-violet-600">PEDRO (Encargado Norte):</span>
                      Pedro tiene permiso para crear sus propios usuarios. Crea 4 "Cajeros" para los turnos de su tienda sin necesidad de que Juan intervenga.
                    </p>
                    <p className="bg-background/50 p-3 rounded-xl italic text-xs">
                      "La clave es la autonomía: el Admin delega en el Encargado, y el Encargado gestiona su equipo local."
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 rounded-3xl bg-muted/30 border border-border">
                <h4 className="font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                  <ListChecks className="w-4 h-4" />
                  Checklist de Roles
                </h4>
                <div className="space-y-6">
                  <div>
                    <Badge className="bg-primary mb-2">ADMIN</Badge>
                    <p className="text-xs font-medium text-muted-foreground leading-tight">Control total, creación de tiendas, reportes financieros globales y auditoría de sistema.</p>
                  </div>
                  <div>
                    <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20 mb-2">ENCARGADO / GERENTE</Badge>
                    <p className="text-xs font-medium text-muted-foreground leading-tight">Administra usuarios y tiendas asignadas, supervisa cierres de caja y gestiona el inventario local.</p>
                  </div>
                  <div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 mb-2">CAJERO / ALMACÉN</Badge>
                    <p className="text-xs font-medium text-muted-foreground leading-tight">Operaciones diarias de punto de venta y control de entrada/salida de mercancía.</p>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 space-y-4">
                <div>
                  <h4 className="font-black text-xs uppercase tracking-widest text-emerald-700 mb-2">Tip Multi-Tienda</h4>
                  <p className="text-xs font-medium text-emerald-800/70">
                    Un usuario puede ser <span className="font-bold">Encargado</span> en la Tienda A y <span className="font-bold">Cajero</span> en la Tienda B. Sus permisos cambiarán dinámicamente según la tienda que seleccione al entrar.
                  </p>
                </div>
                <div className="pt-4 border-t border-emerald-500/10">
                  <h4 className="font-black text-xs uppercase tracking-widest text-green-700 mb-2 flex items-center gap-2">
                    <Store className="w-3 h-3" />
                    Auto-selección de Tienda
                  </h4>
                  <p className="text-xs font-medium text-green-800/70 leading-relaxed">
                    Para garantizar la operatividad inmediata, el sistema selecciona automáticamente tu primera tienda asignada si no tienes una activa.
                    <span className="block mt-1 font-bold italic">Nota: Si no ves datos, verifica que tengas al menos una tienda asignada por tu Administrador.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- GESTIÓN PASO A PASO --- */}
        <TabsContent value="admin" className="space-y-8">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Guía de Configuración y Despliegue</CardTitle>
              <CardDescription className="text-base font-medium">
                Sigue estos pasos para poner en marcha tu estructura operativa.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-12">
              <UserFlowDiagram />

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="step-1" className="border-b border-primary/10">
                  <AccordionTrigger className="hover:no-underline py-6">
                    <div className="flex items-center gap-4 text-left">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black">1</div>
                      <div>
                        <h4 className="font-black text-sm uppercase">Paso 1: Registro del Usuario</h4>
                        <p className="text-xs text-muted-foreground">Alta inicial en la base de datos central.</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 pl-14 text-sm text-muted-foreground space-y-2">
                    <p>Accede a <span className="font-bold text-primary">Usuarios</span> y haz clic en "Nuevo Usuario".</p>
                    <p>Solo necesitas el Nombre y Correo Electrónico. En este punto, el usuario <span className="italic">no tiene acceso a nada</span> hasta que se le asigne una membresía.</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step-2" className="border-b border-primary/10">
                  <AccordionTrigger className="hover:no-underline py-6">
                    <div className="flex items-center gap-4 text-left">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black">2</div>
                      <div>
                        <h4 className="font-black text-sm uppercase">Paso 2: Asignación de Tiendas (Bulk)</h4>
                        <p className="text-xs text-muted-foreground">Vincular al usuario con una o varias sucursales.</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 pl-14 text-sm text-muted-foreground space-y-4">
                    <p>Utiliza el gestor multi-tienda para asignar <span className="font-bold">múltiples sucursales</span> de una sola vez. Cada membresía es independiente.</p>
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs leading-relaxed">
                        El sistema ahora soporta la asignación masiva de roles y estados por tienda, permitiendo que un usuario sea <span className="font-bold italic">Encargado</span> en una sede y <span className="font-bold italic">Cajero</span> en otra simultáneamente.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="step-3" className="border-b border-primary/10">
                  <AccordionTrigger className="hover:no-underline py-6">
                    <div className="flex items-center gap-4 text-left">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black">3</div>
                      <div>
                        <h4 className="font-black text-sm uppercase">Paso 3: Definición del Rol</h4>
                        <p className="text-xs text-muted-foreground">Establecer qué acciones puede realizar en esa tienda.</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 pl-14 text-sm text-muted-foreground space-y-2">
                    <p>Para cada tienda asignada, elige el rol: <Badge variant="secondary" className="scale-75">Encargado</Badge>, <Badge variant="secondary" className="scale-75">Cajero</Badge> o <Badge variant="secondary" className="scale-75">Almacenero</Badge>.</p>
                    <p>Guarda los cambios. El acceso es <span className="font-bold text-emerald-600">instantáneo</span>.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- COST SHEET FLOWS --- */}
        <TabsContent value="costs" className="space-y-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-none shadow-none bg-transparent">
                <CardHeader className="px-0">
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Ingeniería de Costos v5</CardTitle>
                  <CardDescription className="text-base font-medium">
                    Nuestro motor de cálculo procesa 14 secciones críticas y 5 anexos técnicos con precisión matemática.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <CostFlowDiagram />
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-6 rounded-2xl bg-violet-500/5 border border-violet-500/10 space-y-2">
                  <Table2 className="w-6 h-6 text-violet-600" />
                  <h5 className="font-black text-xs uppercase">Modo Experto</h5>
                  <p className="text-xs text-muted-foreground leading-tight">Control total sobre celdas, fórmulas y referencias cruzadas en tiempo real.</p>
                </div>
                <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
                  <Wand2 className="w-6 h-6 text-emerald-600" />
                  <h5 className="font-black text-xs uppercase">Modo Asistido</h5>
                  <p className="text-xs text-muted-foreground leading-tight">Wizard paso a paso que guía la entrada de datos para evitar errores humanos.</p>
                </div>
                <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-2">
                  <BookOpen className="w-6 h-6 text-amber-600" />
                  <h5 className="font-black text-xs uppercase">Modo Lectura</h5>
                  <p className="text-xs text-muted-foreground leading-tight">Narrativa generada automáticamente que explica el origen de cada costo.</p>
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-3xl mt-8">
                <h4 className="font-black text-amber-600 text-xs uppercase mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Nuevo: Modo Rápido & Gen. Masiva (v5.7.25)
                </h4>
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <p className="text-xs font-medium leading-relaxed text-amber-800/70">
                      <strong>Antes Juan hacía X:</strong> Tenía que crear cada ficha de costo una por una, entrando en el modo experto para cada producto, lo cual era lento si tenía 20 productos nuevos.
                      <br />
                      <strong>Ahora Juan hace Y:</strong> Juan entra al "Modo Rápido", escribe una lista simple de productos con sus costos base, y Eli se encarga de generar todas las fichas masivamente en un solo clic.
                    </p>
                    <div className="p-4 bg-background/50 rounded-xl border border-amber-200">
                      <p className="text-xs italic text-amber-800 leading-tight">
                        "Es como hacer una lista de compras: tú pones lo que necesitas y el sistema llena todos los formularios técnicos por ti automáticamente."
                      </p>
                    </div>
                  </div>
                  <QuickModeMassiveDiagram />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 rounded-3xl bg-muted/30 border border-border">
                <h4 className="font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Arquitectura v5
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-xs">14</div>
                    <span className="text-xs font-bold uppercase">Secciones de Gasto</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-xs">05</div>
                    <span className="text-xs font-bold uppercase">Anexos Técnicos</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-xs">14%</div>
                    <span className="text-xs font-bold uppercase">Seguridad Social</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-xs">05%</div>
                    <span className="text-xs font-bold uppercase">Impuesto Fuerza Trabajo</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-primary text-white space-y-4">
                <h4 className="font-black text-xs uppercase tracking-widest opacity-80 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  Exportación
                </h4>
                <p className="text-xs font-medium leading-relaxed">
                  Genera reportes profesionales en <span className="font-black">PDF</span> con branding corporativo o exporta a <span className="font-black">CSV/Excel</span> para auditorías contables externas.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- POS FLOWS --- */}
        <TabsContent value="pos" className="space-y-6">
          <div className="bg-primary/10 border border-primary/20 p-4 rounded-2xl mb-6">
            <h4 className="font-black text-primary text-xs uppercase mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Arquitectura Zero-Latency (v5.7.12)
            </h4>
            <p className="text-xs font-medium leading-relaxed text-primary/80">
              <strong>Antes Juan hacía X:</strong> Cada búsqueda de producto requería una llamada a la nube, causando esperas y frustración si el internet fallaba.
              <br />
              <strong>Ahora Juan hace Y:</strong> El TPV descarga todo el catálogo al inicio (como llenar los estantes al abrir la tienda). Las búsquedas son instantáneas, locales y funcionan incluso si el internet parpadea.
            </p>
          </div>
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Ciclo de Venta y Caja</CardTitle>
            </CardHeader>
            <CardContent className="px-0 space-y-12">
              <div className="bg-primary/5 p-6 rounded-3xl border border-primary/10 mb-8">
                <h4 className="font-black text-primary text-xs uppercase mb-4 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Optimizaciones de Velocidad Móvil
                </h4>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase text-muted-foreground">TPV (Caja):</p>
                    <ul className="text-xs space-y-1 font-medium">
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <strong>Botones 44px:</strong> Controles de cantidad más grandes para evitar errores.</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <strong>Descuento 1-Tap:</strong> Botones rápidos de 5%, 10% y 15%.</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase text-muted-foreground">Inventario:</p>
                    <ul className="text-xs space-y-1 font-medium">
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <strong>Filtros Rápidos:</strong> Categorías siempre visibles en un toque.</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <strong>Búsqueda Local:</strong> Resultados inmediatos sin latencia de red.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-primary uppercase tracking-tighter">
                      <ShoppingCart className="w-5 h-5" />
                        Arquitectura Móvil Primero
                    </h3>
                    <p className="text-sm font-medium leading-relaxed">
                        En la v5.4.0, el TPV ha sido rediseñado para una operativa fluida en dispositivos táctiles. El carrito de compras ahora reside en un <span className="font-bold text-primary">Panel Inferior</span> accesible desde la zona de alcance del pulgar.
                    </p>
                    <div className="bg-primary/5 p-4 rounded-xl border-l-4 border-primary">
                       <p className="text-xs font-black uppercase text-primary mb-1">Optimización UX (Nueva Estructura):</p>
                       <p className="text-xs italic">"Menos clics, más velocidad. El selector de productos y el cierre de venta están optimizados para uso a una sola mano mediante un footer sticky."</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <StickyCartFlowDiagram />
                    <MobilePosDiagram />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                  <ShoppingCart className="w-5 h-5" />
                  Flujo de Operación Estándar
                </h3>
                <SalesFlowDiagram />
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                  <Receipt className="w-5 h-5" />
                  Control de Efectivo y Cierre
                </h3>
                <CashFlowDiagram />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 rounded-3xl border border-emerald-500/20 bg-emerald-500/5">
                  <h4 className="font-black text-emerald-600 uppercase tracking-widest text-xs mb-3">Protocolo de Venta</h4>
                  <ul className="space-y-3">
                    {[
                      "Escanea el producto o búscalo por nombre localmente.",
                      "Verifica que el precio sea el correcto antes de totalizar.",
                      "Selecciona el método de pago exacto (Efectivo/Transferencia).",
                      "Entrega el comprobante digital o impreso al cliente."
                    ].map((t, i) => (
                      <li key={i} className="flex gap-3 text-xs font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-6 rounded-3xl border border-amber-500/20 bg-amber-500/5">
                  <h4 className="font-black text-amber-600 uppercase tracking-widest text-xs mb-3">Cierre de Caja Diario</h4>
                  <ul className="space-y-3">
                    {[
                      "Realiza el arqueo físico del dinero en caja.",
                      "Usa el botón 'Actualizar' para sincronizar ventas recientes.",
                      "Declara el total en el sistema para detectar faltantes.",
                      "Solicita la firma del Encargado en el reporte final."
                    ].map((t, i) => (
                      <li key={i} className="flex gap-3 text-xs font-medium">
                        <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- INVENTORY FLOWS --- */}
        <TabsContent value="inventory" className="space-y-6">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Logística e Inventario</CardTitle>
            </CardHeader>
            <CardContent className="px-0 space-y-12">
              <InventoryFlowDiagram />

              <div className="bg-primary/5 p-6 rounded-3xl border border-primary/10">
                <h4 className="font-black text-primary text-xs uppercase mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Nuevo: Ajuste Rápido de Inventario
                </h4>
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                   <div className="space-y-4">
                      <p className="text-sm font-medium leading-relaxed">
                        Optimizado para la operación en almacén, el ajuste de stock ahora utiliza un <span className="font-bold text-primary">Panel Inferior</span> con controles táctiles de gran tamaño.
                      </p>
                      <ul className="text-xs space-y-2 font-medium">
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <strong>Botones Stepper:</strong> Incrementa o decrementa unidades sin usar el teclado.</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <strong>Motivos Quick-Pick:</strong> Botones rápidos para Merma, Error de Conteo o Venta Omitida.</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <strong>Feedback Inmediato:</strong> Visualiza la variación porcentual del costo antes de confirmar.</li>
                      </ul>
                   </div>
                   <InventoryAdjustmentFlowDiagram />
                </div>
              </div>

              <div className="space-y-6 pt-8 border-t border-primary/10">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary uppercase tracking-tighter">
                  <Store className="w-5 h-5" />
                  Tienda Activa y SKU (Identificación Unívoca)
                </h3>
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                   <div className="space-y-4 text-sm leading-relaxed">
                      <p className="font-medium">
                        En el modelo Empresarial de CostPro, <span className="font-bold">cada tienda es un mundo separado</span>. El sistema garantiza el aislamiento total de inventarios mediante la combinación obligatoria de Tienda + SKU.
                      </p>
                      <div className="bg-primary/5 p-4 rounded-xl border-l-4 border-primary space-y-2">
                        <p className="font-bold text-xs uppercase text-primary">Regla Fundamental:</p>
                        <p className="italic text-xs">"Un producto se identifica por su SKU dentro de su tienda activa. El mismo SKU puede existir en otra tienda sin causar conflictos."</p>
                      </div>
                      <div className="bg-emerald-500/5 p-4 rounded-xl border-l-4 border-emerald-500 space-y-2">
                        <p className="font-bold text-xs uppercase text-emerald-600">Recepción Responsiva (v5.7.16):</p>
                        <p className="italic text-xs text-emerald-900/70">"La tabla de recepción ahora permite scroll horizontal en móviles, asegurando que los subtotales y costos totales sean siempre visibles."</p>
                      </div>
                      <div className="space-y-2">
                        <h5 className="font-black text-xs uppercase tracking-widest text-muted-foreground">Ejemplo Operativo:</h5>
                        <p className="text-xs bg-muted/50 p-3 rounded-lg">
                          Juan administra la <strong>Tienda A</strong> y la <strong>Tienda B</strong>. Ambas venden arroz con SKU <code className="bg-primary/10 px-1 rounded text-primary font-bold">ARROZ-1KG</code>.
                          Cuando Juan importa una recepción estando en la <span className="font-bold uppercase text-primary">Tienda B</span>, solo aumenta el inventario de la Tienda B. El inventario de la Tienda A permanece intacto.
                        </p>
                      </div>
                   </div>
                   <StoreSkuDiagram />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="font-black text-primary uppercase tracking-widest text-xs">Gestión de Existencias</h4>
                  <div className="space-y-4">
                    <div className="flex gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-black text-primary italic">IN</div>
                      <div>
                        <h5 className="font-bold text-sm">Recepciones Protegidas</h5>
                        <p className="text-xs text-muted-foreground">
                          El sistema bloquea la búsqueda o importación hasta que selecciones una <span className="font-bold">Tienda Activa</span>. Esto garantiza que el stock y los costos se asignen correctamente.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 p-4 rounded-2xl bg-muted/30">
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center font-black text-amber-600 italic">ADJ</div>
                      <div>
                        <h5 className="font-bold text-sm">Ajustes de Merma</h5>
                        <p className="text-xs text-muted-foreground">Correcciones por daño o vencimiento. Debe ir acompañado de una nota explicativa.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex flex-col justify-center">
                  <div className="flex items-start gap-4">
                    <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0" />
                    <div>
                      <h5 className="font-black text-xs uppercase text-amber-600 tracking-widest mb-2">Regla de Oro del Inventario</h5>
                      <p className="text-xs text-amber-900/70 font-medium leading-relaxed">
                        "Nunca vendas un producto que no haya sido ingresado primero al sistema".
                        El stock negativo está deshabilitado para garantizar la integridad de tus costos y márgenes de ganancia.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- INNOVATION FLOWS --- */}
        <TabsContent value="innovation" className="space-y-8">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Vanguardia Tecnológica</CardTitle>
              <CardDescription className="text-base font-medium">
                IA y Resiliencia Offline para una operativa sin interrupciones.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-12">
              <div className="grid lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                  <div className="p-6 rounded-3xl bg-violet-500/5 border border-violet-500/10">
                    <h4 className="text-lg font-black text-violet-600 uppercase mb-4 flex items-center gap-2">
                      <Cpu className="w-5 h-5" />
                      Eli: Inteligencia Integrada
                    </h4>
                    <p className="text-sm font-medium leading-relaxed mb-4 text-muted-foreground">
                      Eli es tu asistente técnica experta. Analiza datos en tiempo real y consulta la base de normativas para ofrecerte respuestas precisas sobre tu inventario y métricas.
                    </p>
                    <div className="bg-background/50 p-4 rounded-xl border border-violet-200">
                       <p className="text-xs italic text-violet-800">
                         "Juan ya no tiene que buscar en 10 reportes. Solo le pregunta a Eli: '¿Cuál fue mi producto más vendido hoy?' y obtiene la respuesta en 5 segundos."
                       </p>
                    </div>
                  </div>
                  <EliDiagram />
                </div>

                <div className="space-y-6">
                  <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/10">
                    <h4 className="text-lg font-black text-amber-600 uppercase mb-4 flex items-center gap-2">
                      <WifiOff className="w-5 h-5" />
                      Sincronización Offline
                    </h4>
                    <p className="text-sm font-medium leading-relaxed mb-4 text-muted-foreground">
                      <strong>Antes Juan hacía X:</strong> Si se iba el internet, la tienda se detenía. No podía registrar ventas ni ver el inventario.
                      <br />
                      <strong>Ahora Juan hace Y:</strong> Sigue operando normalmente. CostPro guarda todo en un "cuaderno digital" (IndexedDB) y sincroniza automáticamente al recuperar la conexión.
                    </p>
                    <div className="bg-background/50 p-4 rounded-xl border border-amber-200">
                       <p className="text-xs italic text-amber-800">
                         "Es como tener un generador eléctrico: la luz se va, pero tu negocio sigue brillando."
                       </p>
                    </div>
                  </div>
                  <OfflineSyncDiagram />
                </div>
              </div>

              <div className="p-8 rounded-3xl bg-muted/30 border border-border">
                <h4 className="text-lg font-black text-primary uppercase mb-6 flex items-center gap-2">
                  <Newspaper className="w-5 h-5" />
                  Agregador de Noticias & Divisas
                </h4>
                <div className="grid md:grid-cols-2 gap-8 text-sm leading-relaxed text-muted-foreground">
                   <p>
                     Nuestro módulo RSS ahora detecta automáticamente tasas de cambio (BCC) y prioriza noticias críticas. Juan puede ver el precio del dólar actualizado nada más entrar en la sección de Noticias.
                   </p>
                   <ul className="space-y-2">
                     <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Filtro de prioridad activo por defecto.</li>
                     <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Detección inteligente de moneda y metadatos.</li>
                   </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- SECURITY FLOWS --- */}
        <TabsContent value="security" className="space-y-6">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Seguridad y Observabilidad</CardTitle>
              <CardDescription className="text-base font-medium">
                Arquitectura de protección de datos empresarial.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-8">
              <SecurityFlowDiagram />

              <div className="grid md:grid-cols-2 gap-6 mt-8">
                <div className="p-8 rounded-3xl bg-primary shadow-xl text-white">
                  <h4 className="font-black uppercase tracking-widest text-xs mb-4 opacity-80">Aislamiento de Sucursales</h4>
                  <p className="text-sm font-medium leading-relaxed">
                    Utilizamos <span className="underline decoration-white/30 underline-offset-4">Row-Level Security (RLS)</span>.
                    Esto significa que un empleado de la Tienda A no puede acceder, ni siquiera por error, a los datos de la Tienda B.
                  </p>
                </div>
                <div className="p-8 rounded-3xl bg-white border border-border shadow-sm">
                  <h4 className="font-black uppercase tracking-widest text-xs text-primary mb-4 flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Admin Query Inspector
                  </h4>
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground mb-4">
                    Transparencia total para administradores:
                  </p>
                  <div className="space-y-4">
                    <p className="text-xs">
                      Es como tener una cámara de seguridad que registra cada pregunta hecha a la base de datos. Permite auditar en tiempo real qué información se está consultando y desde qué vista.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {["Auditoría Real-time", "Parámetros RPC", "Filtros Supabase", "Restringido a Admins"].map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-black uppercase tracking-tighter text-muted-foreground">
                          <CheckCircle2 className="w-3 h-3 text-primary" />
                          {t}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- IPV BUILDER FLOWS --- */}
        <TabsContent value="ipv" className="space-y-8">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Módulo IPV Builder (Conciliación Automática)</CardTitle>
              <CardDescription className="text-base font-medium">
                Sincroniza tus ventas registradas con los movimientos reales de tu banco en segundos.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-12">
              <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-3xl mb-8">
                <h4 className="font-black text-blue-600 text-xs uppercase mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Evolución de la Conciliación
                </h4>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase text-muted-foreground">Antes (Juan Manual):</p>
                    <p className="text-xs font-medium leading-relaxed">
                      Juan pasaba horas con una regla y un papel comparando cada transferencia del banco con sus vales de venta. Si se equivocaba en un peso, tenía que empezar de nuevo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-black uppercase text-blue-600">Ahora (Eli Automática):</p>
                    <p className="text-xs font-medium leading-relaxed">
                      Eli toma el archivo del banco (CSV/XLSX) y lo cruza instantáneamente con el sistema. Ella detecta montos exactos, referencias y hasta errores de centavos automáticamente.
                    </p>
                  </div>
                </div>
              </div>

              <IpvFlowDiagram />

              <div className="grid md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl bg-muted/30 border border-border space-y-3">
                  <CreditCard className="w-6 h-6 text-primary" />
                  <h5 className="font-black text-xs uppercase">Ingesta Inteligente</h5>
                  <p className="text-xs text-muted-foreground leading-tight">Carga masiva de extractos con detección de duplicados por Hash SHA-256.</p>
                </div>
                <div className="p-6 rounded-2xl bg-muted/30 border border-border space-y-3">
                  <Scale className="w-6 h-6 text-primary" />
                  <h5 className="font-black text-xs uppercase">Motor Multi-Pass</h5>
                  <p className="text-xs text-muted-foreground leading-tight">4 niveles de análisis: Referencia Exacta, Suma de Partes, Tolerancia y Ajuste de Caja.</p>
                </div>
                <div className="p-6 rounded-2xl bg-muted/30 border border-border space-y-3">
                  <FileText className="w-6 h-6 text-primary" />
                  <h5 className="font-black text-xs uppercase">Reportes IPV PDF</h5>
                  <p className="text-xs text-muted-foreground leading-tight">Generación de informes de venta e inventario listos para imprimir o enviar.</p>
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-3xl">
                <h4 className="font-black text-amber-600 text-xs uppercase mb-2">Privacidad de Datos (Local-First)</h4>
                <p className="text-xs font-medium leading-relaxed text-amber-800/70">
                  Tus transacciones bancarias <strong>nunca suben a la nube</strong> de forma cruda. Todo el proceso de matching ocurre en tu navegador usando IndexedDB. Solo el reporte final consolidado es almacenado para auditoría.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- VERSION HISTORY --- */}
        <TabsContent value="history" className="space-y-8">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Historial de Actualizaciones</CardTitle>
              <CardDescription className="text-base font-medium">
                Registro oficial de cambios y mantenimiento de la plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="space-y-8">
                {/* --- v5.7.25 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary">v5.7.25</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">14 de Marzo, 2026 (Actual)</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Integración de Modo Rápido y Gen. Masiva</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Creación express de productos mediante tabla de entrada rápida.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Transición automática al motor de Generación Masiva pre-poblado.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.7.24 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-90">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.7.24</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">06 de Marzo, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Next-Gen Welcome Landing</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Nueva Landing Page con diseño Bento y Showcase de Producto.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Desacoplamiento total del flujo de Login.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.7.23 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-90">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.7.23</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">02 de Marzo, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Hardening de Contratos y Observabilidad</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Validación Zod en todos los RPCs de Dashboard y Ventas.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Trazabilidad total en el QueryInspector para administradores.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.7.19 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-90">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.7.19</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">27 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Lanzamiento IPV Builder (v10.0)</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Motor de Matching Multi-Pass para conciliación bancaria.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Generación local de reportes IPV en PDF.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.7.18 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-80">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.7.18</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">27 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Refactor de Flujo en Ficha de Costo</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Navegación optimizada mediante Dropdown en Tabla Principal.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Inicio en ceros y función de carga de ejemplo realista.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.7.16 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-90">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.7.16</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">26 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Responsividad en Recepción de Productos</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Refactorización de tablas para scroll horizontal garantizado.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Resumen de costos siempre visible en dispositivos móviles.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.7.15 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-90">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary">v5.7.15</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">26 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Hardenización de API y TPV</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Validación estricta de parámetros en mutaciones críticas.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Corrección de solapamiento de cabeceras en tablas del TPV.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.7.14 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-90">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary">v5.7.14</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">26 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">UX de Caja y Noticias</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Nuevo botón de actualización manual en Cierre de Caja.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Filtro de noticias prioritarias activo por defecto.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.7.13 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-80">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.7.13</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">25 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Validación Permisiva de UUID y Resiliencia en TPV</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Implementación de validación permisiva de UUID para soportar datos de demo.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Unificación de `active_store_id` en el flujo de facturación.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.6.5 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-80">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.6.5</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">18 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Lanzamiento de Eli AI Assistant</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Integración de chat flotante con Eli (Inteligencia Integrada).</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Auditoría automática de consultas IA.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.6.4 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-80">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.6.4</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">17 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Arquitectura Offline-First</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Persistencia local con IndexedDB para ventas offline.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Sistema de resolución de conflictos y Badge de estado.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.6.0 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-80">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.6.0</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">13 de Febrero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">Lógica Funcional de Cierre de Caja</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Implementación de flujo de cierre: Declaración y Validación.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Cálculo automático de diferencia de arqueo.</li>
                    </ul>
                  </div>
                </div>

                <div className="relative pl-8 border-l-2 border-primary/10 space-y-4 opacity-60">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.2.0</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">Noviembre, 2024</span>
                  </div>
                  <div className="bg-muted/10 rounded-2xl p-6">
                    <h4 className="font-black text-sm uppercase">Lanzamiento Multi-Tienda Empresarial</h4>
                    <p className="text-xs mt-2">Implementación de RLS, jerarquías de roles dinámicos y aislamiento de sucursales.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer Support */}
      <div className="mt-12 p-8 rounded-[2rem] bg-muted/50 border border-border flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-black text-sm uppercase">¿Necesitas más ayuda?</h4>
            <p className="text-xs text-muted-foreground">Contacta con el equipo de soporte técnico de CostPro.</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
           <button className="px-8 py-3 bg-background border border-border rounded-xl font-black text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all">
             Abrir Ticket de Soporte
           </button>
           <span className="text-xs font-bold text-muted-foreground">COSTPRO v5.7.25</span>
        </div>
      </div>
    </div>
  );
}
