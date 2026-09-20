'use client';

import React from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';
import InteractiveDemo from './demo/InteractiveDemo';
import { enterFichaDeCosto } from '@/lib/fcEntry';

export default function InteractiveDemoModal({
  showDemoModal,
  setShowDemoModal,
}: {
  showDemoModal: boolean;
  setShowDemoModal: (v: boolean) => void;
}) {
  return (
    <Dialog open={showDemoModal} onOpenChange={setShowDemoModal}>
      <DialogContent className="sm:max-w-5xl p-0 gap-0 overflow-hidden border-white/10 bg-[#0a0f1a]">
        <DialogTitle className="sr-only">Demo interactiva de CostPro</DialogTitle>
        <DialogDescription className="sr-only">
          Mira cómo CostPro gestiona tiendas, inventario y ventas desde una sola plataforma
        </DialogDescription>
        {/* Close button */}
        <button
          onClick={() => setShowDemoModal(false)}
          className="absolute top-3 right-3 z-50 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-black/70 hover:border-white/20 transition-colors cursor-pointer"
          aria-label="Cerrar demo"
        >
          <X className="w-4 h-4 text-white/70 hover:text-white transition-colors" />
        </button>
        <div className="p-4 sm:p-6">
          <InteractiveDemo />
        </div>
        {/* FIX-ENTRY (2026-09-20): conversión contextual al final del camino C —
            la demo ya no es un callejón sin salida: ofrece continuar hacia la
            Ficha de Costo (camino B) o a COSTPRO (camino A), con los MISMOS
            flujos del selector (sin recargas, returnTo solo navegación). */}
        <div className="border-t border-white/[0.06] bg-[#0d1420] px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/50 text-center sm:text-left">
            ¿Quieres probarlo con tus datos?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowDemoModal(false);
                enterFichaDeCosto(() => window.dispatchEvent(new CustomEvent('open-login')));
              }}
              className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-lg bg-[#004d40] hover:bg-[#00695c] text-white text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]/70"
            >
              Crear ficha gratis
            </button>
            <button
              onClick={() => {
                setShowDemoModal(false);
                window.dispatchEvent(new CustomEvent('open-login'));
              }}
              className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-lg border border-white/[0.12] text-white/80 hover:text-white hover:bg-white/[0.05] text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Entrar a COSTPRO
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
