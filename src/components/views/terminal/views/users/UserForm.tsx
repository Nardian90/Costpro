'use client';

import React, { useState } from 'react';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/lib/utils';
import { UserContract } from '@/contracts/user';
import { Store, UserRole } from '@/types';
import { Loader2, Save, Plus, Trash2, Building, Users, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BulkStoreAssignModal } from './BulkStoreAssignModal';

const userFormSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse', 'costo'] as const),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
  isActive: z.boolean(),
  plan: z.enum(['basico', 'profesional', 'enterprise']).catch('basico'),
  maxStoresLimit: z.number().min(0).catch(0),
  maxUsersLimit: z.number().min(0).catch(0),
  memberships: z.array(z.object({
    store_id: z.string().min(1, 'Seleccione una tienda'),
    role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse', 'costo'] as const),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').optional().or(z.literal('')),
    status: z.enum(['active', 'revoked'] as const),
  })),
}).refine(data => {
  // Solo validamos el límite de tiendas si el usuario es un encargado y tiene un límite definido > 0
  if (data.role === 'encargado' && data.maxStoresLimit > 0) {
    return data.memberships.length <= data.maxStoresLimit;
  }
  return true;
}, {
  message: "El número de tiendas asignadas excede el límite permitido para este encargado",
  path: ["memberships"]
}).refine(data => {
  // Roles que requieren al menos una tienda
  const rolesQueRequierenTienda = ['encargado', 'clerk', 'warehouse'];
  if (rolesQueRequierenTienda.includes(data.role)) {
    return data.memberships.length > 0;
  }
  return true;
}, {
  message: "Este rol requiere al menos una tienda asignada",
  path: ["memberships"]
});

export type UserFormData = z.output<typeof userFormSchema>;

interface UserFormProps {
  mode: 'create' | 'edit';
  initialData?: UserContract | null;
  stores: Store[];
  onSubmit: (data: UserFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  allowedRoles?: UserRole[];
  isAdmin?: boolean;
}

export default function UserForm({
  mode,
  initialData,
  stores,
  onSubmit,
  onCancel,
  isSubmitting = false,
  allowedRoles,
  isAdmin = false
}: UserFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: initialData ? {
      fullName: initialData.fullName,
      email: initialData.email,
      role: initialData.role,
      isActive: initialData.isActive,
      plan: (initialData as any).plan || 'basico',
      maxStoresLimit: initialData.maxStoresLimit ?? 0,
      maxUsersLimit: initialData.maxUsersLimit ?? 0,
      memberships: initialData.memberships?.map(m => ({
        // Extracción resiliente de store_id (maneja casos donde m.store_id puede ser null pero m.store.id existe)
        store_id: typeof m.store_id === 'string' ? m.store_id : (m as any).store?.id || '',
        role: m.role,
        status: m.status || 'active'
      })) || [],
    } : {
      fullName: '',
      email: '',
      role: 'clerk',
      password: '',
      isActive: true,
      maxStoresLimit: 0,
      maxUsersLimit: 0,
      plan: 'basico',
      memberships: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "memberships"
  });

