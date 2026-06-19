'use client';

import React from 'react';
import {
  Newspaper,
  TrendingUp,
  AlertCircle,
  ExternalLink,
  Clock,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  ChevronRight
} from 'lucide-react';
import { cn, formatDate, formatTime, safeFormatDate } from '@/lib/utils';
import { useRSSNews } from '@/hooks/api/useRSS';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { RSSNewsItem } from '@/types';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

export default function NewsView() {
  const prefersReducedMotion = useReducedMotion();
  const { data: news, isLoading, error, refetch, isRefetching } = useRSSNews();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterPriority, setFilterPriority] = React.useState(true);

  const filteredNews = React.useMemo(() => {
    if (!news) return [];
    return news.filter(item => {
      const title = item.title?.toLowerCase() || '';
      const content = item.content?.toLowerCase() || '';
      const matchesSearch = title.includes(searchTerm.toLowerCase()) ||
                          content.includes(searchTerm.toLowerCase());
      const matchesPriority = filterPriority ? item.isPriority : true;
      return matchesSearch && matchesPriority;
    });
  }, [news, searchTerm, filterPriority]);

  const exchangeRateNews = React.useMemo(() => {
    return news?.find(item => item.isExchangeRate);
  }, [news]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Agregador de Noticias</h2>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
            Información relevante y tasas de cambio en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-accent transition-all text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")} />
            {isRefetching ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Tasa de Cambio Card (if available) */}
      {exchangeRateNews && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
          className="relative overflow-hidden p-6 rounded-3xl border-2 border-primary/20 bg-primary/5 shadow-xl shadow-primary/5"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <TrendingUp size={120} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary font-black uppercase text-xs tracking-[0.2em]">
                <DollarSign className="w-4 h-4" />
                Tasa de Cambio Oficial
              </div>
              <h3 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">
                {exchangeRateNews.title}
              </h3>
              <p className="text-sm font-medium text-muted-foreground max-w-2xl">
                {exchangeRateNews.contentSnippet}
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end">
              {exchangeRateNews.exchangeRateData ? (
                <div className="text-5xl font-black text-primary tracking-tighter">
                  {exchangeRateNews.exchangeRateData.value} <span className="text-xl uppercase ml-1">CUP</span>
                </div>
              ) : (
                <a
                  href={exchangeRateNews.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-primary text-foreground font-black text-xs uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  Ver Detalles <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <div className="mt-2 text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Publicado: {safeFormatDate(exchangeRateNews.pubDate)} {formatTime(exchangeRateNews.pubDate)}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Buscar noticias"
            placeholder="BUSCAR NOTICIAS..."
            className="w-full bg-card border border-border rounded-2xl py-3.5 pl-11 pr-4 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-widest"
          />
        </div>
        <div className="md:col-span-1">
          <button type="button"
            onClick={() => setFilterPriority(!filterPriority)}
            className={cn(
              "w-full h-full flex items-center justify-center gap-2 rounded-2xl border-2 transition-all text-xs font-black uppercase tracking-widest",
              filterPriority
                ? "bg-warning/10 border-warning text-warning shadow-lg shadow-warning/10"
                : "bg-card border-border text-muted-foreground hover:bg-accent"
            )}
          >
            <Filter className="w-4 h-4" />
            {filterPriority ? 'Solo Prioritarias' : 'Todas'}
          </button>
        </div>
        <div className="md:col-span-1 flex items-center justify-center p-3 rounded-2xl border border-dashed border-border bg-muted/30">
          <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">
            {filteredNews.length} Resultados
          </span>
        </div>
      </div>

      {/* News List */}
      <StateRenderer
        isLoading={isLoading}
        error={error}
        data={filteredNews}
        emptyComponent={
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-muted/20 border border-border rounded-2xl p-8">
            <p className="font-bold text-foreground uppercase tracking-widest text-xs">No se encontraron noticias</p>
            <p className="text-sm text-muted-foreground">No hay artículos que coincidan con los criterios actuales.</p>
          </div>
        }
      >
        {(items) => (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </StateRenderer>
    </div>
  );
}

function NewsCard({ item }: { item: RSSNewsItem }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, scale: 1 }}
      exit={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95 }}
      className={cn(
        "group p-6 rounded-3xl border transition-all hover:shadow-2xl hover:-translate-y-1 flex flex-col justify-between h-full relative overflow-hidden",
        item.isPriority
          ? "border-warning/30 bg-warning/[0.02] shadow-warning/5 hover:border-warning/50"
          : "border-border bg-card shadow-sm hover:border-primary/30"
      )}
    >
      {item.isPriority && (
        <div className="absolute top-0 right-0">
          <div className="bg-warning text-foreground text-xs font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-lg">
            Prioritario
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-2 rounded-xl",
              item.isPriority ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
            )}>
              <Newspaper className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              {item.feedName || 'Noticias'}
            </span>
          </div>
          <div className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {safeFormatDate(item.pubDate)}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight line-clamp-2 leading-tight group-hover:text-primary transition-colors">
            {item.title}
          </h3>
          <p className="mt-3 text-xs font-medium text-muted-foreground line-clamp-3 leading-relaxed">
            {item.contentSnippet}
          </p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-border/50 flex items-center justify-between">
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-1"
        >
          Leer noticia completa <ExternalLink className="w-3 h-3" />
        </a>
        <div className="p-2 rounded-full border border-border group-hover:bg-primary group-hover:border-primary transition-all">
          <ChevronRight className="w-3 h-3 group-hover:text-foreground" />
        </div>
      </div>
    </motion.div>
  );
}
