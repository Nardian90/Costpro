'use client';

import { motion } from 'framer-motion';
import { User, Store, Package, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function KidsOnboarding() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.5
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-12 py-8">
      {/* Introduction Story */}
      <div className="grid md:grid-cols-2 gap-8 items-center bg-primary/5 rounded-[2.5rem] p-8 border border-primary/10">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest">
            <User className="w-3 h-3" />
            Historia CostPro
          </div>
          <h3 className="text-[clamp(1.25rem,5vw,1.5rem)] font-black uppercase tracking-tighter text-primary leading-tight">
            Juan, Pedro y el Misterio de los Inventarios
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Juan es el dueño de tres tiendas. Él usa <span className="font-bold text-primary">CostPro</span> para que todo esté en orden. Pero Juan no puede estar en todas partes al mismo tiempo...
          </p>
          <div className="p-4 bg-background rounded-2xl border border-primary/10 italic text-xs shadow-sm">
            "Necesito que Pedro me ayude a gestionar la Tienda del Norte, pero que no pueda ver lo que pasa en la Tienda del Sur por error."
          </div>
        </div>
        <div className="relative h-64 bg-muted/30 rounded-3xl overflow-hidden border border-primary/5">
           <RolesStoryDiagram />
        </div>
      </div>

      {/* The Concept of Context */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h4 className="text-[clamp(1.1rem,4vw,1.25rem)] font-black uppercase tracking-tight flex items-center gap-3 leading-tight">
            <Store className="w-6 h-6 text-primary" />
            La "Burbuja" de la Tienda
          </h4>
          <p className="text-sm text-muted-foreground">
            En CostPro, cuando Pedro entra a la <span className="font-bold">Tienda Norte</span>, entra en una "burbuja". Todo lo que haga (vender, contar productos, recibir mercancía) se queda <span className="font-black underline decoration-primary/30">solo en esa burbuja</span>.
          </p>
          <ContextIsolationDiagram />
        </div>
        <div className="space-y-4">
          <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/10">
             <h5 className="font-black text-xs uppercase text-amber-600 mb-2">¿Por qué es importante?</h5>
             <p className="text-xs font-medium leading-relaxed text-amber-900/70">
               Si Pedro no selecciona su tienda antes de trabajar, ¡CostPro no sabría a qué inventario sumar los productos! Por eso, ahora el sistema <span className="font-bold">te pide siempre confirmar en qué tienda estás</span> antes de recibir mercancía.
             </p>
          </div>
          <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10">
             <h5 className="font-black text-xs uppercase text-emerald-600 mb-2">SKU: El nombre secreto</h5>
             <p className="text-xs font-medium leading-relaxed text-emerald-900/70">
               Cada producto tiene un SKU (como un nombre secreto). El "Arroz" puede tener el mismo SKU en ambas tiendas, pero CostPro sabe que son <span className="font-bold text-emerald-600">paquetes de arroz distintos</span> porque están en burbujas diferentes.
             </p>
          </div>
        </div>
      </div>

      {/* Step by Step Flow */}
      <div className="space-y-6">
        <h4 className="text-[clamp(1.1rem,4vw,1.25rem)] font-black uppercase tracking-tight text-center leading-tight">Cómo trabaja Pedro (Encargado)</h4>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { step: "1", title: "Entra", desc: "Pedro inicia sesión con su correo.", icon: User },
            { step: "2", title: "Elige", desc: "Selecciona 'Tienda Norte' en el menú.", icon: Store },
            { step: "3", title: "Recibe", desc: "Escanea los productos nuevos.", icon: Package },
            { step: "4", title: "Listo", desc: "El stock sube automáticamente.", icon: CheckCircle2 },
          ].map((s, i) => (
            <div key={i} className="neu-card !p-6 flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <s.icon className="w-6 h-6" />
              </div>
              <div className="font-black text-xs uppercase text-primary">Paso {s.step}</div>
              <div className="font-bold text-sm">{s.title}</div>
              <p className="text-xs text-muted-foreground font-medium">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RolesStoryDiagram() {
  return (
    <motion.svg viewBox="0 0 400 250" className="w-full h-full p-4">
      {/* Juan (Admin) */}
      <motion.g
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <circle cx="200" cy="60" r="30" className="fill-primary" />
        <text x="200" y="110" textAnchor="middle" className="fill-primary font-black text-xs uppercase">Juan (Dueño)</text>
      </motion.g>

      {/* Connections */}
      <motion.path
        d="M180 85 L100 150 M220 85 L300 150"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4,4"
        className="text-primary/20"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.5, duration: 1 }}
      />

      {/* Pedro (Encargado) */}
      <motion.g
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
      >
        <rect x="50" y="150" width="100" height="50" rx="12" className="fill-violet-500" />
        <text x="100" y="180" textAnchor="middle" className="fill-white font-black text-xs uppercase">Pedro</text>
        <text x="100" y="220" textAnchor="middle" className="fill-muted-foreground font-bold text-xs uppercase">Tienda Norte</text>
      </motion.g>

      {/* María (Encargado) */}
      <motion.g
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        <rect x="250" y="150" width="100" height="50" rx="12" className="fill-violet-500/50" />
        <text x="300" y="180" textAnchor="middle" className="fill-white font-black text-xs uppercase">María</text>
        <text x="300" y="220" textAnchor="middle" className="fill-muted-foreground font-bold text-xs uppercase">Tienda Sur</text>
      </motion.g>
    </motion.svg>
  );
}

function ContextIsolationDiagram() {
  return (
    <div className="w-full overflow-x-auto no-scrollbar rounded-3xl border border-primary/10 bg-muted/20">
      <div className="w-full aspect-[21/9]">
        <motion.svg viewBox="0 0 800 300" className="w-full h-full p-4 sm:p-8">
        {/* Store A Context */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
           <rect x="50" y="20" width="300" height="260" rx="30" className="fill-primary/5 stroke-primary/20" strokeWidth="2" />
           <text x="200" y="50" textAnchor="middle" className="fill-primary/60 font-black text-xs uppercase tracking-widest">Burbuja: Tienda Norte</text>

           <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1 }}>
             <circle cx="150" cy="150" r="40" className="fill-primary" />
             <Package className="text-white w-10 h-10" x="130" y="130" />
             <text x="150" y="210" textAnchor="middle" className="fill-primary font-bold text-xs">Stock: 100</text>
           </motion.g>

           <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2 }}>
             <circle cx="250" cy="150" r="40" className="fill-primary/20" />
             <User className="text-primary w-10 h-10" x="230" y="130" />
             <text x="250" y="210" textAnchor="middle" className="fill-primary font-bold text-xs">Pedro</text>
           </motion.g>
        </motion.g>

        {/* Isolation Wall */}
        <motion.line
          x1="400" y1="50" x2="400" y2="250"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="10,10"
          className="text-primary/10"
        />

        {/* Store B Context */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
           <rect x="450" y="20" width="300" height="260" rx="30" className="fill-muted/50 stroke-muted-foreground/20" strokeWidth="2" />
           <text x="600" y="50" textAnchor="middle" className="fill-muted-foreground/60 font-black text-xs uppercase tracking-widest">Burbuja: Tienda Sur</text>

           <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.4 }}>
             <circle cx="600" cy="150" r="40" className="fill-muted-foreground/20" />
             <Package className="text-muted-foreground w-10 h-10" x="580" y="130" />
             <text x="600" y="210" textAnchor="middle" className="fill-muted-foreground font-bold text-xs">Stock: 0</text>
           </motion.g>
        </motion.g>

        {/* Action: Receiving stock */}
        <motion.path
          d="M700 150 Q750 150 750 100"
          fill="none"
          stroke="transparent"
          id="stockPath"
        />

        <motion.g
          initial={{ x: 800, opacity: 0 }}
          animate={{ x: 150, opacity: 1 }}
          transition={{
            delay: 2,
            duration: 1.5,
            repeat: Infinity,
            repeatDelay: 3
          }}
        >
          <rect x="-20" y="-20" width="40" height="40" rx="8" className="fill-amber-500 shadow-xl" />
          <text x="0" y="5" textAnchor="middle" className="fill-white font-black text-xs">+50</text>
        </motion.g>

        <text x="400" y="285" textAnchor="middle" className="fill-muted-foreground italic text-xs">
          "Las entradas de Pedro solo afectan a su burbuja"
        </text>
        </motion.svg>
      </div>
    </div>
  );
}
