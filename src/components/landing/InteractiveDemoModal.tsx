'use client';

import React from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';
import InteractiveDemo from './demo/InteractiveDemo';

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
          Mira cómo CostPro crea fichas de costo paso a paso según la Resolución 148/2023
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
      </DialogContent>
    </Dialog>
  );
}
