'use client';

/**
 * CP-FIN — Vista A: Configuración de Documentos.
 *
 * Administra las reglas que usa el motor de partida doble: para cada tipo
 * documental se construyen las plantillas de movimientos económicos
 * (débitos/créditos por categoría), se validan con el simulador (nunca
 * escribe datos) y se versionan/activan como reglas del ámbito de tienda.
 *
 * APIs (todas con Authorization Bearer, patrón ReceivedServicesView):
 *   GET  /api/fin/config?store_id            → catálogo (tipos, categorías, métricas, reglas)
 *   POST /api/fin/config                     → guardar borrador
 *   POST /api/fin/config/rule-action         → activar / desactivar versión
 *   POST /api/fin/config/simulate            → simulación (sin escrituras)
 *   GET  /api/fin/documents?store_id&doctype → documentos reales (selector)
 *   POST /api/fin/posting                    → reprocess de errores
 *
 * UI en español hardcodeado (sin next-intl). Estado plano (sin react-query):
 * consistente con las vistas legacy del terminal.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings2, RefreshCw, Search, ChevronUp, ChevronDown, Pencil, Trash2, Plus,
  Landmark, FileText, History, Play, Save, Zap, Ban, RotateCcw, Scale,
  ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, Info, ArrowLeftRight,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import OpeningBalancesDialog from './OpeningBalancesDialog';
import {
  type DocumentTypeStatus, type FinCategory, type MetricCatalogItem, type RuleVersion,
  type MovementTemplate, type MovementCondition, type SimulateResult,
  type FinDocumentOption, type PostingErrorRow, type ReprocessResult, type RuleActionResult,
  MODULE_ORDER, SIMULATOR_SUPPORTED_DOCTYPES, claseMeta, summarizeCondition,
} from './types';

const MODULE_LIST: string[] = [...MODULE_ORDER];
const SUPPORTED: string[] = [...SIMULATOR_SUPPORTED_DOCTYPES];
const CONDITION_OPS = ['=', '!=', '>', '>=', '<', '<=', 'existe'] as const;

type EditorSource =
  | { kind: 'draft'; ruleId: string; version: number | null }
  | { kind: 'active'; version: number | null }
  | { kind: 'new' };

// ─────────────────────────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────────────────────────

export default function DocumentConfigView() {
  const { user } = useAuthStore();
  const authToken = useAuthStore((s) => s.token);
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
  const storeId = user?.activeStoreId;

  // ── Catálogo (GET /api/fin/config) ──
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeStatus[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [metrics, setMetrics] = useState<MetricCatalogItem[]>([]);
  const [rules, setRules] = useState<RuleVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Filtros del catálogo ──
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('todos');
  const [onlyUnconfigured, setOnlyUnconfigured] = useState(false);

  // ── Selección + editor de plantillas ──
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [editorMovements, setEditorMovements] = useState<MovementTemplate[]>([]);
  const [editorSource, setEditorSource] = useState<EditorSource>({ kind: 'new' });
  const [baseline, setBaseline] = useState('[]');
  const [movementDialog, setMovementDialog] = useState<{ open: boolean; editIndex: number | null }>({ open: false, editIndex: null });

  // ── Simulador ──
  const [simMode, setSimMode] = useState<'documento' | 'manual'>('documento');
  const [documents, setDocuments] = useState<FinDocumentOption[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  // ── Acciones (guardar/activar/reprocesar) ──
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [confirmActivateConfig, setConfirmActivateConfig] = useState(false);
  const [confirmActivateRule, setConfirmActivateRule] = useState<RuleVersion | null>(null);
  const [reprocessing, setReprocessing] = useState(false);

  // ── Errores de contabilización del tipo seleccionado ──
  const [postingErrors, setPostingErrors] = useState<PostingErrorRow[]>([]);

  // ── Saldos iniciales ──
  const [openingOpen, setOpeningOpen] = useState(false);

  const dirty = useMemo(() => JSON.stringify(editorMovements) !== baseline, [editorMovements, baseline]);

  // ── Carga del catálogo ──
  const fetchConfig = useCallback(async (reselect?: string) => {
    if (!storeId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/fin/config?store_id=${storeId}`, {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al cargar la configuración');
      }
      const data = await res.json();
      const dts: DocumentTypeStatus[] = data.document_types ?? [];
      const rls: RuleVersion[] = data.rules ?? [];
      setDocumentTypes(dts);
      setCategories(data.categories ?? []);
      setMetrics(data.metrics ?? []);
      setRules(rls);
      if (reselect) applySelection(reselect, dts, rls);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, authToken]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  /**
   * Carga el editor para un tipo documental:
   * plantillas del BORRADOR en edición (borrador de la tienda más reciente)
   * o, si no hay borrador, de la regla ACTIVA vigente.
   */
  const applySelection = useCallback((code: string, dts: DocumentTypeStatus[], rls: RuleVersion[]) => {
    const dt = dts.find((d) => d.code === code);
    if (!dt) return;
    const draft = rls
      .filter((r) => r.document_type === code && r.status === 'draft' && r.store_id === storeId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (draft) {
      const movs = (draft.movements ?? []).map((m) => ({ ...m }));
      setEditorMovements(movs);
      setBaseline(JSON.stringify(movs));
      setEditorSource({ kind: 'draft', ruleId: draft.id, version: draft.version });
    } else {
      const movs = (dt.movements ?? []).map((m) => ({ ...m }));
      setEditorMovements(movs);
      setBaseline(JSON.stringify(movs));
      setEditorSource({ kind: 'active', version: dt.version });
    }
    setSimResult(null);
  }, [storeId]);

  const resetSimulator = useCallback(() => {
    setSimResult(null);
    setSelectedDocumentId('');
    setManualValues({});
    setDocuments([]);
  }, []);

  const onSelectType = useCallback((code: string) => {
    setSelectedCode(code);
    setPostingErrors([]);
    applySelection(code, documentTypes, rules);
    resetSimulator();
    const dt = documentTypes.find((d) => d.code === code);
    if (dt && dt.errores > 0) fetchPostingErrors(code);
    // Documentos para el selector del simulador
    if (SUPPORTED.includes(code)) {
      setDocsLoading(true);
      fetch(`/api/fin/documents?store_id=${storeId}&doctype=${code}`, {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('Error al cargar documentos');
          const data = await res.json();
          setDocuments(data.documents ?? []);
        })
        .catch(() => setDocuments([]))
        .finally(() => setDocsLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentTypes, rules, storeId, authToken, applySelection, resetSimulator]);

  const fetchPostingErrors = useCallback(async (code: string) => {
    if (!storeId) return;
    try {
      const { data, error } = await supabase
        .from('fin_posting_errors')
        .select('id, store_id, document_type, document_id, document_number, event, error_code, error_detail, attempts, created_at, last_attempt_at, resolved_at')
        .eq('store_id', storeId)
        .eq('document_type', code)
        .is('resolved_at', null)
        .order('created_at')
        .limit(20);
      if (error) throw error;
      setPostingErrors((data as PostingErrorRow[]) ?? []);
    } catch {
      setPostingErrors([]);
    }
  }, [storeId]);

  // ── Derivados ──
  const selected = useMemo(
    () => documentTypes.find((d) => d.code === selectedCode) ?? null,
    [documentTypes, selectedCode],
  );
  const categoriesByCode = useMemo(() => {
    const map = new Map<string, FinCategory>();
    for (const c of categories) map.set(c.code, c);
    return map;
  }, [categories]);
  const selectedMetrics = useMemo(
    () => (selectedCode ? metrics.filter((m) => m.document_type === selectedCode) : []),
    [metrics, selectedCode],
  );
  const historyRules = useMemo(
    () => (selectedCode ? rules.filter((r) => r.document_type === selectedCode) : []),
    [rules, selectedCode],
  );

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documentTypes.filter((dt) => {
      if (onlyUnconfigured && dt.configurado) return false;
      if (moduleFilter !== 'todos' && dt.module !== moduleFilter) return false;
      if (q) {
        return dt.name.toLowerCase().includes(q)
          || dt.code.toLowerCase().includes(q)
          || dt.module.toLowerCase().includes(q);
      }
      return true;
    });
  }, [documentTypes, search, moduleFilter, onlyUnconfigured]);

  const moduleGroups = useMemo(() => {
    const groups: { module: string; items: DocumentTypeStatus[] }[] = [];
    for (const dt of filteredTypes) {
      let g = groups.find((x) => x.module === dt.module);
      if (!g) { g = { module: dt.module, items: [] }; groups.push(g); }
      g.items.push(dt);
    }
    groups.sort((a, b) => {
      const ia = MODULE_LIST.indexOf(a.module);
      const ib = MODULE_LIST.indexOf(b.module);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return groups;
  }, [filteredTypes]);

  const modulesPresent = useMemo(() => {
    const set = new Set<string>();
    for (const dt of documentTypes) set.add(dt.module);
    return MODULE_LIST.filter((m) => set.has(m))
      .concat([...set].filter((m) => !MODULE_LIST.includes(m)));
  }, [documentTypes]);

  // ── Editor: mutaciones ──
  const renumber = (movs: MovementTemplate[]): MovementTemplate[] =>
    movs.map((m, i) => ({ ...m, orden: i + 1 }));

  const patchEditor = (next: MovementTemplate[]) => {
    const renumbered = renumber(next);
    setEditorMovements(renumbered);
    setSimResult(null);
  };

  const moveRow = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= editorMovements.length) return;
    const next = [...editorMovements];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    patchEditor(next);
  };

  const removeRow = (index: number) => {
    patchEditor(editorMovements.filter((_, i) => i !== index));
  };

  const upsertRow = (tpl: MovementTemplate, editIndex: number | null) => {
    if (editIndex === null) patchEditor([...editorMovements, tpl]);
    else {
      const next = [...editorMovements];
      next[editIndex] = tpl;
      patchEditor(next);
    }
  };

  // ── Guardar borrador / activar ──
  const movementsPayload = () =>
    editorMovements.map((m) => ({
      ...m,
      condicion: m.condicion ?? null,
    }));

  const saveDraft = async (): Promise<string | null> => {
    // Devuelve el id de la versión creada (o null si falló).
    const res = await fetch('/api/fin/config', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        document_type: selectedCode,
        scope: 'store' as const,
        movements: movementsPayload(),
        notes: editorSource.kind === 'draft'
          ? `Edición del borrador v${editorSource.version ?? '?'} (desde Configuración de Documentos)`
          : 'Borrador creado desde Configuración de Documentos',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const det = Array.isArray((data as { detalles?: unknown }).detalles)
        ? ` — ${((data as { detalles: unknown[] }).detalles).join(' · ')}`
        : '';
      throw new Error((data as { error?: string }).error ? `${(data as { error: string }).error}${det}` : 'Error al guardar el borrador');
    }
    return ((data as { rule_version?: { id?: string } }).rule_version?.id) ?? null;
  };

  const ruleAction = async (id: string, action: 'activate' | 'deactivate') => {
    const res = await fetch('/api/fin/config/rule-action', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ rule_version_id: id, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const det = Array.isArray((data as RuleActionResult).advertencias)
        ? ` — ${((data as unknown as { advertencias: string[] }).advertencias).join(' · ')}`
        : '';
      throw new Error((data as { error?: string }).error ? `${(data as { error: string }).error}${det}` : 'Error en la acción de la regla');
    }
    return data as RuleActionResult;
  };

  const handleSaveDraft = async () => {
    if (saving || activating || !selectedCode) return;
    setSaving(true);
    try {
      await saveDraft();
      toast.success('Borrador guardado. Actívalo cuando la configuración esté probada.');
      await fetchConfig(selectedCode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const runActivate = async () => {
    if (activating || saving || !selectedCode) return;
    setActivating(true);
    try {
      // «Activar configuración»: primero guarda si hay cambios, luego activa.
      let targetId: string | null = null;
      if (dirty || editorSource.kind !== 'draft') {
        targetId = await saveDraft();
      } else if (editorSource.kind === 'draft') {
        targetId = editorSource.ruleId;
      }
      if (!targetId) throw new Error('No se pudo determinar la versión a activar');
      const out = await ruleAction(targetId, 'activate');
      if (Array.isArray(out.advertencias) && out.advertencias.length > 0) {
        toast.warning(`Configuración activada con advertencias: ${out.advertencias.join(' · ')}`);
      } else {
        toast.success('Configuración activada. Los documentos posteriores se contabilizarán con esta regla.');
      }
      await fetchConfig(selectedCode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setActivating(false);
    }
  };

  const handleHistoryRuleAction = async (rule: RuleVersion, action: 'activate' | 'deactivate') => {
    if (activating) return;
    setActivating(true);
    try {
      const out = await ruleAction(rule.id, action);
      if (Array.isArray(out.advertencias) && out.advertencias.length > 0) {
        toast.warning(`Acción completada con advertencias: ${out.advertencias.join(' · ')}`);
      } else {
        toast.success(action === 'activate' ? 'Versión activada' : 'Versión desactivada');
      }
      await fetchConfig(selectedCode ?? undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setActivating(false);
      setConfirmActivateRule(null);
    }
  };

  const handleEditAsNewDraft = (rule: RuleVersion) => {
    const movs = (rule.movements ?? []).map((m) => ({ ...m }));
    const normalized = renumber(movs);
    setEditorMovements(normalized);
    setBaseline(JSON.stringify(normalized));
    setEditorSource({ kind: 'new' });
    setSimResult(null);
    toast.info(`Plantillas de la v${rule.version} copiadas al editor. Guarda para crear un nuevo borrador.`);
  };

  // ── Simulador ──
  const handleSimulate = async () => {
    if (simulating || !selectedCode) return;
    if (simMode === 'documento' && !selectedDocumentId) {
      toast.error('Selecciona un documento real o cambia a datos manuales');
      return;
    }
    if (simMode === 'manual') {
      const anyValue = selectedMetrics.some((m) => (manualValues[m.metric] ?? '').trim() !== '');
      if (!anyValue) { toast.error('Indica al menos un valor manual'); return; }
    }
    setSimulating(true);
    try {
      const body: Record<string, unknown> = {
        doctype: selectedCode,
        movements_override: movementsPayload(),
      };
      if (simMode === 'documento') {
        body.document_id = selectedDocumentId;
      } else {
        const manual: Record<string, string | number> = {};
        for (const m of selectedMetrics) {
          const raw = (manualValues[m.metric] ?? '').trim();
          if (m.unit === 'CUP') {
            const n = parseFloat(raw);
            manual[m.metric] = Number.isFinite(n) ? n : 0;
          } else if (raw !== '') {
            manual[m.metric] = raw;
          }
        }
        body.metrics_manual = manual;
      }
      const res = await fetch('/api/fin/config/simulate', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Error al simular');
      setSimResult(data as SimulateResult);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setSimulating(false);
    }
  };

  // ── Reproceso de errores de contabilización ──
  const handleReprocess = async () => {
    if (reprocessing || !storeId) return;
    setReprocessing(true);
    try {
      const res = await fetch('/api/fin/posting', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action: 'reprocess', store_id: storeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Error al reintentar');
      const out = data as ReprocessResult;
      if (out.fallidos > 0) {
        toast.warning(`Reproceso: ${out.resueltos} resueltos, ${out.fallidos} fallidos. Revisa la configuración e inténtalo de nuevo.`);
      } else if (out.resueltos === 0) {
        toast.info('No había errores pendientes que reprocesar.');
      } else {
        toast.success(`Reproceso completado: ${out.resueltos} asientos recuperados.`);
      }
      await fetchConfig(selectedCode ?? undefined);
      if (selectedCode) fetchPostingErrors(selectedCode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setReprocessing(false);
    }
  };

  // ── Impacto y balance (derivados de la última simulación) ──
  const impactRows = useMemo(() => {
    if (!simResult) return [];
    const byCat = new Map<string, { debito: number; credito: number }>();
    for (const mv of simResult.movimientos) {
      const entry = byCat.get(mv.categoria) ?? { debito: 0, credito: 0 };
      if (mv.sentido === 'debito') entry.debito += mv.amount;
      else entry.credito += mv.amount;
      byCat.set(mv.categoria, entry);
    }
    return [...byCat.entries()]
      .map(([code, v]) => {
        const cat = categoriesByCode.get(code);
        const clase = cat?.clase ?? 'activo';
        // Activo/gasto suben por débito; pasivo/patrimonio/ingreso suben por crédito.
        const delta = clase === 'activo' || clase === 'gasto'
          ? v.debito - v.credito
          : v.credito - v.debito;
        return { code, name: cat?.name ?? code, clase, delta, debito: v.debito, credito: v.credito };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [simResult, categoriesByCode]);

  const balanceIndicator = useMemo(() => {
    const missingOrigen = editorMovements.some((m) => !m.origen);
    if (missingOrigen) {
      return { label: 'Sin origen de importe', cls: 'bg-destructive/10 text-destructive border-destructive/30' };
    }
    if (simResult) {
      if (simResult.total_debitos === 0 || simResult.total_creditos === 0) {
        return { label: 'Incompleta', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' };
      }
      if (simResult.equilibrado) {
        return { label: 'Configuración equilibrada', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' };
      }
      return { label: 'Desequilibrada', cls: 'bg-destructive/10 text-destructive border-destructive/30' };
    }
    const hasD = editorMovements.some((m) => m.sentido === 'debito');
    const hasC = editorMovements.some((m) => m.sentido === 'credito');
    if (!hasD || !hasC) {
      return { label: 'Incompleta', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' };
    }
    return { label: 'Pendiente de simulación', cls: 'bg-muted text-muted-foreground border-border' };
  }, [editorMovements, simResult]);

  // ── Guardas de tienda ──
  if (!storeId) {
    return (
      <div className="w-full max-w-7xl mx-auto p-4">
        <ViewHeader />
        <div className="bg-card rounded-2xl border border-border p-10 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-bold text-foreground">Selecciona una tienda</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            La configuración de documentos es por tienda. Activa una tienda para continuar.
          </p>
        </div>
      </div>
    );
  }

  const simulatorSupported = selectedCode ? SUPPORTED.includes(selectedCode) : false;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 p-4">
      <ViewHeader onOpening={() => setOpeningOpen(true)} />

      {loading && documentTypes.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cargando configuración...</p>
        </div>
      ) : loadError ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-destructive/60 mx-auto" />
          <p className="text-sm font-bold text-destructive">{loadError}</p>
          <Button variant="outline" onClick={() => fetchConfig()} className="min-h-[44px] font-black uppercase tracking-widest text-xs">
            <RefreshCw className="w-4 h-4" /> Reintentar
          </Button>
        </div>
      ) : documentTypes.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <Settings2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No hay tipos documentales disponibles</p>
          <p className="text-xs text-muted-foreground/70 mt-1">El catálogo del motor no devolvió tipos documentales.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[340px,1fr] gap-4 items-start">
          {/* ══════════ a) Catálogo (izquierda) ══════════ */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {/* Filtros */}
            <div className="p-3 space-y-2.5 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tipo documental..."
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-border bg-background text-sm font-medium min-h-[44px]"
                />
              </div>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="min-h-[44px] bg-background">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los módulos</SelectItem>
                  {modulesPresent.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center justify-between gap-3 min-h-[44px] rounded-xl border border-border px-3 bg-background cursor-pointer">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Solo sin configurar
                </span>
                <Switch checked={onlyUnconfigured} onCheckedChange={setOnlyUnconfigured} />
              </label>
            </div>

            {/* Lista */}
            <div className="max-h-[70vh] overflow-y-auto">
              {filteredTypes.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-xs font-bold text-muted-foreground">Ningún tipo coincide con los filtros</p>
                </div>
              ) : moduleGroups.map((group) => (
                <div key={group.module}>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                    {group.module}
                  </p>
                  <div className="divide-y divide-border/50">
                    {group.items.map((dt) => {
                      const isSel = dt.code === selectedCode;
                      return (
                        <button
                          key={dt.code}
                          onClick={() => onSelectType(dt.code)}
                          className={cn(
                            'w-full text-left px-3 py-2.5 min-h-[44px] transition-colors',
                            isSel ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-primary/5 border-l-2 border-transparent',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={cn('text-xs font-bold truncate', isSel ? 'text-primary' : 'text-foreground')}>
                                {dt.name}
                              </p>
                              <p className="text-[10px] font-mono text-muted-foreground">{dt.code}</p>
                            </div>
                            <span className={cn(
                              'shrink-0 px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest',
                              dt.configurado
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-600 border-amber-500/30',
                            )}>
                              {dt.configurado ? 'Configurado' : 'Sin configurar'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-bold text-muted-foreground tabular-nums">
                              {dt.asientos} asientos
                            </span>
                            {dt.errores > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30 text-[9px] font-black uppercase tabular-nums">
                                {dt.errores} errores
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ══════════ b) Panel de configuración (derecha) ══════════ */}
          {!selected ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center">
              <Settings2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm font-bold text-muted-foreground">Selecciona un tipo documental del catálogo</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Verás su información, el constructor de movimientos, el simulador y el historial de versiones.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Info del documento */}
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-base font-black text-foreground">{selected.name}</h2>
                    <p className="text-[10px] font-mono text-muted-foreground">{selected.code}</p>
                  </div>
                  <span className={cn(
                    'px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest',
                    selected.configurado
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/30',
                  )}>
                    {selected.configurado ? 'Configurado' : 'Sin configurar'}
                  </span>
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-xs">
                  <InfoItem label="Módulo" value={selected.module} />
                  <InfoItem label="Tabla fuente" value={selected.source_table} mono />
                  <InfoItem label="Dispara con" value={selected.trigger_status ?? '— (sin trigger)'} />
                  <InfoItem label="Versión activa" value={selected.version != null ? `v${selected.version}` : '—'} />
                  <InfoItem label="Vigente desde" value={selected.effective_from ?? '—'} />
                  <InfoItem label="Asientos contabilizados" value={String(selected.asientos)} />
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descripción</p>
                    <p className="text-muted-foreground leading-relaxed">{selected.description ?? '—'}</p>
                  </div>
                </div>
              </div>

              {/* Constructor de movimientos */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
                        Movimientos económicos que genera este documento
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {editorSource.kind === 'draft' && `Editando borrador v${editorSource.version ?? '?'} (no activo)`}
                        {editorSource.kind === 'active' && 'Sin borrador: se muestra la regla activa vigente'}
                        {editorSource.kind === 'new' && 'Plantillas copiadas al editor (nuevo borrador al guardar)'}
                        {dirty && <span className="text-amber-600 font-bold"> · cambios sin guardar</span>}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setMovementDialog({ open: true, editIndex: null })}
                      className="min-h-[44px] font-black uppercase tracking-widest text-xs gap-2"
                    >
                      <Plus className="w-4 h-4" /> Agregar movimiento
                    </Button>
                  </div>
                </div>

                {editorMovements.length === 0 ? (
                  <div className="p-8 text-center">
                    <ArrowLeftRight className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs font-bold text-muted-foreground">Sin movimientos configurados</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      Agrega plantillas de débito y crédito (o copia una versión del historial).
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                      <thead className="bg-muted/50 border-y border-border">
                        <tr>
                          <th className="px-2 py-2.5 w-[76px] text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Orden</th>
                          <th className="px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Evento</th>
                          <th className="px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoría</th>
                          <th className="px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sentido</th>
                          <th className="px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Importe desde</th>
                          <th className="px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Condición</th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {editorMovements.map((m, i) => {
                          const cat = categoriesByCode.get(m.categoria);
                          const meta = claseMeta(cat?.clase ?? '');
                          const origenMetrica: string | null = m.origen?.tipo === 'metrica' ? m.origen.metrica : null;
                          const origenLabel = m.origen?.tipo === 'constante'
                            ? `Valor constante: ${m.origen.valor}`
                            : (selectedMetrics.find((x) => x.metric === origenMetrica)?.label ?? origenMetrica ?? '—');
                          return (
                            <tr key={`${m.categoria}-${i}-${m.orden ?? i}`} className="hover:bg-primary/5 transition-colors">
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <span className="text-xs font-mono font-black tabular-nums w-5 text-center">{m.orden ?? i + 1}</span>
                                  <div className="flex flex-col">
                                    <button
                                      onClick={() => moveRow(i, -1)}
                                      disabled={i === 0}
                                      className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-20 min-h-[22px] min-w-[22px]"
                                      aria-label="Subir"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => moveRow(i, 1)}
                                      disabled={i === editorMovements.length - 1}
                                      className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-20 min-h-[22px] min-w-[22px]"
                                      aria-label="Bajar"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <span className={cn(
                                  'px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest',
                                  m.evento === 'reconocimiento'
                                    ? 'bg-primary/10 text-primary border-primary/30'
                                    : 'bg-violet-500/10 text-violet-600 border-violet-500/30',
                                )}>
                                  {m.evento === 'reconocimiento' ? 'Reconocimiento' : 'Pago'}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold truncate">{cat?.name ?? m.categoria}</p>
                                    <p className="text-[10px] font-mono text-muted-foreground">{m.categoria}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2">
                                <span className={cn(
                                  'inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest',
                                  m.sentido === 'debito'
                                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                                    : 'bg-red-500/10 text-red-600 border-red-500/30',
                                )}>
                                  {m.sentido === 'debito'
                                    ? <><ArrowUpRight className="w-3 h-3" /> Débito</>
                                    : <><ArrowDownRight className="w-3 h-3" /> Crédito</>}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <p className="text-xs">{origenLabel}</p>
                                {!m.origen && (
                                  <p className="text-[10px] font-bold text-destructive">Falta origen del importe</p>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <p className="text-[11px] text-muted-foreground">{summarizeCondition(m.condicion)}</p>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => setMovementDialog({ open: true, editIndex: i })}
                                    className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors min-h-[44px] min-w-[44px]"
                                    aria-label="Editar movimiento" title="Editar"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => removeRow(i)}
                                    className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors min-h-[44px] min-w-[44px]"
                                    aria-label="Eliminar movimiento" title="Eliminar"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Balance de la configuración */}
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                    <Scale className="w-4 h-4 text-primary" /> Balance de la configuración
                  </h3>
                  <span className={cn('px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest', balanceIndicator.cls)}>
                    {balanceIndicator.label}
                  </span>
                </div>

                {simResult ? (
                  <div className="mt-3 overflow-x-auto bg-card rounded-2xl border border-border">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoría</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Débitos</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Créditos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {impactRows.map((r) => (
                          <tr key={r.code} className="hover:bg-primary/5 transition-colors">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className={cn('w-2 h-2 rounded-full shrink-0', claseMeta(r.clase).dot)} />
                                <div>
                                  <p className="text-xs font-bold">{r.name}</p>
                                  <p className="text-[10px] font-mono text-muted-foreground">{r.code}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs font-mono font-bold tabular-nums">
                              {r.debito > 0 ? formatCurrency(r.debito) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs font-mono font-bold tabular-nums">
                              {r.credito > 0 ? formatCurrency(r.credito) : '—'}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-border bg-muted/30">
                          <td className="px-3 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground">Totales</td>
                          <td className="px-3 py-2.5 text-right text-xs font-mono font-black tabular-nums">{formatCurrency(simResult.total_debitos)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-mono font-black tabular-nums">{formatCurrency(simResult.total_creditos)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Ejecuta el simulador con un documento real o datos manuales para ver aquí la vista previa
                      de débitos y créditos por categoría con importes.
                    </p>
                  </div>
                )}
              </div>

              {/* Simulador */}
              <div className="bg-card rounded-2xl border border-border p-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                  <Play className="w-4 h-4 text-primary" /> Simulador
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Prueba la configuración sin escribir datos. La simulación nunca contabiliza.
                </p>

                {/* Modo */}
                <div className="flex gap-1 bg-muted p-0.5 rounded-lg border border-border mt-3">
                  {(['documento', 'manual'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSimMode(mode)}
                      className={cn(
                        'flex-1 px-3 py-2.5 rounded-md text-xs font-black uppercase tracking-widest transition-all min-h-[44px]',
                        simMode === mode ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {mode === 'documento' ? 'Documento real' : 'Datos manuales'}
                    </button>
                  ))}
                </div>

                <div className="mt-3 space-y-3">
                  {simMode === 'documento' && (
                    simulatorSupported ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Documento de la tienda</Label>
                        {docsLoading ? (
                          <div className="h-11 rounded-xl border border-border bg-background flex items-center px-3 gap-2 min-h-[44px]">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">Cargando documentos...</span>
                          </div>
                        ) : documents.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            No hay documentos consultables de este tipo. Usa datos manuales.
                          </p>
                        ) : (
                          <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
                            <SelectTrigger className="min-h-[44px] bg-background"><SelectValue placeholder="Selecciona documento" /></SelectTrigger>
                            <SelectContent>
                              {documents.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {`#${d.number} · ${d.date ?? ''} · ${formatCurrency(Number(d.total ?? 0))}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          Este tipo documental no tiene documentos consultables por el selector.
                          Cambia a «Datos manuales» para probar la configuración.
                        </p>
                      </div>
                    )
                  )}

                  {simMode === 'manual' && (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                          Métricas de importe (CUP)
                        </p>
                        {selectedMetrics.filter((m) => m.unit === 'CUP').length === 0 ? (
                          <p className="text-xs text-muted-foreground">Este tipo no tiene métricas de importe en el catálogo.</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {selectedMetrics.filter((m) => m.unit === 'CUP').map((m) => (
                              <div key={m.metric} className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground leading-tight block" htmlFor={`manual-${m.metric}`}>
                                  {m.label}
                                </Label>
                                <Input
                                  id={`manual-${m.metric}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={manualValues[m.metric] ?? ''}
                                  onChange={(e) => setManualValues((prev) => ({ ...prev, [m.metric]: e.target.value }))}
                                  placeholder="0.00"
                                  className="min-h-[44px] tabular-nums"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedMetrics.some((m) => m.unit !== 'CUP') && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                            Atributos de texto (para condiciones)
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {selectedMetrics.filter((m) => m.unit !== 'CUP').map((m) => (
                              <div key={m.metric} className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground leading-tight block" htmlFor={`manual-${m.metric}`}>
                                  {m.label}
                                </Label>
                                <Input
                                  id={`manual-${m.metric}`}
                                  value={manualValues[m.metric] ?? ''}
                                  onChange={(e) => setManualValues((prev) => ({ ...prev, [m.metric]: e.target.value }))}
                                  placeholder="Ej: cash, CUP, egreso"
                                  className="min-h-[44px]"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleSimulate}
                    disabled={simulating}
                    className="min-h-[44px] w-full sm:w-auto font-black uppercase tracking-widest text-xs gap-2"
                  >
                    {simulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {simulating ? 'Simulando...' : 'Probar configuración'}
                  </Button>

                  {simResult && (
                    <div className="space-y-3 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                          'px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest',
                          simResult.equilibrado
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                            : 'bg-destructive/10 text-destructive border-destructive/30',
                        )}>
                          {simResult.equilibrado ? 'Equilibrado' : 'Desequilibrado'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Débitos <span className="font-mono font-black tabular-nums">{formatCurrency(simResult.total_debitos)}</span>
                          {' · '}Créditos <span className="font-mono font-black tabular-nums">{formatCurrency(simResult.total_creditos)}</span>
                        </span>
                      </div>

                      {simResult.movimientos.length === 0 ? (
                        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                            La configuración no generó movimientos con estos datos (condiciones no cumplidas
                            o importes en 0). La simulación no escribe datos.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto bg-card rounded-2xl border border-border">
                          <table className="w-full text-sm min-w-[480px]">
                            <thead className="bg-muted/50 border-b border-border">
                              <tr>
                                <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoría</th>
                                <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sentido</th>
                                <th className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Importe</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {simResult.movimientos.map((mv, i) => {
                                const cat = categoriesByCode.get(mv.categoria);
                                return (
                                  <tr key={`${mv.categoria}-${i}`} className="hover:bg-primary/5 transition-colors">
                                    <td className="px-3 py-2.5">
                                      <p className="text-xs font-bold">{cat?.name ?? mv.categoria}</p>
                                      <p className="text-[10px] font-mono text-muted-foreground">{mv.categoria}</p>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span className={cn(
                                        'px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest',
                                        mv.sentido === 'debito'
                                          ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                                          : 'bg-red-500/10 text-red-600 border-red-500/30',
                                      )}>
                                        {mv.sentido === 'debito' ? 'Débito' : 'Crédito'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-xs font-mono font-bold tabular-nums">
                                      {formatCurrency(mv.amount)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Impacto en la situación financiera */}
                      {impactRows.length > 0 && (
                        <div className="rounded-2xl border border-border p-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                            ¿Cómo afecta este documento a la situación financiera?
                          </p>
                          <div className="space-y-1.5">
                            {impactRows.map((r) => {
                              const up = r.delta > 0;
                              const flat = r.delta === 0;
                              return (
                                <div key={r.code} className="flex items-center justify-between gap-3 rounded-lg bg-muted/20 px-2.5 py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={cn('w-2 h-2 rounded-full shrink-0', claseMeta(r.clase).dot)} />
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold truncate">{r.name}</p>
                                      <p className="text-[10px] font-mono text-muted-foreground">{r.code}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={cn(
                                      'text-[10px] font-black uppercase tracking-widest',
                                      flat ? 'text-muted-foreground' : up ? 'text-emerald-600' : 'text-destructive',
                                    )}>
                                      {flat ? 'Neutro' : up ? 'Sube' : 'Baja'}
                                    </span>
                                    {flat
                                      ? <Minus className="w-4 h-4 text-muted-foreground" />
                                      : up
                                        ? <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                                        : <ArrowDownRight className="w-4 h-4 text-destructive" />}
                                    <span className={cn(
                                      'text-xs font-mono font-black tabular-nums min-w-[86px] text-right',
                                      flat ? 'text-muted-foreground' : up ? 'text-emerald-600' : 'text-destructive',
                                    )}>
                                      {flat ? '0.00' : `${up ? '+' : '-'}${formatCurrency(Math.abs(r.delta))}`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Historial de versiones */}
              <div className="bg-card rounded-2xl border border-border p-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" /> Historial de versiones
                </h3>
                {historyRules.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">Sin versiones registradas para este tipo documental.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {historyRules.map((r) => {
                      const isDraft = r.status === 'draft';
                      const isActive = r.status === 'active';
                      const statusCls = isActive
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                        : isDraft
                          ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                          : 'bg-muted text-muted-foreground border-border';
                      const statusLabel = isActive ? 'Activa' : isDraft ? 'Borrador' : 'Inactiva';
                      return (
                        <div key={r.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black">v{r.version}</span>
                              <span className={cn('px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest', statusCls)}>
                                {statusLabel}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {r.store_id ? 'Tienda' : 'Global'}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {new Date(r.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          {r.notes && (
                            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{r.notes}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2.5">
                            <Button
                              size="sm" variant="outline"
                              onClick={() => handleEditAsNewDraft(r)}
                              className="min-h-[44px] text-[10px] font-black uppercase tracking-widest gap-1.5"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Editar como nuevo borrador
                            </Button>
                            {isDraft && (
                              <Button
                                size="sm"
                                onClick={() => setConfirmActivateRule(r)}
                                disabled={activating}
                                className="min-h-[44px] text-[10px] font-black uppercase tracking-widest gap-1.5"
                              >
                                <Zap className="w-3.5 h-3.5" /> Activar
                              </Button>
                            )}
                            {isActive && (
                              <Button
                                size="sm" variant="outline"
                                onClick={() => handleHistoryRuleAction(r, 'deactivate')}
                                disabled={activating}
                                className="min-h-[44px] text-[10px] font-black uppercase tracking-widest gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                              >
                                <Ban className="w-3.5 h-3.5" /> Desactivar
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Errores de contabilización (solo si errores > 0) */}
              {selected.errores > 0 && (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-sm font-black uppercase tracking-widest text-destructive flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Errores de contabilización ({selected.errores})
                    </h3>
                    <Button
                      size="sm"
                      onClick={handleReprocess}
                      disabled={reprocessing}
                      className="min-h-[44px] text-[10px] font-black uppercase tracking-widest gap-1.5"
                    >
                      {reprocessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      {reprocessing ? 'Reintentando...' : 'Reintentar contabilización'}
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {postingErrors.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {selected.errores} error(es) pendiente(s). Carga la vista de nuevo si no aparecen en detalle.
                      </p>
                    ) : postingErrors.map((pe) => (
                      <div key={pe.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {pe.document_type} · {pe.event}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                            {pe.attempts} intento(s)
                          </span>
                        </div>
                        {pe.document_number && (
                          <p className="text-[11px] font-mono text-muted-foreground mt-1">{pe.document_number}</p>
                        )}
                        <p className="text-xs text-destructive mt-1 leading-relaxed break-words">
                          {pe.error_detail ?? pe.error_code ?? 'Error desconocido'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones del panel */}
              <div className="bg-card rounded-2xl border border-border p-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={saving || activating}
                  className="min-h-[44px] font-black uppercase tracking-widest text-xs gap-2"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Guardando...' : 'Guardar borrador'}
                </Button>
                <Button
                  onClick={() => setConfirmActivateConfig(true)}
                  disabled={saving || activating || editorMovements.length === 0}
                  className="min-h-[44px] font-black uppercase tracking-widest text-xs gap-2"
                >
                  {activating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {activating ? 'Activando...' : 'Activar configuración'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diálogo: agregar/editar movimiento */}
      <MovementDialog
        open={movementDialog.open}
        editIndex={movementDialog.editIndex}
        movements={editorMovements}
        metrics={selectedMetrics}
        categories={categories}
        onClose={() => setMovementDialog({ open: false, editIndex: null })}
        onSave={(tpl, editIndex) => {
          upsertRow(tpl, editIndex);
          setMovementDialog({ open: false, editIndex: null });
        }}
      />

      {/* Diálogo: saldos iniciales */}
      <OpeningBalancesDialog
        open={openingOpen}
        onClose={() => setOpeningOpen(false)}
        categories={categories}
      />

      {/* Confirmación: activar configuración (botón del panel) */}
      <AlertDialog open={confirmActivateConfig} onOpenChange={setConfirmActivateConfig}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar esta configuración?</AlertDialogTitle>
            <AlertDialogDescription>
              {dirty || editorSource.kind !== 'draft'
                ? 'Se guardará primero un borrador con los cambios del editor y se activará a continuación. La versión activa anterior quedará desactivada; los documentos posteriores se contabilizarán con esta regla.'
                : 'Se activará el borrador en edición. La versión activa anterior quedará desactivada; los documentos posteriores se contabilizarán con esta regla.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={(e) => { e.preventDefault(); setConfirmActivateConfig(false); runActivate(); }}
            >
              Activar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación: activar versión del historial */}
      <AlertDialog open={!!confirmActivateRule} onOpenChange={(o) => !o && setConfirmActivateRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Activar la versión v{confirmActivateRule?.version}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              La versión activa anterior quedará desactivada. Los documentos posteriores
              se contabilizarán con esta configuración.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={(e) => {
                e.preventDefault();
                const rule = confirmActivateRule;
                setConfirmActivateRule(null);
                if (rule) handleHistoryRuleAction(rule, 'activate');
              }}
            >
              Activar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Piezas de la vista
// ─────────────────────────────────────────────────────────────────

function ViewHeader({ onOpening }: { onOpening?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0">
          <Settings2 className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-foreground">
            Configuración de Documentos
          </h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
            Motor de información financiera · Partida doble
          </p>
        </div>
      </div>
      {onOpening && (
        <Button
          onClick={onOpening}
          className="h-11 min-h-[44px] rounded-xl font-black uppercase tracking-widest text-xs gap-2"
        >
          <Landmark className="w-4 h-4" />
          Saldos iniciales
        </Button>
      )}
    </div>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn('text-foreground', mono ? 'font-mono text-xs' : 'text-xs font-bold')}>{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MovementDialog — alta/edición de una plantilla de movimiento
// ─────────────────────────────────────────────────────────────────

interface MovementDialogProps {
  open: boolean;
  editIndex: number | null;
  movements: MovementTemplate[];
  metrics: MetricCatalogItem[];
  categories: FinCategory[];
  onClose: () => void;
  onSave: (tpl: MovementTemplate, editIndex: number | null) => void;
}

const OTRO_CAMPO = '__otro__';

function MovementDialog({ open, editIndex, movements, metrics, categories, onClose, onSave }: MovementDialogProps) {
  const editing = editIndex !== null ? movements[editIndex] : null;

  const [evento, setEvento] = useState<'reconocimiento' | 'pago'>('reconocimiento');
  const [categoria, setCategoria] = useState('');
  const [sentido, setSentido] = useState<'debito' | 'credito'>('debito');
  const [origenTipo, setOrigenTipo] = useState<'metrica' | 'constante'>('metrica');
  const [origenMetrica, setOrigenMetrica] = useState('');
  const [origenConstante, setOrigenConstante] = useState('');
  const [usarCondicion, setUsarCondicion] = useState(false);
  const [condCampoKind, setCondCampoKind] = useState<'metrica' | 'otro'>('metrica');
  const [condCampo, setCondCampo] = useState('');
  const [condCampoLibre, setCondCampoLibre] = useState('');
  const [condOp, setCondOp] = useState<string>('=');
  const [condValor, setCondValor] = useState('');
  const [orden, setOrden] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  // Al abrir: precarga (edición) o defaults (alta con orden automático)
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setEvento(editing.evento);
      setCategoria(editing.categoria);
      setSentido(editing.sentido);
      if (editing.origen?.tipo === 'constante') {
        setOrigenTipo('constante');
        setOrigenConstante(String(editing.origen.valor));
      } else {
        setOrigenTipo('metrica');
        setOrigenMetrica(editing.origen?.metrica ?? '');
      }
      const cond = editing.condicion ?? null;
      const condList = cond ? (Array.isArray(cond) ? cond : [cond]) : [];
      const first = condList[0];
      setUsarCondicion(!!first);
      if (first) {
        const known = metrics.some((m) => m.metric === first.campo);
        setCondCampoKind(known ? 'metrica' : 'otro');
        setCondCampo(known ? first.campo : '');
        setCondCampoLibre(known ? '' : first.campo);
        setCondOp(first.op);
        setCondValor(first.op === 'existe' ? '' : String(Array.isArray(first.valor) ? first.valor[0] ?? '' : first.valor));
      } else {
        setCondCampoKind('metrica');
        setCondCampo('');
        setCondCampoLibre('');
        setCondOp('=');
        setCondValor('');
      }
      setOrden(String(editing.orden ?? (editIndex !== null ? editIndex + 1 : 1)));
    } else {
      setEvento('reconocimiento');
      setCategoria('');
      setSentido('debito');
      setOrigenTipo('metrica');
      setOrigenMetrica('');
      setOrigenConstante('');
      setUsarCondicion(false);
      setCondCampoKind('metrica');
      setCondCampo('');
      setCondCampoLibre('');
      setCondOp('=');
      setCondValor('');
      const nextOrden = movements.reduce((mx, m) => Math.max(mx, m.orden ?? 0), 0) + 1;
      setOrden(String(nextOrden));
    }
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editIndex]);

  // Métricas sugeridas cuando cambia el evento (solo etiqueta visual; el usuario elige)
  const cupMetrics = metrics.filter((m) => m.unit === 'CUP');
  const textoMetrics = metrics.filter((m) => m.unit !== 'CUP');

  const handleSubmit = () => {
    if (submitting) return;
    if (!categoria) { toast.error('Selecciona la categoría'); return; }
    if (origenTipo === 'metrica' && !origenMetrica) { toast.error('Selecciona la métrica de origen del importe'); return; }
    if (origenTipo === 'constante') {
      const v = parseFloat(origenConstante);
      if (!Number.isFinite(v) || v <= 0) { toast.error('El valor constante debe ser mayor a 0'); return; }
    }
    if (usarCondicion) {
      const campo = condCampoKind === 'metrica' ? condCampo : condCampoLibre.trim();
      if (!campo) { toast.error('Indica el campo de la condición'); return; }
      if (condOp !== 'existe' && condValor.trim() === '') {
        toast.error('Indica el valor de la condición (u usa «existe»)');
        return;
      }
    }
    const ordenNum = parseInt(orden, 10);
    if (!Number.isFinite(ordenNum) || ordenNum < 1 || ordenNum > 99) { toast.error('Orden entre 1 y 99'); return; }

    setSubmitting(true);
    const campo = usarCondicion
      ? (condCampoKind === 'metrica' ? condCampo : condCampoLibre.trim())
      : '';
    const condicion: MovementCondition | null = usarCondicion
      ? { campo, op: condOp, valor: condOp === 'existe' ? '' : condValor.trim() }
      : null;

    const tpl: MovementTemplate = {
      id: editing?.id ?? `ed-${ordenNum}-${Date.now().toString(36).slice(-4)}`,
      evento,
      categoria,
      sentido,
      origen: origenTipo === 'constante'
        ? { tipo: 'constante', valor: parseFloat(origenConstante) }
        : { tipo: 'metrica', metrica: origenMetrica },
      condicion,
      orden: ordenNum,
    };
    onSave(tpl, editIndex);
    setSubmitting(false);
  };

  const grupos = useMemo(() => {
    const byClase = new Map<string, FinCategory[]>();
    for (const c of categories) {
      if (!c.is_active) continue;
      const list = byClase.get(c.clase) ?? [];
      list.push(c);
      byClase.set(c.clase, list);
    }
    const order = ['activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto'];
    return order
      .map((clase) => ({ clase, items: byClase.get(clase) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [categories]);

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={editIndex !== null ? 'Editar movimiento' : 'Agregar movimiento'}
      subtitle="Plantilla aplicada por el motor al contabilizar documentos de este tipo."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Evento</Label>
            <Select value={evento} onValueChange={(v) => setEvento(v as 'reconocimiento' | 'pago')}>
              <SelectTrigger className="min-h-[44px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reconocimiento">Reconocimiento (devengo)</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sentido</Label>
            <Select value={sentido} onValueChange={(v) => setSentido(v as 'debito' | 'credito')}>
              <SelectTrigger className="min-h-[44px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="debito">Débito</SelectItem>
                <SelectItem value="credito">Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Categoría económica</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="min-h-[44px] bg-background"><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
            <SelectContent>
              {grupos.map((g) => (
                <SelectGroup key={g.clase}>
                  <SelectLabel>{claseMeta(g.clase).label}</SelectLabel>
                  {g.items.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Origen del importe</Label>
          <Select
            value={origenTipo === 'metrica' ? (origenMetrica || '') : 'constante'}
            onValueChange={(v) => {
              if (v === 'constante') { setOrigenTipo('constante'); }
              else { setOrigenTipo('metrica'); setOrigenMetrica(v); }
            }}
          >
            <SelectTrigger className="min-h-[44px] bg-background">
              <SelectValue placeholder={origenTipo === 'metrica' ? 'Selecciona métrica' : 'Valor constante'} />
            </SelectTrigger>
            <SelectContent>
              {cupMetrics.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Métricas del documento</SelectLabel>
                  {cupMetrics.map((m) => (
                    <SelectItem key={m.metric} value={m.metric}>{m.label}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectGroup>
                <SelectLabel>Fijo</SelectLabel>
                <SelectItem value="constante">Valor constante</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {origenTipo === 'constante' && (
            <Input
              type="number"
              min="0"
              step="0.01"
              value={origenConstante}
              onChange={(e) => setOrigenConstante(e.target.value)}
              placeholder="Importe fijo (CUP)"
              className="min-h-[44px] tabular-nums"
            />
          )}
          {origenTipo === 'metrica' && !origenMetrica && (
            <p className="text-[10px] text-amber-600">Si el tipo no tiene métricas de importe, usa «Valor constante».</p>
          )}
        </div>

        <Separator />

        <div className="space-y-2.5">
          <label className="flex items-center justify-between gap-3 min-h-[44px] rounded-xl border border-border px-3 bg-background cursor-pointer">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Condición opcional
            </span>
            <Switch checked={usarCondicion} onCheckedChange={setUsarCondicion} />
          </label>

          {usarCondicion && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Campo</Label>
                <Select
                  value={condCampoKind === 'otro' ? OTRO_CAMPO : (condCampo || '')}
                  onValueChange={(v) => {
                    if (v === OTRO_CAMPO) {
                      setCondCampoKind('otro');
                    } else {
                      setCondCampoKind('metrica');
                      setCondCampo(v);
                    }
                  }}
                >
                  <SelectTrigger className="min-h-[44px] bg-background"><SelectValue placeholder="Campo" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Métricas / texto</SelectLabel>
                      {metrics.map((m) => (
                        <SelectItem key={m.metric} value={m.metric}>{m.label}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Avanzado</SelectLabel>
                      <SelectItem value={OTRO_CAMPO}>Otro campo…</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {condCampoKind === 'otro' && (
                  <Input
                    value={condCampoLibre}
                    onChange={(e) => setCondCampoLibre(e.target.value)}
                    placeholder="Nombre del campo (ej: metodo_pago)"
                    className="min-h-[44px] font-mono text-xs"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Operador</Label>
                <Select value={condOp} onValueChange={setCondOp}>
                  <SelectTrigger className="min-h-[44px] bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPS.map((op) => (
                      <SelectItem key={op} value={op}>{op === 'existe' ? 'existe' : op}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Valor</Label>
                <Input
                  value={condValor}
                  onChange={(e) => setCondValor(e.target.value)}
                  placeholder={condOp === 'existe' ? '(no aplica)' : 'Ej: 0, cash, USD'}
                  disabled={condOp === 'existe'}
                  className="min-h-[44px] font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Orden</Label>
          <Input
            type="number"
            min={1}
            max={99}
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            className="min-h-[44px] tabular-nums sm:max-w-[140px]"
          />
          <p className="text-[10px] text-muted-foreground">Automático: siguiente posición del constructor.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-1">
          <Button variant="outline" onClick={onClose} className="min-h-[44px] font-black uppercase tracking-widest text-xs">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="min-h-[44px] font-black uppercase tracking-widest text-xs">
            {editIndex !== null ? 'Guardar cambios' : 'Agregar movimiento'}
          </Button>
        </div>
      </div>
    </BaseDialog>
  );
}

/** Contenedor de diálogo (Dialog de shadcn), mismo patrón que BaseModal. */
function BaseDialog({
  open, onClose, title, subtitle, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
