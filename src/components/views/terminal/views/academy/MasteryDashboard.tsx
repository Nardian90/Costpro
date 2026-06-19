import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Award, Target, Zap, Clock, TrendingUp } from 'lucide-react';

export const MasteryDashboard = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [categoryStats, setCategoryStats] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const { data: progress } = await supabase
        .from('user_progress')
        .select('*, learning_cards(category, difficulty)')
        .eq('user_id', user.id);

      if (!progress) return;

      const totalCards = progress.length;
      const avgMastery = progress.reduce((acc, curr) => acc + (curr.mastery_score || 0), 0) / (totalCards || 1);
      const mastered = progress.filter(p => (p.mastery_score || 0) >= 90).length;

      setStats({
        totalCards,
        avgMastery: Math.round(avgMastery),
        mastered,
        masteryPercent: Math.round(avgMastery)
      });

      // Group by category
      const categories: Record<string, { total: number, sum: number }> = {};
      progress.forEach(p => {
        const cat = p.learning_cards?.category || 'Otros';
        if (!categories[cat]) categories[cat] = { total: 0, sum: 0 };
        categories[cat].total += 1;
        categories[cat].sum += (p.mastery_score || 0);
      });

      const catData = Object.entries(categories).map(([name, data]) => ({
        name,
        mastery: Math.round(data.sum / data.total)
      }));

      setCategoryStats(catData);
    };

    fetchStats();
  }, [user]);

  if (!stats) return <div className="text-center py-20 font-black uppercase tracking-widest animate-pulse">CALCULANDO MÉTRICAS...</div>;

  const level = stats.avgMastery >= 95 ? 'Arquitecto Costos' :
                stats.avgMastery >= 80 ? 'Analista' :
                'Operador';

  return (
    <div className="space-y-8">
      {/* Level Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-8 bg-primary text-primary-foreground rounded-3xl flex flex-col items-center justify-center text-center space-y-4 border-none shadow-xl">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                <Award className="w-10 h-10" />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Nivel Actual</p>
                <h3 className="text-[clamp(1.25rem,5vw,1.5rem)] font-black uppercase italic tracking-tighter leading-tight">{level}</h3>
            </div>
        </Card>

        <Card className="p-8 bg-card rounded-3xl border border-border flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <Target className="w-10 h-10" />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Dominio Global</p>
                <h3 className="text-[clamp(1.5rem,6vw,2.25rem)] font-black leading-none">{stats.avgMastery}%</h3>
            </div>
        </Card>

        <Card className="p-8 bg-card rounded-3xl border border-border flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center text-warning border border-warning/20">
                <Zap className="w-10 h-10" />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Tarjetas Dominadas</p>
                <h3 className="text-[clamp(1.5rem,6vw,2.25rem)] font-black leading-none">{stats.mastered}</h3>
            </div>
        </Card>
      </div>

      {/* Domain by Module */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-8 rounded-3xl border border-border shadow-sm">
            <h3 className="text-xl font-black uppercase tracking-tighter mb-8 flex items-center gap-3 italic">
                <TrendingUp className="w-6 h-6 text-primary" /> Dominio por Módulo
            </h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryStats} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={120}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fontWeight: 900 }}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="mastery" radius={[0, 8, 8, 0]}>
                            {categoryStats.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.mastery >= 80 ? '#22c55e' : entry.mastery >= 50 ? '#f59e0b' : '#3b82f6'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </Card>

        <Card className="p-8 rounded-3xl border border-border flex flex-col justify-center shadow-sm">
             <h3 className="text-xl font-black uppercase tracking-tighter mb-8 flex items-center gap-3 italic">
                <Clock className="w-6 h-6 text-primary" /> Estado del Repositorio
            </h3>
            <div className="space-y-8">
                <div>
                    <div className="flex justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tarjetas Totales</span>
                        <span className="font-black text-lg">{stats.totalCards}</span>
                    </div>
                    <Progress value={Math.min(100, (stats.totalCards / 100) * 100)} className="h-3 rounded-full" />
                </div>
                <div>
                    <div className="flex justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Maestría Arquitecto</span>
                        <span className="font-black text-lg">{stats.avgMastery}/100</span>
                    </div>
                    <Progress value={stats.avgMastery} className="h-3 rounded-full" />
                </div>
            </div>

            <div className="mt-12 p-8 bg-primary/5 rounded-3xl border border-primary/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Award className="w-20 h-20 text-primary" />
                </div>
                <p className="text-sm text-primary font-black leading-relaxed italic relative z-10">
                    "El conocimiento en Costpro no es solo usar una herramienta, es entender la arquitectura del costo para optimizar el beneficio."
                </p>
            </div>
        </Card>
      </div>
    </div>
  );
};
