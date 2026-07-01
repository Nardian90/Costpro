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

    import('d3').then((d3) => {
      const svg = d3.select(heatmapRef.current);
      svg.selectAll("*").remove();

      const margin = { top: 20, right: 20, bottom: 20, left: 20 };
      const width = 280 - margin.left - margin.right;
      const height = 280 - margin.top - margin.bottom;

      const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const data: any[] = [];
      const transitions = analysis.markovTransitions.digits;
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          data.push({ x: String(i), y: String(j), value: transitions[i]?.[j] || 0 });
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
        .style("stroke", "rgba(0,0,0,0.05)")
        .append("title")
        .text((d: any) => `De ${d.x} a ${d.y}: ${d.value} veces`);

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

  const distribution2DData = useMemo(() => {
    const dist: Record<number, number> = {};
    history.slice(0, 100).forEach(h => {
      const val = (h.result[1] * 10) + h.result[2];
      dist[val] = (dist[val] || 0) + 1;
    });
    return Object.entries(dist)
      .map(([val, count]) => ({ val: val.padStart(2, '0'), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [history]);

  const ChartWrapper = ({ title, desc, children }: any) => (
    <Card className="bg-card border-border/50 shadow-xl relative group overflow-hidden rounded-[32px]">
      <CardHeader>
        <CardTitle className="text-xs font-black uppercase tracking-widest italic flex items-center gap-2">
          {title}
        </CardTitle>
        <CardDescription className="text-[10px]">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="h-[200px] md:h-[250px]">
        {children}
      </CardContent>
    </Card>
  );

  if (!mounted) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
       <ChartWrapper
          title="Frecuencia de Dígitos"
          desc="Distribución histórica (Global)"
       >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={freqData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="number" stroke="#999" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis stroke="#999" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                contentStyle={{ backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px' }}
              />
              <Bar isAnimationActive={false} dataKey="frequency" radius={[4, 4, 0, 0]}>
                {freqData.map((entry, index) => (
                  <Cell key={index} fill={entry.isHot ? '#3b82f6' : 'rgba(0,0,0,0.1)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
       </ChartWrapper>

       <ChartWrapper
          title="Top 2D (Últimos 100)"
          desc="Pares más frecuentes (YZ)"
       >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution2DData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
              <XAxis type="number" hide />
              <YAxis dataKey="val" type="category" stroke="#999" fontSize={10} axisLine={false} tickLine={false} width={30} />
              <Tooltip />
              <Bar isAnimationActive={false} dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
       </ChartWrapper>

       <ChartWrapper
          title="Mapa de Calor Markov"
          desc="Transiciones (X -> X')"
       >
          <div className="flex justify-center items-center h-full">
            <svg ref={heatmapRef} width="280" height="280" className="max-w-full h-auto"></svg>
          </div>
       </ChartWrapper>
    </div>
  );
}
