'use client';

import React from 'react';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserContract } from '@/contracts/user';
import { Store, UserRole } from '@/types';
import { Loader2, Save, Plus, Trash2, Building } from 'lucide-react';

const userFormSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse'] as const),
  isActive: z.boolean(),
  memberships: z.array(z.object({
    store_id: z.string().uuid('Seleccione una tienda'),
    role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse'] as const),
    status: z.enum(['active', 'revoked'] as const),
  })),
});

export type UserFormData = z.infer<typeof userFormSchema>;

interface UserFormProps {
  mode: 'create' | 'edit';
  initialData?: UserContract | null;
  stores: Store[];
  onSubmit: (data: UserFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  allowedRoles?: UserRole[];
}

export default function UserForm({
  mode,
  initialData,
  stores,
  onSubmit,
  onCancel,
  isSubmitting = false,
  allowedRoles
}: UserFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: initialData ? {
      fullName: initialData.fullName,
      email: initialData.email,
      role: initialData.role,
      isActive: initialData.isActive,
      memberships: initialData.memberships?.map(m => ({
        store_id: m.store_id || '',
        role: m.role,
        status: m.status || 'active'
      })) || [],
    } : {
      fullName: '',
      email: '',
      role: 'clerk',
      isActive: true,
      memberships: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "memberships"
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
            Nombre Completo
          </label>
          <input
            {...register('fullName')}
            className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            placeholder="Ej: Juan Pérez"
          />
          {errors.fullName && (
            <p className="text-[10px] text-destructive font-bold uppercase mt-1">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
            Correo Electrónico
          </label>
          <input
            {...register('email')}
            type="email"
            disabled={mode === 'edit'}
            className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-50"
            placeholder="juan@costpro.com"
          />
          {errors.email && (
            <p className="text-[10px] text-destructive font-bold uppercase mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
              Rol de Usuario
            </label>
            <select
              {...register('role')}
              className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none cursor-pointer"
            >
              {(!allowedRoles || allowedRoles.includes('admin')) && <option value="admin">Administrador</option>}
              {(!allowedRoles || allowedRoles.includes('encargado')) && <option value="encargado">Encargado</option>}
              {(!allowedRoles || allowedRoles.includes('manager')) && <option value="manager">Gestor</option>}
              {(!allowedRoles || allowedRoles.includes('clerk')) && <option value="clerk">Cajero</option>}
              {(!allowedRoles || allowedRoles.includes('warehouse')) && <option value="warehouse">Almacén</option>}
              {(!allowedRoles || allowedRoles.includes('usuario')) && <option value="usuario">Usuario</option>}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
              Estado
            </label>
            <select
              {...register('isActive', { setValueAs: (v) => v === 'true' || v === true })}
              className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tiendas Asignadas */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-4">
          <label className="text-[10px] font-black uppercase text-primary tracking-widest block">
            Tiendas Asignadas (Multi-Tienda)
          </label>
          <button
            type="button"
            onClick={() => append({ store_id: '', role: 'clerk', status: 'active' })}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-black uppercase hover:bg-primary/20 transition-all"
          >
            <Plus className="w-3 h-3" />
            Añadir Tienda
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-col sm:flex-row gap-4 sm:gap-2 items-stretch sm:items-end bg-muted/20 p-4 sm:p-3 rounded-xl border border-border/50 relative group">
              <div className="flex-1 space-y-2">
                 <label className="text-[8px] font-black uppercase text-muted-foreground tracking-widest block">Tienda</label>
                 <select
                  {...register(`memberships.${index}.store_id` as const)}
                  className="w-full p-2.5 sm:p-2 rounded-lg border border-border bg-background font-bold text-xs outline-none"
                >
                  <option value="">Seleccione tienda</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2">
                <div className="flex-1 sm:w-24 space-y-2">
                  <label className="text-[8px] font-black uppercase text-muted-foreground tracking-widest block">Rol</label>
                  <select
                    {...register(`memberships.${index}.role` as const)}
                    className="w-full p-2.5 sm:p-2 rounded-lg border border-border bg-background font-bold text-xs outline-none"
                  >
                    {(!allowedRoles || allowedRoles.includes('admin')) && <option value="admin">Admin</option>}
                    {(!allowedRoles || allowedRoles.includes('encargado')) && <option value="encargado">Encargado</option>}
                    {(!allowedRoles || allowedRoles.includes('manager')) && <option value="manager">Gestor</option>}
                    {(!allowedRoles || allowedRoles.includes('clerk')) && <option value="clerk">Cajero</option>}
                    {(!allowedRoles || allowedRoles.includes('warehouse')) && <option value="warehouse">Almacén</option>}
                    {(!allowedRoles || allowedRoles.includes('usuario')) && <option value="usuario">Usuario</option>}
                  </select>
                </div>
                <div className="flex-1 sm:w-24 space-y-2">
                   <label className="text-[8px] font-black uppercase text-muted-foreground tracking-widest block">Estado</label>
                   <select
                    {...register(`memberships.${index}.status` as const)}
                    className="w-full p-2.5 sm:p-2 rounded-lg border border-border bg-background font-bold text-xs outline-none"
                  >
                    <option value="active">Activo</option>
                    <option value="revoked">Revocado</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                className="absolute top-2 right-2 sm:relative sm:top-0 sm:right-0 p-2.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all mb-0.5"
                title="Eliminar tienda"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {fields.length === 0 && (
            <div className="text-center py-6 border-2 border-dashed border-border rounded-xl">
               <Building className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
               <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sin tiendas asignadas</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
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
          className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {mode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  );
}
