'use client';

/**
 * SISTEMA → Organizaciones — MISIÓN ORGANIZACIONES (2026-10-26), FASE 1.
 *
 * Vista empresarial completa sobre la entidad canónica `tenants`:
 *  · Encabezado con descripción funcional + acción «Nueva organización»
 *    (solo SuperAdmin — crear empresas es una acción de plataforma).
 *  · Indicadores de resumen SOLO de consultas reales, con alcance explicado.
 *  · Tabla densa: empresa/owner, tiendas (reales), usuarios (reales),
 *    estado, fechas reales, acciones por fila.
 *  · Búsqueda, filtro por estado, filtro por presencia de tiendas,
 *    ordenación por nombre/estado/tiendas/usuarios (datos cargados),
 *    paginación real del servidor.
 *  · Estados de carga (skeleton), error con reintento, vacío inicial y
 *    vacío por filtros sin coincidencias.
 *  · Acciones: ver detalle (tabs Resumen/Tiendas/Usuarios/Configuración),
 *    editar, activar/desactivar, eliminar (bloqueado con dependencias
 *    reales — nunca cascada).
 *
 * La denominación visible única es «Organizaciones».
 */
import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Building2, MoreVertical, Eye, Edit, Trash2, AlertTriangle, Users, Store, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store';
import { useOrganizations, useDeleteOrganization } from '@/hooks/api/useOrganizations';
import { OrganizationFormModal } from './OrganizationFormModal';
import { OrganizationDetailModal } from './OrganizationDetailModal';

type SortKey = 'name' | 'status' | 'stores' | 'users';

