"use client";

import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area
} from 'recharts';
import { AdvancedAnalysis, Pick3Result } from '@/types/pick3';
import { Info, Maximize2, Zap } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Pick3VisualsProps {
  analysis: AdvancedAnalysis;
  history: Pick3Result[];
}

export function Pick3Visuals({ analysis, history }: Pick3VisualsProps) {
  const [mounted, setMounted] = useState(false);
  const heatmapRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !heatmapRef.current) return;

    // Heatmap D3 implementation (Standardized)
    import('d3').then((d3) => {
      const svg = d3.select(heatmapRef.current);
      svg.selectAll("*").remove();

      const margin = { top: 20, right: 20, bottom: 20, left: 20 };
      const width = 280 - margin.left - margin.right;
      const height = 280 - margin.top - margin.bottom;

      const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const data: any[] = [];
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          data.push({ x: String(i), y: String(j), value: analysis.markovTransitions[i][j] || 0 });
        }
      }

      const x = d3.scaleBand().range([0, width]).domain(d3.range(10).map(String)).padding(0.05);
      const y = d3.scaleBand().range([height, 0]).domain(d3.range(10).map(String)).padding(0.05);

      const color = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, d3.max(data, (d: any) => d.value) || 1]);

      g.selectAll()
        .data(data)
        .enter()
        .append("rect")
        .attr("x", (d: any) => x(d.x)!)
        .attr("y", (d: any) => y(d.y)!)
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", (d: any) => color(d.value))
        .style("stroke-width", 1)
        .style("stroke", "rgba(255,255,255,0.05)")
        .append("title")
        .text((d: any) => `De ${d.x} a ${d.y}: ${d.value} veces`);

      // Axes
      g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickSize(0))
        .select(".domain").remove();

      g.append("g")
        .call(d3.axisLeft(y).tickSize(0))
        .select(".domain").remove();
    });
  }, [mounted, analysis]);

  const freqData = useMemo(() => {
    return Object.entries(analysis.global).map(([num, count]) => ({
      number: num,
      frequency: count,
      isHot: analysis.hotNumbers.includes(parseInt(num))
    }));
  }, [analysis]);

  const evolutionData = useMemo(() => {
    return history.slice(0, 30).reverse().map(h => ({
      date: h.date,
      sum: h.result?.reduce((a,b) => (a as number)+(b as number), 0) || 0
    }));
  }, [history]);

  const insight = useMemo(() => {
    const hot = analysis.hotNumbers[0];
    const bias = analysis.biasScore[hot];
    if (bias > 20) return `El número ${hot} muestra una desviación positiva crítica de +${bias.toFixed(1)}%. Alta probabilidad de tendencia persistente.`;
    return "Distribución estable. Considere una estrategia balanceada entre fríos y calientes.";
  }, [analysis]);

  const ChartWrapper = ({ title, desc, children, tooltip }: any) => (
    <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl relative group overflow-hidden">
      <div className="absolute top-4 right-4 flex gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-black/40 border border-white/10 text-white">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl h-[80vh] bg-black border-white/10">
             <DialogHeader>
                <DialogTitle className="text-2xl font-black italic uppercase italic tracking-tighter text-primary flex items-center gap-3">
                  <Zap className="w-6 h-6" />
                  Modo Enfoque: {title}
                </DialogTitle>
                <CardDescription className="text-base">{desc}</CardDescription>
             </DialogHeader>
             <div className="flex-1 mt-8 min-h-0 relative">
               {children}
               <div className="absolute bottom-4 left-4 right-4 p-6 rounded-3xl bg-primary/5 border border-primary/10 flex gap-4 items-start animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="p-2 rounded-xl bg-primary/20">
                    <Info className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Análisis Cuántico Automático</h4>
                    <p className="text-sm font-medium italic text-white/80">{insight}</p>
                  </div>
               </div>
             </div>
          </DialogContent>
        </Dialog>
        <div className="h-8 w-8 rounded-full bg-black/40 border border-white/10 text-white flex items-center justify-center cursor-help">
          <Info className="h-4 w-4" />
        </div>
      </div>
      <CardHeader>
        <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
          {title}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="h-[250px]">
        {children}
      </CardContent>
    </Card>
  );

  if (!mounted) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
       <ChartWrapper
          title="Frecuencia Global"
          desc="Distribución histórica por dígito"
          tooltip="Muestra cuántas veces ha salido cada dígito. Valores altos indican tendencia caliente."
       >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={freqData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="number" stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              />
              <Bar dataKey="frequency" radius={[4, 4, 0, 0]}>
                {freqData.map((entry, index) => (
                  <Cell key={index} fill={entry.isHot ? '#3b82f6' : 'rgba(255,255,255,0.1)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
       </ChartWrapper>

       <ChartWrapper
          title="Evolución Cuántica"
          desc="Suma de dígitos en el tiempo"
          tooltip="Muestra la suma de los tres dígitos. Permite detectar oscilaciones entre valores altos y bajos."
       >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolutionData}>
              <defs>
                <linearGradient id="colorSum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" hide />
              <YAxis stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              />
              <Area type="monotone" dataKey="sum" stroke="#10b981" fillOpacity={1} fill="url(#colorSum)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
       </ChartWrapper>

       <ChartWrapper
          title="Mapa de Calor de Transición"
          desc="Correlación Markov entre sorteos"
          tooltip="Analiza la probabilidad de que un dígito sea seguido por otro específico."
       >
          <div className="flex justify-center items-center h-full">
            <svg ref={heatmapRef} width="280" height="280"></svg>
          </div>
       </ChartWrapper>
    </div>
  );
}
