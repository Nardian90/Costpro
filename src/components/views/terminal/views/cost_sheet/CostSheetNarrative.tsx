
'use client';

import React from 'react';
import { FileText, TrendingUp, Info } from 'lucide-react';

interface CostSheetNarrativeProps {
  data: any;
  calculatedValues: any;
}

const CostSheetNarrative: React.FC<CostSheetNarrativeProps> = ({ data, calculatedValues }) => {
  const getVal = (id: string) => calculatedValues[id]?.total || 0;
  const format = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const costoTotal = getVal('5');
  const gastosTotales = getVal('11');
  const costoYGastoTotal = getVal('12');
  const utilidad = getVal('13');
  const precioFinal = getVal('14');

  const materialTotal = getVal('1');
  const salarioTotal = getVal('2');
  const otrosDirectos = getVal('3');
  const asociadosProd = getVal('4');

  // Identify the largest cost driver
  const components = [
    { label: 'Gasto Material', value: materialTotal },
    { label: 'Salario Directo', value: salarioTotal },
    { label: 'Otros Gastos Directos', value: otrosDirectos },
    { label: 'Gastos Asociados', value: asociadosProd }
  ];
  const largest = components.reduce((prev, current) => (prev.value > current.value) ? prev : current);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Overview Card */}
      <div className="neu-card p-6 bg-primary/5 border-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary rounded-lg text-white">
            <FileText className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold">Informe Narrativo de Costos</h2>
        </div>

        <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
          Para el producto <span className="font-bold text-foreground">"{data.header.name}"</span>,
          se ha determinado un <span className="font-bold">Costo Total de Producción</span> de <span className="text-primary font-bold">{data.header.currency} {format(costoTotal)}</span>.
          A este valor se le adicionan gastos indirectos por un total de <span className="font-bold">{data.header.currency} {format(gastosTotales)}</span>,
          resultando en un costo y gasto total de <span className="font-bold">{data.header.currency} {format(costoYGastoTotal)}</span>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3">
             <TrendingUp className="w-5 h-5 text-success mt-1" />
             <div>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Margen de Utilidad</p>
                <p className="text-lg font-bold text-success">
                  {format(utilidad)}
                  ({costoYGastoTotal > 0 ? ((utilidad/costoYGastoTotal)*100).toFixed(2) : '0.00'}%)
                </p>
             </div>
          </div>
          <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3">
             <Info className="w-5 h-5 text-primary mt-1" />
             <div>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Precio Final Sugerido</p>
                <p className="text-lg font-bold text-primary">{data.header.currency} {format(precioFinal)}</p>
             </div>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown Narrative */}
      <div className="space-y-6 px-2">
        <section>
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <div className="w-2 h-6 bg-primary rounded-full" />
            Estructura de Costos Directos
          </h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            El componente principal de los costos directos es <span className="font-bold text-foreground">{largest.label}</span>,
            que representa el <span className="font-bold text-foreground">{costoTotal > 0 ? ((largest.value / costoTotal) * 100).toFixed(1) : '0.0'}%</span> del costo de producción.
            {materialTotal > 0 && ` Los gastos materiales ascienden a ${format(materialTotal)}, destacando los insumos derivados del Anexo I.`}
            {salarioTotal > 0 && ` La fuerza de trabajo directa representa una inversión de ${format(salarioTotal)}, incluyendo la provisión para vacaciones.`}
          </p>
        </section>

        <section>
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <div className="w-2 h-6 bg-success rounded-full" />
            Gastos Indirectos y Tributos
          </h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            Se han contemplado gastos generales y de administración, así como gastos de distribución y financieros.
            En el ámbito tributario, se calcula una <span className="font-bold text-foreground">Contribución a la Seguridad Social (14%)</span> y un
            <span className="font-bold text-foreground">Impuesto sobre la Fuerza de Trabajo (5%)</span>, totalizando
            <span className="font-bold text-foreground"> {format(getVal('10'))}</span> en cargas tributarias asociadas al personal.
          </p>
        </section>

        <section>
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <div className="w-2 h-6 bg-amber-500 rounded-full" />
            Conclusión Económica
          </h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
            El punto de equilibrio se sitúa en un precio unitario de <span className="font-bold text-foreground">{format(getVal('15'))}</span>.
            Para alcanzar la rentabilidad proyectada del {costoYGastoTotal > 0 ? ((utilidad/costoYGastoTotal)*100).toFixed(0) : '0'}%, se recomienda establecer la tarifa de venta en
            <span className="font-bold text-foreground"> {format(getVal('16'))} {data.header.currency} por {data.header.unit}</span>.
          </p>
        </section>
      </div>

      <div className="pt-8 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
          Documento Generado Automáticamente por el Motor de Cálculo CostPro v5.0
        </p>
      </div>
    </div>
  );
};

export default CostSheetNarrative;
