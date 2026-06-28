'use client';

/**
 * SectionHubView — Vista overview de un submenu (patrón Odoo/Shopify).
 *
 * ════════════════════════════════════════════════════════════════════════
 * E-SectionHub (IA Audit): breadcrumbs navegan a section hubs, no a primer hijo.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Antes: si el usuario hacía clic en "Punto de Venta" en el breadcrumb, caía
 * al default "Módulo No Disponible" (porque 'punto_venta' no era una vista
 * real, era un submenu wrapper). Luego se añadió SUBMENU_FALLBACK que
 * redirigía al primer hijo, pero esto era confuso: el usuario esperaba ver
 * "todo lo de Punto de Venta" y terminaba en una vista específica sin contexto.
 *
 * Ahora: cada submenu wrapper ID es una vista válida que renderiza este
 * SectionHubView. El componente muestra todas las vistas hijas del submenu
 * como tarjetas grandes (patrón Odoo/Shopify), con icono, título, descripción
 * y badge "Nuevo"/"Beta" si aplica. Click en tarjeta → navega a esa vista.
 *
 * Esto cumple el principio de "wayfinding progresivo": el usuario puede
 * explorar la jerarquía completa sin perder contexto. El breadcrumb muestra
 * "Inicio > MULTI-TIENDA > Punto de Venta" y esta vista confirma "estás en
 * Punto de Venta, aquí están tus opciones".
 *
 * Casos soportados:
 *  - 'punto_venta' → tarjetas: Terminal, Venta (hub), Ofertas
 *  - 'almacen_gestion' → tarjetas: Inventario, Ajustes, Etiquetas
 *  - 'almacen_operaciones' → tarjetas: Recepciones, OCs, Transferencias
 *  - 'analitica' → tarjetas: Dashboard KPI, Generador de Reportes
 *  - 'ipv_*' → redirige a 'ipv' (vista con tabs)
 *  - 'cost_*' → redirige a 'cost-sheets' (vista con tabs)
 *
 * Para IPV y Costos, los submenu wrappers son demasiados (5-6 cada uno) y
 * sus vistas ya tienen tabs internas, así que redirigimos en lugar de mostrar
 * tarjetas. Esto evita duplicar la navegación.
 */

import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Crown, Zap, LayoutGrid } from 'lucide-react';
import { useUIStore, ViewType } from '@/store';
import { SIDEBAR_STRUCTURE, NavModule } from '@/config/navigation/sidebar.structure';
import { useAuthStore } from '@/store';
import { BackToVentaButton } from '@/components/ui/BackToVentaButton';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

// Vistas que se consideran "premium" (análisis avanzado, inteligencia)
const PREMIUM_VIEWS: Set<ViewType> = new Set([
  'dashboard',
  'exchange-intelligence',
  'usage-monitoring',
  'workers',
  'ipv',
]);

// Submenus que redirigen a una vista con tabs (no muestran tarjetas)
const REDIRECT_SUBMENUS: Partial<Record<ViewType, ViewType>> = {
  // IPV submenus → todos redirigen a la vista 'ipv' con tabs internas
  'ipv_reporting': 'ipv',
  'ipv_operaciones': 'ipv',
  'ipv_datos': 'ipv',
  'ipv_procesamiento': 'ipv',
  'ipv_avanzado': 'ipv',
  // Costos submenus → todos redirigen a la vista 'cost-sheets' con tabs internas
  'cost_views': 'cost-sheets',
  'cost_gen': 'cost-sheets',
  'cost_templates': 'cost-sheets',
  'cost_tools': 'cost-sheets',
};

interface SectionHubViewProps {
  /** ID del submenu wrapper a renderizar. Debe existir en SIDEBAR_STRUCTURE. */
  submenuId: ViewType;
}

