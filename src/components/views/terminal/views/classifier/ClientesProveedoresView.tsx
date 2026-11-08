'use client';

/**
 * ClientesProveedoresView — MISIÓN CLASIFICADOR MAESTRO (FASE 3).
 * ============================================================================
 * Nueva vista «Clientes y Proveedores» (Inicio → OPERACIÓN). Registro maestro
 * de terceros de la ORGANIZACIÓN compartido con las tiendas conectadas:
 *  · Búsqueda por código/nombre/NIT; filtro Cliente / Proveedor / Ambos y
 *    por estado (activos / desactivados / todos).
 *  · Alta / edición / detalle con trazabilidad / activar-desactivar.
 *  · Identifica el ORIGEN de cada fila: «Maestro» (compartido por el
 *    Clasificador de la organización) o «Local» (registro propio de la
 *    tienda aún sin maestro) — requisito de la misión.
 *  · Eliminación física SOLO sin historial (el guard real vive en la RPC
 *    delete_master_party → ERR_PARTY_HAS_HISTORY); con historial solo se
 *    desactiva (status='archived').
 *  · Responsivo (cards en móvil / tabla en desktop), componentes del sistema,
 *    sin duplicar entradas de menú.
 *
 * Datos: hook useClassifier (RPC certificadas; el cliente jamás escribe las
 * tablas del maestro directamente). La identidad y la clasificación comercial
 * están separadas: un tercero puede ser cliente y proveedor (ambos).
 */

