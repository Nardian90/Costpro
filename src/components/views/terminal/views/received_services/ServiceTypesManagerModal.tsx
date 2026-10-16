'use client';

import React, { useState } from 'react';
import { Plus, Settings2, Pencil, Power, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import type { ServiceType } from '@/hooks/useServiceTypes';

/**
 * ServiceTypesManagerModal — gestión del catálogo de tipos de servicio.
 *
 * MISIÓN 2026-10-15 (F2.2/F2.3): acceso «Gestionar tipos de servicio» desde
 * el formulario Nuevo Servicio Recibido. Permite agregar, editar y
 * desactivar tipos de la fuente oficial (tabla service_types, catálogo
 * GLOBAL) sin tocar código fuente.
 *
 * Reglas de integridad implementadas:
 *  · Nombre obligatorio, trim y colapso de espacios.
 *  · Duplicados rechazados (comparación case/espacio-insensitive; la defensa
 *    definitiva es server-side + índice único parcial en BD).
 *  · Longitud ≤80 y sin caracteres de control; mensajes de error claros.
 *  · Doble envío bloqueado (flag submitting + botón deshabilitado).
 *  · Éxito solo tras confirmación de persistencia (respuesta del servidor).
 *  · Tras crear: el padre actualiza el selector y preselecciona el nuevo tipo
 *    (onTypeCreated) — sin cerrar la operación en curso.
 *  · Sin borrado físico: desactivación; el historial conserva el nombre
 *    con el que cada servicio fue creado (snapshot service_type_name).
 *  · Desactivar un tipo EN USO advierte sus consecuencias antes de aplicar.
 *  · Fallo de red: el modal permanece abierto con los datos intactos.
 *
 * Permisos: la escritura exige rol global 'admin' o 'encargado' (server-side,
 * orden del negocio 2026-10-17). En la UI, los usuarios sin esos roles ven
 * el catálogo en modo lectura (SR-11). El gate es sobre profiles.role —
 * NUNCA sobre membresías por tienda (doctrina del catálogo GLOBAL).
 */

interface ServiceTypesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  types: ServiceType[];
  loading: boolean;
  onRefresh: () => void;
  /** Notifica al formulario creador que un tipo nuevo quedó disponible (preselección). */
  onTypeCreated?: (type: ServiceType) => void;
  /** FIX SUPERADMIN-TIPOS: error de carga del hook (p. ej. 401) — un error de
   *  red/autenticación NO es un catálogo vacío y no debe presentarse como tal. */
  loadError?: string | null;
}

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; target: ServiceType };

