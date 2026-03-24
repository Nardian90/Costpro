"use client";
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AdvancedAnalysis } from '@/services/pick3/Pick3Engine';
import { Pick3Result } from '@/types/pick3';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler
);

interface Pick3VisualsProps {
  analysis: AdvancedAnalysis;
  history: Pick3Result[];
}

export function Pick3Visuals({ analysis, history }: Pick3VisualsProps) {
  const heatmapRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!heatmapRef.current || !analysis.markovTransitions) return;

    // Simple D3.js Heatmap for Markov Transitions of first digit
    const svg = d3.select(heatmapRef.current);
    svg.selectAll("*").remove();

    const data: {x: number, y: number, value: number}[] = [];
    Object.entries(analysis.markovTransitions).forEach(([current, transitions]) => {
      Object.entries(transitions).forEach(([next, count]) => {
        data.push({ x: parseInt(current), y: parseInt(next), value: count });
      });
    });

    const margin = { top: 20, right: 20, bottom: 30, left: 30 };
    const width = 300 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().range([0, width]).domain(d3.range(10).map(String)).padding(0.05);
    const y = d3.scaleBand().range([height, 0]).domain(d3.range(10).map(String)).padding(0.05);

    const color = d3.scaleSequential(d3.interpolateBlues)
      .domain([0, d3.max(data, d => d.value) || 1]);

    g.selectAll("rect")
      .data(data)
      .enter().append("rect")
      .attr("x", d => x(String(d.x))!)
      .attr("y", d => y(String(d.y))!)
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .style("fill", d => color(d.value))
      .style("stroke-width", 1)
      .style("stroke", "rgba(255,255,255,0.05)")
      .append("title")
      .text(d => `De ${d.x} a ${d.y}: ${d.value} veces`);

    // Add axes
    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickSize(0)).select(".domain").remove();
    g.append("g").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();

  }, [analysis]);

  // Chart.js Data: Frequency
  const freqData = {
    labels: ['0','1','2','3','4','5','6','7','8','9'],
    datasets: [{
      label: 'Frecuencia Global',
      data: Object.values(analysis.global),
      backgroundColor: 'rgba(54, 162, 235, 0.7)',
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 1,
      borderRadius: 4,
    }]
  };

  // Chart.js Data: Evolution (Sum of digits over time)
  const evolutionData = {
    labels: history.slice(0, 15).reverse().map(h => h.date),
    datasets: [{
      label: 'Suma de Dígitos (Evolución)',
      data: history.slice(0, 15).reverse().map(h => h.result?.reduce((a,b) => a+b, 0) || 0),
      fill: true,
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      borderColor: 'rgba(75, 192, 192, 1)',
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: 'rgba(75, 192, 192, 1)',
    }]
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
       <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            Frecuencia de Dígitos
          </CardTitle>
          <CardDescription>Distribución de apariciones por número</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <Bar data={freqData} options={{ maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } } }} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            Evolución Temporal
          </CardTitle>
          <CardDescription>Tendencia de la suma total (últimas 15)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <Line data={evolutionData} options={{ maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } } }} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            Heatmap de Transición (D3.js)
          </CardTitle>
          <CardDescription>Correlación Markov entre dígitos consecutivos</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center">
          <svg ref={heatmapRef} width="280" height="280"></svg>
        </CardContent>
      </Card>
    </div>
  );
}
