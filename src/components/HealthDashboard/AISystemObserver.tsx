'use client';

import React from 'react';
import { Bot, RefreshCw } from 'lucide-react';

export const AISystemObserver: React.FC = () => {
  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50">
       <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
            <Bot className="w-5 h-5 text-primary" />
            AI System Observer: Historial de Hallazgos
          </h2>
          <button disabled title="Próximamente" aria-label="Actualizar hallazgos" className="p-2 rounded-xl bg-background/50 border border-border/50 opacity-50 cursor-not-allowed">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
       </div>

       <div className="space-y-4">
          <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 border-l-4 border-l-blue-500">
             <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Hallazgo #204 - Optimización sugerida</div>
             <p className="text-xs font-bold leading-relaxed">
               SE DETECTÓ UN ACOPLAMIENTO ELEVADO EN 'src/lib/ipv/engine.ts' (SCORE: 10.0). SE RECOMIENDA DECOMPOSICIÓN DE FUNCIONES EN MÓDULOS DE VALIDACIÓN INDEPENDIENTES PARA MEJORAR LA TESTABILIDAD.
             </p>
          </div>

          <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 border-l-4 border-l-emerald-500">
             <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Hallazgo #203 - Integridad validada</div>
             <p className="text-xs font-bold leading-relaxed">
               LA ESTRUCTURA DE 'knowledge/knowledge_graph.json' ES CONSISTENTE CON LAS DEFINICIONES DE 'public/system_architecture.json'. SINCRONIZACIÓN EXITOSA.
             </p>
          </div>
       </div>
    </section>
  );
};
