'use client';

/**
 * ADNEGOCIO 2026-11-22 — Alerta «Configuración contable pendiente».
 *
 * Consulta el estado REAL de la configuración económica por tipo documental
 * con el MISMO RPC que consume la página oficial de Configuración de
 * Documentos (fin_get_document_types_status, ACL por tienda — no es una
 * segunda implementación). El conteo y los nombres se CALCULAN de la
 * respuesta: nunca se codifican como constante. Si todo está configurado
 * muestra un estado correcto; mientras haya pendientes, la alerta persiste.
 *
 * Nota de comportamiento financiero: configurar una regla nueva NO genera
 * asientos retroactivos (decisión del motor); por eso el aviso indica que
 * los documentos de estos tipos no contabilizan hasta configurar la regla.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Settings2 } from 'lucide-react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import type { DocumentTypeStatus } from '@/components/views/terminal/views/financial_config/types';

interface FinDocumentConfigAlertProps {
  storeId: string;
  /** Cambia cuando la vista refresca filtros: re-consulta el estado. */
  refreshKey: number;
  /** La página oficial de Configuración de Documentos es admin/manager. */
  canConfigure: boolean;
  onGoDocumentConfig: () => void;
}

export function FinDocumentConfigAlert({
  storeId,
  refreshKey,
  canConfigure,
  onGoDocumentConfig,
}: FinDocumentConfigAlertProps) {
  const [types, setTypes] = useState<DocumentTypeStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('fin_get_document_types_status', {
        p_store_id: storeId,
      });
      if (rpcError) throw new Error(rpcError.message);
      setTypes((data as DocumentTypeStatus[] | null) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al consultar la configuración contable');
      setTypes(null);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return <div className="h-[64px] rounded-xl border border-border bg-card animate-pulse" data-testid="doc-config-alert-loading" />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3" data-testid="doc-config-alert-error">
        <p className="text-xs text-foreground">No se pudo consultar el estado de la configuración contable: {error}</p>
        <button
          type="button"
          onClick={load}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-[11px] font-black uppercase tracking-widest hover:bg-muted"
        >
          <RefreshCw className="w-3 h-3" /> Reintentar
        </button>
      </div>
    );
  }

  if (!types) return null;

  const pendientes = types.filter((t) => !t.configurado);

  // Estado correcto: sin alertas pendientes (misión §5).
  if (pendientes.length === 0) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/5 p-3"
        data-testid="doc-config-ok"
        aria-label="Configuración contable al día"
      >
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <p className="text-xs leading-relaxed text-foreground">
          <span className="font-black uppercase tracking-wide">Configuración contable al día.</span>{' '}
          <span className="text-muted-foreground">
            Los {types.length} tipos documentales de la tienda tienen su regla económica activa.
          </span>
        </p>
      </div>
    );
  }

  return (
    <section
      className="rounded-xl border border-warning/40 bg-warning/10 p-3 sm:p-4"
      data-testid="doc-config-alert"
      aria-label="Configuración contable pendiente"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">
              Configuración contable pendiente
            </h3>
            <p className="text-xs leading-relaxed text-foreground mt-1" data-testid="doc-config-alert-count">
              Existen{' '}
              <span className="font-black">
                {pendientes.length} tipo{pendientes.length !== 1 ? 's' : ''} documental
                {pendientes.length !== 1 ? 'es' : ''}
              </span>{' '}
              sin configuración económica. Los documentos de estos tipos no generan asientos
              contables automáticos hasta configurar su regla correspondiente en Configuración de
              Documentos.
            </p>
          </div>
        </div>
        {canConfigure && (
          <button
            type="button"
            onClick={onGoDocumentConfig}
            title="Abre la página oficial: Inicio › Sistema › Configuración de Documentos"
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
            data-testid="doc-config-go"
          >
            <Settings2 className="w-3.5 h-3.5" /> Configurar
          </button>
        )}
      </div>

      {/* Situación de cada tipo pendiente (nombre + estado de su configuración) */}
      <ul className="mt-2.5 space-y-1.5" data-testid="doc-config-alert-items">
        {pendientes.map((t) => (
          <li
            key={t.code}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-relaxed rounded-lg bg-background/60 border border-border/60 px-2.5 py-1.5"
            data-testid={`doc-config-item-${t.code}`}
          >
            <span className="font-black text-foreground">{t.name}</span>
            <span className="text-muted-foreground tabular-nums">({t.code})</span>
            <span className="text-warning font-bold uppercase tracking-wide">Sin regla económica activa</span>
            {t.errores > 0 && (
              <span className="text-destructive font-bold">
                · {t.errores} error{t.errores !== 1 ? 'es' : ''} de contabilización sin resolver
              </span>
            )}
            {t.asientos > 0 && (
              <span className="text-muted-foreground">
                · {t.asientos} asiento{t.asientos !== 1 ? 's' : ''} histórico{t.asientos !== 1 ? 's' : ''} previo
                {t.asientos !== 1 ? 's' : ''}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Configurar una regla nueva no genera asientos retroactivos ni altera documentos históricos;
        los documentos nuevos del tipo se contabilizan desde su activación.
        {!canConfigure && ' El acceso a la configuración requiere permisos de administración.'}
      </p>
    </section>
  );
}
