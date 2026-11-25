/**
 * CP-UX-FINAL-POLISH-003 §2.2 — Tipos del sistema unificado de diálogos COSTPRO.
 *
 * Sustituye a los diálogos nativos del navegador (alert/confirm/prompt) en todos
 * los flujos funcionales de la aplicación. Los componentes se apoyan en BaseModal
 * (Radix Dialog + focus trap) y usan exclusivamente tokens del tema (Light/Dark).
 */
import type * as React from 'react';

/** Variante visual de una confirmación. */
export type ConfirmVariant = 'default' | 'destructive' | 'warning';

/** Variante visual de un mensaje informativo (AlertDialog conceptual). */
export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface ConfirmOptions {
  /** Título descriptivo de la operación. */
  title: string;
  /** Explicación clara de qué va a ocurrir. Acepta JSX (p. ej. <strong>). */
  message: React.ReactNode;
  /** Texto del botón de confirmación (default: «Confirmar»). */
  confirmLabel?: string;
  /** Texto del botón de cancelación (default: «Cancelar»). */
  cancelLabel?: string;
  /** Variante visual (default: «default»; usar «destructive» en eliminaciones/anulaciones). */
  variant?: ConfirmVariant;
  /**
   * Trabajo a ejecutar mientras el diálogo permanece abierto con estado de
   * procesamiento. Si se omite, la promesa resuelve al pulsar Confirmar y el
   * llamador ejecuta su propia lógica (con su guard de doble envío).
   */
  onConfirm?: () => void | Promise<void>;
}

export interface AlertOptions {
  title: string;
  message: React.ReactNode;
  /** Texto del botón único (default: «Entendido»). */
  confirmLabel?: string;
  /** Variante (default: «info»). */
  variant?: AlertVariant;
}

export interface PromptOptions {
  title: string;
  /** Texto explicativo sobre el campo (opcional). */
  message?: React.ReactNode;
  /** Etiqueta del campo (opcional). */
  label?: string;
  placeholder?: string;
  initialValue?: string;
  /** Tipo de entrada (default: «text»; «number» para valores numéricos). */
  type?: 'text' | 'number' | 'textarea';
  /** Si es opcional, se puede confirmar vacío (equivale a prompt() con texto vacío). */
  optional?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Validación adicional; devuelve el mensaje de error o null si es válido. */
  validate?: (value: string) => string | null;
}
