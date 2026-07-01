'use client';

import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen, Calculator, Info, Lightbulb } from 'lucide-react';

import { useTranslations } from 'next-intl';
export const CostSheetFormulaGuide = () => {
  const t = useTranslations('costSheet');
  return (
    <div className="mt-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-primary/10 p-2 rounded-xl">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-foreground uppercase tracking-tight">
            ¿Cómo se calculan estos costos?
          </h2>
          <p className="text-sm text-muted-foreground font-medium">Guía educativa paso a paso para entender tu ficha de costo</p>
        </div>
      </div>

      <Accordion type="single" collapsible className="w-full space-y-4">
        {/* 1. Gasto Material */}
        <AccordionItem value="item-1" className="border rounded-2xl px-6 bg-background dark:bg-slate-900/50 shadow-sm overflow-hidden">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-4 text-left">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg">
                <Calculator className="w-4 h-4 text-success" />
              </div>
              <div>
                <span className="text-sm font-black uppercase text-muted-foreground block">Fórmula #1</span>
                <span className="text-base font-bold text-slate-900 dark:text-foreground">Gasto Material (Anexo I)</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-6">
            <div className="space-y-6 pt-2">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border-l-4 border-success">
                <p className="text-xs font-black uppercase text-muted-foreground mb-1">Ecuación Matemática</p>
                <code className="text-lg font-black text-success dark:text-green-400">∑ (Consumo × Precio Unitario)</code>
              </div>

              <div className="flex gap-3">
                <div className="mt-1"><Info className="w-4 h-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Explicación en lenguaje natural:</p>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                    Es la suma de todo lo que "tocas" o consumes para fabricar el producto. Por cada material en tu lista, multiplicamos la cantidad que vas a usar (Norma de Consumo) por lo que te costó comprarlo. Al final, sumamos todos esos totales.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400">
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-wider">Ejemplo Práctico</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  Si para hacer un lote de pan usas <span className="font-bold text-slate-900 dark:text-foreground">10kg de harina</span> y cada kilo cuesta <span className="font-bold text-slate-900 dark:text-foreground">$50.00</span>:
                  <br />
                  <span className="inline-block mt-2 font-mono bg-background dark:bg-slate-800 px-2 py-1 rounded border shadow-sm">
                    10 (Cantidad) × 50 (Precio) = <span className="text-success font-bold">$500.00</span>
                  </span>
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 2. Salario Directo */}
        <AccordionItem value="item-2" className="border rounded-2xl px-6 bg-background dark:bg-slate-900/50 shadow-sm overflow-hidden">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-4 text-left">
              <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-lg">
                <Calculator className="w-4 h-4 text-warning" />
              </div>
              <div>
                <span className="text-sm font-black uppercase text-muted-foreground block">Fórmula #2</span>
                <span className="text-base font-bold text-slate-900 dark:text-foreground">Salario Directo (Anexo II)</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-6">
            <div className="space-y-6 pt-2">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border-l-4 border-warning">
                <p className="text-xs font-black uppercase text-muted-foreground mb-1">Ecuación Matemática</p>
                <code className="text-lg font-black text-warning dark:text-amber-400">∑ (Horas × Tarifa × Obreros) × 1.0909</code>
              </div>

              <div className="flex gap-3">
                <div className="mt-1"><Info className="w-4 h-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Explicación en lenguaje natural:</p>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                    Calculamos cuánto le pagamos a las personas que fabrican el producto. Multiplicamos el tiempo que tardan por su salario por hora y por la cantidad de personas. Además, sumamos un 9.09% adicional que es lo que se guarda legalmente para sus vacaciones.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400">
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-wider">Ejemplo Práctico</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  Un panadero trabaja <span className="font-bold text-slate-900 dark:text-foreground">8 horas</span> a <span className="font-bold text-slate-900 dark:text-foreground">$100/hora</span>:
                  <br />
                  <span className="inline-block mt-2 font-mono bg-background dark:bg-slate-800 px-2 py-1 rounded border shadow-sm">
                    8h × $100 = $800.00 base.
                  </span>
                  <br />
                  <span className="inline-block mt-1 font-mono bg-background dark:bg-slate-800 px-2 py-1 rounded border shadow-sm">
                    $800 × 1.0909 (con vacaciones) = <span className="text-warning font-bold">$872.72</span>
                  </span>
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 3. Costo Total */}
        <AccordionItem value="item-3" className="border rounded-2xl px-6 bg-background dark:bg-slate-900/50 shadow-sm overflow-hidden">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-4 text-left">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                <Calculator className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <span className="text-sm font-black uppercase text-muted-foreground block">Fórmula #3</span>
                <span className="text-base font-bold text-slate-900 dark:text-foreground">Costo Total de Producción</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-6">
            <div className="space-y-6 pt-2">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border-l-4 border-purple-500">
                <p className="text-xs font-black uppercase text-muted-foreground mb-1">Ecuación Matemática</p>
                <code className="text-lg font-black text-purple-600 dark:text-purple-400">Gastos Directos + Gastos Indirectos + Tributos</code>
              </div>

              <div className="flex gap-3">
                <div className="mt-1"><Info className="w-4 h-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Explicación en lenguaje natural:</p>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                    Es la "mochila" completa de gastos. Sumamos los materiales, los salarios, la depreciación de los equipos, los gastos de administración y los impuestos sobre la fuerza de trabajo. Es lo que realmente te cuesta tener el producto listo antes de pensar en ganar dinero.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400">
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-wider">Ejemplo Práctico</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  Si tus materiales son <span className="font-bold text-slate-900 dark:text-foreground">$500</span>, salarios <span className="font-bold text-slate-900 dark:text-foreground">$872</span> y otros gastos <span className="font-bold text-slate-900 dark:text-foreground">$128</span>:
                  <br />
                  <span className="inline-block mt-2 font-mono bg-background dark:bg-slate-800 px-2 py-1 rounded border shadow-sm">
                    500 + 872 + 128 = <span className="text-purple-600 font-bold">$1,500.00</span>
                  </span>
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 4. Utilidad */}
        <AccordionItem value="item-4" className="border rounded-2xl px-6 bg-background dark:bg-slate-900/50 shadow-sm overflow-hidden">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-4 text-left">
              <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg">
                <Calculator className="w-4 h-4 text-success" />
              </div>
              <div>
                <span className="text-sm font-black uppercase text-muted-foreground block">Fórmula #4</span>
                <span className="text-base font-bold text-slate-900 dark:text-foreground">Utilidad (Tu Ganancia)</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-6">
            <div className="space-y-6 pt-2">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border-l-4 border-success">
                <p className="text-xs font-black uppercase text-muted-foreground mb-1">Ecuación Matemática</p>
                <code className="text-lg font-black text-success dark:text-emerald-400">Costo Total × % Margen</code>
              </div>

              <div className="flex gap-3">
                <div className="mt-1"><Info className="w-4 h-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Explicación en lenguaje natural:</p>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                    Es el beneficio neto que quieres obtener por el esfuerzo de producir. Se calcula aplicando un porcentaje (ej. 30%) sobre el Costo Total que calculamos anteriormente.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400">
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-wider">Ejemplo Práctico</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  Si tu costo total es <span className="font-bold text-slate-900 dark:text-foreground">$1,500</span> y quieres ganar un <span className="font-bold text-slate-900 dark:text-foreground">30%</span>:
                  <br />
                  <span className="inline-block mt-2 font-mono bg-background dark:bg-slate-800 px-2 py-1 rounded border shadow-sm">
                    1,500 × 0.30 = <span className="text-success font-bold">$450.00</span>
                  </span>
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 5. Precio Final */}
        <AccordionItem value="item-5" className="border rounded-2xl px-6 bg-background dark:bg-slate-900/50 shadow-sm overflow-hidden">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-4 text-left">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                <Calculator className="w-4 h-4 text-primary" />
              </div>
              <div>
                <span className="text-sm font-black uppercase text-muted-foreground block">Fórmula #5</span>
                <span className="text-base font-bold text-slate-900 dark:text-foreground">Precio Final de Venta</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-6">
            <div className="space-y-6 pt-2">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border-l-4 border-primary">
                <p className="text-xs font-black uppercase text-muted-foreground mb-1">Ecuación Matemática</p>
                <code className="text-lg font-black text-primary dark:text-blue-400">(Costo + Utilidad) / 0.90</code>
              </div>

              <div className="flex gap-3">
                <div className="mt-1"><Info className="w-4 h-4 text-muted-foreground" /></div>
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Explicación en lenguaje natural:</p>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                    Es el precio que paga el cliente. Sumamos el costo y tu utilidad, y luego dividimos por 0.90. ¿Por qué? Esto asegura que cuando pagues el 10% de impuesto sobre la venta final, tu ganancia se mantenga intacta.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400">
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-wider">Ejemplo Práctico</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  Costo ($1,500) + Utilidad ($450) = <span className="font-bold text-slate-900 dark:text-foreground">$1,950</span>.
                  <br />
                  <span className="inline-block mt-2 font-mono bg-background dark:bg-slate-800 px-2 py-1 rounded border shadow-sm">
                    1,950 / 0.90 = <span className="text-primary font-bold">$2,166.67</span>
                  </span>
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
