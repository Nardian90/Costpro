/**
 * P3-1 → CP-UX-FINAL-POLISH-003 §2.2: el ConfirmDialog genérico fue promovido a
 * `@/components/ui/dialogs` para servir a toda la aplicación como reemplazo de
 * `confirm()` nativo. Este archivo se conserva como fachada de compatibilidad
 * para los importadores existentes del módulo COSTOS (API idéntica).
 */
export { ConfirmDialog, default } from '@/components/ui/dialogs/ConfirmDialog';
export type { ConfirmDialogProps } from '@/components/ui/dialogs/ConfirmDialog';
