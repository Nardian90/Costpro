'use client';


import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Input } from '@/components/ui/input';
import { PenTool } from 'lucide-react';

const CostSheetSignatureEditor = () => {
  const { data, updateValue } = useCostSheetStore();
  const signature = data?.signature;

  if (!signature) return null;

  const handleChange = (field: string, value: string) => {
    updateValue(['signature', field], value);
  };

  return (
    <div className="neu-card p-8 animate-in zoom-in-95 duration-500">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <PenTool className="w-5 h-5 text-primary" />
        </div>
        <div>
            <h3 className="text-lg font-black text-foreground">Firmas y Aprobaciones</h3>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Responsables del Documento</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-3">
          <label className="text-xs font-black uppercase tracking-[0.2em] text-primary/60 block">
            Elaborado por (Nombre y Cargo)
          </label>
          <Input
            value={signature?.prepared_by || ''}
            onChange={(e) => handleChange('prepared_by', e.target.value)}
            className="neu-input h-12 text-lg font-bold"
            placeholder="Ej: Ing. Juan Pérez - Especialista B en Costos"
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-black uppercase tracking-[0.2em] text-primary/60 block">
            Aprobado por (Nombre y Cargo)
          </label>
          <Input
            value={signature?.approved_by || ''}
            onChange={(e) => handleChange('approved_by', e.target.value)}
            className="neu-input h-12 text-lg font-bold"
            placeholder="Ej: Lic. Ana García - Directora Económica"
          />
        </div>
      </div>

      <div className="mt-12 p-4 bg-muted/30 rounded-2xl border border-dashed border-border">
          <p className="text-xs text-center text-muted-foreground font-bold uppercase tracking-widest">
            Estas firmas aparecerán en la parte inferior del documento impreso o exportado.
          </p>
      </div>
    </div>
  );
};

export default CostSheetSignatureEditor;