export default function SectionHubView({ submenuId }: SectionHubViewProps) {
  const t = useTranslations('dashboard.storeDashboard');
  const { setCurrentView } = useUIStore();
  const { user } = useAuthStore();

  // Buscar el submenu en SIDEBAR_STRUCTURE
  const submenu = useMemo<NavModule | null>(() => {
    for (const group of SIDEBAR_STRUCTURE) {
      for (const child of group.children || []) {
        if (child.id === submenuId) return child;
      }
    }
    return null;
  }, [submenuId]);

  // Para submenus que redirigen (IPV, Costos), ejecutar redirección inmediata
  const redirectTarget = REDIRECT_SUBMENUS[submenuId];
  useEffect(() => {
    if (redirectTarget) {
      const t = setTimeout(() => setCurrentView(redirectTarget), 0);
      return () => clearTimeout(t);
    }
  }, [redirectTarget, setCurrentView]);

  if (redirectTarget) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        <div className="animate-pulse">Redirigiendo a {redirectTarget}…</div>
      </div>
    );
  }

  if (!submenu) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <h3 className="text-xl font-black uppercase tracking-tight">{t('sectionHub.notFound')}</h3>
        <p className="text-muted-foreground text-sm max-w-md">
          No se encontró la sección <code className="px-1.5 py-0.5 bg-muted rounded text-sm font-mono">{submenuId}</code>.
        </p>
        <button
          onClick={() => setCurrentView('dashboard')}
          className="px-6 min-h-[44px] py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-widest"
        >
          {t('sectionHub.goDashboard')}
        </button>
      </div>
    );
  }

  // Filtrar hijos por rol del usuario (RBAC)
  const visibleChildren = (submenu.children || []).filter(child => {
    if (!child.allowedRoles || child.allowedRoles.length === 0) return true;
    const userRole = user?.role;
    if (!userRole) return false;
    return child.allowedRoles.includes(userRole);
  });

  const Icon = submenu.icon;
  const description = submenu.description || submenu.ariaLabel || '';

  return (
    <div className="space-y-6">
      {/* Header con título + descripción + back button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {/* QW-1 / M-2: botón volver para wayfinding contextual */}
          <BackToVentaButton compact className="mt-1" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              {Icon && (
                <div className="p-2 rounded-lg bg-primary/10">
                  <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
                </div>
              )}
              <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">
                {submenu.label}
              </h2>
            </div>
            {description && (
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-primary/20 bg-primary/5 shrink-0">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Sección</p>
            <p className="text-sm font-black text-primary tabular-nums">{visibleChildren.length} {visibleChildren.length === 1 ? 'opción' : 'opciones'}</p>
          </div>
        </div>
      </div>

      {/* Grid de tarjetas estilo Odoo kanban */}
      {visibleChildren.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleChildren.map((child, idx) => {
            const ChildIcon = child.icon;
            const childDesc = child.description || child.ariaLabel || '';
            const isPremium = PREMIUM_VIEWS.has(child.id as ViewType);
            return (
              <motion.div
                key={child.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                className={cn(
                  'group relative p-6 rounded-2xl border-2 bg-card transition-all hover:shadow-xl',
                  isPremium
                    ? 'border-primary/40 hover:border-primary/60 ring-1 ring-primary/10'
                    : 'border-border/60 hover:border-primary/30',
                )}
              >
                {/* Badges Nuevo/Beta/Premium en esquina superior derecha */}
                <div className="absolute top-3 right-3 flex gap-1">
                  {isPremium && (
                    <span className="text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-primary to-primary/70 text-primary-foreground px-2 py-0.5 rounded-full border border-primary/50 flex items-center gap-1 shadow-sm">
                      <Crown className="w-2.5 h-2.5" />
                      Premium
                    </span>
                  )}
                  {child.isNew && (
                    <span className="text-[10px] font-black uppercase tracking-widest bg-success/15 text-success px-2 py-0.5 rounded-full border border-success/30">
                      Nuevo
                    </span>
                  )}
                  {child.isBeta && (
                    <span className="text-[10px] font-black uppercase tracking-widest bg-warning/15 text-warning px-2 py-0.5 rounded-full border border-warning/30">
                      Beta
                    </span>
                  )}
                </div>

                <div className={cn(
                  'p-3 rounded-xl inline-flex mb-4 transition-colors',
                  isPremium ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-primary/5 group-hover:bg-primary/10',
                )}>
                  {ChildIcon && <ChildIcon className={cn('w-8 h-8', isPremium ? 'text-primary' : 'text-primary')} aria-hidden="true" />}
                </div>

                <h3 className="text-base font-black uppercase tracking-tight text-foreground mb-2 flex items-center gap-2">
                  {child.label}
                  {isPremium && <Zap className="w-3.5 h-3.5 text-primary fill-primary/20" />}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
                  {childDesc}
                </p>

                {/* Botón principal explícito (no solo icono) */}
                <button
                  type="button"
                  onClick={() => setCurrentView(child.id as ViewType)}
                  className={cn(
                    'w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2',
                    isPremium
                      ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/25'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md',
                  )}
                  aria-label={`Acceder a ${child.label}`}
                >
                  {isPremium ? 'Acceder al Dashboard' : 'Acceder'}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </button>

                {/* Botón secundario "Dashboard" — acceso rápido al dashboard KPI
                    de la tienda activa (solo para vistas premium de analítica) */}
                {isPremium && child.id === 'dashboard' && (
                  <button
                    type="button"
                    onClick={() => setCurrentView('dashboard' as ViewType)}
                    className="w-full min-h-[40px] py-2 px-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 border-2 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50"
                    aria-label="Ir al Dashboard KPI de la tienda activa"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Dashboard
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 border-2 border-dashed border-border rounded-2xl">
          <p className="text-sm text-muted-foreground">
            No tienes permisos para acceder a ninguna opción de esta sección.
          </p>
          <p className="text-sm text-muted-foreground/70">
            Contacta a un administrador si crees que es un error.
          </p>
        </div>
      )}

      {/* Footer con ayuda contextual */}
      <div className="text-center text-sm text-muted-foreground/60 uppercase tracking-widest font-bold pt-4">
        Sección {submenu.label} · {visibleChildren.length} {visibleChildren.length === 1 ? 'vista disponible' : 'vistas disponibles'}
      </div>
    </div>
  );
}
