'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { LucideIcon } from 'lucide-react';

/**
 * PageHeader (F2) — portador de la jerarquía de página:
 *   PAGE TITLE → DESCRIPTION → PRIMARY ACTION → SECONDARY ACTIONS
 *
 * Reglas F2 (§11-§12 del brief):
 * - Es SOLO composición visual y jerarquía: sin modales, sin tabs, sin
 *   fetching, sin lógica de negocio. La lógica permanece en las vistas.
 * - El breadcrumb global de TerminalShell NO se duplica: `context` existe para
 *   chips/breadcrumb LOCAL de la vista cuando lo necesita.
 * - Ninguna prop salvo `title` es obligatoria.
 * - Tipografía por roles (components.css): .cp-page-title / .cp-page-description.
 * - El chip de icono es un momento de marca (tokens --brand, AAA verificado).
 */

interface PageHeaderBadge {
  text: string;
  variant: 'default' | 'success' | 'warning' | 'danger';
}

interface PageHeaderProps {
  title: string;
  /** Descripción o estado de contexto (texto o nodo dinámico, ej: estado del turno). */
  description?: React.ReactNode;
  icon?: LucideIcon;
  badge?: PageHeaderBadge;
  /** Slot de contexto local (breadcrumb local, chips de estado). Opcional. */
  context?: React.ReactNode;
  /** Acción primaria (una sola). Opcional. */
  primaryAction?: React.ReactNode;
  /** Grupo de acciones secundarias. Opcional. */
  secondaryActions?: React.ReactNode;
  /** Compatibilidad: equivalente a secondaryActions (API original). */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

const badgeVariantMap: Record<PageHeaderBadge['variant'], string> = {
  default: 'bg-primary/10 text-primary border-primary/20',
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  danger: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
};

export default function PageHeader({
  title,
  description,
  icon: Icon,
  badge,
  context,
  primaryAction,
  secondaryActions,
  actions,
  children,
}: PageHeaderProps) {
  const secondary = secondaryActions ?? actions;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="border-b border-border/50 pb-4 sm:pb-6"
    >
      {/* Contexto local (opcional) — bajo el breadcrumb global del shell */}
      {context && (
        <div className="mb-2">
          {context}
        </div>
      )}

      {/* Main header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side: icon + title + badge + description */}
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand text-brand-foreground shrink-0">
              <Icon className="w-5 h-5" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="cp-page-title">
                {title}
              </h1>

              {badge && (
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full px-2.5 py-0 text-[10px] font-medium uppercase tracking-wide border',
                    badgeVariantMap[badge.variant]
                  )}
                >
                  {badge.text}
                </Badge>
              )}
            </div>

            {description && (
              // div (no p): description acepta nodos con markup (ej. estado del
              // turno en Caja) — un <p> que contenga <div> rompe la hidratación.
              <div className="cp-page-description mt-0.5">
                {description}
              </div>
            )}
          </div>
        </div>

        {/* Right side: primary + secondary actions */}
        {(primaryAction || secondary) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0 sm:ml-auto">
            {secondary}
            {primaryAction}
          </div>
        )}
      </div>

      {/* Children: filters, toggles, etc. */}
      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </motion.div>
  );
}
