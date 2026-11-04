'use client';

/**
 * CP-SALES-024 — Panel de configuración del documento SC-2-12 «Factura».
 * ============================================================================
 *
 * Diálogo de personalización de PRESENTACIÓN del SC-2-12, abierto desde el
 * icono de engranaje junto al botón «Exportar SC-2-12 (PDF)» en Detalles de
 * la Venta. Permite, POR CAMPO (misión §4.1):
 *
 *   - Mostrar/ocultar campos opcionales (sin dejar huecos en el documento).
 *   - Cambiar la ETIQUETA de presentación (el dato fuente no cambia).
 *   - Sustituir el VALOR — SOLO en campos no oficiales (dirección, teléfono,
 *     correo). REEUP/NIT/cuenta bancaria conservan siempre su valor oficial
 *     persistido en Gestión de Tiendas (misión §4.2).
 *   - Restaurar el valor original de un campo (vuelve a la configuración de
 *     la tienda).
 *   - Vista previa del documento resultante antes de exportar.
 *
 * Persistencia (misión §4.3/§4.4): preferencia `sc212:fields:<storeId>` en
 * `user_preferences` (mecanismo F-02b: cross-device + fallback localStorage),
 * alcance USUARIO + TIENDA. Guardar aquí NUNCA modifica la configuración
 * maestra de la tienda (Gestión de Tiendas), la venta ni sus importes.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Eye, EyeOff, RotateCcw, Save, Loader2, ShieldCheck, FileDown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SC212_FIELDS,
  normalizeSc212Prefs,
  sc212PrefsKey,
  type Sc212FieldId,
  type Sc212FieldPref,
  type Sc212FieldsPrefs,
} from '@/lib/legal/sc212-config/fields';
import { useUserPreferences } from '@/hooks/useUserPreferences';

export interface Sc212ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tienda de la VENTA consultada (no la seleccionada en el menú global). */
  storeId: string | null;
  /** Nombre de la tienda para el título del panel. */
  storeName?: string | null;
  /** Valores actuales persistidos en Gestión de Tiendas (solo lectura). */
  storeValues: Record<string, string>;
  /** Vista previa: genera el PDF con las prefs actuales sin guardar nada. */
  onPreview: (prefs: Sc212FieldsPrefs) => Promise<void>;
  /** Notifica las preferencias persistidas (para sincronizar al exportador). */
  onSaved?: (prefs: Sc212FieldsPrefs) => void;
}

