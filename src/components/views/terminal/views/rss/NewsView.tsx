'use client';

import { useQuery } from '@tanstack/react-query';
import { rssService } from '@/services/rss-service';
import { RSSItem } from '@/types';
import {
  Newspaper,
  ExternalLink,
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function NewsView() {
  const { data: news, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['news'],
    queryFn: () => rssService.fetchNews(),
    staleTime: 30 * 60 * 1000, // 30 mins
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="w-10 h-10 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Sincronizando noticias del mundo...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-destructive/10 border-2 border-dashed border-destructive/20 rounded-3xl text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
        <h3 className="text-lg font-black uppercase text-destructive">Error al cargar noticias</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          No pudimos conectar con los servicios de noticias. Por favor, intenta de nuevo más tarde.
        </p>
        <button
          onClick={() => refetch()}
          className="px-6 py-2 bg-destructive text-white font-bold rounded-xl text-xs uppercase"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tighter">Noticias Inteligentes</h2>
          <p className="text-muted-foreground font-medium uppercase text-[10px] tracking-widest">
            Agregador de feeds con prioridad económica y tasas de cambio
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground font-bold rounded-xl text-[10px] uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} />
          {isRefetching ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {news?.map((item) => (
          <NewsCard key={item.id} item={item} />
        ))}
      </div>

      {news?.length === 0 && (
        <div className="py-20 text-center space-y-4">
          <Newspaper className="w-16 h-16 text-muted-foreground/20 mx-auto" />
          <p className="text-muted-foreground font-bold uppercase text-xs">No hay noticias disponibles en este momento.</p>
        </div>
      )}
    </div>
  );
}

function NewsCard({ item }: { item: RSSItem }) {
  const isExchangeRate = item.isExchangeRate;
  const isPriority = item.isPriority;

  return (
    <div className={`group relative bg-card border-2 transition-all duration-300 rounded-[2rem] overflow-hidden flex flex-col ${
      isExchangeRate
        ? 'border-primary ring-4 ring-primary/10'
        : isPriority
          ? 'border-orange-500/50 hover:border-orange-500 bg-orange-500/[0.02]'
          : 'border-border hover:border-primary/50'
    }`}>
      {/* Badges */}
      <div className="absolute top-4 right-4 flex gap-2">
        {isExchangeRate && (
          <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg animate-pulse">
            <TrendingUp className="w-3 h-3" />
            Tasa de Cambio
          </div>
        )}
        {isPriority && !isExchangeRate && (
          <div className="bg-orange-500 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg">
            <AlertTriangle className="w-3 h-3" />
            Prioridad
          </div>
        )}
      </div>

      <div className="p-6 space-y-4 flex-1 flex flex-col">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span className="text-primary">{item.sourceName}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(item.pubDate), { addSuffix: true, locale: es })}
            </span>
          </div>
          <h3 className={`text-lg font-black leading-tight group-hover:text-primary transition-colors ${
            isExchangeRate ? 'text-xl' : ''
          }`}>
            {item.title}
          </h3>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-3 font-medium leading-relaxed flex-1">
          {item.contentSnippet}
        </p>

        <div className="pt-4 flex items-center justify-between border-t border-border/50">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:gap-3 transition-all"
          >
            Leer más <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
