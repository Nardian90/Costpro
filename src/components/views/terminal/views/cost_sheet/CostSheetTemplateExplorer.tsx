'use client';
import { isAdminLevel } from '@/lib/roles';
import { logger } from '@/lib/logger';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  FolderOpen,
  Lock as LockIcon,
  FileText,
  Download,
  Upload,
  MoreVertical,
  Globe,
  Settings,
  RefreshCw,
  Trash,
  Copy,
  Save,
  HardDrive,
  Store as StoreIcon,
  Plus,
  Cloud,
  Eye,
  Pencil,
  FilePlus2,
  CloudUpload,
  CloudOff,
  LayoutTemplate,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CostSheetData } from '@/types/cost-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCostSheetStore, useAuthStore, useUIStore } from '@/store';
import { useScenarioStore } from '@/store/scenario-store';
import { toast } from 'sonner';
// CP-PLANTILLAS-FASE2: todo el acceso a cost_sheet_templates pasa por el servicio.
import {
  listPrivateTemplates,
  listPublicTemplates,
  createPublicTemplate,
  updatePrivateTemplate,
  deletePrivateTemplate,
  publishTemplate,
  unpublishTemplate,
  updatePublicTemplate,
  changePublicTemplateStore,
  deletePublicTemplate,
  duplicateTemplate,
  type CostSheetTemplateRecord,
} from '@/services/cost-sheet-template-service';
// F3-T01: store-service.ts eliminado — usamos storeApiClient (cliente activo).
import { storeApiClient } from '@/services/store-api-client';
import { Store } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Import Templates (SISTEMA — 13 plantillas oficiales, NO modificar: orden FASE 2 §3A)
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import exampleTemplate from '@/lib/data/costpro-ejemplo';
import juiceTemplate from '@/lib/data/template-juice';
import pizzaTemplate from '@/lib/data/template-pizza';
import pastryTemplate from '@/lib/data/template-pastry';
import furnitureTemplate from '@/lib/data/template-furniture';
import industrialTemplate from '@/lib/data/template-industrial';
import consultancyTemplate from '@/lib/data/template-consultancy';
import icecreamTemplate from '@/lib/data/template-icecream';
import repairTemplate from '@/lib/data/template-repair';
import shoesTemplate from '@/lib/data/template-shoes';
import logisticsTemplate from '@/lib/data/template-logistics';
import lavarTemplate from "@/lib/data/template-lavar";

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from './ConfirmDialog';
import { UnifiedTabs } from './UnifiedTabs';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { CostSheetSaveAsTemplateDialog } from './CostSheetSaveAsTemplateDialog';

type TemplateCategory = 'system' | 'private' | 'public';
/** Origen de la plantilla dentro de la pestaña Privadas. */
type TemplateOrigin = 'system' | 'server' | 'local';

interface Template {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  type: TemplateCategory;
  data: CostSheetData;
  updated_at?: string | null;
  store_id?: string | null;
  /** CP-PLANTILLAS-FASE2: server (Supabase) | local (archivo JSON) | system (código). */
  origin?: TemplateOrigin;
}

/** Convierte un registro del servicio a la forma de UI del Explorador. */
function recordToTemplate(t: CostSheetTemplateRecord): Template {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    type: t.type,
    data: t.data,
    updated_at: t.updated_at ?? t.created_at,
    store_id: t.store_id,
    origin: 'server',
  };
}

