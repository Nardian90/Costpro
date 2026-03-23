'use client';

import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { FileText, Clipboard } from 'lucide-react';
import { toast } from 'sonner';

interface ObservationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  observations: string;
  reference: string;
}

export function ObservationsModal({
  open,
  onOpenChange,
  observations,
  reference,
}: ObservationsModalProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(observations);
    toast.success('Observaciones copiadas al portapapeles');
  };

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <span className="uppercase tracking-tight">Detalle de Observaciones</span>
        </div>
      }
      description={
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest bg-muted px-2 py-0.5 rounded">
            Referencia: {reference}
          </span>
        </div>
      }
      maxWidth="sm:max-w-xl"
      footer={
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            onClick={handleCopy}
            className="flex-1 h-11 font-black uppercase text-xs tracking-widest gap-2"
          >
            <Clipboard className="w-4 h-4" />
            Copiar Texto
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="flex-1 h-11 font-black uppercase text-xs tracking-widest"
          >
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 min-h-[200px] max-h-[400px] overflow-y-auto">
          {observations ? (
            <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {observations}
            </p>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic gap-2 py-12">
              <FileText className="w-8 h-8 opacity-20" />
              <p className="text-xs uppercase font-bold tracking-widest">Sin observaciones registradas</p>
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