export function ServiceTypesManagerModal({
  isOpen, onClose, types, loading, onRefresh, onTypeCreated, loadError,
}: ServiceTypesManagerModalProps) {
  const { user, token } = useAuthStore();
  // ENC-SRV (2026-10-17): alineado con el gate server-side del route —
  // admin global o encargado global gestionan el catálogo; el resto, lectura.
  const canManageCatalog = user?.role === 'admin' || user?.role === 'encargado';

  /**
   * FIX SUPERADMIN-TIPOS (2026-10-17): el fetch crudo sin Authorization daba
   * 401 en POST/PATCH (getServerSession SEC-024 es fail-closed, SOLO Bearer)
   * → «Se requiere sesión activa» al crear/editar/desactivar pese a ser admin.
   * Patrón canónico de la app (useUsers/useOfertas): Bearer del auth store.
   */
  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const resetForm = () => {
    setFormMode({ kind: 'closed' });
    setName(''); setDescription(''); setFieldError(null);
  };

  const openCreate = () => {
    setFormMode({ kind: 'create' });
    setName(''); setDescription(''); setFieldError(null);
  };

  const openEdit = (t: ServiceType) => {
    setFormMode({ kind: 'edit', target: t });
    setName(t.name); setDescription(t.description || ''); setFieldError(null);
  };

  /** Validación local (la misma semántica que aplica el servidor). */
  const validate = (rawName: string): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) return 'El nombre del tipo es obligatorio.';
    if (trimmed.length > 80) return 'El nombre no puede superar 80 caracteres.';
    if (/[\u0000-\u001F\u007F]/.test(trimmed)) return 'El nombre contiene caracteres no válidos.';
    const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
    const duplicate = types.some(t =>
      t.name.replace(/\s+/g, ' ').trim().toLowerCase() === normalized &&
      !(formMode.kind === 'edit' && formMode.target.id === t.id),
    );
    if (duplicate) return `Ya existe un tipo de servicio «${trimmed}» en el catálogo.`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // doble envío bloqueado
    const validationError = validate(name);
    if (validationError) { setFieldError(validationError); return; }

    setSubmitting(true);
    setFieldError(null);
    try {
      const isEdit = formMode.kind === 'edit';
      const cleanName = name.trim().replace(/\s+/g, ' ');
      const res = await fetch('/api/service-types', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(
          isEdit
            ? { id: formMode.target.id, name: cleanName, description: description.trim() || null }
            : { name: cleanName, description: description.trim() || null },
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // El modal permanece abierto y el formulario conserva los datos.
        throw new Error(json?.error || 'No se pudo guardar el tipo de servicio.');
      }
      const saved: ServiceType = json.data;
      toast.success(isEdit ? 'Tipo actualizado correctamente' : `Tipo «${saved.name}» creado correctamente`);
      resetForm();
      onRefresh(); // fuente de verdad: recargar del servidor
      if (!isEdit && onTypeCreated && saved) onTypeCreated(saved);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de conexión al guardar.';
      setFieldError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (t: ServiceType) => {
    if (busyId) return;
    const deactivating = t.is_active;
    const usage = t.usage_count ?? 0;
    if (deactivating) {
      const consequence = usage > 0
        ? `«${t.name}» está asociado a ${usage} servicio(s) registrado(s).\n\nConsecuencias: el historial NO se pierde ni se altera (seguirá mostrando este tipo tal como fue creado), pero NO estará disponible para nuevos servicios recibidos.`
        : `«${t.name}» no tiene servicios asociados. Dejará de ofrecerse para nuevos servicios y podrás reactivarlo cuando quieras.`;
      if (!window.confirm(`¿Desactivar el tipo de servicio?\n\n${consequence}`)) return;
    }
    setBusyId(t.id);
    try {
      const res = await fetch('/api/service-types', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: t.id, is_active: !deactivating }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'No se pudo cambiar el estado del tipo.');
      toast.success(deactivating ? 'Tipo desactivado' : 'Tipo reactivado');
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={<span className="flex items-center gap-2"><Settings2 className="w-5 h-5" /> Gestionar tipos de servicio</span>}
      description={
        canManageCatalog
          ? 'Catálogo compartido por todas las tiendas. Agrega, edita o desactiva tipos; el historial siempre conserva el tipo con el que cada servicio fue creado.'
          : 'Catálogo compartido por todas las tiendas. Solo un administrador o encargado puede modificarlo (consulta de lectura).'
      }
      maxWidth="sm:max-w-xl"
      aria-label="Gestión de tipos de servicio"
    >
      <div className="space-y-4">
        {/* Acción crear — admin global o encargado global (ENC-SRV) */}
        {canManageCatalog && formMode.kind === 'closed' && (
          <Button
            type="button"
            onClick={openCreate}
            className="h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs gap-2 w-full"
          >
            <Plus className="w-4 h-4" />
            Agregar nuevo tipo
          </Button>
        )}

        {/* Formulario crear/editar */}
        {formMode.kind !== 'closed' && (
          <form onSubmit={handleSubmit} className="rounded-xl border border-primary/25 bg-primary/[0.03] p-3 sm:p-4 space-y-3" noValidate>
            <p className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-2">
              {formMode.kind === 'edit' ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {formMode.kind === 'edit' ? `Editar «${formMode.target.name}»` : 'Nuevo tipo de servicio'}
            </p>
            <div>
              <label htmlFor="service-type-name" className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                Nombre del tipo <span aria-hidden="true">*</span>
              </label>
              <input
                id="service-type-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); if (fieldError) setFieldError(null); }}
                maxLength={90}
                disabled={submitting}
                aria-required="true"
                aria-invalid={!!fieldError}
                aria-describedby={fieldError ? 'service-type-error' : undefined}
                className={cn(
                  'w-full h-11 px-3 rounded-xl border bg-background text-sm font-medium min-h-[44px]',
                  fieldError ? 'border-destructive' : 'border-border',
                )}
                placeholder="Ej: Montaje y embalaje"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="service-type-desc" className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">
                Descripción (opcional)
              </label>
              <input
                id="service-type-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={320}
                disabled={submitting}
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm min-h-[44px]"
                placeholder="Para qué se usa este tipo"
              />
            </div>
            {fieldError && (
              <p id="service-type-error" role="alert" className="text-xs font-bold text-destructive">{fieldError}</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={resetForm} disabled={submitting} className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs">
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !name.trim()} className="flex-1 h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs gap-2">
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {submitting ? 'Guardando…' : formMode.kind === 'edit' ? 'Guardar cambios' : 'Crear tipo'}
              </Button>
            </div>
          </form>
        )}

        {/* Listado del catálogo */}
        <div className="rounded-xl border border-border overflow-hidden" data-testid="service-types-list">
          {loading ? (
            <p className="text-xs text-center py-6 text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando catálogo…
            </p>
          ) : loadError ? (
            <p className="text-xs text-center py-6 text-destructive font-bold flex items-center justify-center gap-2" role="alert">
              {loadError}
            </p>
          ) : types.length === 0 ? (
            <p className="text-xs text-center py-6 text-muted-foreground">
              El catálogo está vacío. {canManageCatalog ? 'Agrega el primer tipo de servicio.' : 'Contacta a un administrador.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/50 max-h-[320px] overflow-y-auto">
              {types.map((t) => {
                const usage = t.usage_count ?? 0;
                const busy = busyId === t.id;
                return (
                  <li key={t.id} className="px-3 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold flex items-center gap-2">
                        <span className={cn(!t.is_active && 'text-muted-foreground line-through')}>{t.name}</span>
                        {!t.is_active && (
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-black uppercase tracking-widest">Inactivo</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {t.code} · {usage === 0 ? 'Sin servicios asociados' : `${usage} servicio(s) registrado(s)`}
                        {t.description ? ` · ${t.description}` : ''}
                      </p>
                    </div>
                    {canManageCatalog && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          disabled={busy || formMode.kind !== 'closed'}
                          className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors min-h-[44px] min-w-[44px] disabled:opacity-40"
                          aria-label={`Editar tipo ${t.name}`}
                          title="Editar nombre y descripción (el historial conserva el tipo original)"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(t)}
                          disabled={busy || formMode.kind !== 'closed'}
                          className={cn(
                            'p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] disabled:opacity-40',
                            t.is_active ? 'hover:bg-amber-500/10 text-amber-500' : 'hover:bg-success/10 text-success',
                          )}
                          aria-label={t.is_active ? `Desactivar tipo ${t.name}` : `Reactivar tipo ${t.name}`}
                          title={t.is_active ? 'Desactivar (el historial no se pierde)' : 'Reactivar para nuevos servicios'}
                        >
                          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : t.is_active ? <Power className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 min-h-[44px] rounded-xl border border-border/40 text-xs font-black uppercase tracking-widest hover:bg-muted transition-colors"
        >
          Cerrar
        </button>
      </div>
    </BaseModal>
  );
}
