'use client';

import React from 'react';
import { useStoreHealth, type StoreHealth } from '@/hooks/api/useStoreHealth';
import { Heart, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * F4-T05: Badge de Health Score por tienda.
 *
 * Muestra un círculo coloreado con el score (0-100) y un icono de corazón.
 * Al hacer hover, abre un tooltip con el breakdown por categoría:
 *  - ✓ Configuración general (20/20)
 *  - ✗ Datos fiscales (0/20) — "Agrega REEUP, NIT..."
 *
 * Colores:
 *  - Rojo: 0-39 (crítico — tienda barely operativa)
 *  - Ámbar: 40-79 (parcial — le faltan piezas)
 *  - Verde: 80-100 (saludable — lista para operar)
 *
 * Consumo:
 *   const { data: health } = useStoreHealth(stores);
 *   <StoreHealthBadge storeId={store.id} health={health} />
 */

interface StoreHealthBadgeProps {
  storeId: string;
  health?: Record<string, StoreHealth>;
  compact?: boolean; // versión mini para tarjetas pequeñas
}

export function StoreHealthBadge({ storeId, health, compact = false }: StoreHealthBadgeProps) {
  const data = health?.[storeId];

  if (!data) {
    // Skeleton mientras carga
    return (
      <span className={cn(
        "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-muted/50 border-border text-muted-foreground/40",
        compact && "px-1"
      )}>
        <Heart className="w-3 h-3" />
        ...
      </span>
    );
  }

  const score = data.total;
  const colorClass = score >= 80
    ? 'bg-success/10 text-success border-success/20'
    : score >= 40
      ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
      : 'bg-destructive/10 text-destructive border-destructive/20';

  return (
    <div className="relative group inline-block">
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-help",
          colorClass,
          compact && "px-1"
        )}
        aria-label={`Health score: ${score} de 100. ${data.categories.filter(c => !c.achieved).length} categorías pendientes.`}
      >
        <Heart className="w-3 h-3" fill="currentColor" />
        {score}%
      </span>

      {/* Tooltip con breakdown — aparece en hover */}
      <div className="absolute z-50 bottom-full left-0 mb-2 w-64 p-3 rounded-xl bg-card border border-border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
          Salud de la tienda · {score}/100
        </div>
        {/* Barra de progreso visual */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
          <div
            className={cn(
              "h-full transition-all",
              score >= 80 ? 'bg-success' : score >= 40 ? 'bg-amber-500' : 'bg-destructive'
            )}
            style={{ width: `${score}%` }}
          />
        </div>
        {/* Lista de categorías */}
        <ul className="space-y-1.5">
          {data.categories.map((cat) => (
            <li key={cat.key} className="flex items-start gap-2 text-xs">
              {cat.achieved ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={cn("font-bold", cat.achieved ? "text-foreground" : "text-muted-foreground")}>
                    {cat.label}
                  </span>
                  <span className={cn("font-mono text-[10px]", cat.achieved ? "text-success" : "text-muted-foreground")}>
                    {cat.score}/20
                  </span>
                </div>
                {!cat.achieved && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">
                    {cat.hint}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