export default function OrganizationsView() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'superadmin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [hasStoresFilter, setHasStoresFilter] = useState<'all' | 'true' | 'false'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch, isRefetching } = useOrganizations({
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    hasStores: hasStoresFilter === 'all' ? undefined : hasStoresFilter,
    page,
    limit: 50,
  });

  const deleteMutation = useDeleteOrganization();

  const [formOpen, setFormOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<{ id: string; name: string; is_active: boolean } | null>(null);
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);

  const rows = data?.data || [];
  const summary = data?.summary;
  const pagination = data?.pagination;

  // Ordenación sobre los datos cargados (el backend ordena por nombre; el
  // resto de claves se resuelve aquí — misión: «cuando el backend lo permita»).
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'status') cmp = Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name);
      else if (sortKey === 'stores') cmp = a.stores_total - b.stores_total;
      else if (sortKey === 'users') cmp = a.users - b.users;
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(prev => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const handleDelete = (org: { id: string; name: string }) => {
    const confirmed = window.confirm(
      `¿Eliminar la organización «${org.name}»?\n\nSolo se elimina si NO tiene tiendas ni usuarios asignados. La operación no usa cascadas.`
    );
    if (!confirmed) return;
    deleteMutation.mutate(org.id);
  };

  const renderSummary = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      );
    }
    if (!summary) return null;
    const cards = [
      { label: 'Organizaciones activas', value: summary.active_organizations, icon: Building2, hint: isSuperAdmin ? 'Todas las empresas' : 'Tu empresa' },
      { label: 'Tiendas activas', value: summary.stores, icon: Store, hint: 'En el alcance de esta vista' },
      { label: 'Usuarios asignados', value: summary.assigned_users, icon: Users, hint: 'Con empresa asignada (alcance actual)' },
      ...(isSuperAdmin
        ? [{ label: 'Usuarios sin asignar', value: summary.unassigned_users, icon: UserX, hint: 'Pendientes de asignación (global)', alert: summary.unassigned_users > 0 }]
        : []),
    ];
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div
            key={c.label}
            className={cn(
              'rounded-xl border bg-card p-4 shadow-sm',
              c.alert ? 'border-destructive/40' : 'border-border'
            )}
            aria-label={`${c.label}: ${c.value}`}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <c.icon className={cn('w-3.5 h-3.5', c.alert && 'text-destructive')} aria-hidden="true" />
              <span className="text-[10px] font-black uppercase tracking-widest">{c.label}</span>
            </div>
            <p className={cn('mt-1.5 text-2xl font-black', c.alert && 'text-destructive')}>{c.value}</p>
            <p className="text-[10px] text-muted-foreground/70 font-bold">{c.hint}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderTable = () => {
    if (isLoading) {
      return (
        <div className="rounded-xl border border-border bg-card shadow-sm p-4 space-y-3">
          {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      );
    }

    if (isError) {
      return (
        <div className="rounded-xl border border-destructive/40 bg-card p-10 text-center space-y-4" role="alert">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto" aria-hidden="true" />
          <div className="space-y-1">
            <h3 className="text-sm font-black uppercase tracking-widest text-destructive">No se pudieron cargar las organizaciones</h3>
            <p className="text-xs text-muted-foreground font-bold">
              {error instanceof Error ? error.message : 'Error desconocido al consultar las empresas.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="uppercase text-xs font-black tracking-widest">
            Reintentar
          </Button>
        </div>
      );
    }

    const noOrgsAtAll = pagination?.total === 0 && !search && statusFilter === 'all' && hasStoresFilter === 'all';
    const noMatches = pagination?.total === 0 && (!!search || statusFilter !== 'all' || hasStoresFilter !== 'all');

    if (noOrgsAtAll || noMatches) {
      return (
        <div className="rounded-xl border border-border bg-card p-12 text-center space-y-3">
          <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
            {noMatches ? 'Ninguna organización coincide con los filtros' : 'Aún no hay organizaciones'}
          </h3>
          <p className="text-xs text-muted-foreground/70 font-bold max-w-md mx-auto">
            {noMatches
              ? 'Ajusta la búsqueda o los filtros aplicados para ver resultados.'
              : 'Las empresas agrupan tiendas y usuarios. Crea la primera organización para estructurar tu operación.'}
          </p>
          {noMatches && (
            <Button variant="outline" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setHasStoresFilter('all'); setPage(1); }} className="uppercase text-xs font-black tracking-widest">
              Limpiar filtros
            </Button>
          )}
        </div>
      );
    }

    const th = (key: SortKey, label: string, extraClass = '') => (
      <th className={cn('p-4 text-left', extraClass)}>
        <button
          type="button"
          onClick={() => handleSort(key)}
          aria-label={`Ordenar por ${label}`}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {label}
          <span className="text-[9px]" aria-hidden="true">{sortKey === key ? (sortAsc ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );

    return (
      <div className="table-scroll-wrapper rounded-xl border border-border bg-card shadow-sm">
        <table className="data-table w-full text-sm" aria-label="Listado de organizaciones">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
              {th('name', 'Empresa / Organización')}
              {th('stores', 'Tiendas')}
              {th('users', 'Usuarios')}
              {th('status', 'Estado')}
              <th className="p-4 text-left">Creación</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(org => (
              <tr
                key={org.id}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                aria-label={`Organización: ${org.name}`}
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0" aria-hidden="true">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate" title={org.name}>{org.name}</div>
                      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">
                        {org.owner_name ? `Propietario: ${org.owner_name}` : 'Sin propietario registrado'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className="font-black text-sm">{org.stores_total}</span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                    {' '}({org.stores_active} activa{org.stores_active === 1 ? '' : 's'})
                  </span>
                </td>
                <td className="p-4">
                  <span className="font-black text-sm">{org.users}</span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest"> asignados</span>
                </td>
                <td className="p-4">
                  <span
                    className={cn(
                      'px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest',
                      org.is_active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {org.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="p-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {org.created_at ? new Date(org.created_at).toLocaleDateString() : '-'}
                </td>
                <td className="p-4 text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Opciones de ${org.name}`}
                        aria-haspopup="menu"
                        title="Opciones"
                        className="inline-flex items-center justify-center w-10 h-10 min-h-[40px] rounded-lg border bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-90 shrink-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4} className="w-56 rounded-xl border-border/60 bg-card shadow-lg">
                      <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Opciones
                      </DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => setDetailOrgId(org.id)} className="gap-2 text-xs font-bold">
                        <Eye className="w-3.5 h-3.5" />
                        Ver detalle
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => { setEditingOrg({ id: org.id, name: org.name, is_active: org.is_active }); setFormOpen(true); }}
                        className="gap-2 text-xs font-bold"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Editar
                      </DropdownMenuItem>
                      {isSuperAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => handleDelete(org)}
                            className="gap-2 text-xs font-bold text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tighter uppercase">Organizaciones</h2>
          <p className="text-xs text-muted-foreground font-bold">
            Las empresas agrupan tiendas y usuarios. {isSuperAdmin ? 'Como SuperAdmin ves todas las organizaciones.' : 'Ves tu organización.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            aria-label="Actualizar datos de organizaciones"
            className="gap-2 uppercase text-xs font-black tracking-widest"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefetching && 'animate-spin')} aria-hidden="true" />
            Actualizar
          </Button>
          {isSuperAdmin && (
            <ActionMenu
              actions={[
                {
                  id: 'new',
                  label: 'Nueva Organización',
                  icon: Plus,
                  onClick: () => { setEditingOrg(null); setFormOpen(true); },
                  variant: 'primary',
                },
              ]}
              className="sm:w-auto"
            />
          )}
        </div>
      </div>

      {/* Indicadores de resumen (solo recuentos reales) */}
      {renderSummary()}

      {/* Búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Buscar organizaciones por nombre..."
          />
        </div>
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as 'all' | 'active' | 'inactive'); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-10 text-[10px] font-black uppercase" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px] font-black uppercase">Todos los estados</SelectItem>
              <SelectItem value="active" className="text-[10px] font-black uppercase">Activas</SelectItem>
              <SelectItem value="inactive" className="text-[10px] font-black uppercase">Inactivas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={hasStoresFilter} onValueChange={(v) => { setHasStoresFilter(v as 'all' | 'true' | 'false'); setPage(1); }}>
            <SelectTrigger className="w-[160px] h-10 text-[10px] font-black uppercase" aria-label="Filtrar por presencia de tiendas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px] font-black uppercase">Con y sin tiendas</SelectItem>
              <SelectItem value="true" className="text-[10px] font-black uppercase">Con tiendas</SelectItem>
              <SelectItem value="false" className="text-[10px] font-black uppercase">Sin tiendas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla */}
      {renderTable()}

      {/* Paginación real */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-bold text-muted-foreground" aria-label="Paginación de organizaciones">
          <span>
            Página {pagination.page} de {pagination.totalPages} · {pagination.total} organización(es)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage(p => p - 1)} className="uppercase text-[10px] font-black tracking-widest">
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages || isLoading} onClick={() => setPage(p => p + 1)} className="uppercase text-[10px] font-black tracking-widest">
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Modales */}
      <OrganizationFormModal
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingOrg(null); }}
        organization={editingOrg}
      />
      <OrganizationDetailModal
        orgId={detailOrgId}
        onOpenChange={(open) => { if (!open) setDetailOrgId(null); }}
        onEdit={(org) => { setDetailOrgId(null); setEditingOrg(org); setFormOpen(true); }}
      />
    </div>
  );
}
