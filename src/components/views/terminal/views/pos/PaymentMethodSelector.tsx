'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Banknote, ArrowLeftRight, DollarSign, Wallet } from 'lucide-react';
import type { PaymentMethod } from '@/types';

/**
 * PaymentMethodSelector — Componente unificado para selección de método de pago.
 *
 * V2.12.25: Resuelve la fragmentación de 3 flujos de checkout distintos
 * (POSCartCheckoutPanel, SalesCatalogView, POSExpressMode) que cada uno
 * implementaba su propio selector de método de pago con look&feel y
 * vocabulario diferente.
 *
 * Uso:
 *   <PaymentMethodSelector
 *     value={selectedPayment}
 *     onChange={setSelectedPayment}
 *     variant="compact"  // o "full"
 *   />
 *
 * Métodos de pago válidos (alineados con payment_method_enum de PostgreSQL):
 *   - cash (Efectivo)
 *   - transfer (Transferencia)
 *   - zelle (Zelle)
 *   - mixed (Mixto — efectivo + transferencia)
 */

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const PAYMENT_OPTIONS: PaymentMethodOption[] = [
  {
    value: 'cash',
    label: 'Efectivo',
    shortLabel: 'Efectivo',
    icon: Banknote,
    color: 'text-success',
    bgColor: 'bg-success/10 border-success/30',
  },
  {
    value: 'transfer',
    label: 'Transferencia',
    shortLabel: 'Transfer.',
    icon: ArrowLeftRight,
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/30',
  },
  {
    value: 'zelle',
    label: 'Zelle',
    shortLabel: 'Zelle',
    icon: DollarSign,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
  },
  {
    value: 'mixed',
    label: 'Mixto',
    shortLabel: 'Mixto',
    icon: Wallet,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
  },
];

interface PaymentMethodSelectorProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  variant?: 'compact' | 'full';
  className?: string;
  ariaLabel?: string;
}

export function PaymentMethodSelector({
  value,
  onChange,
  variant = 'compact',
  className,
  ariaLabel = 'Seleccionar método de pago',
}: PaymentMethodSelectorProps) {
  if (variant === 'compact') {
    // Variante compacta: select nativo estilizado (para headers tight como POSExpressMode)
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PaymentMethod)}
        className={cn(
          'bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-black uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none min-h-[36px]',
          className
        )}
        aria-label={ariaLabel}
      >
        {PAYMENT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  // Variante full: botones grandes con iconos (para checkout panels)
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-4 gap-2', className)} role="radiogroup" aria-label={ariaLabel}>
      {PAYMENT_OPTIONS.map(opt => {
        const Icon = opt.icon;
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all min-h-[44px] active:scale-95',
              isSelected
                ? cn(opt.bgColor, opt.color, 'font-black')
                : 'border-border text-muted-foreground hover:bg-muted/50'
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">{opt.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Helper para obtener label legible de un PaymentMethod.
 */
export function getPaymentLabel(method: PaymentMethod | string | null | undefined): string {
  const opt = PAYMENT_OPTIONS.find(o => o.value === method);
  return opt?.label || 'Sin especificar';
}

/**
 * Helper para obtener icono de un PaymentMethod.
 */
export function getPaymentIcon(method: PaymentMethod | string | null | undefined): React.ElementType {
  const opt = PAYMENT_OPTIONS.find(o => o.value === method);
  return opt?.icon || Banknote;
}

/**
 * Helper para obtener color de un PaymentMethod.
 */
export function getPaymentColor(method: PaymentMethod | string | null | undefined): string {
  const opt = PAYMENT_OPTIONS.find(o => o.value === method);
  return opt?.color || 'text-muted-foreground';
}
