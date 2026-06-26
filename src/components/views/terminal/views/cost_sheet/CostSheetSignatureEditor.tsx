
'use client';

import React, { useState } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Input } from '@/components/ui/input';
import { PenTool } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useTranslations } from 'next-intl';
const CostSheetSignatureEditor = () => {
  const t = useTranslations('costSheet');
  const { data, updateValue } = useCostSheetStore();
  const signature = data?.signature;
  // P2: Validación inline para campos requeridos de firmas.
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  if (!signature) return null;

  const validateField = (field: string, value: string): string | null => {
    if (!value.trim()) {
      return field === 'prepared_by'
        ? 'El elaborador es obligatorio'
        : 'El aprobador es obligatorio';
    }
    return null;
  };

  const handleChange = (field: string, value: string) => {
    updateValue(['signature', field], value);
    // P2: Si el campo ya fue tocado, re-validar en cada cambio
    if (touched[field]) {
      setErrors(prev => ({ ...prev, [field]: validateField(field, value) }));
    }
  };

  const handleBlur = (field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(prev => ({ ...prev, [field]: validateField(field, value) }));
  };

  return (
    <div className="p-8 bg-card border border-border rounded-3xl shadow-sm animate-in zoom-in-95 duration-500">
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
        {/* P2: Elaborado por — required + validación inline */}
        <div className="space-y-3">
          <label htmlFor="signature-prepared-by" className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 block">
            Elaborado por (Nombre y Cargo)
            <span className="text-destructive ml-0.5 font-black" aria-hidden="true">*</span>
          </label>
          <Input
            id="signature-prepared-by"
            value={signature?.prepared_by || ''}
            onChange={(e) => handleChange('prepared_by', e.target.value)}
            onBlur={(e) => handleBlur('prepared_by', e.target.value)}
            className={cn(
              "w-full h-12 bg-background border rounded-xl px-3 text-lg font-bold focus:ring-1 focus:ring-primary/20 outline-none",
              touched.prepared_by && errors.prepared_by
                ? "border-destructive/60 focus-visible:ring-destructive/30"
                : "border-border"
            )}
            placeholder="Ej: Ing. Juan Pérez - Especialista B en Costos"
            aria-required="true"
            aria-invalid={touched.prepared_by && !!errors.prepared_by || undefined}
          />
          {touched.prepared_by && errors.prepared_by && (
            <p role="alert" className="text-destructive text-xs font-bold flex items-center gap-1">
              <span aria-hidden="true">⚠</span> {errors.prepared_by}
            </p>
          )}
        </div>

        {/* P2: Aprobado por — required + validación inline */}
        <div className="space-y-3">
          <label htmlFor="signature-approved-by" className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 block">
            Aprobado por (Nombre y Cargo)
            <span className="text-destructive ml-0.5 font-black" aria-hidden="true">*</span>
          </label>
          <Input
            id="signature-approved-by"
            value={signature?.approved_by || ''}
            onChange={(e) => handleChange('approved_by', e.target.value)}
            onBlur={(e) => handleBlur('approved_by', e.target.value)}
            className={cn(
              "w-full h-12 bg-background border rounded-xl px-3 text-lg font-bold focus:ring-1 focus:ring-primary/20 outline-none",
              touched.approved_by && errors.approved_by
                ? "border-destructive/60 focus-visible:ring-destructive/30"
                : "border-border"
            )}
            placeholder="Ej: Lic. Ana García - Directora Económica"
            aria-required="true"
            aria-invalid={touched.approved_by && !!errors.approved_by || undefined}
          />
          {touched.approved_by && errors.approved_by && (
            <p role="alert" className="text-destructive text-xs font-bold flex items-center gap-1">
              <span aria-hidden="true">⚠</span> {errors.approved_by}
            </p>
          )}
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
