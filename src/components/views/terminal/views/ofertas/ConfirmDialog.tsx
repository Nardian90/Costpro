'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="bg-background border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-full bg-destructive/10">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <h4 className="font-bold text-sm">{title}</h4>
        </div>
        <p className="text-xs text-muted-foreground mb-5 leading-relaxed">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" className="text-xs" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="text-xs"
            onClick={onConfirm}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
