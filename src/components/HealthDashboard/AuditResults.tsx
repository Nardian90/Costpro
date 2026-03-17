'use client';

import React from 'react';
import { History, ChevronRight, User, MapPin } from 'lucide-react';
import { format } from 'date-fns';

export const AuditResults: React.FC = () => {
  // Mock data as per prompt structure
  const actions = [
    { id: 1, action: 'CHANGE ACTIVE STORE', desc: 'CHANGE_ACTIVE_STORE EN PROFILES', user: 'ADMIN DEMO', context: 'TIENDA CENTRAL COSTPRO', time: '15:49:08' },
    { id: 2, action: 'UPDATE PRICE', desc: 'PRICE_UPDATE EN PRODUCTS', user: 'JUAN PEREZ', context: 'TEST WAC STORE', time: '15:48:20' },
    { id: 3, action: 'IMPORT DATA', desc: 'CSV_IMPORT EN INVENTORY', user: 'SYSTEM AGENT', context: 'SUCURSAL BELGRANO', time: '15:47:55' },
    { id: 4, action: 'LOGIN SUCCESS', desc: 'USER_LOGIN EN AUTH', user: 'ADMIN DEMO', context: 'TIENDA CENTRAL COSTPRO', time: '15:46:12' },
    { id: 5, action: 'DELETE CATEGORY', desc: 'DELETE_CATEGORY EN CATALOG', user: 'MANAGER', context: 'GLOBAL', time: '15:45:00' }
  ];

  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50">
       <div className="flex items-center justify-between mb-8 px-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">Resultados de Auditoría</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Últimas 5 acciones</p>
          </div>
          <History className="w-5 h-5 text-muted-foreground opacity-30" />
       </div>

       <div className="space-y-3">
          {actions.map(a => (
            <div key={a.id} className="p-4 rounded-2xl bg-background/50 border border-border/50 hover:border-primary/20 transition-all flex items-center gap-4">
              <ChevronRight className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">{a.action}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{a.time}</span>
                </div>
                <div className="text-[11px] font-bold uppercase truncate my-1">{a.desc}</div>
                <div className="flex items-center gap-4 opacity-50">
                   <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span className="text-[9px] font-black uppercase">{a.user}</span>
                   </div>
                   <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span className="text-[9px] font-black uppercase">{a.context}</span>
                   </div>
                </div>
              </div>
            </div>
          ))}
       </div>
    </section>
  );
};
