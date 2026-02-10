
'use client';

import React from 'react';
import { FileText, TrendingUp, Info, PieChart as PieIcon, BarChart as BarIcon, Activity, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface CostSheetNarrativeProps {
  data: any;
  calculatedValues: any;
  calculatedHeader: any;
}

const CostSheetNarrative: React.FC<CostSheetNarrativeProps> = ({ data, calculatedValues, calculatedHeader }) => {
  if (!data || !data.header) return null;

  const header = calculatedHeader || data.header;
  const getVal = (id: string) => calculatedValues?.[id]?.total || 0;
  const format = (val: number) => formatCurrency(val);

  const costoTotal = getVal('5');
  const costoYGastoTotal = getVal('12');
  const gastosTotales = costoYGastoTotal - costoTotal;
  const utilidad = getVal('13');
  const precioFinal = getVal('14');

  const quantity = parseFloat(header?.quantity) || 1;
  const unitPrice = getVal('16') || (precioFinal / quantity);
  const breakEvenPrice = getVal('15') || (costoYGastoTotal / quantity);

  const materialTotal = getVal('1');
  const salarioTotal = getVal('2');
  const otrosDirectos = getVal('3');
  const asociadosProd = getVal('4');

  // Identify the largest cost driver
  const components = [
    { label: 'Gasto Material', value: materialTotal, color: '#3b82f6' },
    { label: 'Salario Directo', value: salarioTotal, color: '#10b981' },
    { label: 'Otros Gastos Directos', value: otrosDirectos, color: '#f59e0b' },
    { label: 'Gastos Asociados', value: asociadosProd, color: '#8b5cf6' }
  ];
  const largest = components.reduce((prev, current) => (prev.value > current.value) ? prev : current);

  // Data for Charts
  const costStructureData = [
    { name: 'Costos Directos', value: costoTotal, color: '#3b82f6' },
    { name: 'Gastos Indirectos', value: gastosTotales, color: '#f43f5e' },
  ];

  const breakEvenData = [
    {
      name: 'Precios',
      'Punto Equilibrio': breakEvenPrice,
      'Precio Venta': unitPrice,
    }
  ];

  const COLORS = ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-20">
      {/* Executive Header */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 text-white p-8 md:p-12 shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10">
            <FileText className="w-64 h-64 -mr-20 -mt-20" />
        </div>

        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-primary/20 backdrop-blur-md rounded-xl border border-white/10">
                    <Activity className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.4em] text-primary-foreground/70">Informe Ejecutivo de Costos</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
                {header?.name || 'Ficha de Costo'}
            </h1>
            <p className="text-slate-400 text-lg md:text-xl font-medium max-w-2xl leading-relaxed">
                Análisis técnico-económico detallado de la estructura de costos, margen de rentabilidad y proyecciones de venta para el producto <span className="text-white underline decoration-primary decoration-4 underline-offset-4">{header?.product_code || ''}</span>.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-12 border-t border-white/10 pt-8">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Costo Total</p>
                    <p className="text-xl font-bold">{header?.currency} {format(costoYGastoTotal)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Precio Unitario</p>
                    <p className="text-xl font-bold">{header?.currency} {format(unitPrice)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Margen (30%)</p>
                    <p className="text-xl font-bold text-success">{header?.currency} {format(utilidad)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">UM</p>
                    <p className="text-xl font-bold uppercase">{header?.unit || 'Unidad'}</p>
                </div>
            </div>
        </div>
      </div>

      {/* Intelligent Insights Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-xl font-black mb-6 flex items-center gap-3">
                    <div className="w-2 h-8 bg-primary rounded-full" />
                    Análisis Inteligente de Partidas
                </h3>

                <div className="space-y-6">
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg">
                        Tras procesar los datos a través del motor declarativo, se identifica que el <span className="font-bold text-foreground">{(costoYGastoTotal > 0 ? (costoTotal / costoYGastoTotal * 100) : 0).toFixed(1)}%</span> del gasto total se concentra en costos directos de fabricación.
                    </p>

                    <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                            <Target className="w-12 h-12" />
                        </div>
                        <p className="text-sm font-bold text-primary uppercase tracking-widest mb-2">Principal Impulsor de Costo</p>
                        <p className="text-slate-700 dark:text-slate-300">
                            La partida <span className="font-black text-foreground underline decoration-primary/30 decoration-2 underline-offset-2">"{largest.label}"</span> representa el <span className="font-black text-primary text-lg">{(costoTotal > 0 ? (largest.value / costoTotal * 100) : 0).toFixed(1)}%</span> del costo de producción. Esta es la variable de mayor sensibilidad para optimizaciones operativas.
                        </p>
                    </div>

                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        {materialTotal > 0 && (
                            <span className="block mb-2">
                                <span className="font-bold text-foreground">Gestión de Materiales:</span> Con una inversión de {format(materialTotal)}, el flujo de insumos desde el Anexo I es el pilar de la composición física del producto.
                            </span>
                        )}
                        {salarioTotal > 0 && (
                            <span className="block">
                                <span className="font-bold text-foreground">Fuerza de Trabajo:</span> Los salarios directos ({format(salarioTotal)}) incluyen las provisiones legales correspondientes, garantizando el cumplimiento normativo.
                            </span>
                        )}
                    </p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-xl font-black mb-6 flex items-center gap-3">
                    <div className="w-2 h-8 bg-amber-500 rounded-full" />
                    Punto de Equilibrio y Venta
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
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
                <h3 className="text-sm font-black uppercase tracking-widest mb-8 text-center">Estructura de Costos</h3>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={costStructureData}
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={8}
                                dataKey="value"
                            >
                                {costStructureData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
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
                <h3 className="text-lg font-black mb-4">Conclusión</h3>
                <p className="text-sm leading-relaxed opacity-90 mb-6">
                    Se recomienda una tarifa de <span className="font-black">{header?.currency} {format(unitPrice)}</span> para garantizar la sostenibilidad y el margen proyectado del 30%.
                </p>
                <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                    <Info className="w-5 h-5 shrink-0" />
                    <p className="text-[10px] font-bold uppercase tracking-widest leading-tight">
                        Datos validados por el motor v5.7.24
                    </p>
                </div>
            </div>
        </div>
      </div>

      <div className="pt-12 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
          Documento Confidencial • Generado Automáticamente por CostPro Terminal
        </p>
      </div>
    </div>
  );
};

export default CostSheetNarrative;
