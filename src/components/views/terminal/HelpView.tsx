'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Users, ShoppingCart, Package, Shield,
  CheckCircle2, ArrowRight, Info, AlertTriangle,
  Settings, Building2, Receipt, FileText, ChevronRight,
  UserPlus, Store, Key, ListChecks, HelpCircle
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
import SalesFlowDiagram from '@/components/help/SalesFlowDiagram';
import SecurityFlowDiagram from '@/components/help/SecurityFlowDiagram';

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
            VERSIÓN 5.2.0 (ENTERPRISE)
          </Badge>
          <span className="text-[10px] text-muted-foreground font-bold uppercase mt-1">Última actualización: Nov 2024</span>
        </div>
      </div>

      <Tabs defaultValue="roles" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 h-auto p-1 bg-muted/50 rounded-2xl mb-8">
          <TabsTrigger value="roles" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Users className="w-4 h-4 mr-2" />
            Jerarquía
          </TabsTrigger>
          <TabsTrigger value="admin" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Settings className="w-4 h-4 mr-2" />
            Gestión
          </TabsTrigger>
          <TabsTrigger value="pos" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Ventas
          </TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Package className="w-4 h-4 mr-2" />
            Almacén
          </TabsTrigger>
          <TabsTrigger value="security" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Shield className="w-4 h-4 mr-2" />
            Seguridad
          </TabsTrigger>
        </TabsList>

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
                    <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20 mb-2">ENCARGADO</Badge>
                    <p className="text-[10px] font-medium text-muted-foreground leading-tight">Administra usuarios de su tienda, supervisa cierres de caja y ajusta inventario local.</p>
                  </div>
                  <div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 mb-2">ALMACENERO / CAJERO</Badge>
                    <p className="text-[10px] font-medium text-muted-foreground leading-tight">Operaciones diarias de punto de venta y entrada/salida de mercancía.</p>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10">
                <h4 className="font-black text-xs uppercase tracking-widest text-emerald-700 mb-2">Tip Multi-Store</h4>
                <p className="text-xs font-medium text-emerald-800/70">
                  Un usuario puede ser <span className="font-bold">Encargado</span> en la Tienda A y <span className="font-bold">Cajero</span> en la Tienda B. Sus permisos cambiarán dinámicamente según la tienda que seleccione al entrar.
                </p>
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
                        <h4 className="font-black text-sm uppercase">Paso 2: Asignación de Tienda</h4>
                        <p className="text-xs text-muted-foreground">Vincular al usuario con una sucursal física.</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 pl-14 text-sm text-muted-foreground space-y-2">
                    <p>Dentro de la ficha del usuario, selecciona la tienda en la que operará.</p>
                    <p>Puedes asignar <span className="font-bold">múltiples tiendas</span> si el usuario es supervisor o rota entre sucursales.</p>
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

        {/* --- POS FLOWS --- */}
        <TabsContent value="pos" className="space-y-6">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Ciclo de Venta y Caja</CardTitle>
            </CardHeader>
            <CardContent className="px-0 space-y-12">
              <div className="space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                  <ShoppingCart className="w-5 h-5" />
                  Operativa de Punto de Venta (TPV)
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
            <CardContent className="px-0 space-y-8">
              <InventoryFlowDiagram />

              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="font-black text-primary uppercase tracking-widest text-xs">Gestión de Existencias</h4>
                  <div className="space-y-4">
                    <div className="flex gap-4 p-4 rounded-2xl bg-muted/30">
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-black text-primary italic">IN</div>
                      <div>
                        <h5 className="font-bold text-sm">Recepciones</h5>
                        <p className="text-xs text-muted-foreground">Ingreso de mercancía por compras. Incrementa el stock disponible inmediatamente.</p>
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
                    <Key className="w-4 h-4" />
                    Auditoría Inmutable
                  </h4>
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground mb-4">
                    Cada vez que un precio cambia o una venta se anula, CostPro registra:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {["Identidad del Usuario", "IP de Conexión", "Timestamp exacto", "Valores históricos"].map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 text-primary" />
                        {t}
                      </div>
                    ))}
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
