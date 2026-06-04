"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { BaseModal } from "@/components/ui/BaseModal";

interface POSModalsProps {
  showPriceWarning: boolean;
  onPriceWarningChange: (open: boolean) => void;
  onConfirmUnpriced: () => void;
}

export const POSModals = ({
  showPriceWarning,
  onPriceWarningChange,
  onConfirmUnpriced,
}: POSModalsProps) => (
  <>
    {/* Modal de Advertencia de Precio */}
    <BaseModal
      open={showPriceWarning}
      onOpenChange={onPriceWarningChange}
      title={
        <div className="text-amber-500 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Advertencia de Precio
        </div>
      }
      maxWidth="sm:max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={() => onPriceWarningChange(false)}
            className="flex-1 py-2.5 rounded-xl border border-border font-black text-xs uppercase tracking-widest hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmUnpriced}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-primary-foreground font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            Confirmar Facturación
          </button>
        </>
      }
    >
      <div className="py-6 text-center space-y-4">
        <p className="font-bold text-foreground">
          Uno o más productos en el carrito no tienen un precio asignado
          (Precio 0 o Nulo).
        </p>
        <div className="neu-card !p-4 bg-amber-500/10 border-amber-500/20">
          <p className="text-sm font-medium text-amber-700 leading-relaxed">
            ¿Desea continuar con la facturación bajo su responsabilidad?
          </p>
        </div>
        <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">
          Esta acción quedará registrada en la auditoría del sistema.
        </p>
      </div>
    </BaseModal>

  </>
);
