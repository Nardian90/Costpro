'use client';

/**
 * HelpLauncher — Botón de ayuda con deep-linking por vista.
 *
 * Cuando un usuario hace clic en el botón "?" dentro de una vista específica
 * (POS, Inventario, Recepciones, etc.), este componente navega a la vista
 * de ayuda y carga directamente el documento correspondiente.
 *
 * Uso:
 *   <HelpLauncher view="pos" />
 *   <HelpLauncher view="inventory" size="sm" />
 *
 * El mapeo vista → documento está en HELP_DOC_BY_VIEW más abajo.
 */

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useUIStore } from '@/store';
import { cn } from '@/lib/utils';

// Mapeo de ViewType → documento de ayuda.
// Las rutas son relativas a /knowledge/help/.
export const HELP_DOC_BY_VIEW: Record<string, string> = {
  // Tutoriales principales
  'occ': 'help/01-tutoriales/01-primer-inicio.md',
  'dashboard': 'help/01-tutoriales/04-primer-reporte.md',

  // Operaciones multi-tienda
  'pos': 'help/02-como-hacer/03-como-cerrar-caja.md',
  'sales-hub': 'help/02-como-hacer/11-como-ver-historial-ventas.md',
  'sales': 'help/02-como-hacer/11-como-ver-historial-ventas.md',
  'sales_catalog': 'help/02-como-hacer/09-como-exportar-catalogo.md',
  'catalog': 'help/01-tutoriales/03-primer-producto.md',
  'inventory': 'help/02-como-hacer/10-como-ajustar-inventario.md',
  'inventory_adjustments': 'help/02-como-hacer/10-como-ajustar-inventario.md',
  'history': 'help/03-referencia/08-estados-transferencia.md',
  'inventory_count': 'help/02-como-hacer/10-como-ajustar-inventario.md',
  'labels': 'help/02-como-hacer/08-como-imprimir-etiqueta.md',
  'recepcion': 'help/02-como-hacer/04-como-recibir-mercancia.md',
  'reception_list': 'help/02-como-hacer/04-como-recibir-mercancia.md',
  'transferencias': 'help/02-como-hacer/05-como-hacer-transferencia.md',
  'cash': 'help/02-como-hacer/03-como-cerrar-caja.md',
  'purchase-orders': 'help/02-como-hacer/06-como-crear-orden-compra.md',

  // Inteligencia / servicios
  'exchange-intelligence': 'help/02-como-hacer/12-como-usar-tasa-cambio.md',
  'received-services': 'help/02-como-hacer/14-como-recibir-servicio.md',
  'usage-monitoring': 'help/02-como-hacer/15-como-ver-uso-sistema.md',
  'workers': 'help/02-como-hacer/13-como-pagar-comisiones.md',

  // Configuración
  'stores': 'help/04-explicacion/01-que-es-multi-tienda.md',
  'users': 'help/03-referencia/02-roles-permisos.md',
  'roles': 'help/03-referencia/02-roles-permisos.md',
  'settings': 'help/03-referencia/04-temas-visuales.md',
  'health': 'help/02-como-hacer/15-como-ver-uso-sistema.md',
  'audit': 'help/04-explicacion/04-por-que-auditoria.md',

  // Reportes
  'reports': 'help/01-tutoriales/04-primer-reporte.md',

  // IPV
  'ipv': 'help/04-explicacion/03-que-es-ipv.md',

  // Costos
  'cost-sheets': 'help/04-explicacion/02-que-es-ficha-costo.md',

  // Más recursos
  'help': 'help/00-diataxis-map.md',
  'wiki': 'help/03-referencia/01-glosario.md',
  'academy': 'help/00-diataxis-map.md',
  'legal': 'help/00-diataxis-map.md',

  // Otros
  'pick3-intelligence': 'help/05-referencia/pick3-workflow.md',
  'ofertas': 'help/02-como-hacer/07-como-aplicar-descuento.md',
  'news': 'help/00-diataxis-map.md',
  'rss_management': 'help/00-diataxis-map.md',
  'wallet': 'help/00-diataxis-map.md',
};

export interface HelpLauncherProps {
  /** El ViewType desde donde se llama. Determina qué documento abrir. */
  view: string;
  /** Tamaño del botón. */
  size?: 'sm' | 'md' | 'lg';
  /** Variante visual. */
  variant?: 'ghost' | 'outline' | 'solid';
  /** Etiqueta (texto) al lado del ícono. Si se omite, solo muestra el ícono. */
  label?: string;
  /** Clases adicionales. */
  className?: string;
}

export function HelpLauncher({
  view,
  size = 'md',
  variant = 'ghost',
  label,
  className,
}: HelpLauncherProps) {
  const { setCurrentView, currentView } = useUIStore();

  const handleClick = () => {
    // Si estamos en la vista de ayuda y el usuario pulsa "?", 
    // NO debemos re-navegar (perdería el documento actual que el usuario está leyendo).
    // En su lugar, hacemos scroll al top del documento actual.
    if (currentView === 'help' || currentView === 'wiki') {
      if (typeof window !== 'undefined' && (window as any).__helpScrollToTop) {
        (window as any).__helpScrollToTop();
      }
      return;
    }

    // Guardar la vista origen en sessionStorage para referencia futura
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('costpro:last-help-view', view);
      } catch {}
    }

    const docPath = HELP_DOC_BY_VIEW[view];
    if (docPath) {
      // Limpiar cualquier ?doc= previo y setear el nuevo.
      // Importante: SIEMPRE actualizamos el param para forzar el reload en HelpView.
      const url = new URL(window.location.href);
      // Si el doc actual ya es el mismo, forzamos recarga limpiando primero
      if (url.searchParams.get('doc') === docPath) {
        url.searchParams.delete('doc');
        window.history.replaceState({}, '', url.toString());
      }
      url.searchParams.set('doc', docPath);
      window.history.pushState({}, '', url.toString());
      // Forzamos el cambio de vista
      setCurrentView('help');
      // Disparamos un evento para que HelpView reaccione si ya está montado
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      // Si no hay documento específico, vamos al índice general
      const url = new URL(window.location.href);
      url.searchParams.delete('doc');
      window.history.pushState({}, '', url.toString());
      setCurrentView('help');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-11 h-11',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const variantClasses = {
    ghost: 'hover:bg-muted/60 text-muted-foreground hover:text-foreground',
    outline: 'border border-border/50 bg-background hover:bg-muted/40 text-foreground',
    solid: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20',
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Ayuda de esta vista`}
      aria-label={`Abrir ayuda de esta vista`}
      className={cn(
        'flex items-center justify-center rounded-xl transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px] min-w-[44px]',
        sizeClasses[size],
        variantClasses[variant],
        label && 'px-3 gap-1.5',
        className
      )}
    >
      <HelpCircle className={iconSizes[size]} aria-hidden="true" />
      {label && <span className="text-xs font-semibold">{label}</span>}
    </button>
  );
}

export default HelpLauncher;
