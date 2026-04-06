'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, TrendingUp, Info, PieChart as PieIcon, BarChart as BarIcon, Activity, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { SafePieChart } from "@/components/ui/SafePieChart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';

interface CostSheetNarrativeProps {
  data: any;
  calculatedValues?: any;
  calculatedHeader?: any;
}

export default function CostSheetNarrative({ data, calculatedValues, calculatedHeader }: CostSheetNarrativeProps) {
  const header = data?.header;
  const sections = data?.sections || [];

  // Calculate summary stats
  const totalCosto = sections.reduce((acc: number, s: any) => acc + (Number(s.total_costo) || 0), 0);
  const totalGasto = sections.reduce((acc: number, s: any) => acc + (Number(s.total_gasto) || 0), 0);
  const costoYGastoTotal = totalCosto + totalGasto;

  const unitPrice = Number(header?.unit_price) || 0;
  const breakEvenPrice = costoYGastoTotal;
  const marginValue = unitPrice - breakEvenPrice;
  const marginPercent = unitPrice > 0 ? (marginValue / unitPrice) * 100 : 0;

  const format = (val: number) => formatCurrency(val);

  const costStructureData = [
    { name: 'Costos Directos', value: totalCosto, color: '#10b981' },
    { name: 'Gastos Operativos', value: totalGasto, color: '#3b82f6' }
  ];

  const breakEvenData = [
    { name: 'Break-even', 'Punto Equilibrio': breakEvenPrice },
    { name: 'Precio Sugerido', 'Precio Venta': unitPrice }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="space-y-10">
            {/* Header Narrative */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <FileText className="w-5 h-5" />
                    </div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter">Resumen Ejecutivo</h2>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                    Este análisis detalla la estructura financiera de <span className="font-bold text-foreground">{header?.name || 'la ficha técnica'}</span>.
                    El costo total proyectado es de <span className="font-bold text-foreground">{format(costoYGastoTotal)}</span> por {header?.unit || 'unidad'}.
                    Con un precio de venta propuesto de <span className="font-bold text-primary">{format(unitPrice)}</span>, la operación genera un margen del <span className="font-bold text-primary">{marginPercent.toFixed(1)}%</span>.
                </p>
            </div>

            {/* Break-even Chart */}
            <div className="bg-background dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-widest mb-8 flex items-center gap-2">
                    <Target className="w-4 h-4 text-orange-500" /> Comparativa de Recuperación
                </h3>
                <div className="h-[250px] w-full mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={breakEvenData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" hide />
                            <YAxis tick={{ fontSize: 12, fontWeight: 'bold' }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                            <Bar dataKey="Punto Equilibrio" fill="#f59e0b" radius={[10, 10, 0, 0]} barSize={60} />
                            <Bar dataKey="Precio Venta" fill="#3b82f6" radius={[10, 10, 0, 0]} barSize={60} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed italic">
                    El gráfico compara el costo unitario de recuperación (Break-even) frente a la tarifa de venta propuesta. La diferencia de <span className="font-bold text-foreground">{format(unitPrice - breakEvenPrice)}</span> representa el margen bruto por {header?.unit || 'unidad'}.
                </p>
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-background dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
                <h3 className="text-sm font-black uppercase tracking-widest mb-8 text-center">Estructura de Costos</h3>
                <div className="w-full">
                    <SafePieChart
                      data={costStructureData}
                      colors={costStructureData.map(d => d.color)}
                      height={200}
                    />
                </div>
                <div className="mt-6 space-y-3 w-full">
                    {costStructureData.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="font-bold text-slate-500 uppercase">{item.name}</span>
                            </div>
                            <span className="font-black text-foreground">{(costoYGastoTotal > 0 ? (item.value / costoYGastoTotal * 100) : 0).toFixed(0)}%</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-primary text-primary-foreground rounded-[2rem] p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <TrendingUp className="w-20 h-20" />
                </div>
                <div className="relative z-10 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest opacity-80">Conclusión Operativa</h4>
                    <p className="font-medium text-lg leading-snug">
                        {marginPercent > 30
                          ? "La rentabilidad proyectada es óptima y supera el benchmark del sector (30%). Se recomienda proceder con el plan de producción."
                          : marginPercent > 10
                            ? "El margen es positivo pero ajustado. Se recomienda revisar los gastos operativos para maximizar la utilidad."
                            : "Alerta de rentabilidad crítica. El margen actual no garantiza sostenibilidad operativa a largo plazo."}
                    </p>
                    <div className="pt-4 flex items-center gap-6">
                        <div>
                            <div className="text-[10px] font-black uppercase opacity-60">Margen Bruto</div>
                            <div className="text-2xl font-black">{marginPercent.toFixed(1)}%</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase opacity-60">Punto de Equilibrio</div>
                            <div className="text-2xl font-black">{format(breakEvenPrice)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
