'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * BiDashboardView — Centro de Inteligencia Empresarial (misión 2026-11-23)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Vista única que monta la ubicación oficial y centralizada de los dashboards
 * de COSTPRO: Inicio → Análisis → Dashboard (ViewType 'store-dashboard').
 *
 * Qué hace:
 *   - Presenta la tienda activa (fuente de verdad: profiles.active_store_id,
 *     resuelta por DashboardView antes de montar este componente).
 *   - Navega ENTRE MÓDULOS de análisis sin abandonar la sección (misión §4):
 *     tabs derivados del registro BI_MODULES — cada módulo autocontenido,
 *     sin mezclar indicadores de naturaleza distinta entre módulos.
 *   - Arquitectura abierta: un dashboard futuro se incorpora añadiendo UNA
 *     entrada al registro, sin tocar navegación, shell ni módulos existentes.
 *
 * Qué NO hace:
 *   - No cambia la tienda activa (el shell global ya tiene el selector).
 *   - No duplica KPIs entre módulos: cada módulo mantiene su fuente y su
 *     definición (contraste: «ventas del período» del RPC store-analytics vs
 *     «ventas netas documentales» del RPC sales-dashboard se etiquetan con
 *     precisión en cada módulo).
 */

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { BI_MODULES, getBiModule } from './bi-module-registry';

interface BiDashboardViewProps {
  storeId: string;
  storeName: string;
}

export default function BiDashboardView({ storeId, storeName }: BiDashboardViewProps) {
  const [activeModuleId, setActiveModuleId] = useState(BI_MODULES[0]?.id ?? 'executive');
  const activeModule = getBiModule(activeModuleId) ?? BI_MODULES[0];
  const ActiveComponent = activeModule?.component;

  return (
    <div className="space-y-5 max-w-6xl mx-auto w-full">
      {/* GATE 16: el shell (Header) ya pinta la h1 de la vista ("Dashboard") —
          el título del centro es h2 con el contexto de tienda activa. */}
      <PageHeader
        headingLevel="h2"
        title={`Dashboard · ${storeName}`}
        description="Centro de Inteligencia Empresarial — comprende la situación del negocio, detecta desviaciones y decide con datos reales."
        icon={activeModule?.icon}
      />

      {/* Navegación interna por módulos (misión §4): sin salir de la sección. */}
      <div
        role="tablist"
        aria-label="Módulos del Dashboard"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        data-testid="bi-module-nav"
      >
        {BI_MODULES.map((m) => {
          const Icon = m.icon;
          const isActive = m.id === activeModule?.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveModuleId(m.id)}
              data-testid={`bi-module-${m.id}`}
              className={cn(
                'group text-left p-3 sm:p-4 rounded-xl border min-h-[44px] transition-all',
                isActive
                  ? 'border-primary/40 bg-primary/5 shadow-sm'
                  : 'border-border/50 bg-card hover:bg-muted/40 hover:border-border',
              )}
            >
              <span className="flex items-center gap-2">
                <Icon
                  className={cn(
                    'w-4 h-4 shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                <span
                  className={cn(
                    'text-sm font-bold tracking-tight',
                    isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  {m.label}
                </span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground leading-snug line-clamp-2">
                {m.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Contenido del módulo activo (lazy, chunk por módulo). */}
      <div data-testid="bi-module-content" aria-label={activeModule?.label}>
        {ActiveComponent ? (
          <ActiveComponent storeId={storeId} storeName={storeName} />
        ) : (
          <div className="p-8 rounded-2xl border border-border/50 bg-card text-center text-sm text-muted-foreground">
            Módulo no disponible.
          </div>
        )}
      </div>

      {/* Nota de alcance: qué cubre la tienda activa (contexto honesto). */}
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground px-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
        Datos de la tienda activa ({storeName}) según tu acceso. Los períodos muestran siempre su
        intervalo de fechas y las comparaciones usan un período anterior equivalente.
      </p>
    </div>
  );
}
