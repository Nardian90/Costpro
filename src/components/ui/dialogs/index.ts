/**
 * CP-UX-FINAL-POLISH-003 §2.2 — Sistema unificado de diálogos COSTPRO.
 *
 * Punto de entrada público. Reemplaza a los diálogos nativos del navegador
 * (alert/confirm/prompt) en todos los flujos funcionales de la aplicación:
 *
 *   import { DialogProvider, useDialogs } from '@/components/ui/dialogs';
 *
 * Componentes declarativos también disponibles por separado:
 *   ConfirmDialog (confirmación), InfoDialog (mensaje importante), PromptDialog
 *   (solicitud de valor). Para eliminaciones graves con verificación
 *   tipo-escribir, seguir usando DestructiveConfirmModal.
 */
export { DialogProvider, useDialogs } from './DialogProvider';
export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmVariant } from './types';
export { InfoDialog } from './InfoDialog';
export type { AlertVariant } from './types';
export { PromptDialog } from './PromptDialog';
export type { AlertOptions, ConfirmOptions, PromptOptions } from './types';
