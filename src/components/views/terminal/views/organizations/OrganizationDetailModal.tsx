'use client';

/**
 * Detalle de organización (misión FASE 1 §4).
 *
 * Tabs internos: Resumen / Tiendas / Usuarios / Configuración.
 *  · Resumen: identidad, estado y recuentos reales.
 *  · Tiendas: las que pertenecen a la organización (reutiliza el modelo
 *    existente; el enlace lleva a la gestión de tiendas ya existente).
 *  · Usuarios: asignados a la empresa con su rol.
 *  · Configuración: datos editables soportados (nombre / estado).
 *
 * No duplica la gestión de tiendas: enlista y enlaza. No inventa actividad
 * («Actividad» solo existiría con registro de auditoría aplicable; la
 * auditoría de reasignaciones se consulta desde SISTEMA → Auditoría).
 */
import React, { useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Edit, Building2, Users, Store, Settings, AlertTriangle } from 'lucide-react';
import { useOrganizationDetail } from '@/hooks/api/useOrganizations';

interface OrganizationDetailModalProps {
  orgId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (org: { id: string; name: string; is_active: boolean }) => void;
}

type Tab = 'resumen' | 'tiendas' | 'usuarios' | 'configuracion';

export function OrganizationDetailModal({ orgId, onOpenChange, onEdit }: OrganizationDetailModalProps) {
  const [tab, setTab] = useState<Tab>('resumen');
  const { data, isLoading, isError, error } = useOrganizationDetail(orgId);

  const org = data?.organization;
  const stores = data?.stores || [];
  const users = data?.users || [];

  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'resumen', label: 'Resumen', icon: Building2 },
    { id: 'tiendas', label: `Tiendas (${stores.length})`, icon: Store },
    { id: 'usuarios', label: `Usuarios (${users.length})`, icon: Users },
    { id: 'configuracion', label: 'Configuración', icon: Settings },
  ];

  return (
    <BaseModal
      open={!!orgId}
      onOpenChange={onOpenChange}
      title={org ? org.name : 'Detalle de organización'}
      description={org ? `Empresa con ${stores.length} tienda(s) y ${users.length} usuario(s) asignados.` : 'Cargando detalle…'}
      maxWidth="sm:max-w-3xl"
      footer={
        org ? (
          <div className="flex justify-between w-full">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="uppercase text-xs font-black tracking-widest">
              Cerrar
            </Button>
            <Button size="sm" onClick={() => onEdit({ id: org.id, name: org.name, is_active: org.is_active })} className="uppercase text-xs font-black tracking-widest gap-2">
              <Edit className="w-3.5 h-3.5" aria-hidden="true" />
              Editar
            </Button>
          </div>
        ) : null
      }
    >
      <div className="py-2">
        {/* Tabs internos (patrón del producto: pestañas internas en modal) */}
        <div role="tablist" aria-label="Secciones del detalle" className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-2 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap',
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <t.icon className="w-3.5 h-3.5" aria-hidden="true" />
                {t.label}
              </span>
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/40 p-6 text-center space-y-2" role="alert">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto" aria-hidden="true" />
            <p className="text-xs font-black uppercase tracking-widest text-destructive">No se pudo cargar el detalle</p>
            <p className="text-xs text-muted-foreground font-bold">{error instanceof Error ? error.message : 'Error desconocido'}</p>
          </div>
        )}

        {!isLoading && !isError && org && (
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            {tab === 'resumen' && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</dt>
                  <dd className="font-bold">{org.name}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</dt>
                  <dd>
                    <span className={cn('px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest', org.is_active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                      {org.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Propietario</dt>
                  <dd className="font-bold">{org.owner_name || 'Sin propietario registrado'}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Creación</dt>
                  <dd className="font-mono text-xs">{org.created_at ? new Date(org.created_at).toLocaleString() : '-'}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tiendas</dt>
                  <dd className="font-black text-lg">{stores.length}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Usuarios asignados</dt>
                  <dd className="font-black text-lg">{users.length}</dd>
                </div>
              </dl>
            )}

            {tab === 'tiendas' && (
              stores.length === 0 ? (
                <p className="text-xs text-muted-foreground font-bold py-6 text-center uppercase tracking-widest">
                  Esta organización no tiene tiendas asignadas
                </p>
              ) : (
                <ul className="divide-y divide-border/60" aria-label="Tiendas de la organización">
                  {stores.map(s => (
                    <li key={s.id} className="flex items-center justify-between py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{s.slug || 'sin slug'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.is_archived && (
                          <span className="px-2 py-0.5 rounded bg-muted text-[9px] font-black uppercase tracking-widest text-muted-foreground">Archivada</span>
                        )}
                        <span className={cn('px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest', s.is_active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                          {s.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === 'usuarios' && (
              users.length === 0 ? (
                <p className="text-xs text-muted-foreground font-bold py-6 text-center uppercase tracking-widest">
                  Esta organización no tiene usuarios asignados
                </p>
              ) : (
                <ul className="divide-y divide-border/60" aria-label="Usuarios de la organización">
                  {users.map(u => (
                    <li key={u.id} className="flex items-center justify-between py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{u.full_name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{u.email}</p>
                      </div>
                      <span className={cn('px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shrink-0', u.is_active ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive')}>
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === 'configuracion' && (
              <div className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground font-bold">
                  Opciones soportadas por el modelo actual: nombre y estado. La edición de planes/facturación no forma del alcance de esta vista.
                </p>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre</p>
                  <p className="font-bold">{org.name}</p>
                </div>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</p>
                  <p className="font-bold">{org.is_active ? 'Activa' : 'Inactiva'}</p>
                </div>
                <Button size="sm" onClick={() => onEdit({ id: org.id, name: org.name, is_active: org.is_active })} className="uppercase text-xs font-black tracking-widest gap-2">
                  <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                  Editar configuración
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </BaseModal>
  );
}
