'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Scale, Search, FileText, Download,
  ChevronRight, BookOpen, Calculator,
  Filter, Sparkles, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import LegalConsultant from './LegalConsultant';
import LegalModelForm from './LegalModelForm';

export default function LegalView() {
  const prefersReducedMotion = useReducedMotion();
  const [resolutions, setResolutions] = useState<any[]>([]);
  const [selectedResolution, setSelectedResolution] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('legal_resolutions')
        .select('*, legal_models(*)');

      if (error) throw error;
      setResolutions(data || []);
    } catch (error) {
      console.error('Error fetching legal data:', error);
      toast.error('Error al cargar normativas legales');
    } finally {
      setLoading(false);
    }
  }

  const filteredResolutions = resolutions.filter(res =>
    res.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    res.full_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    res.legal_models.some((m: any) => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (selectedModel) {
    return (
      <div className="space-y-6">
        <button type="button"
          onClick={() => setSelectedModel(null)}
          className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity font-bold uppercase text-xs tracking-widest"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Consultor
        </button>
        <LegalModelForm model={selectedModel} onCancel={() => setSelectedModel(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-primary/5 p-8 rounded-3xl border border-primary/10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Scale className="w-8 h-8 text-foreground" />
          </div>
          <div>
            <h1 className="text-[clamp(1.5rem,6vw,2.25rem)] font-black uppercase tracking-tight leading-none">Consultor Legal</h1>
            <p className="text-muted-foreground font-medium uppercase text-[10px] sm:text-xs tracking-widest mt-2 opacity-70">
              Normativas, Resoluciones y Modelos Oficiales
            </p>
          </div>
        </div>

        <div className="relative group max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary group-focus-within:scale-110 transition-transform" />
          <input
            type="text"
            placeholder="BUSCAR RESOLUCIÓN O MODELO..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Buscar resolución o modelo legal"
            className="w-full h-14 bg-background border-2 border-primary/10 rounded-2xl pl-12 pr-4 text-sm font-bold focus:outline-none focus:border-primary transition-all uppercase tracking-wider shadow-sm"
          />
        </div>
      </header>

      <LegalConsultant
        resolutions={filteredResolutions}
        loading={loading}
        onSelectModel={(model: any) => setSelectedModel(model)}
      />
    </div>
  );
}
