'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * BI MODULE REGISTRY — Centro de Inteligencia Empresarial (misión 2026-11-23)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Registro ÚNICO de módulos del Dashboard (ubicación oficial: Inicio →
 * Análisis → Dashboard). Cada módulo es un ámbito de análisis autocontenido
 * con su propia fuente de datos, filtros y diseño — el shell (BiDashboardView)
 * los pinta por orden y nada más.
 *
 * CÓMO INCORPORAR UN DASHBOARD FUTURO (ventas avanzadas, finanzas y
 * rentabilidad, inventario, compras, RRHH, operaciones, logística,
 * desempeño por tienda — misión §7):
 *   1. Crear el componente del módulo con firma `BiModuleComponent`
 *      ({ storeId, storeName }).
 *   2. Añadir UNA entrada a BI_MODULES (id, label, description, icon,
 *      component). No se toca la navegación principal, ni el shell, ni
 *      ningún módulo existente.
 *   3. El módulo nuevo reutiliza las librerías de dominio compartidas
 *      (sales-dashboard/periods, useStoreAnalytics, etc.) para mantener
 *      definiciones y fuentes de cálculo únicas.
 *
 * Reglas del registro:
 *   - `component` usa `next/dynamic` (chunks por módulo, TBT sano en móvil).
 *   - Los módulos NO se importan estáticamente entre sí (sin acoplamiento).
 *   - El módulo primero (Resumen ejecutivo) es el default del shell.
 */

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { Gauge, BarChart3, type LucideIcon } from 'lucide-react';

/** Props que el shell pasa a cada módulo. */
export interface BiModuleProps {
  storeId: string;
  storeName: string;
}

export interface BiModuleDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  component: ComponentType<BiModuleProps>;
}

// Chunk-loading resiliente (mismo patrón que TerminalShell/DashboardView).
function lazyBiModule(loader: () => Promise<{ default: ComponentType<BiModuleProps> }>) {
  return dynamic(loader, {
    ssr: false,
    loading: () => (
      <div className="space-y-4" aria-busy="true">
        <div className="h-16 rounded-2xl bg-muted/20 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/20 animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-muted/20 animate-pulse" />
      </div>
    ),
  }) as unknown as ComponentType<BiModuleProps>;
}

/**
 * Módulos activos (orden = orden de presentación).
 *
 * 1. Resumen ejecutivo — rediseño profundo del dashboard ENERVIDA-VITALLCONS:
 *    la situación del negocio de la tienda activa con comparación real contra
 *    el período equivalente anterior, señales verificables y observaciones
 *    ejecutivas orientadas a decisiones.
 * 2. Análisis de ventas — el dashboard del Historial de Ventas (COSTPRO-SALES-
 *    DASHBOARD-001) trasladado a la ubicación centralizada: filtros completos
 *    (período, tienda, vendedor, estado, método, moneda), vendedores/tiendas,
 *    productos, métodos de pago, control operativo y actividad por horario.
 */
export const BI_MODULES: BiModuleDef[] = [
  {
    id: 'executive',
    label: 'Resumen ejecutivo',
    description: 'Cómo va el negocio: resultados del período, comparación con el período anterior, señales de atención y observaciones para decidir.',
    icon: Gauge,
    component: lazyBiModule(() => import('./modules/ExecutiveModule')),
  },
  {
    id: 'sales',
    label: 'Análisis de ventas',
    description: 'Análisis comercial profundo: KPIs documentales, vendedores y tiendas, productos, métodos de pago, control operativo y actividad por horario.',
    icon: BarChart3,
    component: lazyBiModule(() => import('./modules/SalesModule')),
  },
];

export function getBiModule(id: string): BiModuleDef | undefined {
  return BI_MODULES.find((m) => m.id === id);
}
