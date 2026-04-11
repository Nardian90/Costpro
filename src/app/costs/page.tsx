import { Lock } from 'lucide-react';

export default function CostsPage() {
  return (
    <div className="container py-12">
      <div className="max-w-4xl mx-auto text-center py-20 bg-surface border border-border rounded-3xl overflow-hidden relative">
        <div className="absolute top-0 inset-x-0 h-2 bg-primary/20" />
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-10 h-10 text-primary" />
          </div>
        </div>
        <h1 className="text-5xl font-black mb-6 uppercase tracking-tighter">Fichas de Costo Pro</h1>
        <p className="text-xl text-on-surface-variant mb-12 max-w-2xl mx-auto font-sans">
          Cálculo de costos unitarios, análisis de márgenes y simulación de precios avanzados.
          Este módulo está disponible exclusivamente para suscriptores Business y Enterprise.
        </p>
        <button className="bg-primary text-on-primary font-bold px-12 py-5 rounded-xl text-lg hover:scale-105 transition-all shadow-lg uppercase tracking-widest">
          Mejorar mi Plan
        </button>
      </div>
    </div>
  );
}
