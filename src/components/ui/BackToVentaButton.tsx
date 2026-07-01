'use client';

import React from 'react';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import { useUIStore, ViewType } from '@/store';
import { cn } from '@/lib/utils';

/**
 * BackToVentaButton — Botón "← Volver a Venta" para wayfinding contextual.
 *
 * QW-1 (IA Audit, MULTI-TIENDA): las vistas POSView, SalesCatalogView y
 * CatalogView son alcanzadas desde el hub de Venta (sales-hub). El usuario
 * que entra a una de ellas pierde el contexto de "estoy dentro de Venta" y
 * para volver al hub debe hacer clic en el ítem del sidebar "Punto de Venta → Venta"
 * (2 clics) o usar CommandPalette (búsqueda). Este botón restaura el contexto
 * en 1 clic y refuerza la jerarquía: hub → vista específica.
 *
 * Impacto: +1 punto Wayfinding en la auditoría IA.
 * Esfuerzo: 30 min (componente + integración en 3 vistas).
 *
 * UX: botón secundario (no compite con acciones primarias de la vista),
 * con icono ArrowLeft + label "Venta". En mobile el label se oculta para
 * no consumir espacio. Mismo patrón que el "← Back" de Shopify admin.
 */
interface BackToVentaButtonProps {
  /** Etiqueta personalizada (default: "Venta"). */
  label?: string;
  /** Variante compacta para espacios reducidos (sin padding extra). */
  compact?: boolean;
  /** Clases adicionales para override. */
  className?: string;
  /**
   * Vista a la que navegar. Default: 'sales-hub' (hub de Venta).
   * Permite apuntar a una sub-vista específica del hub si hace falta.
   */
  targetView?: ViewType;
}

export function BackToVentaButton({
  label = 'Venta',
  compact = false,
  className,
  targetView = 'sales-hub' as ViewType,
}: BackToVentaButtonProps) {
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  return (
    <button
      type="button"
      onClick={() => setCurrentView(targetView)}
      aria-label={`Volver a ${label}`}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        compact ? 'h-9 px-2.5' : 'h-10 px-3',
        className,
      )}
    >
      <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
      <ShoppingCart className="w-3.5 h-3.5 hidden sm:inline-block opacity-60" aria-hidden="true" />
      <span className="text-xs font-black uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

export default BackToVentaButton;