export function Sc212ConfigModal({
  isOpen,
  onClose,
  storeId,
  storeName,
  storeValues,
  onPreview,
  onSaved,
}: Sc212ConfigModalProps) {
  const key = storeId ? sc212PrefsKey(storeId) : null;
  const { value: savedPrefs, update, loading } = useUserPreferences<Sc212FieldsPrefs>(
    key || 'sc212:fields:none',
    {},
  );

  const [draft, setDraft] = useState<Sc212FieldsPrefs>({});
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Al abrir (o cambiar de tienda): el borrador parte de la preferencia
  // guardada (normalizada — jamás de datos crudos editables a mano).
  useEffect(() => {
    if (isOpen) {
      setDraft(normalizeSc212Prefs(savedPrefs));
    }
  }, [isOpen, key, savedPrefs]);

  const dirty = useMemo(
    () => JSON.stringify(normalizeSc212Prefs(draft)) !== JSON.stringify(normalizeSc212Prefs(savedPrefs)),
    [draft, savedPrefs],
  );

  const setField = (id: Sc212FieldId, patch: Partial<Sc212FieldPref>) => {
    setDraft((prev) => {
      const current: Sc212FieldPref = prev[id] || {};
      const next = { ...current, ...patch };
      // Limpieza: sin overrides vacíos en la preferencia persistida.
      for (const k of Object.keys(next) as Array<keyof Sc212FieldPref>) {
        if (next[k] === undefined || next[k] === '') delete next[k];
      }
      const out = { ...prev };
      if (Object.keys(next).length === 0) delete out[id];
      else out[id] = next;
      return out;
    });
  };

  const restoreField = (id: Sc212FieldId) => {
    setDraft((prev) => {
      const out = { ...prev };
      delete out[id];
      return out;
    });
  };

  const restoreAll = () => {
    setDraft({});
    toast.info('Valores predeterminados restaurados (pendiente de guardar).');
  };

  const handleSave = async () => {
    if (!key) return;
    setSaving(true);
    try {
      const clean = normalizeSc212Prefs(draft);
      await update(clean);
      onSaved?.(clean);
      toast.success('Preferencias del SC-2-12 guardadas. La configuración de la tienda no se modifica.');
    } catch {
      toast.error('No se pudieron guardar las preferencias. Intente nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      await onPreview(normalizeSc212Prefs(draft));
    } catch {
      toast.error('No se pudo generar la vista previa.');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      maxWidth="sm:max-w-2xl"
      aria-label="Configurar documento SC-2-12"
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          Configurar documento SC-2-12
        </span>
      }
      description={
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
          Presentación del documento · {storeName || 'tienda de la venta'}
        </span>
      }
      footer={
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button type="button" variant="outline" onClick={restoreAll} disabled={saving || previewing} className="flex-1 sm:flex-none h-11">
            <RotateCcw className="w-4 h-4 mr-2" />
            Restaurar todo
          </Button>
          <Button type="button" variant="outline" onClick={handlePreview} disabled={saving || previewing} className="flex-1 sm:flex-none h-11">
            {previewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            {previewing ? 'Generando…' : 'Vista previa (PDF)'}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || previewing || !dirty || !key}
            className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="py-4 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Personalice la presentación del modelo SC-2-12 para esta tienda. Los datos oficiales
          (código/REEUP, NIT y cuenta bancaria) siempre provienen de la configuración de la
          tienda en <strong>Gestión de Tiendas</strong>; este panel <strong>no modifica</strong> esa
          configuración, la venta ni sus importes.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {SC212_FIELDS.map((f) => {
              const pref = draft[f.id] || {};
              const visible = pref.visible !== false;
              const originalValue = storeValues[f.id] ?? '';
              const effectiveValue =
                !f.official && typeof pref.value === 'string' && pref.value.trim()
                  ? pref.value
                  : originalValue;
              const customized = Object.keys(pref).length > 0;
              return (
                <div
                  key={f.id}
                  className={cn(
                    'p-3 rounded-xl border transition-colors',
                    visible ? 'bg-background border-border' : 'bg-muted/30 border-border/60 opacity-80',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {visible ? (
                        <Eye className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest truncate">
                          {f.hint}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Fuente: {f.source}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {customized && (
                        <button
                          type="button"
                          onClick={() => restoreField(f.id)}
                          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80"
                          title="Restaurar valor original (configuración de la tienda)"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restaurar
                        </button>
                      )}
                      <Switch
                        checked={visible}
                        onCheckedChange={(v) => setField(f.id, { visible: v })}
                        aria-label={`Mostrar ${f.defaultLabel}`}
                      />
                    </div>
                  </div>

                  {visible && (
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,140px)_1fr] gap-2 mt-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Etiqueta
                        </Label>
                        <Input
                          value={pref.label ?? f.defaultLabel}
                          onChange={(e) => setField(f.id, { label: e.target.value })}
                          maxLength={40}
                          placeholder={f.defaultLabel}
                          className="h-10 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                          {f.official ? (
                            <>
                              <Lock className="w-3 h-3" />
                              Valor oficial (solo lectura)
                            </>
                          ) : (
                            'Valor (opcionalmente personalizado)'
                          )}
                        </Label>
                        {f.official ? (
                          <div className="h-10 px-3 flex items-center rounded-lg border border-border bg-muted/40 text-xs font-mono tabular-nums select-all">
                            {effectiveValue || '(vacío en Gestión de Tiendas)'}
                          </div>
                        ) : (
                          <Input
                            value={pref.value ?? ''}
                            onChange={(e) => setField(f.id, { value: e.target.value })}
                            maxLength={120}
                            placeholder={originalValue || '(vacío en Gestión de Tiendas)'}
                            className="h-10 text-xs font-mono tabular-nums"
                          />
                        )}
                        {!f.official && (
                          <p className="text-[10px] text-muted-foreground">
                            Original de la tienda: <span className="font-mono">{originalValue || '(vacío)'}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-[11px] text-muted-foreground leading-relaxed">
          Las preferencias se guardan por usuario y por tienda (documento SC-2-12) y se aplican a
          las exportaciones futuras de esta tienda. «Restaurar todo» devuelve el documento a los
          valores por defecto: todos los campos visibles con sus etiquetas oficiales y el valor
          real de la configuración de la tienda.
        </div>
      </div>
    </BaseModal>
  );
}
