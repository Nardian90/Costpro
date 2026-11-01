'use client';

/**
 * MaterialRequestDetailsModal — Documento real de la Solicitud de Materiales.
 *
 * Presenta los 9 DATOS DE USO OBLIGATORIO del modelo SC-2-07 (Res. 11/2007
 * MFP) tal como quedaron registrados en la base de datos — sin inventar
 * valores: los campos opcionales no informados se muestran «—».
 *
 *   1. Fecha de emisión …………… fecha_emision
 *   2. Nombre y código de la entidad … store (RLS) + entidad_codigo
 *   3. Almacén al que se efectúa …… almacen_nombre + almacen_codigo
 *   4. Área / centro de costo / OP-OT  area_nombre(+código) + centro_costo +
 *      production_orders.order_number
 *   5. Código, descripción, UM y
 *      cantidad de cada producto …… items (sku, descripcion,
 *      unit_of_measure, quantity)
 *   6. Solicitante y fecha ……………… creator + created_at / submitted_at
 *   7. Funcionario que autoriza ……… authorizer + authorized_at
 *   8. Empleado del almacén que recibe receiver + received_at
 *   9. Número consecutivo ……………… request_number (SM-NNNNNN-YYYY)
 */

import React from 'react';
import { ClipboardList, X } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { BaseModal } from '@/components/ui/BaseModal';
import { SecondaryButton } from '@/components/ui/atomic';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import { formatearCantidad } from '@/lib/inventory/kardexPeriod';
import type { MaterialRequestDoc } from './materialRequestsTypes';

export interface MaterialRequestDetailsModalProps {
  open: boolean;
  onClose: () => void;
  doc: MaterialRequestDoc | null;
  /** Nombre de la tienda activa (entidad del modelo — dato 2). */
  storeName: string | null;
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{etiqueta}</p>
      <p className={cn('text-sm font-bold truncate', mono && 'font-mono')} title={typeof valor === 'string' ? valor : undefined}>
        {valor ?? <span className="text-muted-foreground font-normal">—</span>}
      </p>
    </div>
  );
}

