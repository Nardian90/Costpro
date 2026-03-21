import React, { useState } from 'react';
import { HealthData } from '../hooks/useHealthData';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { Book, FileText, Layout, Info, Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentationTabProps {
  data: HealthData;
}

export const DocumentationTab: React.FC<DocumentationTabProps> = ({ data }) => {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const docs = [
    { id: 'user_help', title: 'Ayuda de Usuario', type: 'USER', icon: Book, content: JSON.stringify(data.userHelp, null, 2) },
    { id: 'iso_manual', title: 'Manual ISO/IEC 26514', type: 'REF', icon: FileText, content: '# ISO Manual - Work in Progress\nCargando contenido dinámico...' },
    { id: 'diataxis', title: 'Estructura Diátaxis', type: 'DEV', icon: Layout, content: '# Estructura Diátaxis\nTutoriales, Guías, Referencia y Explicaciones.' },
    { id: 'integrity', title: 'Reporte de Integridad', type: 'SYS', icon: Info, content: data.integrityReport || '# Sin Reporte de Integridad' },
  ];

  const currentDoc = docs.find(d => d.id === selectedDoc) || docs[0];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[750px]">
        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-4">
           <div className="p-6 rounded-[32px] bg-primary/5 border border-primary/10">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-6">Índice Global</h4>
              <div className="space-y-2">
                 {docs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        selectedDoc === doc.id
                          ? "bg-background text-primary shadow-lg border border-primary/20"
                          : "text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <doc.icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{doc.title}</span>
                    </button>
                 ))}
              </div>
           </div>

           <div className="p-6 rounded-[32px] bg-muted/20 border border-border/50">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4 opacity-50 italic">Categorías</h4>
              <div className="flex flex-wrap gap-2">
                 {['TUTORIALS', 'HOW-TO', 'REFERENCE', 'EXPLANATION'].map(cat => (
                    <div key={cat} className="px-3 py-1.5 rounded-lg bg-background border border-border/50 text-[8px] font-black tracking-widest text-muted-foreground cursor-pointer hover:border-primary/20 transition-all uppercase">
                       {cat}
                    </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Markdown Area */}
        <div className="lg:col-span-9 flex flex-col p-1 rounded-[40px] bg-card border border-border/50 overflow-hidden shadow-sm">
           <div className="px-10 py-8 border-b border-border/50 bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                       <currentDoc.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-xl font-black uppercase tracking-tighter">{currentDoc.title}</h2>
                 </div>
                 <div className="px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-[9px] font-black uppercase tracking-widest text-primary">
                    {currentDoc.type} DOCUMENT
                 </div>
              </div>
              <div className="w-12 h-1 bg-primary/20 rounded-full" />
           </div>

           <div className="flex-1 overflow-auto p-12 no-scrollbar bg-background/50">
              <MarkdownViewer content={currentDoc.content} />
           </div>
        </div>
      </div>
    </div>
  );
};
