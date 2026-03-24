"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AdvancedAnalysis } from '@/types/pick3';
import { Pick3Result } from '@/types/pick3';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area
} from 'recharts';

/**
 * Visualización avanzada para Pick 3.
 * Utiliza Recharts para gráficos estándar (Frecuencia, Tendencia)
 * y D3.js para el Heatmap de transiciones (Requerimiento de patrones complejos).
 */
export function Pick3Visuals({ analysis, history }: { analysis: AdvancedAnalysis; history: Pick3Result[] }) {
  const heatmapRef = useRef<SVGSVGElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !heatmapRef.current || !analysis.markovTransitions) return;

    // Carga perezosa de D3 para evitar problemas de SSR y optimizar el bundle
    import('d3').then((d3) => {
      const svg = d3.select(heatmapRef.current);
      svg.selectAll("*").remove();

      const data: {x: number, y: number, value: number}[] = [];
      Object.entries(analysis.markovTransitions).forEach(([current, transitions]) => {
        Object.entries(transitions).forEach(([next, count]) => {
          data.push({ x: parseInt(current), y: parseInt(next), value: count as number });
        });
      });

      const margin = { top: 20, right: 20, bottom: 30, left: 30 };
      const width = 300 - margin.left - margin.right;
      const height = 300 - margin.top - margin.bottom;

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const x = d3.scaleBand().range([0, width]).domain(d3.range(10).map(String)).padding(0.05);
      const y = d3.scaleBand().range([height, 0]).domain(d3.range(10).map(String)).padding(0.05);

      const color = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, d3.max(data, (d: any) => d.value) || 1]);

      g.selectAll("rect")
        .data(data)
        .enter().append("rect")
        .attr("x", (d: any) => x(String(d.x))!)
        .attr("y", (d: any) => y(String(d.y))!)
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", (d: any) => color(d.value))
        .style("stroke-width", 1)
        .style("stroke", "rgba(255,255,255,0.05)")
        .append("title")
        .text((d: any) => `De ${d.x} a ${d.y}: ${d.value} veces`);

      // Ejes
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
    return history.slice(0, 15).reverse().map(h => ({
      date: h.date,
      sum: h.result?.reduce((a,b) => a+b, 0) || 0
    }));
  }, [history]);

  if (!mounted) {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">
          Sincronizando Motores Visuales...
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
       <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            Frecuencia Global
          </CardTitle>
          <CardDescription>Distribución histórica por dígito</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px]">
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
        </CardContent>
      </Card>

      <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            Evolución Cuántica
          </CardTitle>
          <CardDescription>Suma de dígitos en el tiempo</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px]">
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
        </CardContent>
      </Card>

      <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            Heatmap de Transición (D3)
          </CardTitle>
          <CardDescription>Correlación Markov entre sorteos</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center">
          <svg ref={heatmapRef} width="280" height="280"></svg>
        </CardContent>
      </Card>
    </div>
  );
}