export function MaterialRequestDetailsModal({ open, onClose, doc, storeName }: MaterialRequestDetailsModalProps) {
  if (!doc) return null;

  const items = doc.items || [];
  const totalLineas = items.length;

  return (
    <BaseModal
      open={open}
      onOpenChange={o => { if (!o) onClose(); }}
      aria-label={`Detalle de la Solicitud de Materiales ${doc.request_number}`}
      maxWidth="sm:max-w-3xl"
      title={
        <span className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" aria-hidden="true" />
          Solicitud de Materiales
        </span>
      }
      description={`Modelo SC-2-07 «Solicitud de Entrega» · Res. 11/2007 MFP${storeName ? ` · ${storeName}` : ''}`}
      footer={
        <div className="flex justify-end w-full">
          <SecondaryButton label="Cerrar" onClick={onClose} />
        </div>
      }
    >
      <div className="space-y-4 py-2" data-material-request-id={doc.id}>
        {/* ── Encabezado documental ── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base font-black text-primary">{doc.request_number}</span>
            <DocumentStatusBadge type="material_request" status={doc.status} size="sm" />
          </div>
          <span className="text-xs text-muted-foreground">
            Creada: {formatDate(doc.created_at)}
          </span>
        </div>

        {/* ── Datos 1–4: identificación del documento ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <Dato etiqueta="1 · Fecha de emisión" valor={doc.fecha_emision ? formatDate(doc.fecha_emision) : '—'} mono />
          <Dato etiqueta="2 · Entidad" valor={storeName || doc.almacen_nombre} />
          <Dato etiqueta="2 · Código de entidad" valor={doc.entidad_codigo || '—'} mono />
          <Dato etiqueta="9 · No. consecutivo" valor={doc.request_number} mono />
          <Dato etiqueta="3 · Almacén solicitado" valor={doc.almacen_nombre} />
          <Dato etiqueta="3 · Código del almacén" valor={doc.almacen_codigo || '—'} mono />
          <Dato etiqueta="4 · Área solicitante" valor={doc.area_nombre} />
          <Dato etiqueta="4 · Código del área" valor={doc.area_codigo || '—'} mono />
          <Dato etiqueta="4 · Centro de costo" valor={doc.centro_costo || '—'} />
          <Dato
            etiqueta="4 · Orden de P./Trabajo"
            valor={doc.production_orders?.order_number || '—'}
            mono
          />
          <Dato etiqueta="4 · Tipo de OP/OT" valor={doc.production_orders?.order_type || '—'} />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Estado</p>
            <DocumentStatusBadge type="material_request" status={doc.status} size="xs" />
          </div>
        </div>

        {/* ── Dato 5: productos solicitados ── */}
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
            5 · Productos solicitados ({totalLineas})
          </p>
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-2.5 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Código</th>
                  <th className="p-2.5 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Descripción</th>
                  <th className="p-2.5 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">U.M.</th>
                  <th className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-muted-foreground">Sin productos registrados</td>
                  </tr>
                ) : items.map(it => (
                  <tr key={it.id} className="border-b border-border/40 last:border-0">
                    <td className="p-2.5 font-mono text-muted-foreground whitespace-nowrap">{it.sku || '—'}</td>
                    <td className="p-2.5 font-bold">{it.descripcion}</td>
                    <td className="p-2.5 text-center text-muted-foreground whitespace-nowrap">{it.unit_of_measure || '—'}</td>
                    <td className="p-2.5 text-right font-mono font-black tabular-nums">{formatearCantidad(Number(it.quantity))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Datos 6–8: firmas y fechas del procedimiento ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={cn('rounded-xl border p-3 space-y-1.5',
            doc.submitted_at ? 'border-border bg-muted/20' : 'border-dashed border-border/60 bg-muted/5')}>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">6 · Solicitante</p>
            <p className="text-sm font-bold">{doc.creator?.full_name || '—'}</p>
            <p className="text-[10px] text-muted-foreground">
              {doc.submitted_at
                ? `Enviada a revisión: ${formatDate(doc.submitted_at)}`
                : 'Pendiente de envío a revisión'}
            </p>
          </div>
          <div className={cn('rounded-xl border p-3 space-y-1.5',
            doc.authorized_at ? 'border-success/40 bg-success/5' : 'border-dashed border-border/60 bg-muted/5')}>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">7 · Funcionario que autoriza</p>
            <p className="text-sm font-bold">{doc.authorizer?.full_name || '—'}</p>
            <p className="text-[10px] text-muted-foreground">
              {doc.authorized_at ? `Autorizada: ${formatDate(doc.authorized_at)}` : 'Pendiente de confirmación'}
            </p>
          </div>
          <div className={cn('rounded-xl border p-3 space-y-1.5',
            doc.received_at ? 'border-success/40 bg-success/5' : 'border-dashed border-border/60 bg-muted/5')}>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">8 · Recibida en el almacén por</p>
            <p className="text-sm font-bold">{doc.receiver?.full_name || '—'}</p>
            <p className="text-[10px] text-muted-foreground">
              {doc.received_at ? `Recibida: ${formatDate(doc.received_at)}` : 'Pendiente de confirmación'}
            </p>
          </div>
        </div>

        {/* ── Notas y anulación ── */}
        {doc.notes && (
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Notas</p>
            <p className="text-xs">{doc.notes}</p>
          </div>
        )}
        {doc.status === 'voided' && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-destructive mb-0.5">Solicitud anulada</p>
            <p className="text-xs">
              {doc.voided_at ? `Anulada el ${formatDate(doc.voided_at)}` : ''}
              {doc.voider?.full_name ? ` por ${doc.voider.full_name}` : ''}
              {doc.void_reason ? ` — Motivo: ${doc.void_reason}` : ''}
            </p>
          </div>
        )}
        {doc.reopen_count > 0 && doc.last_reopen_reason && (
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-warning mb-0.5">
              Devuelta a borrador ({doc.reopen_count} {doc.reopen_count === 1 ? 'vez' : 'veces'})
            </p>
            <p className="text-xs">Último motivo: {doc.last_reopen_reason}</p>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
