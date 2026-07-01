'use client';

import React, { useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * F2.5-2 (F1-T06 real): Componente reutilizable de confirmación destructiva.
 *
 * Reemplaza los patrones ad-hoc de confirmación para acciones irreversibles
 * (eliminar tienda, reiniciar tienda, desactivar tienda, eliminar usuario, etc.)
 * con un solo componente estandarizado que exige escribir el nombre exacto
 * de la entidad para habilitar el botón de confirmación.
 *
 * Patrones que reemplaza:
 * - confirm() nativo del navegador (UX inconsistente, no estilizable)
 * - Bloques ad-hoc duplicados en StoreModals.tsx (delete vs reset)
 *
 * Props:
 * - isOpen, onClose: control del modal
 * - title: título del modal (ej: "Eliminar Tienda")
 * - description: subtítulo explicativo
 * - confirmName: string que el usuario debe escribir para habilitar el botón
 *   (típicamente el nombre de la entidad: store.name, user.full_name, etc.)
 * - confirmNameLabel: etiqueta del input (ej: "Nombre de la tienda")
 * - warningText: texto principal de advertencia (se muestra con icono)
 * - itemsList: lista opcional de bullets que detallan qué se pierde (ej: ventas, recepciones)
 * - confirmLabel: texto del botón confirmar (ej: "Eliminar", "Reiniciar", "Desactivar")
 * - onConfirm: callback async que ejecuta la acción destructiva
 * - isSubmitting: estado de carga (deshabilita botones)
 */
interface DestructiveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmName: string;
  confirmNameLabel?: string;
  warningText: React.ReactNode;
  itemsList?: string[];
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
  /** Reset-Flow-Fix: contenido extra opcional entre warningText y itemsList.
   *  Útil para toggles como "Mantener catálogo" en el modal de reset. */
  extraContent?: React.ReactNode;
}

export function DestructiveConfirmModal({
  isOpen,
  onClose,
  title,
  description,
  confirmName,
  confirmNameLabel = 'Escribe el nombre para confirmar',
  warningText,
  itemsList,
  confirmLabel,
  onConfirm,
  isSubmitting = false,
  extraContent,
}: DestructiveConfirmModalProps) {
  // F2.5-2: el input se resetea naturalmente en cada apertura porque el consumidor
  // debe pasar un `key` que cambia cuando abre el modal para una nueva entidad.
  // Ej: <DestructiveConfirmModal key={storeToToggle?.id} ... />
  // Esto remonta el componente y reinicia el estado. Patrón recomendado por React 19.
  const [inputValue, setInputValue] = useState('');

  // El botón solo se habilita cuando el input coincide exactamente con confirmName
  const isConfirmed = inputValue.trim() === confirmName.trim();

  const handleConfirm = async () => {
    if (!isConfirmed || isSubmitting) return;
    await onConfirm();
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      aria-label={`${title}. ${warningText}`}
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-destructive flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {title}
        </span>
      }
      description={
        description ? (
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
            {description}
          </span>
        ) : undefined
      }
      footer={
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none h-11"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            type="button"
            onClick={handleConfirm}
            disabled={!isConfirmed || isSubmitting}
            className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-xs disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 mt-4">
        {/* Ícono de advertencia + texto principal */}
        <div className="flex items-center gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-xl">
          <AlertTriangle className="w-8 h-8 text-destructive flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-black text-sm uppercase tracking-tight text-destructive">
              Acción irreversible
            </p>
            <div className="text-xs text-muted-foreground mt-1">
              {warningText}
            </div>
          </div>
        </div>

        {/* Reset-Flow-Fix: contenido extra opcional (toggles, etc.) */}
        {extraContent && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            {extraContent}
          </div>
        )}

        {/* Lista opcional de items afectados */}
        {itemsList && itemsList.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
            {itemsList.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}

        {/* Input de confirmación — "escribir nombre para confirmar" */}
        <div className="space-y-1">
          <label
            htmlFor="destructive-confirm-input"
            className="text-xs font-black uppercase tracking-widest text-muted-foreground"
          >
            {confirmNameLabel}: <strong className="text-destructive">{confirmName}</strong>
          </label>
          <input
            id="destructive-confirm-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmName}
            aria-label={`${confirmNameLabel} ${confirmName}`}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:ring-1 focus:ring-destructive outline-none"
            autoComplete="off"
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground/60">
            Escribe exactamente <strong>{confirmName}</strong> para habilitar el botón.
          </p>
        </div>
      </div>
    </BaseModal>
  );
}
