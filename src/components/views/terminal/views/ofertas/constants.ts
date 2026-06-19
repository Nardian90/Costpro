/**
 * @file Shared constants for the Ofertas Comerciales feature.
 * Uses semantic design tokens for dark-mode compatibility.
 */

import type { OfertaStatus } from '@/types/oferta';

export const STATUS_CONFIG: Record<OfertaStatus, { label: string; dotClass: string; badgeClass: string }> = {
  draft: {
    label: 'Borrador',
    dotClass: 'bg-muted-foreground/50',
    badgeClass: 'bg-muted text-muted-foreground',
  },
  sent: {
    label: 'Enviada',
    dotClass: 'bg-primary',
    badgeClass: 'bg-primary/15 text-primary',
  },
  accepted: {
    label: 'Aceptada',
    dotClass: 'bg-success',
    badgeClass: 'bg-success/15 text-success',
  },
  rejected: {
    label: 'Rechazada',
    dotClass: 'bg-destructive',
    badgeClass: 'bg-destructive/15 text-destructive',
  },
  expired: {
    label: 'Expirada',
    dotClass: 'bg-warning',
    badgeClass: 'bg-warning/15 text-warning',
  },
};

export const CURRENCY_OPTIONS = [
  { value: 'CUP', label: 'CUP (Peso Cubano)' },
  { value: 'MLC', label: 'MLC (Moneda Libremente Convertible)' },
  { value: 'USD', label: 'USD (Dólar Americano)' },
  { value: 'EUR', label: 'EUR (Euro)' },
];

/** Validation rules for oferta form fields */
export const VALIDATION_RULES: Record<string, { required?: boolean; minLength?: number; pattern?: RegExp; message: string }> = {
  numero: { required: true, minLength: 1, message: 'Número de oferta es requerido' },
  objeto: { required: true, minLength: 1, message: 'Objeto es requerido' },
  'suministrador.empresa': { required: true, minLength: 1, message: 'Empresa del suministrador es requerida' },
  'cliente.empresa': { required: true, minLength: 1, message: 'Empresa del cliente es requerida' },
  productos: { required: true, message: 'Al menos un producto es requerido' },
  'productos.descripcion': { required: true, minLength: 1, message: 'Todos los productos deben tener descripción' },
};
