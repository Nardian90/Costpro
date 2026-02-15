'use client';

import React, { useState } from 'react';
import { FormulaEditor } from '@/components/views/terminal/views/cost_sheet/FormulaEditor';

export default function TestFormulaPage() {
  const [formula, setFormula] = useState('= SUMA(hijos)');

  return (
    <div className="p-12 bg-[#020617] min-h-screen text-slate-200">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="border-b border-white/5 pb-8">
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">Verification: Ergonomic Formula Editor</h1>
            <p className="text-[#39FF14] font-black text-[10px] uppercase tracking-[0.3em] mt-2">Stitch Design Implementation v5.7.25</p>
        </header>

        <section className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Inline Editor (Mobile Optimized)</h2>
            <div className="max-w-md p-6 rounded-2xl bg-slate-900/50 border border-white/5 shadow-xl">
                <FormulaEditor
                  initialValue={formula}
                  onSave={(v) => { setFormula(v); console.log("Saved:", v); }}
                  onCancel={() => console.log("Cancelled")}
                />
            </div>
        </section>

        <section className="bg-slate-900/30 p-8 rounded-3xl border border-white/5">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-4 bg-[#39FF14] rounded-full shadow-[0_0_10px_#39FF14]"></div>
                <h2 className="text-[10px] font-black uppercase tracking-widest text-white">Current Formula State</h2>
            </div>
            <pre className="text-2xl font-mono text-[#39FF14] drop-shadow-[0_0_10px_rgba(57,255,20,0.3)]">{formula}</pre>Section
        </section>
      </div>
    </div>
  );
}
