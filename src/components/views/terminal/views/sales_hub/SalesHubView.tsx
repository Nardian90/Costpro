"use client";

/**
 * SalesHubView — Hub de Venta (patrón HUB).
 *
 * ════════════════════════════════════════════════════════════════════════
 * M-1 (IA Audit): Patrón unificado de navegación para vistas complejas.
 * ════════════════════════════════════════════════════════════════════════
 * CostPro usa DOS patrones válidos para vistas complejas, y prohíbe mezclarlos:
 *
 *  1. HUB (este archivo): tarjetas grandes con accesos directos a sub-vistas.
 *     - Aplicable cuando hay 4-8 accesos heterogéneos (acciones diferentes).
 *     - Ej: Venta (POS, Tabla IPV, Catálogo, Historial, Arqueo, Venta por Conteo).
 *     - El sidebar apunta al hub; el hub redirige a sub-vistas con setCurrentView.
 *
 *  2. TABS (ej: InventoryView): tabs internas que cambian contenido en sitio.
 *     - Aplicable cuando hay 2-4 secciones homogéneas (vista de la misma entidad).
 *     - Ej: Inventario (Stock | Catálogo | Trazabilidad).
 *     - El sidebar apunta a la vista; el usuario cambia tabs sin cambiar URL/view.
 *
 * PROHIBIDO: mezclar ambos patrones en la misma vista (ej: hub con tabs dentro
 * de cada tarjeta, o tabs que redirigen a hubs). Esto rompe el modelo mental del
 * usuario y confunde el wayfinding.
 *
 * Excepción documentada: SalesCatalogView no es un hub ni tabs — es una vista
 * atómica (Tabla IPV) alcanzada desde el hub de Venta. Es el "destino final".
 *
 * Esta vista usa el patrón HUB. Ver también: InventoryView (patrón TABS).
 * ════════════════════════════════════════════════════════════════════════
 *
 * E-3 (IA Audit): Notificaciones contextuales en el hub.
 * Sección "Alertas Operativas" que muestra:
 *  - Ventas pendientes (carrito con items sin confirmar)
 *  - Stock bajo (productos bajo mínimo)
 *  - OCs por recibir (purchase orders en estado 'sent' o 'partial')
 * Las notificaciones son clickeables y navegan a la vista relevante.
 */

import React from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart, Table2, Package, Receipt, DollarSign,
  ArrowRight, Wallet, TrendingUp, ClipboardList,
  AlertCircle, Package as PackageIcon, FileClock,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useUIStore } from "@/store";
import { useAuthStore } from "@/store";
import { useActiveShift } from "@/hooks/api/useActiveShift";
import { useSalesSinceLastClosure } from "@/hooks/api/useCashClosures";
import { useCartStore } from "@/store/cart";
import { usePurchaseOrders } from "@/hooks/api/usePurchaseOrders";
import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";

interface HubCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  view: string;
  color: string;
  bgColor: string;
  borderColor: string;
  primary?: boolean;
}

const PRIMARY_CARDS: HubCard[] = [
  {
    id: "pos",
    title: "Terminal de Venta",
    description: "Venta rápida con carrito, atajos de teclado, escáner de código de barras y pago mixto. Ideal para ventas mostrador.",
    icon: ShoppingCart,
    view: "pos",
    color: "text-primary",
    bgColor: "bg-primary/5",
    borderColor: "border-primary/20",
    primary: true,
  },
  {
    id: "sales_catalog",
    title: "Tabla IPV",
    description: "Tabla interactiva con todos los productos visibles. Asigna cantidades, precios y métodos de pago por producto. Exporta a Excel.",
    icon: Table2,
    view: "sales_catalog",
    color: "text-info",
    bgColor: "bg-info/5",
    borderColor: "border-info/20",
    primary: true,
  },
  {
    id: "catalog",
    title: "Catálogo de Ventas",
    description: "Catálogo imprimible con precios, fichas de costo y exportación a PDF. Para enviar a clientes o imprimir.",
    icon: Package,
    view: "catalog",
    color: "text-success",
    bgColor: "bg-success/5",
    borderColor: "border-success/20",
    primary: true,
  },
];

const SECONDARY_CARDS: HubCard[] = [
  {
    id: "sales",
    title: "Historial de Ventas",
    description: "Consulta, anula, duplica y exporta ventas. Filtra por fecha, estado y método de pago.",
    icon: Receipt,
    view: "sales",
    color: "text-muted-foreground",
    bgColor: "bg-muted/5",
    borderColor: "border-border",
  },
  {
    id: "cash",
    title: "Arqueo de Caja",
    description: "Abre y cierra turnos, declara fondos y reconcilia efectivo al final del día.",
    icon: DollarSign,
    view: "cash",
    color: "text-warning",
    bgColor: "bg-warning/5",
    borderColor: "border-warning/20",
  },
  {
    id: "inventory_count",
    title: "Venta por Conteo",
    description: "Cuenta existencias físicas al final del día y el sistema calcula ventas por diferencia. Ej: 10 stock − 5 actual = 5 vendidos.",
    icon: ClipboardList,
    view: "inventory_count",
    color: "text-info",
    bgColor: "bg-info/5",
    borderColor: "border-info/20",
  },
];

