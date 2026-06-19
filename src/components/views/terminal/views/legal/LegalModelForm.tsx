'use client';

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import {
  FileText, Download, X,
  User, AlertCircle, Plus, Trash2
} from 'lucide-react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { generateLegalPdf } from './LegalPdfExporter';
import { numeroALetras } from '@/lib/utils/number-to-words-es';

interface LegalModelFormProps {
  model: any;
  onCancel: () => void;
}

export default function LegalModelForm({ model, onCancel }: LegalModelFormProps) {
  const prefersReducedMotion = useReducedMotion();
  const { user } = useAuthStore();

  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm<any>({
    defaultValues: {
      conceptos_tabla: [{ concepto: '', importe: 0 }],
      total: 0,
      cantidad_letras: 'CERO'
    }
  });

  const { fields: tableFields, append, remove } = useFieldArray({
    control,
    name: "conceptos_tabla"
  });

  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);

  // useWatch is more reliable for real-time tracking of field arrays
  const watchTable = useWatch({
    control,
    name: "conceptos_tabla"
  });

  // Calculate total and letters in real-time
  const totals = useMemo(() => {
    if (!watchTable || !Array.isArray(watchTable)) return { total: 0, letras: 'CERO' };

    const sum = watchTable.reduce((acc: number, curr: any) => {
      const val = parseFloat(curr?.importe);
      return acc + (isNaN(val) ? 0 : val);
    }, 0);

    return {
      total: sum,
      letras: numeroALetras(sum)
    };
  }, [watchTable]);

  useEffect(() => {
    if (user) {
      setValue('entidad_nombre', 'NOMBRE DE TU ENTIDAD');
      setValue('entidad_codigo', 'COD-001');
    }
    fetchProfiles();
  }, [user, setValue]);

  // Sync totals to form state so they are included in onSubmit data
  useEffect(() => {
    setValue('total', totals.total);
    setValue('cantidad_letras', totals.letras);
  }, [totals, setValue]);

  async function fetchProfiles() {
    // FIX-BUG-LOG-011: Added error handling for Supabase query
    const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true);
    if (error) {
      console.error('Error fetching profiles:', error);
      toast.error('Error al cargar los perfiles de usuario');
      setProfiles([]);
      return;
    }
    setProfiles(data || []);
  }

  const onSubmit = async (formData: any) => {
    try {
      setLoading(true);
      // Ensure we use the most fresh calculated values
      const dataToExport = {
        ...formData,
        total: totals.total,
        cantidad_letras: totals.letras,
        // Ensure numbers are properly typed for the PDF engine
        conceptos_tabla: (formData.conceptos_tabla || []).map((c: any) => ({
          ...c,
          importe: parseFloat(c.importe) || 0
        }))
      };

      await generateLegalPdf(model, dataToExport);
      toast.success('Modelo generado y descargado con éxito');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: any) => {
    const commonClasses = "w-full h-14 bg-background border-2 border-primary/10 rounded-xl px-4 text-sm font-bold focus:outline-none focus:border-primary transition-all uppercase tracking-wider";

    if (field.readonly) {
       let displayValue = '';
       if (field.name === 'total') displayValue = totals.total.toFixed(2);
       else if (field.name === 'cantidad_letras') displayValue = totals.letras;

       return (
         <div className={cn(commonClasses, "flex items-center bg-primary/5 text-primary font-black shadow-inner")}>
           {displayValue || '---'}
         </div>
       );
    }

    switch (field.type) {
      case 'table':
        return (
          <div className="space-y-4">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="min-w-0 sm:min-w-[500px] space-y-4">
                <div className="grid grid-cols-12 gap-4 px-2 mb-2">
                  <div className="col-span-8 text-[10px] font-black uppercase tracking-widest opacity-40">Concepto / Detalle del Cobro</div>
                  <div className="col-span-3 text-[10px] font-black uppercase tracking-widest opacity-40 text-right">Importe ($)</div>
                </div>
                {tableFields.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-12 gap-4 animate-in slide-in-from-left-2 duration-300">
                    <div className="col-span-8">
                      <input
                        {...register(`conceptos_tabla.${index}.concepto` as any, { required: true })}
                        placeholder="Escriba el concepto..."
                        className={cn(commonClasses, "h-12")}
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        step="0.01"
                        {...register(`conceptos_tabla.${index}.importe` as any, { required: true })}
                        placeholder="0.00"
                        className={cn(commonClasses, "h-12 text-right")}
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="w-11 h-11 flex items-center justify-center text-danger hover:bg-danger/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => append({ concepto: '', importe: 0 })}
              className="flex items-center gap-2 px-4 h-11 text-xs font-black text-primary hover:bg-primary/5 rounded-xl transition-all uppercase tracking-widest border-2 border-dashed border-primary/20 hover:border-primary/40"
            >
              <Plus className="w-4 h-4" />
              Añadir Línea de Concepto
            </button>
          </div>
        );
      case 'textarea':
        return (
          <textarea
            {...register(field.name, { required: field.required })}
            className={cn(commonClasses, "h-32 py-4 resize-none")}
            placeholder={field.label.toUpperCase()}
          />
        );
      case 'select':
        return (
          <select
            {...register(field.name, { required: field.required })}
            className={commonClasses}
          >
            <option value="">SELECCIONAR {field.label.toUpperCase()}</option>
            {field.options?.map((opt: string) => (
              <option key={opt} value={opt}>{opt.toUpperCase()}</option>
            ))}
          </select>
        );
      case 'date':
        return <input type="date" {...register(field.name, { required: field.required })} className={commonClasses} />;
      case 'datetime-local':
        return <input type="datetime-local" {...register(field.name, { required: field.required })} className={commonClasses} />;
      case 'number':
        return <input type="number" step="0.01" {...register(field.name, { required: field.required })} className={commonClasses} />;
      default:
        return (
          <div className="relative">
            <input
              type="text"
              {...register(field.name, { required: field.required })}
              className={commonClasses}
              placeholder={field.label.toUpperCase()}
            />
            {field.autocomplete === 'user_fullname' && profiles.length > 0 && (
               <div className="absolute right-4 top-1/2 -translate-y-1/2">
                 <User className="w-4 h-4 text-primary opacity-50" />
               </div>
            )}
          </div>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
      className="bg-background border-2 border-primary/10 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl"
    >
      <div className="p-6 md:p-8 border-b border-primary/5 bg-primary/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <FileText className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{model.code}</div>
            <h2 className="text-xl font-black uppercase tracking-tight">{model.name}</h2>
          </div>
        </div>
        <button type="button"
          onClick={onCancel}
          className="w-10 h-10 rounded-full hover:bg-primary/10 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-6 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {model.fields.map((field: any) => (
            <div key={field.name} className={cn("space-y-2", field.type === 'textarea' || field.type === 'json' || field.type === 'table' ? "md:col-span-2" : "")}>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                {field.label}
                {field.required && <span className="text-danger ml-1">*</span>}
              </label>
              {renderField(field)}
              {errors[field.name] && (
                <div className="flex items-center gap-1 text-danger text-[9px] font-bold uppercase tracking-tighter mt-1">
                  <AlertCircle className="w-3 h-3" />
                  Este campo es obligatorio
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-end gap-4 border-t border-primary/5 pt-8">
          <button
            type="button"
            onClick={onCancel}
            className="px-8 h-14 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-8 h-14 bg-primary text-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            GENERAR Y EXPORTAR PDF
          </button>
        </div>
      </form>
    </motion.div>
  );
}
