'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCcw,
  AlertTriangle,
  Play,
  Pause,
  Ban,
  FileText,
  type LucideIcon,
} from 'lucide-react';

/**
 * DocumentStatusBadge — Indicador visual UNIFICADO de estado de documentos contables.
 *
 * V2.2: Introduce estados `reversed` (reversión contable) y `confirmed` (confirmado pero no revertible).
 * Sustituye a los 6+ badges ad-hoc repartidos por las vistas.
 *
 * Tipos soportados:
 * - transaction        (pending, completed, voided, reversed, ...)
 * - receipt            (pending, confirmed, active, partial, voided, reversed)
 * - transfer           (PENDIENTE, CONFIRMADA, CANCELADA, REVERSADA)
 * - devolution         (pending, completed, voided, reversed)
 * - adjustment         (pending, confirmed, reversed)
 * - production_order   (draft, approved, in_progress, paused, completed, closed, voided, reversed)
 */

type DocType = 'transaction' | 'receipt' | 'transfer' | 'devolution' | 'adjustment' | 'production_order';

interface BadgeConfig {
  label: string;
  icon: LucideIcon;
  className: string;
}

const STATUS_CONFIG: Record<DocType, Record<string, BadgeConfig>> = {
  transaction: {
    pending:   { label: 'Pendiente',  icon: Clock,         className: 'bg-warning/10 text-warning' },
    completed: { label: 'Completada', icon: CheckCircle2,  className: 'bg-success/10 text-success' },
    failed:    { label: 'Fallida',    icon: XCircle,        className: 'bg-destructive/10 text-destructive' },
    cancelled: { label: 'Cancelada',  icon: Ban,            className: 'bg-muted text-muted-foreground' },
    voided:    { label: 'Anulada',    icon: Ban,            className: 'bg-destructive/10 text-destructive' },
    reversed:  { label: 'Revertida',  icon: RefreshCcw,     className: 'bg-purple-500/10 text-purple-500 dark:text-purple-400' },
    refunded:  { label: 'Reembolsada',icon: RefreshCcw,     className: 'bg-blue-500/10 text-blue-500' },
    compensated: { label: 'Compensada', icon: CheckCircle2, className: 'bg-blue-500/10 text-blue-500' },
  },
  receipt: {
    pending:   { label: 'Pendiente',  icon: Clock,         className: 'bg-warning/10 text-warning' },
    confirmed: { label: 'Confirmada', icon: CheckCircle2,  className: 'bg-success/10 text-success' },
    active:    { label: 'Confirmada', icon: CheckCircle2,  className: 'bg-success/10 text-success' },
    partial:   { label: 'Parcial',    icon: AlertTriangle, className: 'bg-amber-500/10 text-amber-500' },
    voided:    { label: 'Anulada',    icon: Ban,            className: 'bg-destructive/10 text-destructive' },
    reversed:  { label: 'Revertida',  icon: RefreshCcw,     className: 'bg-purple-500/10 text-purple-500 dark:text-purple-400' },
  },
  transfer: {
    PENDIENTE:  { label: 'Pendiente',  icon: Clock,         className: 'bg-warning/10 text-warning' },
    CONFIRMADA: { label: 'Confirmada', icon: CheckCircle2,  className: 'bg-success/10 text-success' },
    CANCELADA:  { label: 'Cancelada',  icon: Ban,            className: 'bg-destructive/10 text-destructive' },
    REVERSADA:  { label: 'Revertida',  icon: RefreshCcw,     className: 'bg-purple-500/10 text-purple-500 dark:text-purple-400' },
  },
  devolution: {
    pending:   { label: 'Pendiente',  icon: Clock,         className: 'bg-warning/10 text-warning' },
    completed: { label: 'Completada', icon: CheckCircle2,  className: 'bg-success/10 text-success' },
    voided:    { label: 'Anulada',    icon: Ban,            className: 'bg-destructive/10 text-destructive' },
    reversed:  { label: 'Revertida',  icon: RefreshCcw,     className: 'bg-purple-500/10 text-purple-500 dark:text-purple-400' },
  },
  adjustment: {
    pending:   { label: 'Pendiente',  icon: Clock,         className: 'bg-warning/10 text-warning' },
    confirmed: { label: 'Confirmado', icon: CheckCircle2,  className: 'bg-success/10 text-success' },
    reversed:  { label: 'Revertido',  icon: RefreshCcw,     className: 'bg-purple-500/10 text-purple-500 dark:text-purple-400' },
  },
  production_order: {
    draft:       { label: 'Borrador',     icon: FileText,      className: 'bg-muted text-muted-foreground' },
    approved:    { label: 'Aprobada',      icon: CheckCircle2,  className: 'bg-primary/15 text-primary' },
    in_progress: { label: 'En Progreso',   icon: Play,          className: 'bg-blue-500/15 text-blue-500' },
    paused:      { label: 'Pausada',       icon: Pause,         className: 'bg-amber-500/15 text-amber-500' },
    completed:   { label: 'Completada',    icon: CheckCircle2,  className: 'bg-success/15 text-success' },
    closed:      { label: 'Cerrada',       icon: CheckCircle2,  className: 'bg-muted text-muted-foreground' },
    voided:      { label: 'Anulada',       icon: Ban,           className: 'bg-destructive/15 text-destructive' },
    reversed:    { label: 'Revertida',     icon: RefreshCcw,    className: 'bg-purple-500/15 text-purple-500 dark:text-purple-400' },
  },
};

