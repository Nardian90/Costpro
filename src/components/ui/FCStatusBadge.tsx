'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { getFCStatusBadge } from '@/lib/integration/fc-automation';
import type { ProductFCStatus } from '@/contracts/product-cost-sheet';

/**
 * FCStatusBadge — Indicador visual del estado de Ficha de Costo de un producto.
 *
 * Estados:
 * - vigente (verde): FC calculada y vigente
 * - pendiente (amarillo): FC necesita cálculo o actualización
 * - sin_fc (gris): Sin FC (deshabilitada o sin plantilla)
 *
 * Variantes:
 * - pill: Badge compacto para tablas y listas (default)
 * - dot: Indicador mínimo para cards compactas
 */

interface FCStatusBadgeProps {
  status: ProductFCStatus;
  variant?: 'pill' | 'dot';
  className?: string;
  showLabel?: boolean;
}

const COLOR_MAP = {
  green: {
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/20',
    dot: 'bg-success',
  },
  yellow: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/20',
    dot: 'bg-warning',
  },
  gray: {
    bg: 'bg-muted/50',
    text: 'text-muted-foreground',
    border: 'border-border',
    dot: 'bg-muted-foreground/40',
  },
} as const;

export function FCStatusBadge({
  status,
  variant = 'pill',
  className,
  showLabel = true,
}: FCStatusBadgeProps) {
  const { label, color } = getFCStatusBadge(status);
  const colors = COLOR_MAP[color];

  if (variant === 'dot') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5', className)}
        title={label}
        aria-label={`Estado FC: ${label}`}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full shrink-0',
            colors.dot,
            status === 'pendiente' && 'animate-pulse',
          )}
        />
        {showLabel && (
          <span className={cn('text-[9px] font-bold uppercase tracking-widest', colors.text)}>
            {label}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'fc-status-badge-pill inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0',
        colors.bg,
        colors.text,
        colors.border,
        status === 'pendiente' && 'animate-pulse',
        className,
      )}
      title={label}
      aria-label={`Estado FC: ${label}`}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', colors.dot)} />
      {showLabel && label}
    </span>
  );
}

/**
 * FCCoverageBar — Barra de cobertura FC para dashboard del catálogo.
 * Muestra la proporción de productos con FC vigente/pendiente/sin_fc.
 */

interface FCCoverageBarProps {
  vigente: number;
  pendiente: number;
  sin_fc: number;
  total: number;
  coverage: number;
  className?: string;
}

export function FCCoverageBar({
  vigente,
  pendiente,
  sin_fc,
  total,
  coverage,
  className,
}: FCCoverageBarProps) {
  if (total === 0) return null;

  const pctVigente = (vigente / total) * 100;
  const pctPendiente = (pendiente / total) * 100;
  const pctSinFC = (sin_fc / total) * 100;

  return (
    <div className={cn('fc-coverage-bar space-y-1.5', className)}>
      {/* Barra visual */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(coverage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Cobertura FC: ${coverage.toFixed(1)}% (${vigente} vigente, ${pendiente} pendiente, ${sin_fc} sin FC)`}
        className="flex h-1.5 rounded-full overflow-hidden bg-muted/30 border border-border"
      >
        {pctVigente > 0 && (
          <div
            className="bg-success transition-all duration-500"
            style={{ width: `${pctVigente}%` }}
            title={`${vigente} FC Vigente (${Math.round(pctVigente)}%)`}
          />
        )}
        {pctPendiente > 0 && (
          <div
            className="bg-warning transition-all duration-500"
            style={{ width: `${pctPendiente}%` }}
            title={`${pendiente} FC Pendiente (${Math.round(pctPendiente)}%)`}
          />
        )}
        {pctSinFC > 0 && (
          <div
            className="bg-muted-foreground/20 transition-all duration-500"
            style={{ width: `${pctSinFC}%` }}
            title={`${sin_fc} Sin FC (${Math.round(pctSinFC)}%)`}
          />
        )}
      </div>

      {/* Leyenda compacta */}
      <div className="fc-coverage-bar-legend flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success" />
          {vigente} vigente{vigente !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning" />
          {pendiente} pendiente{pendiente !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          {sin_fc} sin FC
        </span>
        <span className="ml-auto text-primary font-black">
          {coverage.toFixed(1)}% cobertura
        </span>
      </div>
    </div>
  );
}

/**
 * FCCoverageAccordion — Acordeón compacto que combina la barra de cobertura FC
 * con los chips de filtro. Colapsado muestra solo resumen; expandido muestra
 * la barra + leyenda + filtros FC.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

type FCFilterKey = 'all' | 'vigente' | 'pendiente' | 'sin_fc';

interface FCCoverageAccordionProps {
  vigente: number;
  pendiente: number;
  sin_fc: number;
  total: number;
  coverage: number;
  fcFilter: FCFilterKey;
  onFcFilterChange: (key: FCFilterKey) => void;
  className?: string;
}

export function FCCoverageAccordion({
  vigente,
  pendiente,
  sin_fc,
  total,
  coverage,
  fcFilter,
  onFcFilterChange,
  className,
}: FCCoverageAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (total === 0) return null;

  // Summary line: "2 vigentes · 18 pendientes · 0 sin FC — 10.0%"
  const summaryParts: string[] = [];
  if (vigente > 0) summaryParts.push(`${vigente} vigente${vigente !== 1 ? 's' : ''}`);
  if (pendiente > 0) summaryParts.push(`${pendiente} pendiente${pendiente !== 1 ? 's' : ''}`);
  if (sin_fc > 0) summaryParts.push(`${sin_fc} sin FC`);
  const summaryText = summaryParts.length > 0
    ? `${summaryParts.join(' · ')} — ${coverage.toFixed(1)}%`
    : `${total} productos — ${coverage.toFixed(1)}%`;

  const filterOptions: { key: FCFilterKey; label: string; count: number; dotColor: string }[] = [
    { key: 'all', label: 'Todos', count: total, dotColor: 'bg-primary' },
    { key: 'vigente', label: 'Vigente', count: vigente, dotColor: 'bg-success' },
    { key: 'pendiente', label: 'Pendiente', count: pendiente, dotColor: 'bg-warning' },
    { key: 'sin_fc', label: 'Sin FC', count: sin_fc, dotColor: 'bg-muted-foreground/30' },
  ];

  return (
    <div className={cn('rounded-xl bg-card border border-border overflow-hidden', className)}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors min-h-[44px]"
        aria-expanded={isOpen}
        aria-controls="fc-coverage-content"
      >
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">FC</span>
        <span className="flex-1 text-xs font-semibold text-foreground truncate">{summaryText}</span>
        <div className={cn(
          'p-1 rounded-lg transition-colors shrink-0',
          isOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
        )}>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Expandable content */}
      <div
        id="fc-coverage-content"
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          isOpen
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3 space-y-3">
            {/* Progress bar + legend */}
            <FCCoverageBar vigente={vigente} pendiente={pendiente} sin_fc={sin_fc} total={total} coverage={coverage} />

            {/* FC Filter chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground shrink-0 mr-1">Filtrar</span>
              {filterOptions.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onFcFilterChange(opt.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase border transition-all active:scale-95',
                    fcFilter === opt.key
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', opt.dotColor)} />
                  {opt.label}
                  <span className={cn(
                    'tabular-nums',
                    fcFilter === opt.key ? 'text-primary-foreground/70' : 'text-muted-foreground/60'
                  )}>({opt.count})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FCStatusBadge;