export default function SalesHubView() {
  const { setCurrentView } = useUIStore();
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const { data: activeShift } = useActiveShift(storeId);
  const { data: shiftTotals } = useSalesSinceLastClosure(storeId);
  const cartCount = useCartStore((s) => s.getItemCount());

  const todaySales = shiftTotals?.total_sales ?? 0;
  const hasShift = !!activeShift;

  // E-3 (IA Audit): Notificaciones contextuales.
  // 1. OCs por recibir (estado 'sent' o 'partial')
  const { data: purchaseOrders = [] } = usePurchaseOrders(storeId);
  const pendingPOs = purchaseOrders.filter(po =>
    po.status === 'sent' || po.status === 'partial'
  );

  // 2. Stock bajo — productos bajo mínimo (query directa, cache 60s)
  const { data: lowStockCount = 0 } = useQuery({
    queryKey: ['low-stock-count', storeId],
    queryFn: async () => {
      if (!storeId) return 0;
      const { count, error } = await supabase
        .from('products')
        .select(undefined, { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('is_active', true)
        .filter('stock', 'lte', 'min_stock')
        .gt('min_stock', 0);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!storeId,
    staleTime: 60_000,
  });

  // Construir lista de alertas activas
  const alerts: Array<{
    id: string;
    icon: React.ElementType;
    message: string;
    cta: string;
    view: string;
    severity: 'warning' | 'info' | 'danger';
  }> = [];

  if (cartCount > 0) {
    alerts.push({
      id: 'pending-cart',
      icon: ShoppingCart,
      message: `Tienes ${cartCount} producto${cartCount !== 1 ? 's' : ''} en carrito sin confirmar`,
      cta: 'Ir a Terminal',
      view: 'pos',
      severity: 'info',
    });
  }

  if (lowStockCount > 0) {
    alerts.push({
      id: 'low-stock',
      icon: PackageIcon,
      message: `${lowStockCount} producto${lowStockCount !== 1 ? 's' : ''} con stock bajo el mínimo`,
      cta: 'Ver Inventario',
      view: 'inventory',
      severity: 'warning',
    });
  }

  if (pendingPOs.length > 0) {
    alerts.push({
      id: 'pending-pos',
      icon: FileClock,
      message: `${pendingPOs.length} orden${pendingPOs.length !== 1 ? 'es' : ''} de compra por recibir`,
      cta: 'Ver Órdenes',
      view: 'purchase-orders',
      severity: 'info',
    });
  }

  if (!hasShift) {
    alerts.push({
      id: 'no-shift',
      icon: AlertCircle,
      message: 'No hay turno de caja abierto. Abre un turno para registrar ventas.',
      cta: 'Abrir Turno',
      view: 'cash',
      severity: 'danger',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">
            Venta
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Selecciona cómo quieres facturar
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl border-2",
            hasShift ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
          )}>
            <Wallet className={cn("w-4 h-4", hasShift ? "text-success" : "text-destructive")} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Turno</p>
              <p className={cn("text-xs font-black", hasShift ? "text-success" : "text-destructive")}>
                {hasShift ? "Activo" : "Cerrado"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-primary/20 bg-primary/5">
            <TrendingUp className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Ventas turno</p>
              <p className="text-xs font-black text-primary tabular-nums">{formatCurrency(todaySales)}</p>
            </div>
          </div>
          {cartCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-info/20 bg-info/5">
              <ShoppingCart className="w-4 h-4 text-info" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Carrito</p>
                <p className="text-xs font-black text-info tabular-nums">{cartCount} items</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* E-3 (IA Audit): Alertas operativas contextuales.
          Sección que aparece solo si hay alertas activas. Cada alerta es
          clickeable y navega a la vista relevante. Severidad cromática:
          danger (rojo) > warning (amarillo) > info (azul). */}
      {alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
          aria-label="Alertas operativas"
          role="region"
        >
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 px-1">
            Alertas operativas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {alerts.map((alert, idx) => {
              const Icon = alert.icon;
              const severityStyles = {
                warning: 'border-warning/30 bg-warning/5 text-warning',
                info: 'border-info/30 bg-info/5 text-info',
                danger: 'border-destructive/30 bg-destructive/5 text-destructive',
              };
              return (
                <motion.button
                  key={alert.id}
                  type="button"
                  onClick={() => setCurrentView(alert.view as any)}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    "group flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/30",
                    severityStyles[alert.severity]
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground leading-tight">
                      {alert.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest shrink-0">
                    {alert.cta}
                    <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PRIMARY_CARDS.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.id}
              type="button"
              onClick={() => setCurrentView(card.view as any)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className={cn(
                "group relative p-6 rounded-2xl border-2 text-left transition-all hover:shadow-xl active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/30",
                card.bgColor,
                card.borderColor,
              )}
            >
              <div className={cn("p-3 rounded-xl inline-flex mb-4", card.bgColor)}>
                <Icon className={cn("w-8 h-8", card.color)} />
              </div>
              <h3 className="text-base font-black uppercase tracking-tight text-foreground mb-2">
                {card.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                {card.description}
              </p>
              <div className={cn("inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest", card.color)}>
                Acceder
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {SECONDARY_CARDS.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.id}
              type="button"
              onClick={() => setCurrentView(card.view as any)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 + idx * 0.06 }}
              className={cn(
                "group flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/30",
                card.bgColor,
                card.borderColor,
              )}
            >
              <div className={cn("p-2.5 rounded-xl shrink-0", card.bgColor)}>
                <Icon className={cn("w-5 h-5", card.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black uppercase tracking-tight text-foreground">
                  {card.title}
                </h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
                  {card.description}
                </p>
              </div>
              <ArrowRight className={cn("w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1", card.color)} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
