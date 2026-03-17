'use client';

import React from 'react';
import { Info, Activity, Database, ShieldCheck, Target } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const MetricsGuide: React.FC = () => {
  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Info className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter">Guía de Interpretación de Métricas</h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Entienda los indicadores clave de su infraestructura</p>
        </div>
      </div>

      <Accordion type="single" collapsible className="space-y-4">
        <AccordionItem value="infra" className="border-none bg-background/40 rounded-3xl px-6">
          <AccordionTrigger className="py-6 hover:no-underline">
            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest">
              <Activity className="w-4 h-4 text-blue-500" />
              INFRAESTRUCTURA (SHI - 35%)
              <span className="ml-auto text-muted-foreground opacity-40">35% del score</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="text-[11px] font-bold uppercase text-muted-foreground pb-6 leading-relaxed">
            MONITOREA EL ESTADO FÍSICO Y DE RED DEL SISTEMA. INCLUYE UPTIME, LATENCIA Y CARGA DE RECURSOS.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="ops" className="border-none bg-background/40 rounded-3xl px-6">
          <AccordionTrigger className="py-6 hover:no-underline">
            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest">
              <Database className="w-4 h-4 text-emerald-500" />
              OPERACIONES & APLICACIÓN (SHI - 25%)
              <span className="ml-auto text-muted-foreground opacity-40">25% del score</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="text-[11px] font-bold uppercase text-muted-foreground pb-6 leading-relaxed">
            EVALÚA LA SALUD DE LA LÓGICA DE NEGOCIO, RENDIMIENTO TRANSACCIONAL Y ESTADO DE SINCRONIZACIÓN.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="sec" className="border-none bg-background/40 rounded-3xl px-6">
          <AccordionTrigger className="py-6 hover:no-underline">
            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest">
              <ShieldCheck className="w-4 h-4 text-rose-500" />
              SEGURIDAD & GRC (SHI - 25%)
              <span className="ml-auto text-muted-foreground opacity-40">25% del score</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="text-[11px] font-bold uppercase text-muted-foreground pb-6 leading-relaxed">
            GOBERNANZA DE ACCESO, POLÍTICAS RLS Y PROTECCIÓN CONTRA AMENAZAS ACTIVAS.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="mri" className="border-none bg-background/40 rounded-3xl px-6">
          <AccordionTrigger className="py-6 hover:no-underline">
            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest">
              <Target className="w-4 h-4 text-primary" />
              MARKET READINESS INDEX (MRI - 15%)
              <span className="ml-auto text-muted-foreground opacity-40">15% del score</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="text-[11px] font-bold uppercase text-muted-foreground pb-6 leading-relaxed">
            CALIDAD TÉCNICA PARA DESPLIEGUE EN PRODUCCIÓN (ARCHITECTURE, DOCUMENTATION, TESTING, SECURITY).
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
};
