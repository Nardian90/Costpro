'use client';

/**
 * CatalogGovernanceSection — CP-CAT-MAESTRO-002 · Fase 2 (§4.2).
 *
 * Panel de gobernanza del Catálogo Maestro de la organización, integrado como
 * pestaña «Catálogo» del detalle de Organización (Sistema → Organizaciones →
 * ver detalle). Secciones:
 *  1. Tiendas — estado de conexión de cada tienda (conectada / no conectada /
 *     desconectada) con acciones Conectar/Desconectar (solo gobernador). La
 *     desconexión NO elimina productos, precios, existencias ni historial.
 *  2. Identidad compartida — inventario de master_products con búsqueda y
 *     editor de identidad (nombre/SKU/barcode/unidad/descripción/imagen)
 *     reservado al gobernador. La edición propaga SKU/nombre/imagen a las
 *     filas locales vinculadas y deja registro por campo en master_change_log.
 *  3. Propuestas pendientes — cola de cambios propuestos por tiendas con
 *     Aprobar/Rechazar (gobernador).
 *
 * Seguridad: la capacidad se consulta vía RPC is_catalog_governor (fail-closed)
 * y TODA escritura pasa por RPC SECURITY DEFINER que revalidan permisos en el
 * servidor — ocultar botones solo es la capa de presentación, nunca el control.
 */
import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, Link2Off, Loader2, Pencil, RefreshCw, Search, ShieldCheck, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { getSupabaseUrl } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import {
  useConnectStoreCatalog,
  useDisconnectStoreCatalog,
  useIsCatalogGovernor,
  useMasterProposals,
  useOrgCatalogLinks,
  useOrgMasterProducts,
  useReviewMasterProposal,
  useUpdateMasterProduct,
  type MasterProductOrgRow,
} from '@/hooks/api/useMasterCatalog';

interface CatalogGovernanceSectionProps {
  orgId: string;
  stores: Array<{ id: string; name: string; is_active: boolean | null; is_archived: boolean | null }>;
}

/** Traduce los ERR_* certificadas a mensajes accionables. */
export function translateCatalogError(msg: string): string {
  if (msg.includes('ERR_UNAUTHORIZED')) return 'No tienes facultades de gobernanza sobre el catálogo de esta organización.';
  if (msg.includes('ERR_STORE_NOT_CONNECTED')) return 'La tienda no está conectada al catálogo.';
  if (msg.includes('ERR_STORE_NOT_FOUND')) return 'Tienda no encontrada.';
  if (msg.includes('ERR_MASTER_SKU_EXISTS')) return 'Ya existe otro producto maestro con ese SKU en la organización.';
  if (msg.includes('ERR_BARCODE_EXISTS')) return 'Ya existe otro producto con ese código de barras.';
  if (msg.includes('ERR_MASTER_ARCHIVED')) return 'El producto maestro está archivado.';
  if (msg.includes('ERR_INVALID_CHANGES')) return 'Cambios inválidos (revisa los campos).';
  if (msg.includes('ERR_UNAUTHENTICATED')) return 'Sesión expirada: vuelve a iniciar sesión.';
  return msg;
}

interface LinkedImageRow {
  id: string;
  name: string;
  image_url: string | null;
  store_id: string;
}

