import { Lock, Building } from 'lucide-react';

export default function MultiStorePage() {
  return (
    <div className="container py-12">
       <div className="max-w-4xl mx-auto text-center py-20 bg-surface border border-border rounded-3xl overflow-hidden relative">
        <div className="absolute top-0 inset-x-0 h-2 bg-blue-500/20" />
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Building className="w-10 h-10 text-blue-500" />
          </div>
        </div>
        <h1 className="text-5xl font-black mb-6 uppercase tracking-tighter">Multi-Tienda Pro</h1>
        <p className="text-xl text-on-surface-variant mb-12 max-w-2xl mx-auto font-sans">
          Gestión multi-sucursal, consolidación de inventario y reportes cruzados en tiempo real.
          Optimiza la logística de toda tu red comercial desde un solo lugar.
        </p>
        <div className="flex justify-center gap-6">
           <div className="bg-surface-variant p-6 rounded-2xl border border-border text-left w-64">
             <h3 className="font-bold mb-2">Multi-Sucursal</h3>
             <p className="text-xs text-on-surface-variant">Controla N tiendas de forma independiente.</p>
           </div>
           <div className="bg-surface-variant p-6 rounded-2xl border border-border text-left w-64">
             <h3 className="font-bold mb-2">Stock Global</h3>
             <p className="text-xs text-on-surface-variant">Visibilidad total de existencias en tránsito.</p>
           </div>
        </div>
        <div className="mt-12">
          <button className="bg-foreground text-background font-bold px-12 py-5 rounded-xl text-lg hover:scale-105 transition-all shadow-lg uppercase tracking-widest flex items-center gap-3 mx-auto">
            <Lock className="w-5 h-5" />
            Solicitar Demo Pro
          </button>
        </div>
      </div>
    </div>
  );
}
