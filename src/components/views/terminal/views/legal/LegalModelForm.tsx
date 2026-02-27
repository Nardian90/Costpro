'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  FileText, Download, X,
  User, AlertCircle
} from 'lucide-react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { generateLegalPdf } from './LegalPdfExporter';

interface LegalModelFormProps {
  model: any;
  onCancel: () => void;
}

export default function LegalModelForm({ model, onCancel }: LegalModelFormProps) {
  const { user } = useAuthStore();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      setValue('entidad_nombre', 'NOMBRE DE TU ENTIDAD');
      setValue('entidad_codigo', 'COD-001');
    }
    fetchProfiles();
  }, [user, setValue]);

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('id, full_name').eq('is_active', true);
    setProfiles(data || []);
  }

  const onSubmit = async (data: any) => {
    try {
      setLoading(true);
      await generateLegalPdf(model, data);
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

    switch (field.type) {
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
      case 'json':
        return (
          <div className="p-4 bg-primary/5 rounded-xl border-2 border-dashed border-primary/20">
            <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-2">Editor de Tabla / JSON</p>
            <textarea
              {...register(field.name)}
              className={cn(commonClasses, "h-24 py-4 font-mono text-xs")}
              placeholder="INGRESA LOS DATOS EN FORMATO TEXTO O LISTA..."
            />
          </div>
        );
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
      animate={{ opacity: 1, y: 0 }}
      className="bg-background border-2 border-primary/10 rounded-3xl overflow-hidden shadow-2xl"
    >
      <div className="p-8 border-b border-primary/5 bg-primary/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{model.code}</div>
            <h2 className="text-xl font-black uppercase tracking-tight">{model.name}</h2>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="w-10 h-10 rounded-full hover:bg-primary/10 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {model.fields.map((field: any) => (
            <div key={field.name} className={cn("space-y-2", field.type === 'textarea' || field.type === 'json' ? "md:col-span-2" : "")}>
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

        <div className="mt-12 flex items-center justify-end gap-4 border-t border-primary/5 pt-8">
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
            className="px-8 h-14 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all flex items-center gap-3"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
