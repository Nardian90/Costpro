import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAcademyStore } from '@/store/useAcademyStore';
import { useAuthStore } from '@/store';
import { Flashcard } from './Flashcard';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { GraduationCap, Brain, Library, BarChart3, RefreshCw, Zap } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { toast } from 'sonner';

const MasteryDashboard = dynamic(() => import('./MasteryDashboard').then(m => ({ default: m.MasteryDashboard })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-muted rounded h-64" />,
});

export default function AcademyView() {
  const { user } = useAuthStore();
  const {
    dueCards, newCards, loading, error,
    fetchDailyCards, evaluateCard, generateCards
  } = useAcademyStore();

  const [activeTab, setActiveTab] = useState<'study' | 'dashboard' | 'generate'>('study');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  const allCards = [...dueCards, ...newCards];
  const currentCard = allCards[currentIndex];

  useEffect(() => {
    fetchDailyCards();
  }, [fetchDailyCards]);

  const handleScore = async (score: number) => {
    if (!currentCard) return;
    await evaluateCard(currentCard.id, score);

    if (currentIndex < allCards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setShowSuccess(true);
    }
  };

  const handleGenerate = async (filename: string) => {
    try {
        await generateCards(filename, user?.aiProvider, user?.aiApiKey);
        toast.success('Flashcards generadas correctamente');
        fetchDailyCards();
        setActiveTab('study');
    } catch (e: any) {
        toast.error('Error al generar cards: ' + e.message);
    }
  };

  if (loading && allCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <CostProLoader size={200} text="ACADEMIA" subtext="PREPARANDO MATERIAL..." />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-card/50 p-8 rounded-[2rem] border border-primary/10 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
            <GraduationCap className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-[clamp(1.5rem,6vw,2.25rem)] font-black uppercase tracking-tighter italic text-foreground leading-none">Costpro Academia</h1>
            <p className="text-muted-foreground font-bold text-xs uppercase tracking-widest mt-1 opacity-70">Learning & Mastery Engine</p>
          </div>
        </div>

        <div className="flex bg-background/50 p-1.5 rounded-2xl border border-border gap-1">
          <Button
            variant={activeTab === 'study' ? 'default' : 'ghost'}
            className="rounded-xl font-black uppercase text-[10px] tracking-widest px-6 h-10 transition-all"
            onClick={() => setActiveTab('study')}
          >
            <Brain className="w-4 h-4 mr-2" /> Estudiar
          </Button>
          <Button
            variant={activeTab === 'dashboard' ? 'default' : 'ghost'}
            className="rounded-xl font-black uppercase text-[10px] tracking-widest px-6 h-10 transition-all"
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart3 className="w-4 h-4 mr-2" /> Maestría
          </Button>
           <Button
            variant={activeTab === 'generate' ? 'default' : 'ghost'}
            className="rounded-xl font-black uppercase text-[10px] tracking-widest px-6 h-10 transition-all"
            onClick={() => setActiveTab('generate')}
          >
            <Library className="w-4 h-4 mr-2" /> Contenido
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'study' && (
          <motion.div
            key="study"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center"
          >
            {showSuccess ? (
              <div className="text-center py-20 space-y-8 bg-card border border-border rounded-[3rem] w-full max-w-2xl shadow-xl px-12">
                <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto border-2 border-green-500/20 animate-bounce">
                    <Zap className="w-12 h-12 text-green-500" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-[clamp(1.5rem,6vw,2.25rem)] font-black uppercase tracking-tight italic">¡Sesión Completada!</h2>
                    <p className="text-muted-foreground font-medium">
                        Has revisado todas las tarjetas programadas para hoy. Tu maestría está aumentando.
                    </p>
                </div>
                <Button
                    onClick={() => { setShowSuccess(false); setCurrentIndex(0); fetchDailyCards(); }}
                    className="rounded-2xl px-12 py-7 font-black uppercase tracking-[0.2em] text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                >
                    Reiniciar Día
                </Button>
              </div>
            ) : currentCard ? (
              <div className="w-full space-y-12">
                <div className="flex justify-center gap-12">
                    <div className="text-center">
                        <span className="text-[clamp(1.5rem,6vw,2.25rem)] font-black text-primary tracking-tighter italic">{dueCards.length}</span>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">Repasar</p>
                    </div>
                    <div className="text-center">
                        <span className="text-[clamp(1.5rem,6vw,2.25rem)] font-black text-blue-500 tracking-tighter italic">{newCards.length}</span>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">Aprender</p>
                    </div>
                </div>

                <Flashcard
                  key={currentCard.id}
                  card={currentCard}
                  onScore={handleScore}
                />

                <div className="text-center">
                   <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] opacity-50">
                        Tarjeta {currentIndex + 1} de {allCards.length}
                   </p>
                   <div className="w-48 h-1.5 bg-border rounded-full mx-auto mt-4 overflow-hidden">
                        <motion.div
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${((currentIndex + 1) / allCards.length) * 100}%` }}
                        />
                   </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-24 space-y-8 bg-card border border-border rounded-[3rem] w-full max-w-2xl shadow-sm">
                 <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mx-auto border border-primary/10">
                    <Library className="w-10 h-10 text-primary/30" />
                 </div>
                 <div className="space-y-2">
                    <h2 className="text-2xl font-black uppercase italic tracking-tight">Todo al día</h2>
                    <p className="text-muted-foreground font-medium max-w-xs mx-auto">Vuelve mañana o genera más contenido desde los manuales técnicos.</p>
                 </div>
                 <Button onClick={() => setActiveTab('generate')} variant="outline" className="rounded-2xl font-black uppercase text-[10px] tracking-widest px-8 py-6 h-auto">
                    Generar Nuevo Contenido
                 </Button>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <MasteryDashboard />
          </motion.div>
        )}

        {activeTab === 'generate' && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="max-w-3xl mx-auto w-full"
            >
               <ManualsList onSelect={handleGenerate} />
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ManualsList({ onSelect }: { onSelect: (filename: string) => Promise<void> }) {
    const { token } = useAuthStore();
    const [manuals, setManuals] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/academy/generate', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
            .then(res => res.json())
            .then(data => setManuals(data.files || []))
            .finally(() => setLoading(false));
    }, [token]);

    const handleGenerate = async (file: string) => {
        setProcessing(file);
        try {
            await onSelect(file);
        } finally {
            setProcessing(null);
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="w-10 h-10 animate-spin text-primary opacity-20" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Analizando Repositorio</p>
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="text-center mb-10">
                <h3 className="text-2xl font-black uppercase tracking-tighter italic">Biblioteca de Manuales</h3>
                <p className="text-muted-foreground text-sm font-medium">Selecciona un manual para que la IA genere nuevas flashcards.</p>
            </div>
            <div className="grid gap-6">
                {manuals.map(file => (
                    <div key={file} className="flex flex-col sm:flex-row sm:items-center justify-between p-8 bg-card border border-border rounded-[2rem] hover:border-primary/40 transition-all hover:shadow-lg group">
                        <div className="flex items-center gap-6 mb-4 sm:mb-0">
                            <div className="w-14 h-14 rounded-2xl bg-red-500/5 flex items-center justify-center text-red-500 border border-red-500/10 group-hover:bg-red-500/10 transition-colors shadow-inner">
                                <span className="font-black text-[10px] tracking-tighter">PDF</span>
                            </div>
                            <div>
                                <p className="font-black text-lg text-foreground tracking-tight">{file}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black opacity-60">Recurso de Entrenamiento</p>
                            </div>
                        </div>
                        <Button
                            onClick={() => handleGenerate(file)}
                            disabled={!!processing}
                            className="rounded-2xl font-black uppercase text-[10px] tracking-widest px-8 py-6 h-auto shadow-md"
                        >
                            {processing === file ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Entrenar con IA'}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
