'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rssService } from '@/services/rss-service';
import { RSSFeed } from '@/types';
import {
  Plus,
  Trash2,
  Settings2,
  Save,
  Link as LinkIcon,
  Tag,
  AlertCircle,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

export default function RSSManagementView() {
  const queryClient = useQueryClient();
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedName, setNewFeedName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [applyFilter, setApplyFilter] = useState(false);

  // Queries
  const { data: feeds, isLoading: loadingFeeds } = useQuery({
    queryKey: ['rss-feeds'],
    queryFn: () => rssService.getFeeds()
  });

  const { data: settings } = useQuery({
    queryKey: ['rss-settings'],
    queryFn: async () => {
      const s = await rssService.getSettings();
      if (s) {
        setKeywords(s.priority_keywords.join(', '));
        setApplyFilter(s.apply_filter);
      }
      return s;
    }
  });

  // Mutations
  const addFeedMutation = useMutation({
    mutationFn: (feed: Omit<RSSFeed, 'id' | 'is_active'>) =>
      rssService.addFeed({ ...feed, is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rss-feeds'] });
      setNewFeedUrl('');
      setNewFeedName('');
      toast.success('Fuente RSS añadida correctamente');
    },
    onError: () => toast.error('Error al añadir fuente')
  });

  const deleteFeedMutation = useMutation({
    mutationFn: (id: string) => rssService.deleteFeed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rss-feeds'] });
      toast.success('Fuente RSS eliminada');
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: { keywords: string[], applyFilter: boolean }) =>
      rssService.updateSettings({
        priority_keywords: newSettings.keywords,
        apply_filter: newSettings.applyFilter
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rss-settings', 'news'] });
      toast.success('Configuración actualizada');
    }
  });

  const handleAddFeed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedUrl || !newFeedName) return;
    addFeedMutation.mutate({ url: newFeedUrl, name: newFeedName });
  };

  const handleSaveSettings = () => {
    const kwArray = keywords.split(',').map(k => k.trim()).filter(k => k !== '');
    updateSettingsMutation.mutate({ keywords: kwArray, applyFilter });
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-4xl font-black uppercase tracking-tighter">Gestión RSS</h2>
        <p className="text-muted-foreground font-medium uppercase text-[10px] tracking-widest">
          Administra las fuentes de noticias y criterios de prioridad
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Feeds Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <LinkIcon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-xl font-bold uppercase tracking-tight">Fuentes de Noticias</h3>
          </div>

          <form onSubmit={handleAddFeed} className="p-6 bg-card border-2 border-border rounded-[2rem] space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1">Nombre de la Fuente</label>
                <input
                  type="text"
                  value={newFeedName}
                  onChange={(e) => setNewFeedName(e.target.value)}
                  placeholder="Ej: Diario Económico"
                  className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-sm font-medium focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1">URL del Feed RSS</label>
                <input
                  type="url"
                  value={newFeedUrl}
                  onChange={(e) => setNewFeedUrl(e.target.value)}
                  placeholder="https://ejemplo.com/rss.xml"
                  className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-sm font-medium focus:border-primary outline-none transition-all"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={addFeedMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-black rounded-xl text-xs uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Añadir Fuente
            </button>
          </form>

          <div className="space-y-3">
            {loadingFeeds ? (
              <p className="text-center py-4 text-xs font-bold uppercase animate-pulse">Cargando fuentes...</p>
            ) : feeds?.map((feed) => (
              <div key={feed.id} className="flex items-center justify-between p-4 bg-card border-2 border-border rounded-2xl group hover:border-primary/30 transition-all">
                <div>
                  <h4 className="font-bold text-sm uppercase tracking-tight">{feed.name}</h4>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[200px] md:max-w-xs">{feed.url}</p>
                </div>
                <button
                  onClick={() => deleteFeedMutation.mutate(feed.id)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Settings Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Settings2 className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-xl font-bold uppercase tracking-tight">Algoritmo de Prioridad</h3>
          </div>

          <div className="p-8 bg-card border-2 border-border rounded-[2.5rem] space-y-6">
            <div className="flex items-center justify-between p-6 bg-secondary/20 rounded-[2rem] border-2 border-border/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-black uppercase text-[10px] tracking-widest text-primary">
                  <Filter className="w-3 h-3" />
                  Aplicar Filtro de Prioridad
                </div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                  Mostrar únicamente noticias marcadas como prioritarias
                </p>
              </div>
              <Switch
                checked={applyFilter}
                onCheckedChange={setApplyFilter}
              />
            </div>

            <div className="p-4 bg-primary/5 rounded-2xl border-l-4 border-primary space-y-2">
              <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest">
                <AlertCircle className="w-3 h-3" />
                ¿Cómo funciona?
              </div>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Las noticias que contengan estas palabras clave en su título o descripción serán marcadas como <span className="text-primary font-bold">Prioritarias</span> y aparecerán primero. Las tasas de cambio del BCC se identifican automáticamente.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">
                  <Tag className="w-3 h-3" />
                  Palabras Clave (separadas por coma)
                </label>
                <textarea
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  rows={4}
                  className="w-full bg-background border-2 border-border rounded-2xl px-4 py-4 text-sm font-medium focus:border-primary outline-none transition-all resize-none"
                  placeholder="Ej: Divisas, CUP, Inflación, MLC..."
                />
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={updateSettingsMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-foreground text-background font-black rounded-2xl text-xs uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
