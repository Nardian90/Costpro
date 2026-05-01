'use client';

import React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/lib/utils';
import { Role } from '@/types';
import { Loader2, Save, Shield, CheckCircle2 } from 'lucide-react';

const roleFormSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  is_default: z.boolean(),
  permissions: z.object({
    views: z.array(z.string()),
    all: z.boolean(),
  })
});

export type RoleFormData = z.infer<typeof roleFormSchema>;

interface RoleFormProps {
  initialData?: Role | null;
  onSubmit: (data: RoleFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const AVAILABLE_VIEWS = [
  'Dashboard',
  'Inventory',
  'POS',
  'Reports',
  'Users',
  'Costs',
  'Settings'
];

export default function RoleForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: RoleFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      is_default: !!initialData.is_default,
      permissions: {
        views: initialData.permissions?.views || [],
        all: !!initialData.permissions?.all,
      }
    } : {
      name: '',
      is_default: false,
      permissions: {
        views: ['Dashboard'],
        all: false,
      }
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const allSelected = watch('permissions.all');
  const selectedViews = watch('permissions.views');

  const toggleView = (view: string) => {
    if (allSelected) return;
    const current = [...selectedViews];
    const index = current.indexOf(view);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(view);
    }
    setValue('permissions.views', current);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
      <div className="space-y-4">
        <div>
          <label htmlFor="role-name" className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
            Nombre del Rol
          </label>
          <input
            id="role-name"
            {...register('name')}
            className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            placeholder="Ej: Auditor Externo"
          />
          {errors.name && (
            <p className="text-xs text-destructive font-bold uppercase mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-primary/10">
          <input
            type="checkbox"
            id="is_default"
            {...register('is_default')}
            className="w-4 h-4 rounded border-primary/20 text-primary focus:ring-primary"
          />
          <label htmlFor="is_default" className="text-xs font-black uppercase text-primary tracking-widest cursor-pointer">
            Establecer como Rol por Defecto (Para auto-registro)
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase text-foreground tracking-widest">
                Permisos de Acceso
              </span>
            </div>
            <div className="flex items-center gap-2">
               <input
                type="checkbox"
                id="all_perms"
                {...register('permissions.all')}
                className="w-3 h-3 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="all_perms" className="text-xs font-bold uppercase text-muted-foreground tracking-tighter cursor-pointer">
                Acceso Total
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AVAILABLE_VIEWS.map(view => (
              <button
                key={view}
                type="button"
                disabled={allSelected}
                onClick={() => toggleView(view)}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-xl border transition-all text-left",
                  allSelected ? "opacity-50 grayscale cursor-not-allowed bg-muted border-border" :
                  selectedViews.includes(view)
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-background border-border hover:bg-muted"
                )}
              >
                {allSelected || selectedViews.includes(view) ? (
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />
                )}
                <span className="text-xs font-bold uppercase tracking-tighter">{view}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 rounded-xl border border-border hover:bg-muted font-black text-xs uppercase tracking-widest transition-all active:scale-95"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-3 rounded-xl bg-primary text-foreground font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {initialData ? 'Guardar Cambios' : 'Crear Rol'}
        </button>
      </div>
    </form>
  );
}