interface DocumentStatusBadgeProps {
  /** Tipo de documento (determina el set de estados válidos) */
  type: DocType;
  /** Estado actual del documento */
  status: string;
  /** Tamaño del badge */
  size?: 'xs' | 'sm' | 'md';
  /** Mostrar icono */
  showIcon?: boolean;
  /** Clase extra */
  className?: string;
}

const SIZE_CLASS = {
  xs: 'text-[10px] px-1.5 py-0.5 gap-0.5',
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-2.5 py-1 gap-1.5',
};

const ICON_SIZE = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
};

export function DocumentStatusBadge({
  type,
  status,
  size = 'sm',
  showIcon = true,
  className,
}: DocumentStatusBadgeProps) {
  const config = STATUS_CONFIG[type]?.[status];

  if (!config) {
    // Estado desconocido: mostrar crudo para que el dev lo detecte
    return (
      <span className={cn(
        'inline-flex items-center font-black uppercase tracking-widest rounded',
        'bg-muted text-muted-foreground',
        SIZE_CLASS[size],
        className,
      )}>
        {showIcon && <AlertTriangle className={ICON_SIZE[size]} />}
        {status || '—'}
      </span>
    );
  }

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center font-black uppercase tracking-widest rounded',
        config.className,
        SIZE_CLASS[size],
        className,
      )}
      aria-label={`Estado: ${config.label}`}
      title={`Estado: ${config.label}`}
    >
      {showIcon && <Icon className={ICON_SIZE[size]} />}
      {config.label}
    </span>
  );
}

/**
 * Helper: ¿el documento está en un estado terminal (no reversible)?
 */
export function isTerminalStatus(type: DocType, status: string): boolean {
  const terminal: Record<DocType, string[]> = {
    transaction: ['voided', 'reversed'],
    receipt: ['voided', 'reversed'],
    transfer: ['CANCELADA', 'REVERSADA'],
    devolution: ['voided', 'reversed'],
    adjustment: ['reversed'],
    production_order: ['voided', 'reversed'],
  };
  return terminal[type]?.includes(status) ?? false;
}

/**
 * Helper: ¿el documento puede ser revertido (acción "Revertir")?
 */
export function canReverse(type: DocType, status: string): boolean {
  const reversible: Record<DocType, string[]> = {
    transaction: ['completed', 'refunded', 'compensated'],
    receipt: ['confirmed', 'active', 'partial'],
    transfer: ['CONFIRMADA'],
    devolution: ['completed'],
    adjustment: ['confirmed'],
    production_order: ['in_progress', 'paused', 'completed', 'closed'],
  };
  return reversible[type]?.includes(status) ?? false;
}
