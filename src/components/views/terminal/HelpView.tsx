'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Users, ShoppingCart, Package, Shield,
  CheckCircle2, ArrowRight, Info, AlertTriangle,
  Settings, Building2, Receipt, FileText
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black uppercase tracking-tighter text-primary flex items-center gap-3">
          <BookOpen className="w-8 h-8" />
          Centro de Ayuda Pro
        </h2>
        <p className="text-muted-foreground font-medium max-w-2xl">
          Bienvenido a la guía interactiva de CostPro. Aprende los flujos críticos,
          permisos por rol y cómo maximizar la eficiencia en tu tienda.
        </p>
      </div>

      <Tabs defaultValue="roles" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 h-auto p-1 bg-muted/50 rounded-2xl mb-8">
          <TabsTrigger value="roles" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Users className="w-4 h-4 mr-2" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="admin" className="rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Settings className="w-4 h-4 mr-2" />
            Admin
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

        {/* --- ROLES & PERMISSIONS --- */}
        <TabsContent value="roles" className="space-y-6">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Estructura de Roles y Permisos</CardTitle>
              <CardDescription className="text-base font-medium">
                CostPro utiliza un modelo de Control de Acceso Basado en Roles (RBAC) optimizado para multi-tiendas.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-8">
              <RolesDiagram />

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-black text-primary uppercase tracking-widest text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Checklist de Capacidades
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex gap-3 text-sm">
                      <Badge variant="outline" className="h-5 bg-primary/10 text-primary border-primary/20">ADMIN</Badge>
                      <span>Control total del sistema, gestión de todas las tiendas y usuarios globales.</span>
                    </li>
                    <li className="flex gap-3 text-sm">
                      <Badge variant="outline" className="h-5 bg-violet-500/10 text-violet-600 border-violet-500/20">ENCARGADO</Badge>
                      <span>Gestión operativa de las tiendas asignadas, reportes y supervisión de personal.</span>
                    </li>
                    <li className="flex gap-3 text-sm">
                      <Badge variant="outline" className="h-5 bg-amber-500/10 text-amber-600 border-amber-500/20">ALMACENERO</Badge>
                      <span>Recepción de mercancía, ajustes de stock e inventarios físicos.</span>
                    </li>
                    <li className="flex gap-3 text-sm">
                      <Badge variant="outline" className="h-5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">CAJERO</Badge>
                      <span>Ventas directas, apertura/cierre de caja y atención al cliente.</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-primary/5 rounded-3xl p-6 border border-primary/10">
                  <h4 className="font-black text-primary uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Contexto Multi-Store
                  </h4>
                  <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                    Un usuario puede tener **roles distintos en diferentes sucursales**.
                    Por ejemplo, alguien puede ser "Encargado" en la sucursal Norte pero "Cajero" en la sucursal Sur.
                    El sistema cambiará sus permisos automáticamente al cambiar de tienda en la terminal.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- ADMIN FLOWS --- */}
        <TabsContent value="admin" className="space-y-6">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Gestión de Usuarios y Tiendas</CardTitle>
              <CardDescription className="text-base font-medium">
                Flujo maestro para la configuración inicial y expansión de la empresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-8">
              <UserFlowDiagram />

              <div className="grid md:grid-cols-3 gap-6">
                {[
                  { title: "Crear Usuario", desc: "Introduce el correo y nombre completo. Se generará un perfil inactivo hasta asignar roles.", icon: Users },
                  { title: "Definir Membresía", desc: "Selecciona la tienda y el rol específico para ese usuario en esa ubicación.", icon: Building2 },
                  { title: "Control de Acceso", desc: "Activa o revoca el acceso en tiempo real sin eliminar al usuario del sistema.", icon: Shield },
                ].map((item, i) => (
                  <div key={i} className="p-5 rounded-2xl bg-muted/30 border border-border/50">
                    <item.icon className="w-5 h-5 text-primary mb-3" />
                    <h5 className="font-black text-[10px] uppercase tracking-widest mb-2">{item.title}</h5>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
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
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-black">01</span>
                  Flujo de Terminal de Venta (TPV)
                </h3>
                <SalesFlowDiagram />
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-black">02</span>
                  Control de Efectivo y Cierre
                </h3>
                <CashFlowDiagram />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 rounded-3xl border border-emerald-500/20 bg-emerald-500/5">
                  <h4 className="font-black text-emerald-600 uppercase tracking-widest text-xs mb-3">Puntos Críticos de Venta</h4>
                  <ul className="space-y-2">
                    {["Búsqueda rápida por SKU o Nombre", "Aplicación de descuentos autorizados", "Selección correcta del método de pago", "Verificación del ticket emitido"].map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-medium">
                        <ArrowRight className="w-3 h-3 text-emerald-500" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-6 rounded-3xl border border-amber-500/20 bg-amber-500/5">
                  <h4 className="font-black text-amber-600 uppercase tracking-widest text-xs mb-3">Protocolo de Cierre</h4>
                  <ul className="space-y-2">
                    {["Conteo físico de efectivo inicial", "Arqueo de comprobantes de tarjetas", "Declaración de diferencia (sobrante/faltante)", "Cierre definitivo e impresión de reporte"].map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-medium">
                        <ArrowRight className="w-3 h-3 text-amber-500" />
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
                    <div className="flex gap-4">
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center font-black text-primary italic">IN</div>
                      <div>
                        <h5 className="font-bold text-sm">Recepciones</h5>
                        <p className="text-xs text-muted-foreground">Ingreso de mercancía por compras o traslados. Afecta el costo promedio del producto.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center font-black text-primary italic">ADJ</div>
                      <div>
                        <h5 className="font-bold text-sm">Ajustes</h5>
                        <p className="text-xs text-muted-foreground">Correcciones por merma, daño o errores de conteo. Requiere justificación obligatoria.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6">
                  <div className="flex items-start gap-4">
                    <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                    <div>
                      <h5 className="font-black text-xs uppercase text-amber-600 tracking-widest mb-2">Alerta de Stock Bajo</h5>
                      <p className="text-xs text-amber-900/70 font-medium">
                        El sistema notificará automáticamente cuando el inventario caiga por debajo del umbral definido.
                        Asegúrate de configurar el "Stock Mínimo" en la ficha de cada producto para evitar quiebres de stock.
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
                Cómo protegemos tus datos y garantizamos la transparencia operativa.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 space-y-8">
              <SecurityFlowDiagram />

              <div className="grid md:grid-cols-2 gap-6 mt-8">
                <div className="p-6 rounded-3xl bg-primary shadow-xl text-white">
                  <h4 className="font-black uppercase tracking-widest text-xs mb-4 opacity-80">Aislamiento de Datos</h4>
                  <p className="text-sm font-medium leading-relaxed">
                    CostPro utiliza filtros a nivel de base de datos (RLS) para asegurar que un Cajero
                    **nunca vea información de otra tienda** para la que no tiene permisos.
                    Tus costos y ventas están protegidos por compartimentos estancos.
                  </p>
                </div>
                <div className="p-6 rounded-3xl bg-white border border-border shadow-sm">
                  <h4 className="font-black uppercase tracking-widest text-xs text-primary mb-4">Auditoría Permanente</h4>
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                    Cada acción crítica (ventas, ajustes de stock, cambios de precio) queda registrada con:
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {["Usuario", "Fecha/Hora", "Valor Anterior", "Nuevo Valor"].map((t, i) => (
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
    </div>
  );
}
