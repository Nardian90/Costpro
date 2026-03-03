'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket, Shield, AlertTriangle, CheckCircle2,
  Download, Plus, Trash2, Info, ChevronRight,
  ArrowRight, FileText, User, Layout, Gauge
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MRI_DOMAINS,
  HARD_STOPS,
  calculateMRI,
  getDictamen,
  getDictamenColor
} from '@/lib/release-gate/mri-engine';
import { toast } from 'sonner';
import { generateReleaseGatePdf } from '../legal/ReleaseGatePdfExporter';

export default function ReleaseGateView() {
  const [productName, setProductName] = useState('');
  const [version, setVersion] = useState('');
  const [approver, setApprover] = useState('');
  const [domainScores, setDomainScores] = useState<Record<string, number>>(
    MRI_DOMAINS.reduce((acc, d) => ({ ...acc, [d.id]: 5 }), {})
  );
  const [hardStops, setHardStops] = useState<Record<string, boolean>>(
    HARD_STOPS.reduce((acc, hs) => ({ ...acc, [hs.id]: false }), {})
  );
  const [risks, setRisks] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [newRisk, setNewRisk] = useState('');
  const [newRec, setNewRec] = useState('');

  const mri = useMemo(() => calculateMRI(domainScores), [domainScores]);
  const dictamen = useMemo(() => getDictamen(mri, hardStops), [mri, hardStops]);

  const handleScoreChange = (id: string, val: number) => {
    setDomainScores(prev => ({ ...prev, [id]: val }));
  };

  const handleHardStopToggle = (id: string) => {
    setHardStops(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const addRisk = () => {
    if (!newRisk) return;
    setRisks([...risks, newRisk]);
    setNewRisk('');
  };

  const addRec = () => {
    if (!newRec) return;
    setRecommendations([...recommendations, newRec]);
    setNewRec('');
  };

  const removeRisk = (idx: number) => setRisks(risks.filter((_, i) => i !== idx));
  const removeRec = (idx: number) => setRecommendations(recommendations.filter((_, i) => i !== idx));

  const handleExport = async () => {
    if (!productName || !version || !approver) {
      toast.error('Complete los datos del producto y aprobador');
      return;
    }
    try {
      await generateReleaseGatePdf({
        productName,
        version,
        approver,
        mri,
        dictamen,
        domainScores,
        hardStops,
        risks,
        recommendations
      });
      toast.success('Certificado generado con éxito');
    } catch (error) {
      toast.error('Error al generar el PDF');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-primary/5 p-8 rounded-3xl border border-primary/10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Rocket className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-[clamp(1.5rem,8vw,2.5rem)] font-black uppercase tracking-tight">Enterprise Release Gate</h1>
            <p className="text-muted-foreground font-medium uppercase text-xs tracking-widest mt-1 opacity-70">
              Market Readiness Index (MRI) Certification
            </p>
          </div>
        </div>

        <div className={cn(
          "px-6 py-4 rounded-2xl border-2 flex flex-col items-center justify-center min-w-[200px] transition-all",
          getDictamenColor(dictamen)
        )}>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Dictamen Final</span>
          <span className="text-xl font-black uppercase tracking-tight">{dictamen}</span>
          <div className="mt-1 flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            <span className="text-lg font-black">MRI: {mri.toFixed(1)}</span>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Config & Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-background border-2 border-primary/10 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              Datos de Liberación
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Producto</label>
                <input
                  type="text"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  placeholder="NOMBRE DEL PRODUCTO"
                  className="w-full h-12 bg-primary/5 border-2 border-primary/10 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-primary transition-all uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Versión</label>
                <input
                  type="text"
                  value={version}
                  onChange={e => setVersion(e.target.value)}
                  placeholder="V1.0.0"
                  className="w-full h-12 bg-primary/5 border-2 border-primary/10 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-primary transition-all uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Aprobador</label>
                <input
                  type="text"
                  value={approver}
                  onChange={e => setApprover(e.target.value)}
                  placeholder="NOMBRE DEL RESPONSABLE"
                  className="w-full h-12 bg-primary/5 border-2 border-primary/10 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-primary transition-all uppercase"
                />
              </div>
            </div>
          </div>

          <div className="bg-danger/5 border-2 border-danger/20 rounded-3xl p-6">
            <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2 text-danger">
              <AlertTriangle className="w-4 h-4" />
              Hard Stops (Bloqueo)
            </h3>
            <div className="space-y-3">
              {HARD_STOPS.map(hs => (
                <button
                  key={hs.id}
                  onClick={() => handleHardStopToggle(hs.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left",
                    hardStops[hs.id]
                      ? "bg-danger border-danger text-white shadow-lg shadow-danger/20"
                      : "bg-background border-danger/10 text-danger/60 hover:border-danger/30"
                  )}
                >
                  <span className="text-[10px] font-black uppercase tracking-tight">{hs.label}</span>
                  {hardStops[hs.id] ? <AlertTriangle className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center/Right Column: Domains */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-background border-2 border-primary/10 rounded-3xl p-8 shadow-xl">
             <div className="flex items-center justify-between mb-8">
               <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                 <Layout className="w-4 h-4 text-primary" />
                 Evaluación por Dominios
               </h3>
               <div className="text-[10px] font-black text-muted-foreground uppercase bg-primary/5 px-3 py-1 rounded-full">
                 MRI CALCULADO: <span className="text-primary">{mri.toFixed(2)}</span>
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
               {MRI_DOMAINS.map(domain => (
                 <div key={domain.id} className="space-y-3 p-4 rounded-2xl bg-primary/5 border border-primary/10 hover:border-primary/30 transition-all group">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] font-black uppercase tracking-tight text-primary/80">{domain.label}</span>
                     <span className="text-xs font-black text-primary">{domainScores[domain.id]} / 10</span>
                   </div>
                   <input
                     type="range"
                     min="1"
                     max="10"
                     step="1"
                     value={domainScores[domain.id]}
                     onChange={e => handleScoreChange(domain.id, parseInt(e.target.value))}
                     className="w-full h-2 bg-primary/10 rounded-lg appearance-none cursor-pointer accent-primary"
                   />
                   <div className="flex flex-wrap gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     {domain.criteria.slice(0, 3).map(c => (
                       <span key={c} className="text-[8px] font-bold uppercase bg-background px-1.5 py-0.5 rounded border border-primary/10 text-muted-foreground">{c}</span>
                     ))}
                   </div>
                 </div>
               ))}
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-background border-2 border-primary/10 rounded-3xl p-6 shadow-xl">
               <h3 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-danger">
                 <AlertTriangle className="w-4 h-4" />
                 Riesgos Críticos
               </h3>
               <div className="flex gap-2 mb-4">
                 <input
                   type="text"
                   value={newRisk}
                   onChange={e => setNewRisk(e.target.value)}
                   onKeyPress={e => e.key === 'Enter' && addRisk()}
                   placeholder="NUEVO RIESGO..."
                   className="flex-1 h-10 bg-primary/5 border border-primary/10 rounded-lg px-3 text-[10px] font-bold uppercase"
                 />
                 <button onClick={addRisk} className="w-10 h-10 bg-primary text-white rounded-lg flex items-center justify-center hover:opacity-90">
                   <Plus className="w-4 h-4" />
                 </button>
               </div>
               <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                 {risks.map((risk, idx) => (
                   <div key={idx} className="flex items-center justify-between p-3 bg-danger/5 rounded-xl border border-danger/10">
                     <span className="text-[10px] font-bold uppercase text-danger/80">{risk}</span>
                     <button onClick={() => removeRisk(idx)} className="text-danger hover:scale-110 transition-transform">
                       <Trash2 className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 ))}
               </div>
            </div>

            <div className="bg-background border-2 border-primary/10 rounded-3xl p-6 shadow-xl">
               <h3 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-primary">
                 <CheckCircle2 className="w-4 h-4" />
                 Recomendaciones
               </h3>
               <div className="flex gap-2 mb-4">
                 <input
                   type="text"
                   value={newRec}
                   onChange={e => setNewRec(e.target.value)}
                   onKeyPress={e => e.key === 'Enter' && addRec()}
                   placeholder="RECOMENDACIÓN..."
                   className="flex-1 h-10 bg-primary/5 border border-primary/10 rounded-lg px-3 text-[10px] font-bold uppercase"
                 />
                 <button onClick={addRec} className="w-10 h-10 bg-primary text-white rounded-lg flex items-center justify-center hover:opacity-90">
                   <Plus className="w-4 h-4" />
                 </button>
               </div>
               <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                 {recommendations.map((rec, idx) => (
                   <div key={idx} className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
                     <span className="text-[10px] font-bold uppercase text-primary/80">{rec}</span>
                     <button onClick={() => removeRec(idx)} className="text-primary hover:scale-110 transition-transform">
                       <Trash2 className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      </section>

      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={handleExport}
          className="group flex items-center gap-4 px-8 h-16 bg-primary text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-primary/40 hover:scale-105 active:scale-95 transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center group-hover:rotate-12 transition-transform">
            <Download className="w-4 h-4" />
          </div>
          Generar Certificado de Liberación
        </button>
      </div>
    </div>
  );
}
