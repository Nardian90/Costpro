'use client';

/**
 * GroupHubView — Vista overview de un grupo raíz del sidebar (patrón Odoo).
 *
 * ════════════════════════════════════════════════════════════════════════
 * E-GroupHub (IA Audit): breadcrumbs navegan a group hubs a nivel raíz.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Extiende SectionHubView para grupos raíz. Cuando el usuario hace clic en
 * "MULTI-TIENDA" en el breadcrumb, navega aquí y ve tarjetas de TODOS los
 * submenus e items directos del grupo:
 *
 *   MULTI-TIENDA
 *   ├── Tiendas (item directo)
 *   ├── Analítica (submenu) → click abre SectionHubView('analitica')
 *   ├── Punto de Venta (submenu) → click abre SectionHubView('punto_venta')
 *   ├── Almacén (submenu) → click abre SectionHubView('almacen_gestion')
 *   └── Logística (submenu) → click abre SectionHubView('almacen_operaciones')
 *
 * Comportamiento de las tarjetas:
 *  - Si el child es un 'item' (ej: Tiendas) → navega directamente a esa vista.
 *  - Si el child es un 'submenu' (ej: Punto de Venta) → navega al SectionHubView
 *    de ese submenu (donde verá las tarjetas de sus hijos).
 *
 * Esto crea un wayfinding jerárquico de 3 niveles:
 *   Grupo (GroupHubView) → Submenu (SectionHubView) → Vista específica
 *
 * Casos soportados: 'tienda', 'costos', 'ipv_module', 'otros',
 * 'administracion', 'recursos'. 'core' NO usa GroupHub porque es la home.
 *
 * Diferencia con SectionHubView:
 *  - SectionHubView: muestra hijos de un SUBMENU (2do nivel).
 *  - GroupHubView: muestra hijos de un GRUPO (1er nivel), que pueden ser
 *    items directos O submenus (con navegación recursiva).
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, ChevronDown } from 'lucide-react';
import { useUIStore, ViewType } from '@/store';
import { SIDEBAR_STRUCTURE, NavModule } from '@/config/navigation/sidebar.structure';
import { useAuthStore } from '@/store';

interface GroupHubViewProps {
  /** ID del grupo raíz a renderizar. Debe existir en SIDEBAR_STRUCTURE. */
  groupId: ViewType;
}