export function CatalogGovernanceSection({ orgId, stores }: CatalogGovernanceSectionProps) {
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();

  const links = useOrgCatalogLinks(orgId);
  const isGovernor = useIsCatalogGovernor(orgId, user?.id ?? null);
  const connect = useConnectStoreCatalog();
  const disconnect = useDisconnectStoreCatalog();
  const updateMaster = useUpdateMasterProduct(null);

  const [masterSearch, setMasterSearch] = useState('');
  const masters = useOrgMasterProducts(orgId, masterSearch);
  const proposals = useMasterProposals(orgId);
  const review = useReviewMasterProposal();

  const [editing, setEditing] = useState<MasterProductOrgRow | null>(null);

  const linkByStore = useMemo(() => {
    const map = new Map<string, { status: string; connected_at: string | null }>();
    (links.data ?? []).forEach(l => map.set(l.store_id, { status: l.status, connected_at: l.connected_at }));
    return map;
  }, [links.data]);

  const pendingProposals = useMemo(() => (proposals.data ?? []).filter(p => p.status === 'pending'), [proposals.data]);

  const handleConnect = async (storeId: string, name: string) => {
    try {
      const res = await connect.mutateAsync(storeId);
      if (res.already_connected) toast.info(`${name} ya estaba conectada al catálogo`);
      else toast.success(`${name} conectada al catálogo de la organización`);
    } catch (e) {
      toast.error(translateCatalogError(e instanceof Error ? e.message : 'Error al conectar'));
    }
  };

  const handleDisconnect = async (storeId: string, name: string) => {
    const ok = window.confirm(
      `¿Desconectar «${name}» del catálogo de la organización?\n\n` +
      'La tienda dejará de ver el catálogo compartido, pero NO se eliminarán sus productos locales, precios, existencias ni historial.'
    );
    if (!ok) return;
    try {
      await disconnect.mutateAsync({ storeId });
      toast.success(`${name} desconectada (datos locales intactos)`);
    } catch (e) {
      toast.error(translateCatalogError(e instanceof Error ? e.message : 'Error al desconectar'));
    }
  };

  const handleReview = async (proposalId: string, decision: 'approved' | 'rejected') => {
    try {
      await review.mutateAsync({ proposalId, decision });
      toast.success(decision === 'approved' ? 'Propuesta aprobada y aplicada' : 'Propuesta rechazada');
    } catch (e) {
      toast.error(translateCatalogError(e instanceof Error ? e.message : 'Error al revisar la propuesta'));
    }
  };

  return (
    <div className="space-y-5">
      {/* Estado de capacidad: transparencia sobre quién puede gobernar */}
      <div className={cn('rounded-md border p-3 text-sm', isGovernor.data
        ? 'border-primary/40 bg-primary/5'
        : 'border-amber-500/40 bg-amber-500/10')}>
        <div className="flex items-center gap-2 font-bold">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {isGovernor.isLoading ? 'Verificando facultades…' : isGovernor.data
            ? 'Tienes facultades de gobernanza del catálogo'
            : 'Solo lectura: las acciones de gobierno las realiza el gobernador del catálogo'}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Gobierna el catálogo el propietario de la organización y los usuarios autorizados expresamente
          (concedidos por SuperAdmin). Los administradores de plataforma no gobiernan automáticamente.
        </p>
      </div>

      {/* 1. Tiendas conectadas */}
      <section aria-label="Conexión de tiendas al catálogo">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Tiendas conectadas</h4>
        {stores.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Esta organización no tiene tiendas.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border" aria-label="Estado de conexión por tienda">
            {stores.map(s => {
              const link = linkByStore.get(s.id);
              const connected = link?.status === 'connected';
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {connected
                        ? `Conectada desde ${link?.connected_at ? new Date(link.connected_at).toLocaleDateString() : '—'}`
                        : link?.status === 'disconnected'
                          ? 'Desconectada (productos e historial conservados)'
                          : 'Sin conexión al catálogo maestro'}
                    </p>
                  </div>
                  {isGovernor.data && (
                    connected ? (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => handleDisconnect(s.id, s.name)}
                        disabled={disconnect.isPending}
                        aria-label={`Desconectar ${s.name} del catálogo`}
                      >
                        {disconnect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5 mr-1" />}
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(s.id, s.name)}
                        disabled={connect.isPending}
                        aria-label={`Conectar ${s.name} al catálogo`}
                      >
                        {connect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
                        Conectar
                      </Button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 2. Identidad compartida (maestros) */}
      <section aria-label="Productos maestros de la organización">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Productos maestros</h4>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={masterSearch}
              onChange={e => setMasterSearch(e.target.value)}
              placeholder="Buscar por SKU o nombre…"
              className="pl-8 h-9"
              aria-label="Buscar productos maestros"
            />
          </div>
        </div>
        {masters.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>
        ) : (masters.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 border rounded-md text-center">
            Sin productos maestros{masterSearch ? ' para esta búsqueda' : ''}. Se crean desde una tienda conectada
            al dar de alta un producto (Catálogo → Nuevo producto).
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border max-h-64 overflow-y-auto" aria-label="Lista de productos maestros">
            {(masters.data ?? []).map(m => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {m.image_path && (
                    <img
                      src={getSupabaseUrl('product-images', m.image_path) ?? ''}
                      alt={`Imagen de ${m.name}`}
                      className="h-8 w-8 rounded object-cover border shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold px-1 rounded bg-muted">{m.sku}</span>
                      {m.status !== 'active' && <span className="text-[9px] uppercase text-destructive">{m.status}</span>}
                    </div>
                    <p className="text-sm truncate">{m.name}</p>
                  </div>
                </div>
                {isGovernor.data && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(m)} aria-label={`Editar identidad de ${m.sku}`}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Propuestas pendientes */}
      <section aria-label="Propuestas de cambio pendientes">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
          Propuestas pendientes {pendingProposals.length > 0 && `(${pendingProposals.length})`}
        </h4>
        {pendingProposals.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Sin propuestas de cambio pendientes de aprobación.</p>
        ) : (
          <ul className="space-y-2" aria-label="Cola de propuestas">
            {pendingProposals.map(p => (
              <li key={p.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="font-mono text-xs text-muted-foreground">
                  Maestro {p.master_product_id.slice(0, 8)}… · {new Date(p.created_at).toLocaleString()}
                </div>
                <ul className="text-xs space-y-0.5">
                  {Object.entries(p.changes ?? {}).map(([k, v]) => (
                    <li key={k}><span className="font-bold uppercase">{k}:</span> <span className="font-mono">{String(v)}</span></li>
                  ))}
                </ul>
                {isGovernor.data && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => handleReview(p.id, 'approved')} disabled={review.isPending} aria-label="Aprobar propuesta">
                      <Check className="h-3.5 w-3.5 mr-1" /> Aprobar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleReview(p.id, 'rejected')} disabled={review.isPending} aria-label="Rechazar propuesta">
                      <X className="h-3.5 w-3.5 mr-1" /> Rechazar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <EditMasterIdentityDialog
          master={editing}
          onClose={() => setEditing(null)}
          onSave={async changes => {
            try {
              const res = await updateMaster.mutateAsync({ masterId: editing.id, changes });
              const aplicados = (res as { applied?: Array<{ field: string }> }).applied ?? [];
              toast.success(aplicados.length > 0
                ? `Identidad actualizada (${aplicados.map(a => a.field).join(', ')}) y propagada a las tiendas vinculadas`
                : 'Sin cambios que aplicar');
              setEditing(null);
              qc.invalidateQueries({ queryKey: ['master-products-org'] });
            } catch (e) {
              toast.error(translateCatalogError(e instanceof Error ? e.message : 'Error al actualizar'));
            }
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── Editor de identidad ───────────────────────────── */

function EditMasterIdentityDialog({
  master,
  onClose,
  onSave,
}: {
  master: MasterProductOrgRow;
  onClose: () => void;
  onSave: (changes: Record<string, string>) => Promise<void>;
}) {
  const [sku, setSku] = useState(master.sku);
  const [name, setName] = useState(master.name);
  const [barcode, setBarcode] = useState(master.barcode ?? '');
  const [unit, setUnit] = useState(master.unit_of_measure ?? 'unidad');
  const [saving, setSaving] = useState(false);
  const [linked, setLinked] = useState<LinkedImageRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const currentImage = getSupabaseUrl('product-images', master.image_path);

  // Imágenes locales ya asociadas a este maestro (promoción de imagen compartida).
  React.useEffect(() => {
    let alive = true;
    supabase
      .from('products')
      .select('id, name, image_url, store_id')
      .eq('master_product_id', master.id)
      .limit(20)
      .then(({ data }) => { if (alive) setLinked((data ?? []) as LinkedImageRow[]); });
    return () => { alive = false; };
  }, [master.id]);

  const candidateImages = useMemo(
    () => (linked ?? []).filter(p => !!p.image_url),
    [linked]
  );

  const handleUpload = async (file: File) => {
    // La política de Storage exige filename prefijado con el UUID (36 chars) de
    // un producto de una tienda accesible. Reutilizamos el id de un producto
    // vinculado; sin filas vinculadas accesibles no se puede subir.
    const base = (linked ?? []).find(p => !!p.id);
    if (!base) {
      toast.error('Activa primero el producto en una tienda para poder subir una imagen compartida.');
      return;
    }
    const ext = (file.name.split('.').pop() || 'webp').toLowerCase();
    const fileName = `${base.id}-${crypto.randomUUID()}.${ext}`;
    setUploading(true);
    try {
      const { error: upErr } = await supabase.storage.from('product-images').upload(fileName, file);
      if (upErr) throw upErr;
      await onSave({ image_path: fileName });
    } catch (e) {
      toast.error(translateCatalogError(e instanceof Error ? e.message : 'Error al subir la imagen'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const changes: Record<string, string> = {};
    if (sku.trim() && sku.trim() !== master.sku) changes.sku = sku.trim();
    if (name.trim() && name.trim() !== master.name) changes.name = name.trim();
    if (barcode.trim() !== (master.barcode ?? '')) changes.barcode = barcode.trim() || '';
    if (unit.trim() && unit.trim() !== (master.unit_of_measure ?? 'unidad')) changes.unit_of_measure = unit.trim();
    if (Object.keys(changes).length === 0) {
      toast.info('Sin cambios que aplicar');
      return;
    }
    setSaving(true);
    try { await onSave(changes); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Editar identidad de ${master.sku}`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-card border rounded-lg shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest">Editar identidad compartida</h3>
        <p className="text-xs text-muted-foreground">
          Los cambios se propagan a todas las tiendas conectadas y quedan auditados por campo. Los precios,
          costos y existencias de cada tienda NUNCA se modifican desde aquí.
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {currentImage && (
              <img src={currentImage} alt={`Imagen actual de ${master.name}`} className="h-14 w-14 rounded object-cover border" />
            )}
            <div className="text-xs text-muted-foreground">
              {currentImage ? 'Imagen compartida vigente' : 'Sin imagen compartida'}
            </div>
          </div>

          {candidateImages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Promover una imagen local como compartida</p>
              <div className="flex gap-2 flex-wrap">
                {candidateImages.map(p => (
                  <img
                    key={p.id}
                    src={getSupabaseUrl('product-images', p.image_url) ?? ''}
                    alt={`Usar imagen de ${p.name}`}
                    title={`Promover imagen de «${p.name}»`}
                    className="h-10 w-10 rounded object-cover border cursor-pointer hover:ring-2 hover:ring-primary"
                    onClick={() => onSave({ image_path: p.image_url as string })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') onSave({ image_path: p.image_url as string }); }}
                  />
                ))}
              </div>
            </div>
          )}

          <label className="block text-xs font-bold">
            Reemplazar con archivo nuevo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="mt-1 block w-full text-xs"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
              disabled={uploading || !linked?.length}
            />
            <span className="text-[10px] text-muted-foreground font-normal">
              {linked?.length ? 'La imagen nueva se propaga a las tiendas vinculadas.' : 'Requiere el producto activado en al menos una tienda.'}
            </span>
          </label>

          <div>
            <label className="text-xs font-bold" htmlFor="master-edit-sku">SKU</label>
            <Input id="master-edit-sku" value={sku} onChange={e => setSku(e.target.value)} className="h-9 mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold" htmlFor="master-edit-name">Nombre</label>
            <Input id="master-edit-name" value={name} onChange={e => setName(e.target.value)} className="h-9 mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold" htmlFor="master-edit-barcode">Código de barras</label>
            <Input id="master-edit-barcode" value={barcode} onChange={e => setBarcode(e.target.value)} className="h-9 mt-1" placeholder="Opcional" />
          </div>
          <div>
            <label className="text-xs font-bold" htmlFor="master-edit-unit">Unidad de medida</label>
            <Input id="master-edit-unit" value={unit} onChange={e => setUnit(e.target.value)} className="h-9 mt-1" />
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="uppercase text-xs font-black tracking-widest">
            Cancelar
          </Button>
          <Button size="sm" onClick={submit} disabled={saving || uploading} className="uppercase text-xs font-black tracking-widest gap-2">
            {saving || uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Guardar y propagar
          </Button>
        </div>
      </div>
    </div>
  );
}
