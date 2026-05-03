'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SHORTCUTS_REGISTRY } from '@/hooks/ui/useKeyboardShortcuts';
import { Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Atajos de Teclado
          </DialogTitle>
          <DialogDescription>
            Navega rápidamente por CostPro usando el teclado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 py-2">
          {SHORTCUTS_REGISTRY.map((shortcut) => (
            <div
              key={shortcut.key}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm text-muted-foreground">{shortcut.description}</span>
              <kbd className="inline-flex items-center gap-1 px-2.5 py-1 bg-muted text-foreground text-xs font-mono font-bold rounded-md border border-border">
                {shortcut.key.split('+').map((part, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-muted-foreground/50">+</span>}
                    {part}
                  </React.Fragment>
                ))}
              </kbd>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t">
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Los atajos están desactivados al escribir en campos de texto.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsModal;