export default function GroupHubView({ groupId }: GroupHubViewProps) {
  const { setCurrentView } = useUIStore();
  const { user } = useAuthStore();

  // Buscar el grupo en SIDEBAR_STRUCTURE
  const group = useMemo<NavModule | null>(() => {
    return SIDEBAR_STRUCTURE.find(m => m.id === groupId) || null;
  }, [groupId]);

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <h3 className="text-xl font-black uppercase tracking-tight">Grupo no encontrado</h3>
        <p className="text-muted-foreground text-sm max-w-md">
          No se encontró el grupo <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{groupId}</code>.
        </p>
        <button
          onClick={() => setCurrentView('dashboard')}
          className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity text-xs uppercase tracking-widest"
        >
          Ir al Dashboard
        </button>
      </div>
    );
  }

  // Filtrar hijos por rol del usuario (RBAC)
  const visibleChildren = (group.children || []).filter(child => {
    if (!child.allowedRoles || child.allowedRoles.length === 0) return true;
    const userRole = user?.role;
    if (!userRole) return false;
    return child.allowedRoles.includes(userRole);
  });

  // Separar items directos de submenus para layout diferenciado
  const directItems = visibleChildren.filter(c => c.type === 'item');
  const submenus = visibleChildren.filter(c => c.type === 'submenu');

  const Icon = group.icon;
  const description = group.description || group.ariaLabel || '';

  const handleCardClick = (child: NavModule) => {
    // Tanto items directos como submenus navegan a su ID.
    // - Para items: el ID es una vista terminal (ej: 'stores', 'dashboard').
    // - Para submenus: el ID es un submenu wrapper que renderiza SectionHubView.
    setCurrentView(child.id as ViewType);
  };

  return (
    <div className="space-y-6">
      {/* Header con título + descripción */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="p-3 rounded-xl bg-primary/10">
              <Icon className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
          )}
          <div>
            <h2 className="text-[clamp(1.5rem,5vw,2.25rem)] font-black text-foreground tracking-tighter uppercase">
              {group.label}
            </h2>
            {description && (
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-primary/20 bg-primary/5 shrink-0">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Módulo</p>
            <p className="text-xs font-black text-primary tabular-nums">
              {visibleChildren.length} {visibleChildren.length === 1 ? 'opción' : 'opciones'}
            </p>
          </div>
        </div>
      </div>

      {/* Sección: Items directos (acceso inmediato) */}
      {directItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 px-1">
            Accesos directos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {directItems.map((child, idx) => {
              const ChildIcon = child.icon;
              const childDesc = child.description || child.ariaLabel || '';
              return (
                <motion.button
                  key={child.id}
                  type="button"
                  onClick={() => handleCardClick(child)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className="group relative p-6 rounded-2xl border-2 border-border/60 bg-card hover:border-primary/30 hover:shadow-xl transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/30 text-left"
                >
                  {(child.isNew || child.isBeta) && (
                    <div className="absolute top-3 right-3 flex gap-1">
                      {child.isNew && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-success/15 text-success px-2 py-0.5 rounded-full border border-success/30">
                          Nuevo
                        </span>
                      )}
                      {child.isBeta && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-warning/15 text-warning px-2 py-0.5 rounded-full border border-warning/30">
                          Beta
                        </span>
                      )}
                    </div>
                  )}
                  <div className="p-3 rounded-xl inline-flex mb-4 bg-primary/5 group-hover:bg-primary/10 transition-colors">
                    {ChildIcon && <ChildIcon className="w-8 h-8 text-primary" aria-hidden="true" />}
                  </div>
                  <h4 className="text-base font-black uppercase tracking-tight text-foreground mb-2">
                    {child.label}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4 line-clamp-3">
                    {childDesc}
                  </p>
                  <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary">
                    Abrir
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sección: Submenus (categorías con sub-opciones) */}
      {submenus.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 px-1">
            Categorías
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {submenus.map((child, idx) => {
              const ChildIcon = child.icon;
              const childDesc = child.description || child.ariaLabel || '';
              const childCount = (child.children || []).length;
              return (
                <motion.button
                  key={child.id}
                  type="button"
                  onClick={() => handleCardClick(child)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (directItems.length + idx) * 0.06}}
                  className="group relative p-6 rounded-2xl border-2 border-border/60 bg-gradient-to-br from-primary/5 to-card hover:border-primary/30 hover:shadow-xl transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/30 text-left"
                >
                  {(child.isNew || child.isBeta) && (
                    <div className="absolute top-3 right-3 flex gap-1">
                      {child.isNew && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-success/15 text-success px-2 py-0.5 rounded-full border border-success/30">
                          Nuevo
                        </span>
                      )}
                      {child.isBeta && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-warning/15 text-warning px-2 py-0.5 rounded-full border border-warning/30">
                          Beta
                        </span>
                      )}
                    </div>
                  )}
                  <div className="p-3 rounded-xl inline-flex mb-4 bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    {ChildIcon && <ChildIcon className="w-8 h-8 text-primary" aria-hidden="true" />}
                  </div>
                  <h4 className="text-base font-black uppercase tracking-tight text-foreground mb-2">
                    {child.label}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4 line-clamp-2">
                    {childDesc}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                      {childCount} {childCount === 1 ? 'opción' : 'opciones'}
                    </span>
                    <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary">
                      Explorar
                      <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5 rotate-[-90deg]" aria-hidden="true" />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {visibleChildren.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 border-2 border-dashed border-border rounded-2xl">
          <p className="text-sm text-muted-foreground">
            No tienes permisos para acceder a ninguna opción de este módulo.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Contacta a un administrador si crees que es un error.
          </p>
        </div>
      )}

      {/* Footer con ayuda contextual */}
      <div className="text-center text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold pt-4">
        Módulo {group.label} · {visibleChildren.length} {visibleChildren.length === 1 ? 'categoría disponible' : 'categorías disponibles'}
      </div>
    </div>
  );
}
