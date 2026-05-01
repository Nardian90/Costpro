'use client';

import * as React from 'react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, BookOpen, ChevronRight, Sparkles,
  ExternalLink, Info, ClipboardList, Briefcase, Scale
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LegalConsultantProps {
  resolutions: any[];
  loading: boolean;
  onSelectModel: (model: any) => void;
}

export default function LegalConsultant({ resolutions, loading, onSelectModel }: LegalConsultantProps) {
  const [activeResId, setActiveResId] = useState<string | null>(null);

  const formatResolutionText = (text: string) => {
    if (!text) return null;

    // Split text into lines/paragraphs and handle the uppercase keywords
    const paragraphs = text.split('\n');

    return paragraphs.map((p, idx) => {
      // Find patterns like "POR CUANTO:", "PRIMERO:", "RESOLUCION:" (all caps ending in :)
      const parts = p.split(/([A-Z\s]+:)/g);

      return (
        <p key={idx} className="mb-4 text-justify text-foreground dark:text-foreground font-medium leading-relaxed">
          {parts.map((part, pIdx) => {
            if (/^[A-Z\s]+:$/.test(part)) {
              return <strong key={pIdx} className="font-black text-foreground">{part}</strong>;
            }
            return part;
          })}
        </p>
      );
    });
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-64 bg-primary/5 animate-pulse rounded-3xl border border-primary/10" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Sidebar Navigation for Resolutions */}
      <div className="lg:col-span-4 space-y-4">
        <h2 className="text-xs font-black text-primary/60 uppercase tracking-[0.3em] px-4">Resoluciones Vigentes</h2>
        <div className="space-y-2">
          {resolutions.map(res => (
            <button
              key={res.id}
              onClick={() => setActiveResId(res.id === activeResId ? null : res.id)}
              aria-label={`Resolución: ${res.title}`}
              className={cn(
                "w-full text-left p-6 rounded-2xl transition-all border-2 group",
                activeResId === res.id
                  ? "bg-primary border-primary text-foreground shadow-xl shadow-primary/20"
                  : "bg-background border-primary/10 hover:border-primary/30 text-foreground"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className={cn(
                    "text-[10px] font-black uppercase tracking-widest mb-1",
                    activeResId === res.id ? "text-white/70" : "text-primary"
                  )}>
                    Resolución {res.number}/{res.year}
                  </div>
                  <h3 className="text-sm font-black leading-tight uppercase line-clamp-2">
                    {res.title.replace(`RESOLUCIÓN No. ${res.number}/${res.year} - `, '')}
                  </h3>
                </div>
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                  activeResId === res.id ? "bg-white/20" : "bg-primary/10 group-hover:bg-primary group-hover:text-foreground"
                )}>
                  {res.sub_system === 'Nóminas' ? <Briefcase className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="bg-gradient-to-br from-primary/10 to-transparent p-8 rounded-3xl border border-primary/10 mt-8">
          <Sparkles className="w-8 h-8 text-primary mb-4" />
          <h4 className="text-sm font-black uppercase tracking-tight">Consultor Inteligente</h4>
          <p className="text-xs text-muted-foreground font-medium mt-2 leading-relaxed">
            Las normativas se actualizan automáticamente según la Gaceta Oficial. Si una norma es derogada, el sistema te lo notificará aquí.
          </p>
        </div>
      </div>

      {/* Content Area */}
      <div className="lg:col-span-8">
        <AnimatePresence mode="wait">
          {activeResId ? (
            <motion.div
              key={activeResId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="bg-background dark:bg-zinc-900 border-2 border-primary/10 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-8 border-b border-primary/5 bg-primary/5">
                  <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-2">
                    <BookOpen className="w-4 h-4" />
                    Vista de Lectura Interactiva
                  </div>
                  <h2 className="text-[clamp(1.25rem,5vw,1.5rem)] font-black uppercase tracking-tight leading-tight">
                    {resolutions.find(r => r.id === activeResId)?.title}
                  </h2>
                </div>
                <div className="p-8 max-h-[500px] overflow-y-auto text-sm no-scrollbar">
                  {formatResolutionText(resolutions.find(r => r.id === activeResId)?.full_text)}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black text-primary/60 uppercase tracking-[0.3em] px-4">Modelos Disponibles para Emitir</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {resolutions.find(r => r.id === activeResId)?.legal_models.map((model: any) => (
                    <button
                      key={model.id}
                      onClick={() => onSelectModel(model)}
                      className="group bg-background p-6 rounded-2xl border-2 border-primary/5 hover:border-primary/30 transition-all text-left flex items-center justify-between shadow-sm hover:shadow-md"
                    >
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-primary uppercase tracking-widest">{model.code}</div>
                        <div className="text-sm font-black uppercase tracking-tight group-hover:text-primary transition-colors">{model.name}</div>
                        <div className="text-[10px] text-muted-foreground font-medium uppercase line-clamp-1">{model.objective}</div>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center group-hover:bg-primary transition-colors">
                        <ChevronRight className="w-4 h-4 group-hover:text-foreground transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-primary/5 rounded-3xl border-2 border-dashed border-primary/20">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Scale className="w-10 h-10 text-primary opacity-40" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">Selecciona una Resolución</h3>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2 font-medium">
                Explora las normativas vigentes en la columna izquierda para ver su contenido y emitir modelos oficiales.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