export const CostSheetTemplateExplorer: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('system');
  const [searchQuery, setSearchQuery] = useState('');
  // CP-PLANTILLAS-FASE2 §3B.1: plantillas privadas del SERVIDOR (Supabase).
  const [serverPrivateTemplates, setServerPrivateTemplates] = useState<Template[]>([]);
  const [isLoadingPrivate, setIsLoadingPrivate] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  // §3C: plantillas públicas — sin filtro cliente de tienda (la RLS decide).
  const [publicTemplates, setPublicTemplates] = useState<Template[]>([]);
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  // §3B.2: carpeta local (File System Access API) — modalidad secundaria conservada.
  const [localTemplates, setLocalTemplates] = useState<Template[]>([]);
  const [localDirectory, setLocalDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  // Operación en curso (id de plantilla o etiqueta) para deshabilitar duplicados (§7D).
  const [pendingOpId, setPendingOpId] = useState<string | null>(null);
  // G2-fix: confirm() nativo reemplazado por diálogo accesible.
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
  } | null>(null);

  // Diálogo «Guardar como Plantilla» (desde la pestaña Privadas / Públicas).
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [saveTemplateDefaultDestination, setSaveTemplateDefaultDestination] = useState<'private' | 'public'>('private');

  // Diálogo Renombrar / Editar descripción (plantillas privadas de servidor).
  const [renameDialog, setRenameDialog] = useState<{
    template: Template;
    name: string;
    description: string;
  } | null>(null);

  // Diálogo Publicar plantilla privada existente (UPDATE del mismo registro).
  const [publishExistingDialog, setPublishExistingDialog] = useState<{
    template: Template;
    storeId: string;
  } | null>(null);

  // Diálogo Publicar plantilla local como NUEVA pública (INSERT — no hay registro previo).
  const [publishLocalDialog, setPublishLocalDialog] = useState<{
    template: Template;
    name: string;
    description: string;
    storeId: string;
  } | null>(null);

  // Vista previa.
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  const { data: currentSheetData, setSheet } = useCostSheetStore();
  const setActiveTemplateId = useCostSheetStore((s) => s.setActiveTemplateId);
  const { setActiveCostSection } = useUIStore();
  const user = useAuthStore(state => state.user);
  // CP-ORG-001 ciclo 5: nivel administrativo transversal (admin|superadmin)
  const isAdmin = isAdminLevel(user?.role);

  // System Templates (13 — inmutables, viven en el código: orden §3A)
  const systemTemplates: Template[] = useMemo(() => [
    {
      id: 'sys-reinicio',
      name: 'Nueva Ficha',
      description: 'Estructura base vacía con fórmulas de encabezado dinámicas.',
      category: 'Estándar',
      type: 'system',
      data: reinicioTemplate
    },
    {
      id: "sys-lavar",
      name: "Lavar",
      description: "Plantilla para servicios de lavado con carga dinámica.",
      category: "Servicios",
      type: "system",
      data: lavarTemplate
    },
    {
      id: 'sys-juice',
      name: 'Jugo Natural (1L)',
      description: 'Baja complejidad: Solo gasto material (Anexo I).',
      category: 'Bebidas',
      type: 'system',
      data: juiceTemplate
    },
    {
      id: 'sys-pizza',
      name: 'Pizza Margarita',
      description: 'Baja-Media complejidad: Ingredientes y Mano de Obra (I, II).',
      category: 'Gastronomía',
      type: 'system',
      data: pizzaTemplate
    },
    {
      id: 'sys-pastry',
      name: 'Croissant Artesanal',
      description: 'Media complejidad: Materiales, Labor y Otros Directos (I, II, IV).',
      category: 'Repostería',
      type: 'system',
      data: pastryTemplate
    },
    {
      id: 'sys-furniture',
      name: 'Mueble de Roble',
      description: 'Media-Alta complejidad: Materiales, Labor, Depreciación y Otros (I-IV).',
      category: 'Carpintería',
      type: 'system',
      data: furnitureTemplate
    },
    {
      id: 'sys-industrial',
      name: 'Pintura Industrial',
      description: 'Alta complejidad: Todos los anexos con múltiples registros.',
      category: 'Industrial',
      type: 'system',
      data: industrialTemplate
    },
    {
      id: 'sys-consultancy',
      name: 'Consultoría Estratégica',
      description: 'Modelo de servicios profesionales y consultoría.',
      category: 'Servicios',
      type: 'system',
      data: consultancyTemplate
    },
    {
      id: 'sys-icecream',
      name: 'Helado de Chocolate (10L)',
      description: 'Producción de alimentos con cadena de frío.',
      category: 'Alimentos',
      type: 'system',
      data: icecreamTemplate
    },
    {
      id: 'sys-repair',
      name: 'Reparación Técnica',
      description: 'Servicios de reparación y soporte de hardware.',
      category: 'Servicios',
      type: 'system',
      data: repairTemplate
    },
    {
      id: 'sys-shoes',
      name: 'Zapatos de Cuero',
      description: 'Fabricación de calzado e industria ligera.',
      category: 'Manufactura',
      type: 'system',
      data: shoesTemplate
    },
    {
      id: 'sys-logistics',
      name: 'Flete de Carga',
      description: 'Servicios de logística y transporte nacional.',
      category: 'Logística',
      type: 'system',
      data: logisticsTemplate
    },
    {
      id: 'sys-ejemplo',
      name: 'Ejemplo: Producción de Pan',
      description: 'Ficha completa de ejemplo para un lote de producción de pan.',
      category: 'Industria Alimentaria',
      type: 'system',
      data: exampleTemplate
    }
  ], []);

  // ── Carga: privadas del servidor (§3B.1) ────────────────────────────
  const fetchServerPrivateTemplates = useCallback(async () => {
    setIsLoadingPrivate(true);
    setPrivateError(null);
    try {
      const records = await listPrivateTemplates();
      setServerPrivateTemplates(records.map(recordToTemplate));
    } catch (error) {
      logger.warn('COST_SHEET', 'TEMPLATE_PRIVATE_LIST_FAILED', { error: String(error) });
      setPrivateError(
        error instanceof Error ? error.message : 'No se pudieron cargar tus plantillas privadas',
      );
    } finally {
      setIsLoadingPrivate(false);
    }
  }, []);

  // ── Carga: públicas (§3D — sin filtro cliente; la RLS refleja la autorización) ──
  const fetchPublicTemplates = useCallback(async () => {
    setIsLoadingPublic(true);
    setPublicError(null);
    try {
      const records = await listPublicTemplates();
      setPublicTemplates(records.map(recordToTemplate));
    } catch (error) {
      logger.warn('COST_SHEET', 'TEMPLATE_PUBLIC_LIST_FAILED', { error: String(error) });
      setPublicError(
        error instanceof Error ? error.message : 'No se pudieron cargar las plantillas públicas',
      );
    } finally {
      setIsLoadingPublic(false);
    }
  }, []);

  const fetchStores = useCallback(async () => {
    try {
      // F3-T01: usar storeApiClient.fetchStores() (mismo cliente que usa useStores).
      const data = await storeApiClient.fetchStores();
      setStores(data);
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  }, []);

  useEffect(() => {
    if (activeCategory === 'private') {
      fetchServerPrivateTemplates();
    }
    if (activeCategory === 'public') {
      fetchPublicTemplates();
    }
    if (isAdmin) {
      fetchStores();
    }
  }, [activeCategory, fetchServerPrivateTemplates, fetchPublicTemplates, isAdmin, fetchStores]);

  // ── Carpeta local (§3B.2 — conservado) ──────────────────────────────
  const handleSelectDirectory = async () => {
    try {
      const handle = await ((window as unknown) as Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
      setLocalDirectory(handle);
      loadPrivateTemplates(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name !== 'AbortError') {
        console.error('Error picking directory:', error);
        toast.error('No se pudo acceder a la carpeta');
      }
    }
  };

  const loadPrivateTemplates = async (directoryHandle: FileSystemDirectoryHandle) => {
    setIsLoadingPrivate(true);
    try {
      const templates: Template[] = [];
      for await (const entry of ((directoryHandle as unknown) as { values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle> }).values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          const file = await entry.getFile();
          const text = await file.text();
          try {
            const data = JSON.parse(text);
            if (data.sections && data.annexes) {
              templates.push({
                id: `local:${entry.name}`,
                name: data.name || entry.name.replace('.json', ''),
                description: data.metadata?.description || 'Plantilla guardada localmente',
                type: 'private',
                origin: 'local',
                data: data,
                updated_at: new Date(file.lastModified).toISOString()
              });
            }
          } catch (e) {
            logger.warn('COST_SHEET', 'SKIP_INVALID_JSON', { message: `Skipping invalid JSON file: ${entry.name}` });
          }
        }
      }
      setLocalTemplates(templates);
    } catch (error) {
      console.error('Error loading private templates:', error);
      toast.error('Error al leer las plantillas locales');
    } finally {
      setIsLoadingPrivate(false);
    }
  };

  // ── Cargar plantilla en el editor ──────────────────────────────────
  const handleImport = (template: Template, opts?: { navigateTo?: 'structure' | 'main' }) => {
    // Clear scenario store to prevent stale data from previous template
    try {
      const scenarioStore = useScenarioStore.getState();

    } catch {}
    setSheet(template.data);
    // CP-PLANTILLAS-FASE2: vincular la plantilla privada de servidor de origen
    // para poder ofrecer «Actualizar plantilla existente» en el editor (§4).
    setActiveTemplateId(template.origin === 'server' && template.type === 'private' ? template.id : null);
    setActiveCostSection(opts?.navigateTo === 'main' ? 'main' : 'expert-content');
    toast.success(
      opts?.navigateTo === 'main'
        ? `Nueva ficha creada a partir de "${template.name}"`
        : `Plantilla "${template.name}" cargada correctamente`,
    );
  };

  // ── Renombrar / editar descripción (privada de servidor) ───────────
  const handleRenamePrivate = async () => {
    if (!renameDialog) return;
    const { template, name, description } = renameDialog;
    if (!name.trim()) {
      toast.error('El nombre de la plantilla es obligatorio.');
      return;
    }
    if (pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await updatePrivateTemplate(template.id, { name: name.trim(), description });
      toast.success('Plantilla renombrada correctamente');
      setRenameDialog(null);
      fetchServerPrivateTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al renombrar la plantilla', {
        description: 'No se pudo actualizar en COSTPRO. Verifica tu conexión.',
        action: { label: 'Reintentar', onClick: () => handleRenamePrivate() },
      });
    } finally {
      setPendingOpId(null);
    }
  };

  // ── Actualizar contenido con la ficha activa (privada de servidor) ─
  const handleUpdatePrivateContent = (template: Template) => {
    if (!currentSheetData) {
      toast.error('No hay ninguna ficha activa para guardar.');
      return;
    }
    setConfirmDialog({
      title: 'Actualizar plantilla',
      message: `¿Estás seguro de que deseas sobrescribir la plantilla "${template.name}" con los datos actuales del editor?`,
      variant: 'default',
      onConfirm: () => {
        setConfirmDialog(null);
        void doUpdatePrivateContent(template);
      },
    });
  };

  const doUpdatePrivateContent = async (template: Template) => {
    if (!currentSheetData || pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await updatePrivateTemplate(template.id, { data: currentSheetData });
      toast.success(`Plantilla "${template.name}" actualizada correctamente`);
      fetchServerPrivateTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la plantilla', {
        description: 'No se pudo sobrescribir en COSTPRO. Verifica tu conexión.',
        action: { label: 'Reintentar', onClick: () => doUpdatePrivateContent(template) },
      });
    } finally {
      setPendingOpId(null);
    }
  };

  // ── Eliminar privada de servidor (confirmación §3B.1) ───────────────
  const handleDeletePrivate = (template: Template) => {
    setConfirmDialog({
      title: 'Eliminar plantilla',
      message: `¿Estás seguro de que deseas eliminar la plantilla "${template.name}"? Esta acción no se puede deshacer.`,
      variant: 'destructive',
      onConfirm: () => {
        setConfirmDialog(null);
        void doDeletePrivate(template);
      },
    });
  };

  const doDeletePrivate = async (template: Template) => {
    if (pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await deletePrivateTemplate(template.id);
      toast.success(`Plantilla "${template.name}" eliminada correctamente`);
      // Si la ficha activa provenía de esta plantilla, desvincular.
      if (useCostSheetStore.getState().activeTemplateId === template.id) {
        setActiveTemplateId(null);
      }
      fetchServerPrivateTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar la plantilla', {
        description: 'No se pudo eliminar de COSTPRO. Verifica tu conexión.',
        action: { label: 'Reintentar', onClick: () => doDeletePrivate(template) },
      });
    } finally {
      setPendingOpId(null);
    }
  };

  // ── Publicar plantilla privada EXISTENTE (UPDATE mismo registro, §3C) ──
  const handlePublishExisting = async () => {
    if (!publishExistingDialog) return;
    if (!isAdmin) {
      toast.error('Solo los administradores pueden publicar plantillas');
      return;
    }
    const { template, storeId } = publishExistingDialog;
    if (pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await publishTemplate(template.id, storeId === 'all' ? null : storeId);
      toast.success(
        storeId === 'all'
          ? 'Plantilla publicada (visible para todas las tiendas)'
          : 'Plantilla publicada (visible para la tienda seleccionada)',
      );
      setPublishExistingDialog(null);
      fetchServerPrivateTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al publicar la plantilla', {
        description: 'Verifica tu conexión y tus permisos.',
        action: { label: 'Reintentar', onClick: () => handlePublishExisting() },
      });
    } finally {
      setPendingOpId(null);
    }
  };

  // ── Publicar plantilla LOCAL como nueva pública (INSERT) ────────────
  const handlePublishLocal = async () => {
    if (!publishLocalDialog) return;
    if (!isAdmin) {
      toast.error('Solo los administradores pueden publicar plantillas en Supabase');
      return;
    }
    const { template, name, description, storeId } = publishLocalDialog;
    if (!name.trim()) {
      toast.error('El nombre de la plantilla es obligatorio.');
      return;
    }
    if (pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await createPublicTemplate({
        name: name.trim(),
        description,
        data: template.data,
        storeId: storeId === 'all' ? null : storeId,
      });
      toast.success('Plantilla publicada con éxito');
      setPublishLocalDialog(null);
      fetchPublicTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al publicar la plantilla', {
        description: 'No se pudo guardar en Supabase. Verifica tu conexión.',
        action: { label: 'Reintentar', onClick: () => handlePublishLocal() },
      });
    } finally {
      setPendingOpId(null);
    }
  };

  // ── Gestión de públicas (admin) ─────────────────────────────────────
  const handleOverwritePublic = (template: Template) => {
    if (!isAdmin) return;
    if (!currentSheetData) {
      toast.error('No hay ninguna ficha activa para guardar.');
      return;
    }
    setConfirmDialog({
      title: 'Sobrescribir plantilla',
      message: `¿Estás seguro de que deseas sobrescribir la plantilla "${template.name}" con los datos actuales del editor?`,
      variant: 'default',
      onConfirm: () => {
        setConfirmDialog(null);
        void doOverwritePublic(template);
      },
    });
  };

  const doOverwritePublic = async (template: Template) => {
    if (!currentSheetData || pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await updatePublicTemplate(template.id, { data: currentSheetData });
      toast.success('Plantilla actualizada correctamente');
      fetchPublicTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la plantilla', {
        description: 'No se pudo sobrescribir en Supabase. Verifica tu conexión.',
        action: { label: 'Reintentar', onClick: () => doOverwritePublic(template) },
      });
    } finally {
      setPendingOpId(null);
    }
  };

  const handleDeletePublic = (template: Template) => {
    if (!isAdmin) return;
    setConfirmDialog({
      title: 'Eliminar plantilla pública',
      message: `¿Estás seguro de que deseas eliminar la plantilla pública "${template.name}"? Esta acción no se puede deshacer.`,
      variant: 'destructive',
      onConfirm: () => {
        setConfirmDialog(null);
        void doDeletePublic(template);
      },
    });
  };

  const doDeletePublic = async (template: Template) => {
    if (pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await deletePublicTemplate(template.id);
      toast.success('Plantilla eliminada correctamente');
      fetchPublicTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al eliminar la plantilla', {
        description: 'No se pudo eliminar de Supabase. Verifica tu conexión.',
        action: { label: 'Reintentar', onClick: () => doDeletePublic(template) },
      });
    } finally {
      setPendingOpId(null);
    }
  };

  // §7A: duplicar con nombre «Nombre (Copia)» — sin comillas escapadas.
  const handleDuplicatePublic = async (template: Template) => {
    if (!isAdmin) return;
    if (pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await duplicateTemplate({
        id: template.id,
        name: template.name,
        description: template.description ?? null,
        category: template.category ?? null,
        data: template.data,
        type: template.type,
        created_by: null,
        store_id: template.store_id ?? null,
        created_at: null,
        updated_at: null,
      });
      toast.success('Plantilla duplicada correctamente');
      fetchPublicTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al duplicar la plantilla');
    } finally {
      setPendingOpId(null);
    }
  };

  const handleChangeTemplateStore = async (template: Template, storeId: string | null) => {
    if (!isAdmin) return;
    if (pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await changePublicTemplateStore(template.id, storeId);
      toast.success('Tienda de la plantilla actualizada');
      fetchPublicTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la tienda');
    } finally {
      setPendingOpId(null);
    }
  };

  // §3C: retirar publicación — la plantilla vuelve a ser privada de su creador
  // (mismo registro: conserva id, creador y contenido).
  const handleUnpublish = (template: Template) => {
    if (!isAdmin) return;
    setConfirmDialog({
      title: 'Retirar publicación',
      message: `¿Retirar la publicación de "${template.name}"? Volverá a ser una plantilla privada de su creador, conservando su contenido.`,
      variant: 'default',
      onConfirm: () => {
        setConfirmDialog(null);
        void doUnpublish(template);
      },
    });
  };

  const doUnpublish = async (template: Template) => {
    if (pendingOpId) return;
    setPendingOpId(template.id);
    try {
      await unpublishTemplate(template.id);
      toast.success('Publicación retirada: la plantilla volvió a ser privada');
      fetchPublicTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al retirar la publicación', {
        description: 'Verifica tu conexión y tus permisos.',
        action: { label: 'Reintentar', onClick: () => doUnpublish(template) },
      });
    } finally {
      setPendingOpId(null);
    }
  };

  // ── Búsqueda (§7B: por nombre, descripción y nombre real de tienda) ─
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const matchesSearch = useCallback((t: Template) => {
    const q = debouncedSearchQuery.toLowerCase();
    if (!q) return true;
    if (t.name?.toLowerCase().includes(q)) return true;
    if (t.description?.toLowerCase().includes(q)) return true;
    // §7B: para públicas, buscar por el NOMBRE REAL de la tienda (antes:
    // literal «pública general»); sin tienda → etiqueta visible «Pública (General)».
    if (t.type === 'public') {
      const storeLabel = t.store_id
        ? (stores.find(s => s.id === t.store_id)?.name ?? '')
        : 'Pública (General)';
      if (storeLabel.toLowerCase().includes(q)) return true;
    }
    return false;
  }, [debouncedSearchQuery, stores]);

  const filteredSystem = useMemo(
    () => systemTemplates.filter(matchesSearch),
    [systemTemplates, matchesSearch],
  );
  const filteredServerPrivate = useMemo(
    () => serverPrivateTemplates.filter(matchesSearch),
    [serverPrivateTemplates, matchesSearch],
  );
  const filteredLocal = useMemo(
    () => localTemplates.filter(matchesSearch),
    [localTemplates, matchesSearch],
  );
  const filteredPublic = useMemo(
    () => publicTemplates.filter(matchesSearch),
    [publicTemplates, matchesSearch],
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 p-4" aria-busy={isLoadingPrivate || isLoadingPublic}>
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
            <FolderOpen className="w-8 h-8" />
            Explorador de Plantillas
          </h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
            Gestiona y utiliza modelos de fichas de costo predefinidos o propios
          </p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o descripción..."
            className="pl-12 h-12 rounded-2xl bg-primary/5 border-primary/10 focus:ring-primary/20 text-xs font-bold uppercase tracking-widest"
          />
        </div>
      </div>

      {/* P3-7: Categories Tabs — migrado de pills manuales a <UnifiedTabs variant="pills">. */}
      <div className="flex flex-col items-center gap-6">
        <UnifiedTabs
          tabs={[
            { id: 'system', label: 'Sistema', icon: Settings },
            { id: 'private', label: 'Privadas', icon: LockIcon },
            { id: 'public', label: 'Públicas', icon: Globe },
          ]}
          activeTab={activeCategory}
          onTabChange={(id) => setActiveCategory(id as TemplateCategory)}
          variant="pills"
          ariaLabel="Categorías de plantillas"
        />

        {activeCategory === 'private' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          >
            <Button
              onClick={() => {
                setSaveTemplateDefaultDestination('private');
                setIsSaveTemplateOpen(true);
              }}
              className="rounded-2xl h-14 px-8 bg-primary hover:opacity-90 text-primary-foreground font-black uppercase tracking-widest shadow-xl shadow-primary/20 group"
            >
              <LayoutTemplate className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
              Guardar Ficha Actual como Plantilla
            </Button>
          </motion.div>
        )}

        {activeCategory === 'public' && isAdmin && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          >
            <Button
              onClick={() => {
                setSaveTemplateDefaultDestination('public');
                setIsSaveTemplateOpen(true);
              }}
              className="rounded-2xl h-14 px-8 bg-primary hover:opacity-90 text-primary-foreground font-black uppercase tracking-widest shadow-xl shadow-primary/20 group"
            >
              <Plus className="w-5 h-5 mr-3 group-hover:rotate-90 transition-transform" />
              Nueva Plantilla (Desde Editor)
            </Button>
          </motion.div>
        )}
      </div>

      {/* ═══════════════════ TAB SISTEMA (§3A — 13 plantillas intactas) ═══════════════════ */}
      {activeCategory === 'system' && (
        <div className="min-h-[400px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredSystem.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={() => handleImport(template)}
                  isAdmin={isAdmin}
                  stores={stores}
                />
              ))}
            </AnimatePresence>
            {filteredSystem.length === 0 && (
              <EmptyState label="No se encontraron plantillas del sistema" />
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ TAB PRIVADAS (§3B) ═══════════════════ */}
      {activeCategory === 'private' && (
        <div className="min-h-[400px] space-y-10">
          {/* B.1 — MIS PLANTILLAS GUARDADAS EN COSTPRO (principal) */}
          <section aria-labelledby="private-server-heading">
            <div className="flex items-center gap-3 mb-4">
              <Cloud className="w-5 h-5 text-primary" aria-hidden="true" />
              <h2 id="private-server-heading" className="text-lg font-black uppercase tracking-tighter italic text-primary">
                Mis Plantillas Guardadas en COSTPRO
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary">
                Servidor
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-5 max-w-2xl">
              Plantillas asociadas a tu cuenta de usuario. Persisten en el servidor: las
              recuperas al iniciar sesión desde cualquier dispositivo, sin depender de este
              equipo ni de carpetas locales.
            </p>

            {isLoadingPrivate ? (
              <LoadingState label="Cargando tus plantillas privadas..." />
            ) : privateError ? (
              <ErrorState
                message={privateError}
                onRetry={fetchServerPrivateTemplates}
              />
            ) : serverPrivateTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-primary/20 rounded-[2.5rem] bg-primary/5 py-12 px-6">
                <div className="p-5 rounded-full bg-primary/10 mb-4">
                  <Cloud className="w-10 h-10 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tighter italic mb-2 text-center">
                  Todavía no tienes plantillas privadas guardadas en COSTPRO
                </h3>
                <p className="text-sm text-muted-foreground max-w-md text-center font-medium mb-6">
                  Guarda la ficha en la que trabajas como plantilla reutilizable y estará
                  disponible en tu cuenta desde cualquier dispositivo.
                </p>
                <Button
                  onClick={() => {
                    setSaveTemplateDefaultDestination('private');
                    setIsSaveTemplateOpen(true);
                  }}
                  className="rounded-2xl h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                >
                  <LayoutTemplate className="w-4 h-4 mr-2" />
                  Guardar Ficha Actual como Plantilla
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {filteredServerPrivate.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onUse={() => handleImport(template)}
                      onNewSheet={() => handleImport(template, { navigateTo: 'main' })}
                      onPreview={() => setPreviewTemplate(template)}
                      onRename={() => setRenameDialog({
                        template,
                        name: template.name,
                        description: template.description ?? '',
                      })}
                      onUpdateContent={() => handleUpdatePrivateContent(template)}
                      onDelete={() => handleDeletePrivate(template)}
                      onPublish={isAdmin ? () => setPublishExistingDialog({ template, storeId: 'all' }) : undefined}
                      isBusy={pendingOpId === template.id}
                      isAdmin={isAdmin}
                      stores={stores}
                    />
                  ))}
                </AnimatePresence>
                {filteredServerPrivate.length === 0 && (
                  <EmptyState label="Ninguna plantilla coincide con la búsqueda" />
                )}
              </div>
            )}
          </section>

          {/* B.2 — MIS PLANTILLAS LOCALES (secundaria, conservada) */}
          <section aria-labelledby="private-local-heading" className="pt-2 border-t border-sidebar-border/40">
            <div className="flex items-center gap-3 mb-4 mt-6">
              <HardDrive className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              <h2 id="private-local-heading" className="text-lg font-black uppercase tracking-tighter italic text-muted-foreground">
                Mis Plantillas Locales (Archivos JSON)
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Este equipo
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-5 max-w-2xl">
              Plantillas en archivos .json de una carpeta de este equipo (File System Access API).
              No se sincronizan con COSTPRO: para disponer de ellas en otros dispositivos,
              guárdalas también en tu cuenta.
            </p>

            {!localDirectory ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded-[2.5rem] bg-muted/5 py-10 px-6">
                <div className="p-4 rounded-full bg-muted/10 mb-4">
                  <HardDrive className="w-8 h-8 text-muted-foreground animate-pulse" aria-hidden="true" />
                </div>
                <h3 className="text-base font-black uppercase tracking-tighter italic mb-2">Vincular Carpeta Local</h3>
                <p className="text-sm text-muted-foreground max-w-sm text-center font-medium mb-5">
                  Selecciona una carpeta en tu computadora donde guardas tus fichas de costo .json
                  para sincronizarlas con el sistema.
                </p>
                <Button
                  onClick={handleSelectDirectory}
                  className="rounded-2xl h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Seleccionar Directorio
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    Carpeta vinculada: {localDirectory.name}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => localDirectory && loadPrivateTemplates(localDirectory)}
                    className="rounded-xl h-9 text-xs font-black uppercase tracking-widest"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Releer carpeta
                  </Button>
                </div>
                {localTemplates.length === 0 && !isLoadingPrivate ? (
                  <EmptyState label="No se encontraron archivos .json válidos en la carpeta" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                      {filteredLocal.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          onUse={() => handleImport(template)}
                          onPreview={() => setPreviewTemplate(template)}
                          onPublish={isAdmin
                            ? () => setPublishLocalDialog({
                                template,
                                name: template.name,
                                description: template.description ?? '',
                                storeId: 'all',
                              })
                            : undefined}
                          isAdmin={isAdmin}
                          stores={stores}
                        />
                      ))}
                    </AnimatePresence>
                    {filteredLocal.length === 0 && (
                      <EmptyState label="Ningún archivo coincide con la búsqueda" />
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* ═══════════════════ TAB PÚBLICAS (§3C/§3D) ═══════════════════ */}
      {activeCategory === 'public' && (
        <div className="min-h-[400px]">
          {isLoadingPublic ? (
            <LoadingState label="Cargando plantillas públicas..." />
          ) : publicError ? (
            <ErrorState
              message={publicError}
              onRetry={fetchPublicTemplates}
              hint="Comprueba tu conexión. Si el problema persiste, es posible que no tengas acceso en este momento."
            />
          ) : publicTemplates.length === 0 ? (
            <EmptyState
              label="No hay plantillas públicas disponibles"
              hint={isAdmin
                ? 'Publica una plantilla desde el editor o desde tus plantillas privadas para compartirla.'
                : 'Las plantillas compartidas por los administradores aparecerán aquí.'}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {filteredPublic.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onUse={() => handleImport(template)}
                    onPreview={() => setPreviewTemplate(template)}
                    onUpdateContent={isAdmin ? () => handleOverwritePublic(template) : undefined}
                    onDelete={isAdmin ? () => handleDeletePublic(template) : undefined}
                    onDuplicate={isAdmin ? () => handleDuplicatePublic(template) : undefined}
                    onChangeStore={isAdmin ? (storeId) => handleChangeTemplateStore(template, storeId) : undefined}
                    onUnpublish={isAdmin ? () => handleUnpublish(template) : undefined}
                    isBusy={pendingOpId === template.id}
                    isAdmin={isAdmin}
                    stores={stores}
                  />
                ))}
              </AnimatePresence>
              {filteredPublic.length === 0 && (
                <EmptyState label="Ninguna plantilla coincide con la búsqueda" />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Diálogo: Guardar como Plantilla (compartido con el editor) ── */}
      <CostSheetSaveAsTemplateDialog
        open={isSaveTemplateOpen}
        onOpenChange={setIsSaveTemplateOpen}
        defaultDestination={saveTemplateDefaultDestination}
        onSaved={() => {
          // Refrescar la pestaña activa correspondiente.
          if (activeCategory === 'private') fetchServerPrivateTemplates();
          if (activeCategory === 'public') fetchPublicTemplates();
        }}
      />

      {/* ── Diálogo: Renombrar / Editar descripción (privada servidor) ── */}
      <Dialog open={!!renameDialog} onOpenChange={(open) => !open && setRenameDialog(null)}>
        <DialogContent className="sm:max-w-[460px] rounded-[2rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
              <Pencil className="w-6 h-6" />
              Renombrar Plantilla
            </DialogTitle>
            <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Modifica el nombre y la descripción de tu plantilla privada
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="space-y-3">
              <label htmlFor="rename-name" className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Nombre
              </label>
              <Input
                id="rename-name"
                value={renameDialog?.name ?? ''}
                onChange={(e) => setRenameDialog((d) => (d ? { ...d, name: e.target.value } : d))}
                className="h-12 rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest"
              />
            </div>
            <div className="space-y-3">
              <label htmlFor="rename-description" className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Descripción
              </label>
              <Textarea
                id="rename-description"
                value={renameDialog?.description ?? ''}
                onChange={(e) => setRenameDialog((d) => (d ? { ...d, description: e.target.value } : d))}
                className="min-h-[80px] rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest resize-none"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => setRenameDialog(null)}
              className="flex-1 rounded-2xl h-12 font-black uppercase tracking-widest text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRenamePrivate}
              disabled={!renameDialog?.name.trim() || pendingOpId !== null}
              className="flex-1 rounded-2xl h-12 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20"
            >
              <Save className="w-4 h-4 mr-2" />
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: Publicar plantilla privada EXISTENTE (UPDATE) ────── */}
      <Dialog open={!!publishExistingDialog} onOpenChange={(open) => !open && setPublishExistingDialog(null)}>
        <DialogContent className="sm:max-w-[460px] rounded-[2rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
              <Globe className="w-6 h-6" />
              Publicar Plantilla
            </DialogTitle>
            <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {publishExistingDialog?.template.name} — se publica esta misma plantilla (sin duplicados)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="space-y-3">
              <span className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Ámbito de Publicación
              </span>
              <Select
                value={publishExistingDialog?.storeId ?? 'all'}
                onValueChange={(v) => setPublishExistingDialog((d) => (d ? { ...d, storeId: v } : d))}
              >
                <SelectTrigger className="h-12 rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest">
                  <SelectValue placeholder="Selecciona visibilidad" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
                  <SelectItem value="all" className="text-xs font-bold uppercase tracking-widest focus:bg-primary/10">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      Todas las tiendas
                    </div>
                  </SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id} className="text-xs font-bold uppercase tracking-widest focus:bg-primary/10">
                      <div className="flex items-center gap-2">
                        <StoreIcon className="w-4 h-4 text-primary" />
                        Solo Tienda: {store.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-2xl bg-primary/5 border border-primary/10 px-4 py-3 text-xs font-medium text-muted-foreground flex items-start gap-2">
              <CloudUpload className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                La plantilla se publicará conservando su identidad (mismo registro, sin duplicar).
                Podrás retirar la publicación en cualquier momento y volverá a ser privada.
              </span>
            </div>
          </div>
          <DialogFooter className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => setPublishExistingDialog(null)}
              className="flex-1 rounded-2xl h-12 font-black uppercase tracking-widest text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePublishExisting}
              disabled={pendingOpId !== null}
              className="flex-1 rounded-2xl h-12 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20"
            >
              <Upload className="w-4 h-4 mr-2" />
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: Publicar plantilla LOCAL como nueva pública (INSERT) ── */}
      <Dialog open={!!publishLocalDialog} onOpenChange={(open) => !open && setPublishLocalDialog(null)}>
        <DialogContent className="sm:max-w-[500px] rounded-[2rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
              <Globe className="w-6 h-6" />
              Publicar Plantilla Local
            </DialogTitle>
            <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Crea una plantilla pública a partir del archivo local
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="space-y-3">
              <label htmlFor="local-pub-name" className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Nombre de la Plantilla
              </label>
              <Input
                id="local-pub-name"
                value={publishLocalDialog?.name ?? ''}
                onChange={(e) => setPublishLocalDialog((d) => (d ? { ...d, name: e.target.value } : d))}
                className="h-12 rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest"
              />
            </div>
            <div className="space-y-3">
              <label htmlFor="local-pub-desc" className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Descripción (Opcional)
              </label>
              <Textarea
                id="local-pub-desc"
                value={publishLocalDialog?.description ?? ''}
                onChange={(e) => setPublishLocalDialog((d) => (d ? { ...d, description: e.target.value } : d))}
                className="min-h-[80px] rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest resize-none"
              />
            </div>
            <div className="space-y-3">
              <span className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Ámbito de Publicación
              </span>
              <Select
                value={publishLocalDialog?.storeId ?? 'all'}
                onValueChange={(v) => setPublishLocalDialog((d) => (d ? { ...d, storeId: v } : d))}
              >
                <SelectTrigger className="h-12 rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest">
                  <SelectValue placeholder="Selecciona visibilidad" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
                  <SelectItem value="all" className="text-xs font-bold uppercase tracking-widest focus:bg-primary/10">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      Todas las tiendas
                    </div>
                  </SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id} className="text-xs font-bold uppercase tracking-widest focus:bg-primary/10">
                      <div className="flex items-center gap-2">
                        <StoreIcon className="w-4 h-4 text-primary" />
                        Solo Tienda: {store.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => setPublishLocalDialog(null)}
              className="flex-1 rounded-2xl h-12 font-black uppercase tracking-widest text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePublishLocal}
              disabled={!publishLocalDialog?.name.trim() || pendingOpId !== null}
              className="flex-1 rounded-2xl h-12 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20"
            >
              <Upload className="w-4 h-4 mr-2" />
              Guardar en Supabase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: Vista previa ─────────────────────────────────────── */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="sm:max-w-[520px] rounded-[2rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
              <Eye className="w-6 h-6" />
              Vista Previa
            </DialogTitle>
            <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {previewTemplate?.name}
            </DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="grid gap-4 py-2 text-xs">
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 space-y-2">
                <PreviewRow label="Nombre" value={previewTemplate.name} />
                {previewTemplate.description && (
                  <PreviewRow label="Descripción" value={previewTemplate.description} />
                )}
                <PreviewRow label="Categoría" value={previewTemplate.category || 'General'} />
                <PreviewRow label="Origen" value={
                  previewTemplate.origin === 'server' ? 'COSTPRO (servidor)'
                  : previewTemplate.origin === 'local' ? 'Archivo local'
                  : 'Sistema'
                } />
                {previewTemplate.type === 'public' && (
                  <PreviewRow
                    label="Visibilidad"
                    value={previewTemplate.store_id
                      ? `Tienda: ${stores.find(s => s.id === previewTemplate.store_id)?.name || 'Específica'}`
                      : 'Pública (General)'}
                  />
                )}
                {previewTemplate.updated_at && (
                  <PreviewRow label="Actualizada" value={new Date(previewTemplate.updated_at).toLocaleString()} />
                )}
              </div>
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 space-y-2">
                <PreviewRow label="Encabezado" value={previewTemplate.data?.header?.name || '—'} />
                <PreviewRow label="Secciones" value={String(previewTemplate.data?.sections?.length ?? 0)} />
                <PreviewRow label="Anexos" value={String(previewTemplate.data?.annexes?.length ?? 0)} />
              </div>
              {(previewTemplate.data?.sections?.length ?? 0) > 0 && (
                <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Secciones</p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {previewTemplate.data.sections.map((s: { id: string; label?: string }) => (
                      <li key={s.id} className="font-medium text-muted-foreground">• {s.label || s.id}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => previewTemplate && handleImport(previewTemplate)}
              className="w-full rounded-2xl h-12 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20"
            >
              <Download className="w-4 h-4 mr-2" />
              Cargar en el Editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* P3-4: Migrado de custom div-based dialog a <ConfirmDialog> unificado. */}
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        variant={confirmDialog?.variant === 'destructive' ? 'destructive' : 'default'}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
};

// ── Subcomponentes de estado (§7C/§7D) ────────────────────────────────

const LoadingState: React.FC<{ label: string }> = ({ label }) => (
  <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3">
    <RefreshCw className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
    <p className="font-black uppercase tracking-widest text-xs text-muted-foreground">{label}</p>
  </div>
);

const EmptyState: React.FC<{ label: string; hint?: string }> = ({ label, hint }) => (
  <div className="col-span-full flex flex-col items-center justify-center py-16 opacity-60 gap-2">
    <FileText className="w-14 h-14 text-muted-foreground" aria-hidden="true" />
    <p className="font-black uppercase tracking-widest text-xs">{label}</p>
    {hint && <p className="text-xs text-muted-foreground font-medium max-w-md text-center">{hint}</p>}
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void; hint?: string }> = ({ message, onRetry, hint }) => (
  <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed border-destructive/30 rounded-[2.5rem] bg-destructive/5 px-6">
    <CloudOff className="w-12 h-12 text-destructive" aria-hidden="true" />
    <p className="font-black uppercase tracking-widest text-xs text-destructive">Error de conexión</p>
    <p className="text-sm text-muted-foreground font-medium max-w-md text-center">{message}</p>
    {hint && <p className="text-xs text-muted-foreground max-w-md text-center">{hint}</p>}
    <Button
      onClick={onRetry}
      className="rounded-2xl h-11 px-6 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20"
    >
      <RefreshCw className="w-4 h-4 mr-2" />
      Reintentar
    </Button>
  </div>
);

const PreviewRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">{label}</span>
    <span className="font-bold text-right">{value}</span>
  </div>
);

// ── Tarjeta de plantilla ──────────────────────────────────────────────

interface TemplateCardProps {
  template: Template;
  onUse: () => void;
  onPreview?: () => void;
  onNewSheet?: () => void;
  onRename?: () => void;
  onUpdateContent?: () => void;
  onDelete?: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onDuplicate?: () => void;
  onChangeStore?: (storeId: string | null) => void;
  isBusy?: boolean;
  isAdmin: boolean;
  stores: Store[];
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onUse,
  onPreview,
  onNewSheet,
  onRename,
  onUpdateContent,
  onDelete,
  onPublish,
  onUnpublish,
  onDuplicate,
  onChangeStore,
  isBusy,
  isAdmin,
  stores
}) => {
  const prefersReducedMotion = useReducedMotion();
  const hasMenu = !!(
    onPreview ||
    onNewSheet ||
    onRename ||
    onUpdateContent ||
    onDelete ||
    onPublish ||
    onUnpublish ||
    onDuplicate ||
    onChangeStore
  );

  const originBadge = () => {
    if (template.id.startsWith('sys-')) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border bg-warning/10 text-warning border-warning/20 shadow-lg shadow-warning/5">
          Sistema
        </span>
      );
    }
    if (template.origin === 'server') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border bg-primary/10 text-primary border-primary/20 shadow-lg shadow-primary/5">
          COSTPRO
        </span>
      );
    }
    if (template.origin === 'local') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border bg-muted text-muted-foreground border-border">
          Archivo Local
        </span>
      );
    }
    if (template.type === 'public') {
      return (
        <span className={cn(
          "px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border",
          template.store_id
            ? "bg-warning/10 text-warning border-warning/20 shadow-lg shadow-warning/5"
            : "bg-primary/10 text-primary border-primary/20 shadow-lg shadow-primary/5"
        )}>
          {template.store_id
            ? `Tienda: ${stores.find(s => s.id === template.store_id)?.name || "Específica"}`
            : "Pública (General)"}
        </span>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      exit={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95 }}
      whileHover={prefersReducedMotion ? {} : { y: -2, scale: 1.01 }}
      className="group relative bg-sidebar/40 backdrop-blur-xl border border-sidebar-border/50 rounded-[2rem] p-6 hover:border-primary/30 transition-all duration-300"
      aria-busy={isBusy}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          "p-3 rounded-2xl",
          template.id.startsWith('sys-') ? "bg-warning/10 text-warning" :
          template.origin === 'local' ? "bg-muted text-muted-foreground" :
          "bg-primary/10 text-primary"
        )}>
          <FileText className="w-6 h-6" />
        </div>
        <div className="flex flex-col items-end gap-1">
          {originBadge()}
          <span className="px-3 py-1 rounded-full bg-primary/5 text-xs font-black uppercase tracking-widest text-primary border border-primary/10">
            {template.category || "General"}
          </span>
        </div>
      </div>
      <h3 className="text-lg font-black uppercase tracking-tighter italic mb-2 line-clamp-1 group-hover:text-primary transition-colors">
        {template.name}
      </h3>
      <p className="text-xs text-muted-foreground font-medium mb-6 line-clamp-2 min-h-[2.5rem]">
        {template.description}
      </p>
      <div className="flex items-center gap-2 pt-4 border-t border-sidebar-border/30">
        <Button
          onClick={onUse}
          disabled={isBusy}
          className="flex-1 rounded-xl h-10 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-black uppercase tracking-widest text-xs transition-all disabled:opacity-60"
        >
          <Download className="w-3.5 h-3.5 mr-2" />
          Cargar
        </Button>
        {onPublish && (
          <Button
            onClick={onPublish}
            variant="outline"
            disabled={isBusy}
            className="rounded-xl h-10 border-sidebar-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 font-black uppercase tracking-widest text-xs disabled:opacity-60"
          >
            <Globe className="w-3.5 h-3.5 mr-2" />
            Publicar
          </Button>
        )}
        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                disabled={isBusy}
                className="rounded-xl h-10 w-10 p-0 text-muted-foreground hover:bg-primary/5 disabled:opacity-60"
                aria-label={`Más acciones para ${template.name}`}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-[1.5rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl p-2 min-w-[220px]">
              {onPreview && (
                <DropdownMenuItem
                  onClick={onPreview}
                  className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary"
                >
                  <Eye className="w-3.5 h-3.5 mr-2" />
                  Vista Previa
                </DropdownMenuItem>
              )}
              {onNewSheet && (
                <DropdownMenuItem
                  onClick={onNewSheet}
                  className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary"
                >
                  <FilePlus2 className="w-3.5 h-3.5 mr-2" />
                  Nueva Ficha desde Plantilla
                </DropdownMenuItem>
              )}
              {onRename && (
                <DropdownMenuItem
                  onClick={onRename}
                  className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary"
                >
                  <Pencil className="w-3.5 h-3.5 mr-2" />
                  Renombrar / Descripción
                </DropdownMenuItem>
              )}
              {onUpdateContent && (
                <DropdownMenuItem
                  onClick={onUpdateContent}
                  className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary"
                >
                  <Save className="w-3.5 h-3.5 mr-2" />
                  {template.type === 'public' ? 'Guardar Cambios (Sobrescribir)' : 'Actualizar Contenido (Ficha Actual)'}
                </DropdownMenuItem>
              )}
              {onUnpublish && (
                <DropdownMenuItem
                  onClick={onUnpublish}
                  className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary"
                >
                  <CloudUpload className="w-3.5 h-3.5 mr-2 rotate-180" />
                  Retirar Publicación
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem
                  onClick={onDuplicate}
                  className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary"
                >
                  <Copy className="w-3.5 h-3.5 mr-2" />
                  Duplicar
                </DropdownMenuItem>
              )}
              {onChangeStore && (
                <>
                  <DropdownMenuSeparator className="bg-primary/5" />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary">
                      <StoreIcon className="w-3.5 h-3.5 mr-2" />
                      Cambiar Tienda
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="rounded-[1.5rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl p-2 min-w-[200px]">
                        <DropdownMenuItem
                          onClick={() => onChangeStore?.(null)}
                          className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary"
                        >
                          <Globe className="w-3.5 h-3.5 mr-2" />
                          Pública (General)
                        </DropdownMenuItem>
                        {stores.map(store => (
                          <DropdownMenuItem
                            key={store.id}
                            onClick={() => onChangeStore?.(store.id)}
                            className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-primary/10 focus:text-primary"
                          >
                            <StoreIcon className="w-3.5 h-3.5 mr-2" />
                            Solo: {store.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator className="bg-primary/5" />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="rounded-xl font-bold uppercase tracking-widest text-xs focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash className="w-3.5 h-3.5 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="ghost"
            className="rounded-xl h-10 w-10 p-0 text-muted-foreground/40 cursor-default"
            aria-hidden="true"
            tabIndex={-1}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        )}
      </div>
      {template.updated_at && (
        <div className="absolute -bottom-4 left-6 right-6 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-20">
          <div className="bg-primary/95 text-primary-foreground px-4 py-2 rounded-xl shadow-xl shadow-primary/20 backdrop-blur-xl border border-primary/20 text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
              <RefreshCw className="w-3 h-3" />
              Actualizado: {new Date(template.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
};
export default CostSheetTemplateExplorer;
