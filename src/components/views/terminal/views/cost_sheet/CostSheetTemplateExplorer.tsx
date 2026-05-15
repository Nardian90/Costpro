'use client';
import { logger } from '@/lib/logger';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  FileText,
  Download,
  Globe,
  RefreshCw
} from 'lucide-react';
import { CostSheetData } from '@/types/cost-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useCostSheetStore } from '@/store/cost-sheet-store';

interface Template {
  id: string;
  name: string;
  description: string;
  data: CostSheetData;
  isPublic: boolean;
  category: string;
  lastModified: string;
}

const CostSheetTemplateExplorer: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { setSheet } = useCostSheetStore();

  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 800));
        setTemplates([
          {
            id: 't1',
            name: 'Servicios de Consultoría',
            description: 'Plantilla estándar para servicios profesionales con margen del 30%',
            category: 'servicios',
            isPublic: true,
            lastModified: '2024-03-15',
            data: {} as any
          },
          {
            id: 't2',
            name: 'Producción Manufacturera',
            description: 'Estructura de costos para procesos de fabricación con materias primas',
            category: 'produccion',
            isPublic: true,
            lastModified: '2024-03-10',
            data: {} as any
          }
        ]);
      } catch (error) {
        logger.error('COST_SHEET', 'Error fetching templates', { error });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  const handleImport = (template: Template) => {
    setSheet(template.data);
    toast.success(`Plantilla "${template.name}" cargada correctamente`);
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || t.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar plantillas..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 w-full md:w-auto">
          {['all', 'servicios', 'produccion', 'comercio'].map(cat => (
            <Button
              key={cat}
              variant={activeCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory(cat)}
              className="capitalize whitespace-nowrap"
            >
              {cat === 'all' ? 'Todas' : cat}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(template => (
            <motion.div
              layout
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group relative bg-card border border-border/50 rounded-xl overflow-hidden hover:shadow-md transition-all"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1">
                    {template.isPublic && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                        <Globe className="w-3 h-3" />
                        PÚBLICA
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                  {template.name}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
                  {template.description}
                </p>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium border-t border-border/30 pt-4">
                  <div className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    {template.lastModified}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleImport(template)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <h3 className="font-bold text-lg mb-1">No se encontraron plantillas</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Prueba ajustando los filtros o el término de búsqueda.
          </p>
        </div>
      )}
    </div>
  );
};

export default CostSheetTemplateExplorer;
