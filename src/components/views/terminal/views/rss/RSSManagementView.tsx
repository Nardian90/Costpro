'use client';

import React from 'react';
import {
  Plus,
  Trash2,
  Settings,
  Globe,
  Tag,
  Save,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRSSFeeds, useRSSSettings, useAddRSSFeed, useUpdateRSSFeed, useDeleteRSSFeed, useUpdateRSSSettings } from '@/hooks/api/useRSS';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { toast } from 'sonner';

export default function RSSManagementView() {
  const { data: feeds, isLoading: isLoadingFeeds, error: feedsError } = useRSSFeeds();
  const { data: settings, isLoading: isLoadingSettings, error: settingsError } = useRSSSettings();

  const addFeedMutation = useAddRSSFeed();
  const updateFeedMutation = useUpdateRSSFeed();
  const deleteFeedMutation = useDeleteRSSFeed();
  const updateSettingsMutation = useUpdateRSSSettings();

  const [newFeedUrl, setNewFeedUrl] = React.useState('');
  const [newFeedName, setNewFeedName] = React.useState('');
  const [newKeyword, setNewKeyword] = React.useState('');

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedUrl) return;

    try {
      await addFeedMutation.mutateAsync({ url: newFeedUrl, name: newFeedName, is_active: true });
      setNewFeedUrl('');
      setNewFeedName('');
      toast.success('Fuente RSS añadida correctamente');
    } catch (err: any) {
      toast.error('Error al añadir fuente: ' + err.message);
    }
  };

  const handleToggleFeed = async (id: string, currentStatus: boolean) => {
    try {
      await updateFeedMutation.mutateAsync({ id, feed: { is_active: !currentStatus } });
      toast.success('Fuente actualizada');
    } catch (err: any) {
      toast.error('Error al actualizar fuente');
    }
  };

  const handleDeleteFeed = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta fuente?')) return;
    try {
      await deleteFeedMutation.mutateAsync(id);
      toast.success('Fuente eliminada');
    } catch (err: any) {
      toast.error('Error al eliminar fuente');
    }
  };

  const handleAddKeyword = async () => {
    if (!newKeyword || !settings) return;
    const keywords = [...settings.priority_keywords, newKeyword];
    try {
      await updateSettingsMutation.mutateAsync({ id: settings.id, settings: { priority_keywords: keywords } });
      setNewKeyword('');
      toast.success('Palabra clave añadida');
    } catch (err: any) {
      toast.error('Error al actualizar palabras clave');
    }
  };

  const handleRemoveKeyword = async (keyword: string) => {
    if (!settings) return;
    const keywords = settings.priority_keywords.filter(k => k !== keyword);
    try {
      await updateSettingsMutation.mutateAsync({ id: settings.id, settings: { priority_keywords: keywords } });
      toast.success('Palabra clave eliminada');
    } catch (err: any) {
      toast.error('Error al eliminar palabra clave');
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Gestión RSS</h2>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
          Configuración de fuentes de noticias y algoritmos de prioridad
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Feeds Management */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-3xl border border-border bg-card shadow-sm">
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2 mb-6">
              <Globe className="w-5 h-5 text-primary" />
              Fuentes de Noticias (Feeds)
            </h3>

            <form onSubmit={handleAddFeed} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
              <input
                type="text"
                value={newFeedName}
                onChange={(e) => setNewFeedName(e.target.value)}
                placeholder="NOMBRE (EJ. BBC)"
                aria-label="Nombre del feed RSS"
                className="md:col-span-2 bg-background border border-border rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase"
              />
              <input
                type="url"
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                placeholder="URL DEL FEED RSS..."
                required
                aria-label="URL del feed RSS"
                className="md:col-span-2 bg-background border border-border rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                disabled={addFeedMutation.isPending}
                className="bg-primary text-foreground font-black text-xs uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Añadir
              </button>
            </form>

            <StateRenderer isLoading={isLoadingFeeds} error={feedsError} data={feeds}>
              {(feedList) => (
                <div className="table-scroll-wrapper rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr className="text-xs font-black uppercase text-muted-foreground tracking-[0.2em] border-b border-border">
                        <th className="p-4 text-left">Fuente</th>
                        <th className="p-4 text-left">URL</th>
                        <th className="p-4 text-center">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {feedList.map((feed) => (
                        <tr key={feed.id} className="hover:bg-muted/10 transition-colors">
                          <td className="p-4">
                            <div className="font-black text-xs uppercase">{feed.name || 'Sin nombre'}</div>
                          </td>
                          <td className="p-4 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                            {feed.url}
                          </td>
                          <td className="p-4">
                            <div className="flex justify-center">
                              <button
                                onClick={() => handleToggleFeed(feed.id, feed.is_active)}
                                aria-label={feed.is_active ? `Desactivar feed: ${feed.name}` : `Activar feed: ${feed.name}`}
                                className={cn(
                                  "px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest transition-all",
                                  feed.is_active
                                    ? "bg-green-500/10 text-green-600 border border-green-500/20"
                                    : "bg-muted text-muted-foreground border border-border"
                                )}
                              >
                                {feed.is_active ? 'Activo' : 'Inactivo'}
                              </button>
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleDeleteFeed(feed.id)}
                              className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </StateRenderer>
          </div>
        </div>

        {/* Settings Management */}
        <div className="space-y-6">
          <div className="p-6 rounded-3xl border border-border bg-card shadow-sm h-full">
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2 mb-6">
              <Settings className="w-5 h-5 text-primary" />
              Priorización (IA)
            </h3>

            <div className="space-y-8">
              <section>
                <span className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 block">
                  Palabras Clave de Prioridad
                </span>
                <div className="flex flex-wrap gap-2 mb-4">
                  {settings?.priority_keywords.map((kw, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 font-bold text-xs uppercase group"
                    >
                      <Tag className="w-3 h-3" />
                      {kw}
                      <button
                        onClick={() => handleRemoveKeyword(kw)}
                        className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="NUEVA PALABRA..."
                    aria-label="Nueva palabra clave de prioridad"
                    className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-xs font-bold uppercase"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                  />
                  <button
                    onClick={handleAddKeyword}
                    className="p-2.5 bg-primary text-foreground rounded-xl hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </section>

              <section className="p-4 rounded-2xl bg-muted/30 border border-border border-dashed">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase text-foreground tracking-widest">Nota del Sistema</p>
                    <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                      Las noticias que contengan estas palabras clave se mostrarán primero y con un indicador visual. Las tasas de cambio del Banco Central se priorizan automáticamente.
                    </p>
                  </div>
                </div>
              </section>

              <button
                disabled
                className="w-full py-4 bg-muted text-muted-foreground font-black text-xs uppercase tracking-[0.3em] rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed"
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
