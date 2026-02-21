'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  FolderOpen,
  Cloud,
  Lock,
  FileText,
  Plus,
  Eye,
  Download,
  Upload,
  MoreVertical,
  Trash2,
  ChevronRight,
  Globe,
  Settings,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCostSheetStore } from '@/store';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import exampleTemplate from '@/lib/data/costpro-ejemplo';
import fullTemplate from '@/lib/data/costpro-full';

type TemplateCategory = 'system' | 'private' | 'public';

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: TemplateCategory;
  data: any;
  updated_at?: string;
}

export const CostSheetTemplateExplorer: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('system');
  const [searchQuery, setSearchQuery] = useState('');
  const [localDirectory, setLocalDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [privateTemplates, setPrivateTemplates] = useState<Template[]>([]);
  const [publicTemplates, setPublicTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const setSheet = useCostSheetStore(state => state.setSheet);

  // System Templates (Hardcoded for now)
  const systemTemplates: Template[] = [
    {
      id: 'sys-reinicio',
      name: 'Plantilla de Reinicio',
      description: 'Estructura base vacía con todas las secciones reglamentarias.',
      category: 'Estándar',
      type: 'system',
      data: reinicioTemplate
    },
    {
      id: 'sys-ejemplo',
      name: 'Ejemplo: Producción de Pan',
      description: 'Ficha completa de ejemplo para un lote de producción de pan.',
      category: 'Industria Alimentaria',
      type: 'system',
      data: exampleTemplate
    },
    {
      id: 'sys-full',
      name: 'Plantilla Full (Lote Especial)',
      description: 'Referencia avanzada con integración completa de anexos.',
      category: 'Industria Alimentaria',
      type: 'system',
      data: fullTemplate
    }
  ];

  const fetchPublicTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('cost_sheet_templates')
        .select('*')
        .eq('type', 'public');

      if (error) throw error;
      setPublicTemplates(data || []);
    } catch (error) {
      console.error('Error fetching public templates:', error);
      toast.error('No se pudieron cargar las plantillas públicas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeCategory === 'public') {
      fetchPublicTemplates();
    }
  }, [activeCategory, fetchPublicTemplates]);

  const handleSelectDirectory = async () => {
    try {
      // @ts-ignore - File System Access API
      const handle = await window.showDirectoryPicker();
      setLocalDirectory(handle);
      loadPrivateTemplates(handle);
    } catch (error) {
      if ((error as any).name !== 'AbortError') {
        console.error('Error selecting directory:', error);
        toast.error('Error al acceder al directorio local');
      }
    }
  };

  const loadPrivateTemplates = async (directoryHandle: FileSystemDirectoryHandle) => {
    setIsLoading(true);
    const templates: Template[] = [];
    try {
      // @ts-ignore
      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          const file = await entry.getFile();
          const text = await file.text();
          try {
            const data = JSON.parse(text);
            // Basic validation that it's a cost sheet
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
            console.warn(`Skipping invalid JSON file: ${entry.name}`);
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
    toast.success(`Plantilla "${template.name}" cargada correctamente`);
  };

  const handlePublish = async (template: Template) => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        toast.error('Debes iniciar sesión para publicar plantillas');
        return;
      }

      const { error } = await supabase
        .from('cost_sheet_templates')
        .insert({
          name: template.name,
          description: template.description,
          category: template.category || 'General',
          data: template.data,
          type: 'public',
          created_by: userData.user.id
        });

      if (error) throw error;
      toast.success('Plantilla publicada con éxito');
      if (activeCategory === 'public') fetchPublicTemplates();
    } catch (error) {
      console.error('Error publishing template:', error);
      toast.error('Error al publicar la plantilla');
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
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 p-4">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tighter italic text-primaryflex items-center gap-3">
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

      {/* Categories Tabs */}
      <div className="flex gap-2 p-1.5 bg-sidebar/50 backdrop-blur-xl rounded-3xl border border-sidebar-border/50 w-fit mx-auto">
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
            {cat === 'private' && <Lock className="w-4 h-4" />}
            {cat === 'public' && <Globe className="w-4 h-4" />}
            {cat === 'system' ? 'Sistema' : cat === 'private' ? 'Privadas' : 'Públicas'}
          </button>
        ))}
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
              <HardDrive className="w-12 h-12 text-primaryanimate-pulse" />
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
                  onPublish={activeCategory === 'private' ? () => handlePublish(template) : undefined}
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
                <RefreshCw className="w-8 h-8 text-primaryanimate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface TemplateCardProps {
  template: Template;
  onImport: () => void;
  onPublish?: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onImport, onPublish }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -5 }}
      className="group relative bg-sidebar/40 backdrop-blur-xl border border-sidebar-border/50 rounded-[2rem] p-6 hover:border-primary/30 transition-all duration-300"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          "p-3 rounded-2xl bg-primary/10 text-primary",
          template.type === 'system' ? "bg-amber-500/10 text-amber-500" :
          template.type === 'public' ? "bg-blue-500/10 text-blue-500" : ""
        )}>
          <FileText className="w-6 h-6" />
        </div>
        <div className="flex gap-1">
          <span className="px-3 py-1 rounded-full bg-primary/5 text-[10px] font-black uppercase tracking-widest text-primaryborder border-primary/10">
            {template.category || (template.type === 'private' ? 'Local' : 'General')}
          </span>
        </div>
      </div>

      <h3 className="text-lg font-black uppercase tracking-tighter italic mb-2 line-clamp-1 group-hover:text-primarytransition-colors">
        {template.name}
      </h3>
      <p className="text-xs text-muted-foreground font-medium mb-6 line-clamp-2 min-h-[2.5rem]">
        {template.description}
      </p>

      <div className="flex items-center gap-2 pt-4 border-t border-sidebar-border/30">
        <Button
          onClick={onImport}
          className="flex-1 rounded-xl h-10 bg-primary/10 hover:bg-primary text-primaryhover:text-primary-foreground font-black uppercase tracking-widest text-[10px] transition-all"
        >
          <Download className="w-3.5 h-3.5 mr-2" />
          Importar
        </Button>
        {onPublish && (
          <Button
            onClick={onPublish}
            variant="outline"
            className="rounded-xl h-10 border-sidebar-border hover:bg-success/10 hover:text-success hover:border-success/30 font-black uppercase tracking-widest text-[10px]"
          >
            <Globe className="w-3.5 h-3.5 mr-2" />
            Publicar
          </Button>
        )}
        <Button
          variant="ghost"
          className="rounded-xl h-10 w-10 p-0 text-muted-foreground hover:bg-primary/5"
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </div>

      {template.updated_at && (
        <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
            {new Date(template.updated_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </motion.div>
  );
};
