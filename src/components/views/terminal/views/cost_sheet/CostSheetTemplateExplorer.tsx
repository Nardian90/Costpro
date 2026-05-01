'use client';
import { logger } from '@/lib/logger';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCostSheetStore, useAuthStore, useUIStore } from '@/store';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { storeService } from '@/services/store-service';
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

// Import Templates
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

type TemplateCategory = 'system' | 'private' | 'public';

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: TemplateCategory;
  data: any;
  updated_at?: string;
  store_id?: string | null;
}

export const CostSheetTemplateExplorer: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('system');
  const [searchQuery, setSearchQuery] = useState('');
  const [publicTemplates, setPublicTemplates] = useState<Template[]>([]);
  const [privateTemplates, setPrivateTemplates] = useState<Template[]>([]);
  const [localDirectory, setLocalDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);

  // Naming state for new templates
  const [publishName, setPublishName] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [selectedTemplateToPublish, setSelectedTemplateToPublish] = useState<Template | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');

  const { data: currentSheetData, setSheet } = useCostSheetStore();
  const { setActiveCostSection } = useUIStore();
  const user = useAuthStore(state => state.user);
  const isAdmin = user?.role === 'admin';

  // System Templates
  const systemTemplates: Template[] = [
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
  ];

  const fetchPublicTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('cost_sheet_templates')
        .select('*')
        .eq('type', 'public');

      // Filtrado según requerimiento: null (para todos) o la tienda activa del usuario
      if (user?.activeStoreId) {
        query = query.or(`store_id.is.null,store_id.eq.${user.activeStoreId}`);
      } else {
        query = query.is('store_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      if (data) {
        setPublicTemplates(data.map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          type: 'public',
          data: t.data,
          updated_at: t.created_at,
          store_id: t.store_id
        })));
      }
    } catch (error) {
      console.error('Error fetching public templates:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.activeStoreId]);

  const fetchStores = useCallback(async () => {
    try {
      const data = await storeService.getStores();
      setStores(data);
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  }, []);

  useEffect(() => {
    if (activeCategory === 'public') {
      fetchPublicTemplates();
    }
    if (isAdmin) {
      fetchStores();
    }
  }, [activeCategory, fetchPublicTemplates, isAdmin, fetchStores]);

  const handleSelectDirectory = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      setLocalDirectory(handle);
      loadPrivateTemplates(handle);
    } catch (error) {
      if ((error as any).name !== 'AbortError') {
        console.error('Error picking directory:', error);
        toast.error('No se pudo acceder a la carpeta');
      }
    }
  };

  const loadPrivateTemplates = async (directoryHandle: FileSystemDirectoryHandle) => {
    setIsLoading(true);
    try {
      const templates: Template[] = [];
      for await (const entry of (directoryHandle as any).values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          const file = await entry.getFile();
          const text = await file.text();
          try {
            const data = JSON.parse(text);
            if (data.sections && data.annexes) {
              templates.push({
                id: entry.name,
                name: data.name || entry.name.replace('.json', ''),
                description: data.metadata?.description || 'Plantilla guardada localmente',
                type: 'private',
                data: data,
                updated_at: new Date(file.lastModified).toISOString()
              });
            }
          } catch (e) {
            logger.warn('COST_SHEET', 'SKIP_INVALID_JSON', { message: `Skipping invalid JSON file: ${entry.name}` });
          }
        }
      }
      setPrivateTemplates(templates);
    } catch (error) {
      console.error('Error loading private templates:', error);
      toast.error('Error al leer las plantillas locales');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = (template: Template) => {
    setSheet(template.data);
    setActiveCostSection("expert-content");
    toast.success(`Plantilla "${template.name}" cargada correctamente`);
  };

  const handleOpenPublishDialog = (template: Template | null) => {
    if (template) {
      setSelectedTemplateToPublish(template);
      setPublishName(template.name);
      setPublishDescription(template.description || '');
    } else {
      // New template from current sheet
      if (!currentSheetData) {
          toast.error("No hay ninguna ficha activa para guardar como plantilla.");
          return;
      }
      setSelectedTemplateToPublish(null);
      setPublishName(currentSheetData.name || '');
      setPublishDescription('');
    }
    setIsPublishDialogOpen(true);
  };

  const handlePublish = async () => {
    if (!isAdmin) {
      toast.error('Solo los administradores pueden publicar plantillas en Supabase');
      return;
    }

    if (!publishName.trim()) {
        toast.error("El nombre de la plantilla es obligatorio.");
        return;
    }

    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error('Debes iniciar sesión para publicar plantillas');
        return;
      }

      const templateData = selectedTemplateToPublish ? selectedTemplateToPublish.data : currentSheetData;

      const { error } = await supabase
        .from('cost_sheet_templates')
        .insert({
          name: publishName,
          description: publishDescription,
          category: (selectedTemplateToPublish?.category || 'General'),
          data: templateData,
          type: 'public',
          created_by: userData.user.id,
          store_id: selectedStoreId === 'all' ? null : selectedStoreId
        });

      if (error) throw error;

      toast.success('Plantilla publicada con éxito');
      setIsPublishDialogOpen(false);
      setSelectedTemplateToPublish(null);
      if (activeCategory === 'public') fetchPublicTemplates();
    } catch (error) {
      console.error('Error publishing template:', error);
      toast.error('Error al publicar la plantilla');
    } finally {
      setIsLoading(false);
    }
  };


  const handleUpdateTemplate = async (template: Template) => {
    if (!isAdmin) return;
    if (!currentSheetData) {
      toast.error("No hay ninguna ficha activa para guardar.");
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas sobrescribir la plantilla \"${template.name}\" con los datos actuales del editor?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("cost_sheet_templates")
        .update({ data: currentSheetData })
        .eq("id", template.id);

      if (error) throw error;
      toast.success("Plantilla actualizada correctamente");
      fetchPublicTemplates();
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error("Error al actualizar la plantilla");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async (template: Template) => {
    if (!isAdmin) return;
    if (!confirm(`¿Estás seguro de que deseas eliminar la plantilla \"${template.name}\"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("cost_sheet_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;
      toast.success("Plantilla eliminada correctamente");
      fetchPublicTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Error al eliminar la plantilla");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicateTemplate = async (template: Template) => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cost_sheet_templates")
        .insert({
          name: `\"${template.name}\" (Copia)`,
          description: template.description,
          category: template.category,
          data: template.data,
          type: "public",
          created_by: userData.user?.id,
          store_id: template.store_id
        });

      if (error) throw error;
      toast.success("Plantilla duplicada correctamente");
      fetchPublicTemplates();
    } catch (error) {
      console.error("Error duplicating template:", error);
      toast.error("Error al duplicar la plantilla");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeTemplateStore = async (template: Template, storeId: string | null) => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("cost_sheet_templates")
        .update({ store_id: storeId })
        .eq("id", template.id);

      if (error) throw error;
      toast.success("Tienda de la plantilla actualizada");
      fetchPublicTemplates();
    } catch (error) {
      console.error("Error updating template store:", error);
      toast.error("Error al actualizar la tienda");
    } finally {
      setIsLoading(false);
    }
  };
  const filteredTemplates = (
    activeCategory === 'system' ? systemTemplates :
    activeCategory === 'private' ? privateTemplates :
    publicTemplates
  ).filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase()) || (t.store_id ? (stores || []).find(s => s.id === t.store_id)?.name?.toLowerCase().includes(searchQuery.toLowerCase()) : "pública general".includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 p-4">
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

      {/* Categories Tabs & Admin Action */}
      <div className="flex flex-col items-center gap-6">
          <div className="flex gap-2 p-1.5 bg-sidebar/50 backdrop-blur-xl rounded-3xl border border-sidebar-border/50 w-fit">
            {(['system', 'private', 'public'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                )}
              >
                {cat === 'system' && <Settings className="w-4 h-4" />}
                {cat === 'private' && <LockIcon className="w-4 h-4" />}
                {cat === 'public' && <Globe className="w-4 h-4" />}
                {cat === 'system' ? 'Sistema' : cat === 'private' ? 'Privadas' : 'Públicas'}
              </button>
            ))}
          </div>

          {activeCategory === 'public' && isAdmin && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                  <Button
                    onClick={() => handleOpenPublishDialog(null)}
                    className="rounded-2xl h-14 px-8 bg-primary hover:opacity-90 text-primary-foreground font-black uppercase tracking-widest shadow-xl shadow-primary/20 group"
                  >
                    <Plus className="w-5 h-5 mr-3 group-hover:rotate-90 transition-transform" />
                    Nueva Plantilla (Desde Editor)
                  </Button>
              </motion.div>
          )}
      </div>

      {/* Main Content Area */}
      <div className="min-h-[400px]">
        {activeCategory === 'private' && !localDirectory ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed border-primary/20 rounded-[2.5rem] bg-primary/5"
          >
            <div className="p-6 rounded-full bg-primary/10 mb-6">
              <HardDrive className="w-12 h-12 text-primary animate-pulse" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tighter italic mb-2">Vincular Carpeta Local</h3>
            <p className="text-sm text-muted-foreground max-w-sm text-center font-medium mb-8">
              Selecciona una carpeta en tu computadora donde guardas tus fichas de costo .json para sincronizarlas con el sistema.
            </p>
            <Button
              onClick={handleSelectDirectory}
              className="rounded-2xl h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest shadow-xl shadow-primary/20"
            >
              <FolderOpen className="w-5 h-5 mr-3" />
              Seleccionar Directorio
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onImport={() => handleImport(template)}
                  onPublish={activeCategory === "private" && isAdmin ? () => handleOpenPublishDialog(template) : undefined}
                  isAdmin={isAdmin}
                  onUpdate={template.type === "public" ? () => handleUpdateTemplate(template) : undefined}
                  onDelete={template.type === "public" ? () => handleDeleteTemplate(template) : undefined}
                  onDuplicate={template.type === "public" ? () => handleDuplicateTemplate(template) : undefined}
                  onChangeStore={template.type === "public" ? (storeId) => handleChangeTemplateStore(template, storeId) : undefined}
                  stores={stores}
                />
              ))}
            </AnimatePresence>
            {filteredTemplates.length === 0 && !isLoading && (
              <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-50">
                <FileText className="w-16 h-16 mb-4 text-muted-foreground" />
                <p className="font-black uppercase tracking-widest text-xs">No se encontraron plantillas</p>
              </div>
            )}
            {isLoading && (
              <div className="col-span-full flex justify-center py-20">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publish Dialog */}
      <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[2rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
              <Globe className="w-6 h-6" />
              Publicar Plantilla
            </DialogTitle>
            <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Configura los detalles y visibilidad de la plantilla en la nube
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">
                    Nombre de la Plantilla
                </label>
                <Input
                    value={publishName}
                    onChange={(e) => setPublishName(e.target.value)}
                    placeholder="Ej: Ficha Base de Carpintería"
                    className="h-12 rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest"
                />
            </div>

            <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">
                    Descripción (Opcional)
                </label>
                <Textarea
                    value={publishDescription}
                    onChange={(e) => setPublishDescription(e.target.value)}
                    placeholder="Describe para qué sirve este modelo..."
                    className="min-h-[100px] rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest resize-none"
                />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">
                    Destino de Publicación
                  </label>
                  <Info className="w-3 h-3 text-muted-foreground cursor-help" />
              </div>
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger className="h-12 rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest">
                  <SelectValue placeholder="Selecciona visibilidad" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
                  <SelectItem value="all" className="text-xs font-bold uppercase tracking-widest focus:bg-primary/10">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-500" />
                      Pública (Todas las tiendas)
                    </div>
                  </SelectItem>
                  {stores.map(store => (
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
              onClick={() => setIsPublishDialogOpen(false)}
              className="flex-1 rounded-2xl h-12 font-black uppercase tracking-widest text-[10px]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePublish}
              disabled={isLoading || !publishName.trim()}
              className="flex-1 rounded-2xl h-12 bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Guardar en Supabase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface TemplateCardProps {
  template: Template;
  onImport: () => void;
  onPublish?: () => void;
  isAdmin: boolean;
  onUpdate?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onChangeStore?: (storeId: string | null) => void;
  stores: Store[];
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onImport,
  onPublish,
  isAdmin,
  onUpdate,
  onDelete,
  onDuplicate,
  onChangeStore,
  stores
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2, scale: 1.01 }}
      className="group relative bg-sidebar/40 backdrop-blur-xl border border-sidebar-border/50 rounded-[2rem] p-6 hover:border-primary/30 transition-all duration-300"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          "p-3 rounded-2xl bg-primary/10 text-primary",
          template.id.startsWith('sys-') ? "bg-amber-500/10 text-amber-500" :
          template.type === 'public' ? "bg-blue-500/10 text-blue-500" : ""
        )}>
          <FileText className="w-6 h-6" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn(
            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
            template.store_id
              ? "bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-lg shadow-amber-500/5"
              : "bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-lg shadow-blue-500/5"
          )}>
            {template.store_id
              ? `Tienda: ${stores.find(s => s.id === template.store_id)?.name || "Específica"}`
              : "Pública (General)"}
          </span>
          <span className="px-3 py-1 rounded-full bg-primary/5 text-[8px] font-black uppercase tracking-widest text-primary border border-primary/10">
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
          onClick={onImport}
          className="flex-1 rounded-xl h-10 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-black uppercase tracking-widest text-[10px] transition-all"
        >
          <Download className="w-3.5 h-3.5 mr-2" />
          Cargar
        </Button>
        {onPublish && (
          <Button
            onClick={onPublish}
            variant="outline"
            className="rounded-xl h-10 border-sidebar-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 font-black uppercase tracking-widest text-[10px]"
          >
            <Globe className="w-3.5 h-3.5 mr-2" />
            Publicar
          </Button>
        )}
        {template.type === "public" && isAdmin ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="rounded-xl h-10 w-10 p-0 text-muted-foreground hover:bg-primary/5"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-[1.5rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl p-2 min-w-[200px]">
              <DropdownMenuItem
                onClick={onUpdate}
                className="rounded-xl font-bold uppercase tracking-widest text-[10px] focus:bg-primary/10 focus:text-primary"
              >
                <Save className="w-3.5 h-3.5 mr-2" />
                Guardar Cambios (Sobrescribir)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDuplicate}
                className="rounded-xl font-bold uppercase tracking-widest text-[10px] focus:bg-primary/10 focus:text-primary"
              >
                <Copy className="w-3.5 h-3.5 mr-2" />
                Duplicar
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-primary/5" />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="rounded-xl font-bold uppercase tracking-widest text-[10px] focus:bg-primary/10 focus:text-primary">
                  <StoreIcon className="w-3.5 h-3.5 mr-2" />
                  Cambiar Tienda
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="rounded-[1.5rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl p-2 min-w-[200px]">
                    <DropdownMenuItem
                      onClick={() => onChangeStore?.(null)}
                      className="rounded-xl font-bold uppercase tracking-widest text-[10px] focus:bg-blue-500/10 focus:text-blue-500"
                    >
                      <Globe className="w-3.5 h-3.5 mr-2" />
                      Pública (General)
                    </DropdownMenuItem>
                    {stores.map(store => (
                      <DropdownMenuItem
                        key={store.id}
                        onClick={() => onChangeStore?.(store.id)}
                        className="rounded-xl font-bold uppercase tracking-widest text-[10px] focus:bg-primary/10 focus:text-primary"
                      >
                        <StoreIcon className="w-3.5 h-3.5 mr-2" />
                        Solo: {store.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuSeparator className="bg-primary/5" />

              <DropdownMenuItem
                onClick={onDelete}
                className="rounded-xl font-bold uppercase tracking-widest text-[10px] focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash className="w-3.5 h-3.5 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="ghost"
            className="rounded-xl h-10 w-10 p-0 text-muted-foreground hover:bg-primary/5 cursor-not-allowed opacity-50"
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        )}
      </div>
      {template.updated_at && (
        <div className="absolute -bottom-4 left-6 right-6 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-20">
          <div className="bg-primary/95 text-primary-foreground px-4 py-2 rounded-xl shadow-xl shadow-primary/20 backdrop-blur-xl border border-primary/20 text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Actualizado: {new Date(template.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
};
export default CostSheetTemplateExplorer;
