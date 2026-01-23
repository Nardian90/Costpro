'use client';

import React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserContract } from '@/contracts/user';
import { Loader2, Save } from 'lucide-react';

const userFormSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse'] as const),
  isActive: z.boolean(),
});

export type UserFormData = z.infer<typeof userFormSchema>;

interface UserFormProps {
  mode: 'create' | 'edit';
  initialData?: UserContract | null;
  onSubmit: (data: UserFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function UserForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false
}: UserFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: initialData ? {
      fullName: initialData.fullName,
      email: initialData.email,
      role: initialData.role,
      isActive: initialData.isActive,
    } : {
      fullName: '',
      email: '',
      role: 'clerk',
      isActive: true,
    },
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
              <option value="admin">Administrador</option>
              <option value="encargado">Encargado</option>
              <option value="manager">Gestor</option>
              <option value="clerk">Cajero</option>
              <option value="warehouse">Almacén</option>
              <option value="usuario">Usuario</option>
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