import React, { useMemo, useState } from 'react';
import {
  Plus, Search, RotateCcw, Loader2, Users, X, Phone, Mail, MapPin,
  Building2, User, Share2, HardDrive, Pencil, Eye, Power, Trash2,
  Link2, Unlink, History, ShieldAlert, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { isAdminLevel } from '@/lib/roles';
import {
  useSearchMasterParties, usePartyStoreLink, usePartyChangeLog,
  useCreateMasterParty, useUpdateMasterParty, useDeleteMasterParty,
  useActivateMasterParty, useConnectStoreClassifier, useDisconnectStoreClassifier,
  partyClassification, translateClassifierError,
  type MasterPartyRow,
} from '@/hooks/api/useClassifier';

const touch = 'min-h-[44px]';

type KindFilter = 'all' | 'client' | 'supplier' | 'ambos';
type StatusFilter = 'active' | 'archived' | 'all';

/**
 * CP-UX-ORG-STORES-002 — Prop opcional `storeId`: contexto operativo ancla.
 *
 * Sin la prop (TerminalShell, acceso OPERACIÓN): usa la tienda activa del
 * usuario — comportamiento intacto. Con la prop (pestaña «Clientes y
 * Proveedores» de la página dedicada de una organización): la vista opera
 * sobre esa tienda ANCLA de la organización — misma fuente de datos
 * (RPCs que derivan el tenant de la tienda), mismas reglas de negocio,
 * mismas autorizaciones server-side (has_store_access_as + roles). No
 * existe una segunda implementación del módulo.
 */
export function ClientesProveedoresView({ storeId: storeIdProp }: { storeId?: string | null } = {}) {
  const { user } = useAuthStore();
  const storeId = (storeIdProp ?? user?.activeStoreId) || null;
  const isAdmin = isAdminLevel(user?.role);

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [detailParty, setDetailParty] = useState<MasterPartyRow | null>(null);
  const [editParty, setEditParty] = useState<MasterPartyRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteParty, setDeleteParty] = useState<MasterPartyRow | null>(null);

  const { data: link } = usePartyStoreLink(storeId);
  const connected = link?.status === 'connected';

  const { data: parties = [], isLoading, isError, error, refetch, isFetching } = useSearchMasterParties(
    storeId, search.trim(), kind, status,
  );

  const connectMut = useConnectStoreClassifier();
  const disconnectMut = useDisconnectStoreClassifier();

  const counts = useMemo(() => {
    const masters = parties.filter(p => p.source === 'master').length;
    return { total: parties.length, masters, locals: parties.length - masters };
  }, [parties]);

  const handleConnect = async () => {
    if (!storeId) return;
    try {
      await connectMut.mutateAsync(storeId);
      toast.success('Tienda conectada al Clasificador Maestro');
    } catch (e) {
      toast.error(translateClassifierError(e));
    }
  };

  const handleDisconnect = async () => {
    if (!storeId) return;
    try {
      await disconnectMut.mutateAsync({ storeId, reason: 'Desconexión desde la vista Clientes y Proveedores' });
      toast.info('Tienda desconectada. Los registros se conservan intactos.');
    } catch (e) {
      toast.error(translateClassifierError(e));
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Encabezado ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight">Clientes y Proveedores</h1>
          <p className="text-xs text-muted-foreground">
            Clasificador Maestro de la organización — identidad única compartida entre tiendas;
            las operaciones comerciales siguen siendo por tienda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && connected && (
            <button
              onClick={handleDisconnect}
              disabled={disconnectMut.isPending}
              className={cn('flex items-center gap-2 px-3 rounded-xl border border-border text-xs font-black uppercase hover:bg-muted', touch)}
            >
              <Unlink className="w-4 h-4" /> Desconectar tienda
            </button>
          )}
          {!connected && isAdmin && (
            <button
              onClick={handleConnect}
              disabled={connectMut.isPending}
              className={cn('flex items-center gap-2 px-3 rounded-xl border border-primary/40 text-primary text-xs font-black uppercase hover:bg-primary/5', touch)}
            >
              <Link2 className="w-4 h-4" /> Conectar esta tienda
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            disabled={!connected}
            title={connected ? 'Nuevo tercero' : 'Conecta la tienda al clasificador para dar de alta'}
            className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 disabled:opacity-40', touch)}
          >
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        </div>
      </div>

      {/* ── Estado de conexión ── */}
      {connected ? (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" />
          Tienda conectada al clasificador de la organización — los registros «Maestro» se comparten entre tiendas.
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Tienda no conectada</p>
            <p className="text-muted-foreground mt-1">
              Esta tienda aún no usa el Clasificador Maestro. Un administrador puede conectarla; mientras tanto
              verás aquí los registros locales de la tienda y la alta permanece deshabilitada.
            </p>
          </div>
        </div>
      )}

      {/* ── Búsqueda y filtros ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por código, nombre o NIT/CI..."
              className={cn('w-full pl-10 pr-4 rounded-xl border border-border bg-background text-sm', touch)}
            />
          </div>
          <button onClick={() => refetch()} className={cn('p-2 rounded-xl border border-border hover:bg-muted', touch)} aria-label="Recargar">
            {isLoading || isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {([['all', 'Todos'], ['client', 'Clientes'], ['supplier', 'Proveedores'], ['ambos', 'Ambos']] as Array<[KindFilter, string]>).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setKind(v)}
              className={cn('px-3 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all', touch,
                kind === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
          {([['active', 'Activos'], ['archived', 'Desactivados'], ['all', 'Todos los estados']] as Array<[StatusFilter, string]>).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setStatus(v)}
              className={cn('px-3 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all', touch,
                status === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Listado ── */}
      {isError ? (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive">
          {translateClassifierError(error)}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : parties.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">
            {connected ? 'No hay terceros que coincidan con la búsqueda' : 'Sin registros locales visibles'}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden sm:block rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2.5">Código</th>
                  <th className="px-3 py-2.5">Nombre</th>
                  <th className="px-3 py-2.5">Clasificación</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5">NIT / CI</th>
                  <th className="px-3 py-2.5">Contacto</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Origen</th>
                  <th className="px-3 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {parties.map(p => (
                  <PartyTableRow key={`${p.source}-${p.id}`} p={p} onDetail={() => setDetailParty(p)} onEdit={() => setEditParty(p)} onDelete={() => setDeleteParty(p)} storeId={storeId} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Móvil: cards */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {parties.map(p => (
              <PartyCard key={`${p.source}-${p.id}`} p={p} onDetail={() => setDetailParty(p)} onEdit={() => setEditParty(p)} onDelete={() => setDeleteParty(p)} storeId={storeId} />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {counts.total} registro(s) — {counts.masters} del maestro compartido · {counts.locals} local(es) de la tienda
          </p>
        </>
      )}

      {/* ── Modales ── */}
      {showCreate && (
        <PartyFormModal
          onClose={() => setShowCreate(false)}
          storeId={storeId}
        />
      )}
      {editParty && (
        <PartyFormModal
          party={editParty}
          onClose={() => setEditParty(null)}
          storeId={storeId}
        />
      )}
      {detailParty && (
        <PartyDetailModal
          party={detailParty}
          onClose={() => setDetailParty(null)}
          onEdit={() => { setEditParty(detailParty); setDetailParty(null); }}
          storeId={storeId}
        />
      )}
      {deleteParty && (
        <PartyDeleteModal
          party={deleteParty}
          storeId={storeId}
          onClose={() => setDeleteParty(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Presentación: clasificación / estado / origen
// ────────────────────────────────────────────────────────────────────────────

function ClassificationBadge({ p }: { p: MasterPartyRow }) {
  const c = partyClassification(p);
  const styles: Record<string, string> = {
    cliente: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    proveedor: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
    ambos: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    '—': 'bg-muted text-muted-foreground',
  };
  return (
    <span className={cn('text-[10px] font-black uppercase px-1.5 py-0.5 rounded whitespace-nowrap', styles[c])}>
      {c}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === 'active' ? (
    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">Activo</span>
  ) : (
    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">Desactivado</span>
  );
}

function SourceBadge({ source }: { source: string }) {
  return source === 'master' ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary whitespace-nowrap" title="Compartido desde el Clasificador Maestro de la organización">
      <Share2 className="w-3 h-3" /> Maestro
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap" title="Registro local de esta tienda (sin maestro)">
      <HardDrive className="w-3 h-3" /> Local
    </span>
  );
}

function PartyActions({ p, onDetail, onEdit, onDelete, storeId }: {
  p: MasterPartyRow; onDetail: () => void; onEdit: () => void; onDelete: () => void; storeId: string | null;
}) {
  const isMaster = p.source === 'master';
  return (
    <div className="flex items-center gap-1 justify-end">
      <button onClick={onDetail} className="p-2 rounded-lg hover:bg-muted" aria-label={`Ver detalle de ${p.name}`} title="Detalle y trazabilidad">
        <Eye className="w-4 h-4" />
      </button>
      {isMaster && (
        <>
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-muted" aria-label={`Editar ${p.name}`} title="Editar">
            <Pencil className="w-4 h-4" />
          </button>
          <PartyToggle p={p} storeId={storeId} />
          <button onClick={onDelete} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" aria-label={`Eliminar ${p.name}`} title="Eliminar (solo sin historial)">
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

/** Activar/Desactivar (status active ⇄ archived) con trazabilidad. */
function PartyToggle({ p, storeId }: { p: MasterPartyRow; storeId: string | null }) {
  const mut = useUpdateMasterParty(storeId);

  const toggle = async () => {
    const next = p.status === 'active' ? 'archived' : 'active';
    try {
      await mut.mutateAsync({ partyId: p.id, changes: { status: next } });
      toast.success(next === 'active' ? 'Tercero activado' : 'Tercero desactivado (conserva su historial)');
    } catch (e) {
      toast.error(translateClassifierError(e));
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={mut.isPending}
      className={cn('p-2 rounded-lg hover:bg-muted', p.status === 'active' && 'text-amber-600')}
      aria-label={p.status === 'active' ? `Desactivar ${p.name}` : `Activar ${p.name}`}
      title={p.status === 'active' ? 'Desactivar' : 'Activar'}
    >
      {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
    </button>
  );
}

function PartyTableRow({ p, onDetail, onEdit, onDelete, storeId }: {
  p: MasterPartyRow; onDetail: () => void; onEdit: () => void; onDelete: () => void; storeId: string | null;
}) {
  return (
    <tr className="border-t border-border hover:bg-muted/30">
      <td className="px-3 py-2.5 font-mono text-xs font-bold">{p.code}</td>
      <td className="px-3 py-2.5 font-bold max-w-[220px] truncate">{p.name}</td>
      <td className="px-3 py-2.5"><ClassificationBadge p={p} /></td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {p.party_type === 'juridica' ? 'Jurídica' : 'Natural'}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.tax_id || '—'}</td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {p.phone || p.email ? (
          <span className="flex flex-col">
            {p.phone && <span>{p.phone}</span>}
            {p.email && <span className="truncate max-w-[160px]">{p.email}</span>}
          </span>
        ) : '—'}
      </td>
      <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
      <td className="px-3 py-2.5"><SourceBadge source={p.source} /></td>
      <td className="px-3 py-2.5"><PartyActions p={p} onDetail={onDetail} onEdit={onEdit} onDelete={onDelete} storeId={storeId} /></td>
    </tr>
  );
}

function PartyCard({ p, onDetail, onEdit, onDelete, storeId }: {
  p: MasterPartyRow; onDetail: () => void; onEdit: () => void; onDelete: () => void; storeId: string | null;
}) {
  return (
    <div className="p-4 rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-sm truncate">{p.name}</h3>
          <p className="text-xs text-muted-foreground font-mono">{p.code} · {p.party_type === 'juridica' ? 'Jurídica' : 'Natural'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ClassificationBadge p={p} />
          <SourceBadge source={p.source} />
        </div>
      </div>
      <div className="space-y-1 mb-2">
        {p.tax_id && <p className="text-xs text-muted-foreground">NIT/CI: {p.tax_id}</p>}
        {p.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {p.phone}</p>}
        {p.email && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {p.email}</p>}
        {p.address && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><MapPin className="w-3 h-3" /> {p.address}</p>}
      </div>
      <div className="flex items-center justify-between">
        <StatusBadge status={p.status} />
        <PartyActions p={p} onDetail={onDetail} onEdit={onEdit} onDelete={onDelete} storeId={storeId} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modal de alta/edición
// ────────────────────────────────────────────────────────────────────────────

function PartyFormModal({ party, onClose, storeId }: {
  party?: MasterPartyRow | null;
  onClose: () => void;
  storeId: string | null;
}) {
  const isEdit = !!party?.id && party.source === 'master';
  const createMut = useCreateMasterParty(storeId);
  const updateMut = useUpdateMasterParty(storeId);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: party?.name || '',
    code: party?.code || '',
    tax_id: party?.tax_id || '',
    party_type: (party?.party_type === 'juridica' ? 'juridica' : 'natural') as 'natural' | 'juridica',
    is_client: party?.is_client ?? true,
    is_supplier: party?.is_supplier ?? false,
    phone: party?.phone || '',
    email: party?.email || '',
    address: party?.address || '',
    notes: party?.notes || '',
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!form.is_client && !form.is_supplier) { toast.error('Marca al menos un rol: cliente o proveedor'); return; }
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          partyId: party!.id,
          changes: {
            name: form.name.trim(),
            code: form.code.trim(),
            tax_id: form.tax_id.trim() || null,
            party_type: form.party_type,
            is_client: form.is_client,
            is_supplier: form.is_supplier,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            address: form.address.trim() || null,
            notes: form.notes.trim() || null,
          },
        });
        toast.success('Tercero actualizado (trazabilidad registrada)');
      } else {
        const res = await createMut.mutateAsync({
          name: form.name,
          code: form.code,
          tax_id: form.tax_id,
          party_type: form.party_type,
          is_client: form.is_client,
          is_supplier: form.is_supplier,
          phone: form.phone,
          email: form.email,
          address: form.address,
          notes: form.notes,
        });
        toast.success(
          res.source === 'master'
            ? 'Tercero creado en el maestro (compartido con las tiendas conectadas)'
            : 'Tercero creado como registro local de la tienda (tienda no conectada)',
        );
        const dups = res.name_duplicates || [];
        if (dups.length > 0) {
          toast.warning(`Ojo: ya existían terceros con nombre similar: ${dups.map(d => `${d.code} · ${d.name}`).join('; ')}`);
        }
      }
      onClose();
    } catch (e) {
      toast.error(translateClassifierError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-3 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black uppercase">{isEdit ? 'Editar Tercero' : 'Nuevo Cliente / Proveedor'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nombre *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} maxLength={120}
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Código {isEdit ? '' : '(vacío = automático CP-####)'}
            </label>
            <input value={form.code} onChange={e => set('code', e.target.value)} maxLength={30}
              className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm font-mono', touch)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">NIT / CI (Identificación fiscal)</label>
            <input value={form.tax_id} onChange={e => set('tax_id', e.target.value)} maxLength={30}
              className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tipo de persona</label>
          <div className="flex gap-2 mt-1">
            {([['natural', 'Natural', User], ['juridica', 'Jurídica', Building2]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" onClick={() => set('party_type', v)}
                className={cn('flex-1 flex items-center justify-center gap-2 rounded-xl border text-xs font-black uppercase', touch,
                  form.party_type === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clasificación (rol comercial)</label>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => set('is_client', !form.is_client)}
              className={cn('flex-1 rounded-xl border text-xs font-black uppercase', touch,
                form.is_client ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/40' : 'border-border hover:bg-muted')}>
              Cliente {form.is_client ? '✓' : ''}
            </button>
            <button type="button" onClick={() => set('is_supplier', !form.is_supplier)}
              className={cn('flex-1 rounded-xl border text-xs font-black uppercase', touch,
                form.is_supplier ? 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/40' : 'border-border hover:bg-muted')}>
              Proveedor {form.is_supplier ? '✓' : ''}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Teléfono</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" maxLength={30}
              className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Correo</label>
            <input value={form.email} onChange={e => set('email', e.target.value)} type="email" maxLength={120}
              className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Dirección</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} maxLength={200}
            className={cn('w-full mt-1 px-3 rounded-xl border border-border bg-background text-sm', touch)} />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Observaciones</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} maxLength={500}
            className={cn('w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none', touch)} />
        </div>

        <button onClick={handleSubmit} disabled={submitting}
          className={cn('w-full rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2', touch)}>
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Plus className="w-4 h-4" /> {isEdit ? 'Guardar Cambios' : 'Crear Tercero'}</>}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modal de detalle con trazabilidad + activación local
// ────────────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  code: 'Código', name: 'Nombre', address: 'Dirección', phone: 'Teléfono',
  email: 'Correo', tax_id: 'NIT/CI', party_type: 'Tipo', is_client: 'Rol Cliente',
  is_supplier: 'Rol Proveedor', status: 'Estado', notes: 'Observaciones',
  classification: 'Clasificación',
};

function PartyDetailModal({ party, onClose, onEdit, storeId }: {
  party: MasterPartyRow;
  onClose: () => void;
  onEdit: () => void;
  storeId: string | null;
}) {
  const { data: log = [], isLoading: logLoading } = usePartyChangeLog(party.source === 'master' ? party.id : party.master_party_id);
  const activateMut = useActivateMasterParty(storeId);
  const isMaster = party.source === 'master';

  const handleActivate = async () => {
    try {
      await activateMut.mutateAsync(party.id);
      toast.success('Tercero activado en esta tienda (filas locales creadas/vinculadas)');
      onClose();
    } catch (e) {
      toast.error(translateClassifierError(e));
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-3 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-black uppercase leading-tight">{party.name}</h2>
            <p className="text-xs text-muted-foreground font-mono">{party.code}</p>
          </div>
          <div className="flex items-center gap-2">
            <ClassificationBadge p={party} />
            <SourceBadge source={party.source} />
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Cerrar"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <DetailItem icon={User} label="Tipo" value={party.party_type === 'juridica' ? 'Persona Jurídica' : 'Persona Natural'} />
          <DetailItem icon={ShieldAlert} label="NIT / CI" value={party.tax_id || '—'} />
          <DetailItem icon={Phone} label="Teléfono" value={party.phone || '—'} />
          <DetailItem icon={Mail} label="Correo" value={party.email || '—'} />
          <div className="col-span-2"><DetailItem icon={MapPin} label="Dirección" value={party.address || '—'} /></div>
          <div className="col-span-2"><DetailItem icon={History} label="Observaciones" value={party.notes || '—'} /></div>
          <div className="col-span-2"><DetailItem icon={Power} label="Estado" value={party.status === 'active' ? 'Activo' : 'Desactivado'} /></div>
        </div>

        {isMaster && (
          <div className="flex flex-wrap gap-2">
            {party.is_client && !party.linked_customer_id && (
              <button onClick={handleActivate} disabled={activateMut.isPending}
                className={cn('flex items-center gap-2 px-3 rounded-xl border border-primary/40 text-primary text-xs font-black uppercase hover:bg-primary/5', touch)}>
                {activateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Activar como cliente en esta tienda
              </button>
            )}
            {party.is_supplier && !party.linked_supplier_id && (
              <button onClick={handleActivate} disabled={activateMut.isPending}
                className={cn('flex items-center gap-2 px-3 rounded-xl border border-primary/40 text-primary text-xs font-black uppercase hover:bg-primary/5', touch)}>
                {activateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Activar como proveedor en esta tienda
              </button>
            )}
            {party.linked_customer_id && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Vinculado a clientes locales</span>}
            {party.linked_supplier_id && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Vinculado a proveedores locales</span>}
          </div>
        )}

        {/* Trazabilidad de modificaciones (requisito de la misión) */}
        <div className="border-t border-border pt-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
            <History className="w-4 h-4" /> Trazabilidad de modificaciones
          </h3>
          {logLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : log.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin cambios registrados todavía.</p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {log.map(l => (
                <li key={l.id} className="text-[11px] flex items-start gap-2">
                  <span className="font-mono text-muted-foreground shrink-0">
                    {new Date(l.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <span>
                    <b className="uppercase">{FIELD_LABELS[l.field] || l.field}</b>{' '}
                    <span className="text-muted-foreground">
                      {l.field === 'status'
                        ? `${l.old_value === 'active' ? 'Activo' : 'Desactivado'} → ${l.new_value === 'active' ? 'Activo' : 'Desactivado'}`
                        : `${l.old_value ?? '(vacío)'} → ${l.new_value ?? '(vacío)'}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isMaster && (
          <button onClick={onEdit} className={cn('w-full rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase hover:opacity-90 flex items-center justify-center gap-2', touch)}>
            <Pencil className="w-4 h-4" /> Editar Tercero
          </button>
        )}
      </div>
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-xs font-bold break-words">{value}</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modal de eliminación (el guard real vive en la RPC)
// ────────────────────────────────────────────────────────────────────────────

function PartyDeleteModal({ party, storeId, onClose }: {
  party: MasterPartyRow;
  storeId: string | null;
  onClose: () => void;
}) {
  const deleteMut = useDeleteMasterParty(storeId);
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText.trim().toUpperCase() === 'ELIMINAR';

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(party.id);
      toast.success('Tercero eliminado del clasificador');
      onClose();
    } catch (e) {
      toast.error(translateClassifierError(e));
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-destructive/40 rounded-2xl shadow-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-destructive" />
          <h2 className="text-lg font-black uppercase text-destructive">Eliminar Tercero</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Vas a eliminar <b>{party.code} · {party.name}</b> del Clasificador Maestro.
          Si el tercero tiene ventas, recepciones o vínculos históricos, la operación será
          <b> rechazada</b> — en ese caso solo puede desactivarse.
        </p>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Escribe ELIMINAR para confirmar</label>
          <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
            className={cn('w-full mt-1 px-3 rounded-xl border border-destructive/40 bg-background text-sm font-mono', touch)} />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className={cn('flex-1 rounded-xl border border-border text-xs font-black uppercase hover:bg-muted', touch)}>Cancelar</button>
          <button onClick={handleDelete} disabled={!canConfirm || deleteMut.isPending}
            className={cn('flex-1 rounded-xl bg-destructive text-destructive-foreground text-xs font-black uppercase disabled:opacity-40 flex items-center justify-center gap-2', touch)}>
            {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