  // F2-T04: estado del modal de asignación masiva de tiendas.
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  // F5-T05: sheet para memberships en mobile
  const [membershipsSheetOpen, setMembershipsSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  // F2-T04: handler que recibe las tiendas seleccionadas del modal bulk y sincroniza
  // el useFieldArray. Las tiendas nuevas se agregan con rol 'clerk' por defecto;
  // las que ya estaban se preservan con su rol actual; las deseleccionadas se remueven.
  const handleBulkAssign = (selectedStoreIds: string[]) => {
    const currentMembershipStoreIds = fields.map(f => (f as any).store_id);
    // Identificar tiendas a remover (estaban en fields pero no en selectedStoreIds)
    const toRemove: number[] = [];
    currentMembershipStoreIds.forEach((sid, idx) => {
      if (sid && !selectedStoreIds.includes(sid)) {
        toRemove.push(idx);
      }
    });
    // Remover de atrás hacia adelante para no romper índices
    toRemove.reverse().forEach(idx => remove(idx));

    // Identificar tiendas a agregar (en selectedStoreIds pero no en currentMembershipStoreIds)
    const toAdd = selectedStoreIds.filter(sid => !currentMembershipStoreIds.includes(sid));
    toAdd.forEach(sid => {
      append({
        store_id: sid,
        role: 'clerk', // rol por defecto — editable en la tabla inferior
        password: '',
        status: 'active',
      });
    });
    setBulkAssignOpen(false);
  };

   
  const selectedRole = watch('role');
  const maxStoresLimit = watch('maxStoresLimit');
  const canAddMoreStores = selectedRole === 'encargado'
    ? fields.length < (maxStoresLimit || 1)
    : true;

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 overflow-x-auto no-scrollbar">
      <div className="space-y-4">
        <div>
          <label htmlFor="user-fullname" className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
            Nombre Completo
          </label>
          <input
            id="user-fullname"
            {...register('fullName')}
            className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            placeholder="Ej: Juan Pérez"
          />
          {errors.fullName && (
            <p className="text-xs text-destructive font-bold uppercase mt-1">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="user-email" className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
            Correo Electrónico
          </label>
          <input
            id="user-email"
            {...register('email')}
            type="email"
            readOnly={mode === 'edit'}
            className={cn(
              "w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all",
              mode === 'edit' && "bg-muted cursor-not-allowed opacity-70"
            )}
            placeholder="juan@costpro.com"
          />
          {errors.email && (
            <p className="text-xs text-destructive font-bold uppercase mt-1">{errors.email.message}</p>
          )}
        </div>

        {mode === 'create' && (
          <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
             <label htmlFor="user-password" className="text-xs font-black uppercase text-primary tracking-widest mb-1.5 block">
              Asignar Contraseña (Opcional)
            </label>
            <input
              id="user-password"
              {...register('password')}
              type="password"
              placeholder="Dejar en blanco para enviar correo de recuperación"
              className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              * Si no asignas una contraseña, el usuario recibirá un correo para definirla.
            </p>
            {errors.password && (
              <p className="text-xs text-destructive font-bold uppercase mt-1">{errors.password.message}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="user-role" className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
              Rol de Usuario
            </label>
            <select
              id="user-role"
              {...register('role')}
              className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none cursor-pointer"
            >
              {(!allowedRoles || allowedRoles.includes('admin')) && <option value="admin">Administrador</option>}
              {(!allowedRoles || allowedRoles.includes('encargado')) && <option value="encargado">Encargado</option>}
              {(!allowedRoles || allowedRoles.includes('manager')) && <option value="manager">Gestor</option>}
              {(!allowedRoles || allowedRoles.includes('clerk')) && <option value="clerk">Cajero</option>}
              {(!allowedRoles || allowedRoles.includes('warehouse')) && <option value="warehouse">Almacén</option>}
              {(!allowedRoles || allowedRoles.includes('usuario')) && <option value="usuario">Usuario</option>}
              {(!allowedRoles || allowedRoles.includes('costo')) && <option value="costo">Costo</option>}
            </select>
          </div>

          <div>
            <label htmlFor="user-status" className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-1.5 block">
              Estado
            </label>
            <select
              id="user-status"
              {...register('isActive', { setValueAs: (v) => v === 'true' || v === true })}
              className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
        </div>

        {isAdmin && selectedRole === 'encargado' && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
            <div>
              <label htmlFor="user-max-stores" className="text-xs font-black uppercase text-primary tracking-widest mb-1.5 block">
                Límite de Tiendas
              </label>
              <input
                id="user-max-stores"
                {...register('maxStoresLimit', { valueAsNumber: true })}
                type="number"
                inputMode="numeric"
                min="1"
                className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              />
              {errors.maxStoresLimit && (
                <p className="text-xs text-destructive font-bold uppercase mt-1">{errors.maxStoresLimit.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="user-max-users" className="text-xs font-black uppercase text-primary tracking-widest mb-1.5 block">
                Límite de Usuarios
              </label>
              <input
                id="user-max-users"
                {...register('maxUsersLimit', { valueAsNumber: true })}
                type="number"
                inputMode="numeric"
                min="0"
                className="w-full p-3 rounded-xl border border-border bg-background font-bold text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              />
              {errors.maxUsersLimit && (
                <p className="text-xs text-destructive font-bold uppercase mt-1">{errors.maxUsersLimit.message}</p>
              )}
            </div>
            <p className="col-span-2 text-xs text-muted-foreground font-medium italic">
              * Estas capacidades definen cuántos recursos puede gestionar el usuario si tiene rol de Encargado.
            </p>
          </div>
        )}

        {/* Plan y Límites — solo admin puede cambiar */}
        {isAdmin && (
          <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
            <label className="text-xs font-black uppercase text-amber-600 dark:text-amber-400 tracking-widest mb-2 block">
              Plan del usuario
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'basico', label: 'Básico', limit: 1, color: 'text-muted-foreground' },
                { id: 'profesional', label: 'Profesional', limit: 3, color: 'text-primary' },
                { id: 'enterprise', label: 'Enterprise', limit: 10, color: 'text-amber-500' },
              ] as const).map(p => {
                const currentPlan = watch('plan');
                const isSelected = currentPlan === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setValue('plan', p.id)}
                    className={cn(
                      'p-3 rounded-xl border-2 text-center transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    <p className={cn('text-sm font-black', isSelected ? 'text-primary' : p.color)}>{p.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.limit} tiendas</p>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2 italic">
              El plan determina cuántas tiendas puede crear este usuario. Básico: 1, Profesional: 3, Enterprise: 10.
            </p>
          </div>
        )}
      </div>

      {/* Tiendas Asignadas */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="text-xs font-black uppercase text-primary tracking-widest block">
            Tiendas Asignadas (Multi-Tienda)
          </span>
          <div className="flex items-center gap-2">
            {/* F2-T04: botón de asignación masiva con checkboxes.
                Reemplaza el flujo one-by-one para despliegues con múltiples tiendas. */}
            <button
              type="button"
              onClick={() => setBulkAssignOpen(true)}
              className={cn(
                "flex items-center gap-1 px-4 h-11 rounded-lg transition-all text-xs font-black uppercase",
                stores.length > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
              )}
              disabled={stores.length === 0}
              title="Asignar múltiples tiendas con checkboxes"
            >
              <Users className="w-3 h-3" />
              Asignar Tiendas
            </button>
            {/* Botón "Añadir Tienda" one-by-one (mantenido para edición granular) */}
            <button
              type="button"
              disabled={!canAddMoreStores}
              onClick={() => append({ store_id: '', role: 'clerk',
        password: '', status: 'active' })}
              className={cn(
                "flex items-center gap-1 px-4 h-11 rounded-lg transition-all text-xs font-black uppercase",
                canAddMoreStores
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
              )}
              title={!canAddMoreStores ? `Límite de ${maxStoresLimit} tiendas alcanzado` : "Añadir Tienda individual"}
            >
              <Plus className="w-3 h-3" />
              Añadir
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {errors.memberships?.root && (
            <p className="p-2 rounded-lg bg-destructive/10 text-destructive text-xs font-bold uppercase text-center border border-destructive/20 animate-pulse">
              {errors.memberships.root.message}
            </p>
          )}
          {errors.memberships?.message && !errors.memberships?.root && (
            <p className="p-2 rounded-lg bg-destructive/10 text-destructive text-xs font-bold uppercase text-center border border-destructive/20 animate-pulse">
              {errors.memberships.message}
            </p>
          )}

          {/* F5-T05: En mobile, colapsar memberships en un botón que abre bottom sheet.
              En desktop, mostrar las filas inline como antes. */}
          {isMobile ? (
            /* Mobile: botón "Ver N membresías" que abre sheet */
            <>
              <button
                type="button"
                onClick={() => setMembershipsSheetOpen(true)}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {fields.length === 0 ? 'Sin tiendas asignadas' : `${fields.length} tienda${fields.length === 1 ? '' : 's'} asignada${fields.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

              {/* Bottom sheet con memberships scrollable — sin superposiciones */}
              <Sheet open={membershipsSheetOpen} onOpenChange={setMembershipsSheetOpen}>
                <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="text-sm font-black uppercase tracking-widest text-primary">
                      Tiendas Asignadas ({fields.length})
                    </SheetTitle>
                  </SheetHeader>
                  <div className="space-y-3 px-4 pb-6">
                    {fields.length === 0 ? (
                      <div className="text-center py-6">
                        <Building className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Sin tiendas asignadas</p>
                      </div>
                    ) : (
                      fields.map((field, index) => (
                        <div key={field.id} className="flex flex-col gap-3 bg-muted/20 p-3 rounded-xl border border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Tienda {index + 1}</span>
                            <button
                              type="button"
                              onClick={() => remove(index)}
                              className="w-9 h-9 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground transition-all"
                              title="Eliminar tienda"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {/* Tienda selector — full width en mobile */}
                          <select
                            {...register(`memberships.${index}.store_id` as const)}
                            className="w-full p-3 rounded-lg border bg-background font-bold text-xs outline-none"
                          >
                            <option value="">Seleccione tienda</option>
                            {stores.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          {/* Rol + Status en grid 2 columnas */}
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              {...register(`memberships.${index}.role` as const)}
                              className="w-full p-3 rounded-lg border border-border bg-background font-bold text-xs outline-none"
                            >
                              {(!allowedRoles || allowedRoles.includes('admin')) && <option value="admin">Admin</option>}
                              {(!allowedRoles || allowedRoles.includes('encargado')) && <option value="encargado">Encargado</option>}
                              {(!allowedRoles || allowedRoles.includes('manager')) && <option value="manager">Gestor</option>}
                              {(!allowedRoles || allowedRoles.includes('clerk')) && <option value="clerk">Cajero</option>}
                              {(!allowedRoles || allowedRoles.includes('warehouse')) && <option value="warehouse">Almacén</option>}
                              {(!allowedRoles || allowedRoles.includes('usuario')) && <option value="usuario">Usuario</option>}
                              {(!allowedRoles || allowedRoles.includes('costo')) && <option value="costo">Costo</option>}
                            </select>
                            <select
                              {...register(`memberships.${index}.status` as const)}
                              className="w-full p-3 rounded-lg border border-border bg-background font-bold text-xs outline-none"
                            >
                              <option value="active">Activo</option>
                              <option value="revoked">Revocado</option>
                            </select>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            /* Desktop: filas inline como antes */
            <>
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-col sm:flex-row gap-4 sm:gap-2 items-stretch sm:items-end bg-muted/20 p-4 sm:p-3 rounded-xl border border-border/50 relative group">
              <div className="flex-1 space-y-2">
                 <label htmlFor={`membership-${index}-store`} className="text-xs font-black uppercase text-muted-foreground tracking-widest block">Tienda</label>
                 <select
                  id={`membership-${index}-store`}
                  {...register(`memberships.${index}.store_id` as const)}
                  className={cn(
                    "w-full p-3.5 rounded-lg border bg-background font-bold text-xs outline-none transition-all",
                    errors.memberships?.[index]?.store_id ? "border-destructive ring-1 ring-destructive/20" : "border-border"
                  )}
                >
                  <option value="">Seleccione tienda</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {errors.memberships?.[index]?.store_id && (
                  <p className="text-xs text-destructive font-bold uppercase mt-1 animate-pulse">
                    {errors.memberships[index].store_id.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2">
                <div className="flex-1 sm:w-24 space-y-2">
                  <label htmlFor={`membership-${index}-role`} className="text-xs font-black uppercase text-muted-foreground tracking-widest block">Rol</label>
                  <select
                    id={`membership-${index}-role`}
                    {...register(`memberships.${index}.role` as const)}
                    className="w-full p-3.5 rounded-lg border border-border bg-background font-bold text-xs outline-none"
                  >
                    {(!allowedRoles || allowedRoles.includes('admin')) && <option value="admin">Admin</option>}
                    {(!allowedRoles || allowedRoles.includes('encargado')) && <option value="encargado">Encargado</option>}
                    {(!allowedRoles || allowedRoles.includes('manager')) && <option value="manager">Gestor</option>}
                    {(!allowedRoles || allowedRoles.includes('clerk')) && <option value="clerk">Cajero</option>}
                    {(!allowedRoles || allowedRoles.includes('warehouse')) && <option value="warehouse">Almacén</option>}
                    {(!allowedRoles || allowedRoles.includes('usuario')) && <option value="usuario">Usuario</option>}
              {(!allowedRoles || allowedRoles.includes('costo')) && <option value="costo">Costo</option>}
                  </select>
                </div>
                <div className="flex-1 sm:w-24 space-y-2">
                   <label htmlFor={`membership-${index}-status`} className="text-xs font-black uppercase text-muted-foreground tracking-widest block">Estado</label>
                   <select
                    id={`membership-${index}-status`}
                    {...register(`memberships.${index}.status` as const)}
                    className="w-full p-3.5 rounded-lg border border-border bg-background font-bold text-xs outline-none"
                  >
                    <option value="active">Activo</option>
                    <option value="revoked">Revocado</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                className="absolute top-2 right-2 sm:relative sm:top-0 sm:right-0 w-11 h-11 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-foreground transition-all mb-0.5"
                title="Eliminar tienda"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {fields.length === 0 && (
            <div className="text-center py-6 border-2 border-dashed border-border rounded-xl">
               <Building className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
               <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Sin tiendas asignadas</p>
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {isSubmitted && Object.keys(errors).length > 0 && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
           <p className="text-xs text-destructive font-black uppercase tracking-widest text-center">
             Hay errores en el formulario. Por favor, revisa los campos marcados.
           </p>
        </div>
      )}

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
          className="flex-1 px-4 py-3 rounded-xl bg-primary text-foreground font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {mode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
        </button>
      </div>
    </form>

    {/* F2-T04: Modal de asignación masiva de tiendas.
        Reemplaza el flujo one-by-one para despliegues con múltiples tiendas.
        Las tiendas ya asignadas aparecen pre-seleccionadas. */}
    <BulkStoreAssignModal
      isOpen={bulkAssignOpen}
      onClose={() => setBulkAssignOpen(false)}
      stores={stores}
      selectedStoreIds={fields.map(f => (f as any).store_id).filter(Boolean)}
      onConfirm={handleBulkAssign}
    />
    </>
  );
}
