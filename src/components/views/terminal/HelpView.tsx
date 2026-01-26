'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Users, ShoppingCart, Package, Shield,
  CheckCircle2, ArrowRight, Info, AlertTriangle,
  Settings, Building2, Receipt, FileText, ChevronRight,
  UserPlus, Store, Key, ListChecks, HelpCircle,
  Wand2, Table2, FileSpreadsheet, History, Target,
  Baby
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Diagrams
import RolesDiagram from '@/components/help/RolesDiagram';
import UserFlowDiagram from '@/components/help/UserFlowDiagram';
import CashFlowDiagram from '@/components/help/CashFlowDiagram';
import InventoryFlowDiagram from '@/components/help/InventoryFlowDiagram';
import StoreSkuDiagram from '@/components/help/StoreSkuDiagram';
import SalesFlowDiagram from '@/components/help/SalesFlowDiagram';
import MobilePosDiagram from '@/components/help/MobilePosDiagram';
import SecurityFlowDiagram from '@/components/help/SecurityFlowDiagram';
import CostFlowDiagram from '@/components/help/CostFlowDiagram';
import KidsOnboarding from '@/components/help/KidsOnboarding';

export default function HelpView() {
  return (
    <div className="space-y-8 pb-12">
      {/* Header with Versioning */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-primary/10 pb-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-black uppercase tracking-tighter text-primary flex items-center gap-3">
            <BookOpen className="w-8 h-8" />
            Centro de Capacitación CostPro
          </h2>
          <p className="text-muted-foreground font-medium max-w-2xl">
            Guía profesional para la gestión de costos, ventas y multi-sucursales.
          </p>
        </div>
        <div className="flex flex-col items-end">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black">
            VERSIÓN 5.5.0 (UX-HARDENING)
          </Badge>
          <span className="text-[10px] text-muted-foreground font-bold uppercase mt-1">Última actualización: 26 Ene 2026</span>
        </div>
      </div>

      <Tabs defaultValue="roles" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 h-auto p-1 bg-muted/50 rounded-2xl mb-8">
          <TabsTrigger value="onboarding" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm text-[10px] sm:text-xs">
            <Baby className="w-4 h-4 mr-2 hidden sm:block" />
            Niños
          </TabsTrigger>
          <TabsTrigger value="roles" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm text-[10px] sm:text-xs">
            <Users className="w-4 h-4 mr-2 hidden sm:block" />
            Jerarquía
          </TabsTrigger>
          <TabsTrigger value="admin" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm text-[10px] sm:text-xs">
            <Settings className="w-4 h-4 mr-2 hidden sm:block" />
            Gestión
          </TabsTrigger>
          <TabsTrigger value="costs" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm text-[10px] sm:text-xs">
            <FileText className="w-4 h-4 mr-2 hidden sm:block" />
            Costos
          </TabsTrigger>
          <TabsTrigger value="pos" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm text-[10px] sm:text-xs">
            <ShoppingCart className="w-4 h-4 mr-2 hidden sm:block" />
            Ventas
          </TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm text-[10px] sm:text-xs">
            <Package className="w-4 h-4 mr-2 hidden sm:block" />
            Almacén
          </TabsTrigger>
          <TabsTrigger value="security" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm text-[10px] sm:text-xs">
            <Shield className="w-4 h-4 mr-2 hidden sm:block" />
            Seguridad
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm text-[10px] sm:text-xs">
            <History className="w-4 h-4 mr-2 hidden sm:block" />
            Historial
          </TabsTrigger>
        </TabsList>

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
                    <p className="text-[10px] font-medium text-muted-foreground leading-tight">Control total, creación de tiendas, reportes financieros globales y auditoría de sistema.</p>
                  </div>
                  <div>
                    <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20 mb-2">ENCARGADO / MANAGER</Badge>
                    <p className="text-[10px] font-medium text-muted-foreground leading-tight">Administra usuarios y tiendas asignadas, supervisa cierres de caja y gestiona el inventario local.</p>
                  </div>
                  <div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 mb-2">CLERK / WAREHOUSE</Badge>
                    <p className="text-[10px] font-medium text-muted-foreground leading-tight">Operaciones diarias de punto de venta y control de entrada/salida de mercancía.</p>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 space-y-4">
                <div>
                  <h4 className="font-black text-xs uppercase tracking-widest text-emerald-700 mb-2">Tip Multi-Store</h4>
                  <p className="text-xs font-medium text-emerald-800/70">
                    Un usuario puede ser <span className="font-bold">Encargado</span> en la Tienda A y <span className="font-bold">Cajero</span> en la Tienda B. Sus permisos cambiarán dinámicamente según la tienda que seleccione al entrar.
                  </p>
                </div>
                <div className="pt-4 border-t border-emerald-500/10">
                  <h4 className="font-black text-xs uppercase tracking-widest text-indigo-700 mb-2 flex items-center gap-2">
                    <Store className="w-3 h-3" />
                    Auto-selección de Tienda
                  </h4>
                  <p className="text-[10px] font-medium text-indigo-800/70 leading-relaxed">
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
                  <p className="text-[10px] text-muted-foreground leading-tight">Control total sobre celdas, fórmulas y referencias cruzadas en tiempo real.</p>
                </div>
                <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
                  <Wand2 className="w-6 h-6 text-emerald-600" />
                  <h5 className="font-black text-xs uppercase">Modo Asistido</h5>
                  <p className="text-[10px] text-muted-foreground leading-tight">Wizard paso a paso que guía la entrada de datos para evitar errores humanos.</p>
                </div>
                <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-2">
                  <BookOpen className="w-6 h-6 text-amber-600" />
                  <h5 className="font-black text-xs uppercase">Modo Lectura</h5>
                  <p className="text-[10px] text-muted-foreground leading-tight">Narrativa generada automáticamente que explica el origen de cada costo.</p>
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
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-[10px]">14</div>
                    <span className="text-[10px] font-bold uppercase">Secciones de Gasto</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-[10px]">05</div>
                    <span className="text-[10px] font-bold uppercase">Anexos Técnicos</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-[10px]">14%</div>
                    <span className="text-[10px] font-bold uppercase">Seguridad Social</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black text-primary text-[10px]">05%</div>
                    <span className="text-[10px] font-bold uppercase">Impuesto Fuerza Trabajo</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-primary text-white space-y-4">
                <h4 className="font-black text-xs uppercase tracking-widest opacity-80 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  Exportación
                </h4>
                <p className="text-[10px] font-medium leading-relaxed">
                  Genera reportes profesionales en <span className="font-black">PDF</span> con branding corporativo o exporta a <span className="font-black">CSV/Excel</span> para auditorías contables externas.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* --- POS FLOWS --- */}
        <TabsContent value="pos" className="space-y-6">
          <div className="bg-primary/10 border border-primary/20 p-4 rounded-2xl mb-6 md:hidden">
            <h4 className="font-black text-primary text-xs uppercase mb-2 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Tip: TPV Optimizado para Móvil
            </h4>
            <p className="text-[10px] font-medium leading-relaxed text-primary/80">
              Hemos movido la <strong>Caja</strong> a la parte inferior y añadido <strong>Categorías en un toque</strong> debajo del buscador para agilizar el despacho. El carrito ahora se abre como un panel deslizante para no interrumpir tu flujo.
            </p>
          </div>
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Ciclo de Venta y Caja</CardTitle>
            </CardHeader>
            <CardContent className="px-0 space-y-12">
              <div className="space-y-10">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-primary uppercase tracking-tighter">
                      <ShoppingCart className="w-5 h-5" />
                      Arquitectura Mobile-First
                    </h3>
                    <p className="text-sm font-medium leading-relaxed">
                      En la v5.4.0, el TPV ha sido rediseñado para una operativa fluida en dispositivos táctiles. El carrito de compras ahora reside en un <span className="font-bold text-primary">Drawer (Panel Inferior)</span> accesible desde la zona de alcance del pulgar.
                    </p>
                    <div className="bg-primary/5 p-4 rounded-xl border-l-4 border-primary">
                       <p className="text-[10px] font-black uppercase text-primary mb-1">Optimización UX:</p>
                       <p className="text-xs italic">"Menos clics, más velocidad. El selector de productos y el cierre de venta están optimizados para uso a una sola mano."</p>
                    </div>
                  </div>
                  <MobilePosDiagram />
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
                      "Escanea el producto o búscalo por nombre.",
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
                      "Registra cualquier salida de efectivo autorizada.",
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

              <div className="space-y-6 pt-8 border-t border-primary/10">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary uppercase tracking-tighter">
                  <Store className="w-5 h-5" />
                  Tienda Activa y SKU (Identificación Unívoca)
                </h3>
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                   <div className="space-y-4 text-sm leading-relaxed">
                      <p className="font-medium">
                        En el modelo Enterprise de CostPro, <span className="font-bold">cada tienda es un mundo separado</span>. El sistema garantiza el aislamiento total de inventarios mediante la combinación obligatoria de Tienda + SKU.
                      </p>
                      <div className="bg-primary/5 p-4 rounded-xl border-l-4 border-primary space-y-2">
                        <p className="font-bold text-xs uppercase text-primary">Regla Fundamental:</p>
                        <p className="italic text-xs">"Un producto se identifica por su SKU dentro de su tienda activa. El mismo SKU puede existir en otra tienda sin causar conflictos."</p>
                      </div>
                      <div className="bg-amber-500/5 p-4 rounded-xl border-l-4 border-amber-500 space-y-2">
                        <p className="font-bold text-xs uppercase text-amber-600">Contexto Obligatorio (v5.5):</p>
                        <p className="italic text-xs text-amber-900/70">"No se pueden realizar recepciones sin una tienda activa. El sistema bloqueará la operación para garantizar la integridad de los datos."</p>
                      </div>
                      <div className="space-y-2">
                        <h5 className="font-black text-[10px] uppercase tracking-widest text-muted-foreground">Ejemplo Operativo:</h5>
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
                  <h4 className="font-black text-primary uppercase tracking-widest text-xs">Gestión de Existencias v5.5</h4>
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
                    <Shield className="w-4 h-4" />
                    Auditoría Visual Enterprise
                  </h4>
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground mb-4">
                    Transformamos logs técnicos en una <span className="font-bold text-primary">Línea de Tiempo Visual</span> comprensible para humanos:
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {["Acciones Categorizadas", "Diferenciales de Datos", "Fechas Relativas", "Búsqueda Avanzada"].map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter text-muted-foreground">
                          <CheckCircle2 className="w-3 h-3 text-primary" />
                          {t}
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-muted/30 rounded-2xl border border-dashed border-border">
                       <p className="text-[10px] font-medium leading-tight italic">
                         "Juan actualizó el producto X" en lugar de "UPDATE public.products SET name = ...".
                       </p>
                    </div>
                  </div>
                </div>
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
                {/* --- v5.5.0 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary">v5.5.0</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">26 de Enero, 2026 (Actual)</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4 border border-primary/10">
                    <h4 className="font-black text-sm uppercase text-primary">UX Hardening & Enterprise Audit</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Nueva sección "CostPro para Niños" con narrativa visual de flujos.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Rediseño completo de Auditoría: Línea de tiempo visual e intuitiva.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Blindaje de Recepción: Bloqueo de operaciones sin tienda activa.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Expansión de rol Manager: Acceso total a gestión de Usuarios y Tiendas.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Hardening de Esquema: Auditoría soporta IDs tipo UUID y Text.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Optimización de Performance: Paginación inteligente en historial de eventos.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.4.0 --- */}
                <div className="relative pl-8 border-l-2 border-primary/20 space-y-4 opacity-60">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.4.0</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">25 de Enero, 2026</span>
                  </div>
                  <div className="bg-muted/30 rounded-2xl p-6 space-y-4">
                    <h4 className="font-black text-sm uppercase text-primary">UX Hardening & POS Efficiency</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Implementación de CategoryChips en TPV para filtrado en 1 toque.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Eliminación de fricción táctil en la búsqueda avanzada del POS.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Optimización de espacio vertical en el buscador móvil.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Actualización de documentación de operativa móvil.</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.4.0 --- */}
                <div className="relative pl-8 border-l-2 border-primary/10 space-y-4 opacity-60">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.4.0</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">25 de Enero, 2026</span>
                  </div>
                  <div className="bg-muted/10 rounded-2xl p-6 space-y-4">
                    <h4 className="font-black text-sm uppercase text-primary">Mobile-First Optimization & UI Sync</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Rediseño de TPV con carrito tipo Drawer para operativa móvil.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Unificación de vistas de Inventario con ProductCard atómica.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Implementación de ActionMenu con posición inferior (Thumb Zone).</li>
                    </ul>
                  </div>
                </div>

                {/* --- v5.3.0 --- */}
                <div className="relative pl-8 border-l-2 border-primary/10 space-y-4 opacity-60">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.3.0</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">24 de Enero, 2026</span>
                  </div>
                  <div className="bg-muted/10 rounded-2xl p-6 space-y-4">
                    <h4 className="font-black text-sm uppercase text-primary">Multi-Store SKU Hardening</h4>
                    <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Implementación de SKU único por tienda (Composite Key).</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Nueva lógica de matching de inventario por Tienda Activa.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Validación obligatoria de SKU en Catálogo y Recepción.</li>
                      <li className="flex gap-2 items-center"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Nuevo diagrama SVG: Aislamiento de SKU en entorno Multi-Tienda.</li>
                    </ul>
                  </div>
                </div>

                <div className="relative pl-8 border-l-2 border-primary/10 space-y-4 opacity-40">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.3.0</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">24 de Enero, 2026</span>
                  </div>
                  <div className="bg-muted/10 rounded-2xl p-6">
                    <h4 className="font-black text-sm uppercase">Multi-Store SKU Hardening</h4>
                    <p className="text-xs mt-2">Implementación de SKU único por tienda y aislamiento de inventario.</p>
                  </div>
                </div>

                <div className="relative pl-8 border-l-2 border-primary/10 space-y-4 opacity-60">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-muted border-4 border-background" />
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">v5.2.0</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase">Noviembre, 2024</span>
                  </div>
                  <div className="bg-muted/10 rounded-2xl p-6">
                    <h4 className="font-black text-sm uppercase">Lanzamiento Multi-Store Enterprise</h4>
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
        <button className="px-8 py-3 bg-background border border-border rounded-xl font-black text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all">
          Abrir Ticket de Soporte
        </button>
      </div>
    </div>
  );
}
