import React, { useState, useEffect } from 'react';
import { HealthData } from '../hooks/useHealthData';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { UserHelpGallery } from '../components/UserHelpGallery';
import { Book, FileText, Layout, Info, Search, ChevronRight, Hash, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentationTabProps {
  data: HealthData;
}

export const DocumentationTab: React.FC<DocumentationTabProps> = ({ data }) => {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const docs = [
    { id: 'user_help', title: 'Guía de Usuario', type: 'INTERACTIVO', icon: Book, content: '' },
    { id: 'integrity', title: 'Reporte de Integridad', type: 'SISTEMA', icon: Info, content: data.integrityReport || '# Sin Reporte de Integridad' },
    ...(data.docsList || []).map(docName => ({
       id: docName,
       title: docName.replace('.md', '').replace(/_/g, ' ').toUpperCase(),
       type: 'CONOCIMIENTO',
       icon: FileText,
       content: `Cargando ${docName}...`
    }))
  ];

  const currentDoc = docs.find(d => d.id === selectedDoc) || docs[0];

  const [fetchedContent, setFetchedContent] = useState<string | null>(null);

  useEffect(() => {
    if (selectedDoc && selectedDoc.endsWith('.md')) {
      let cancelled = false;
      requestAnimationFrame(() => {
        if (!cancelled) setLoading(true);
      });
      requestAnimationFrame(() => {
        if (!cancelled) setFetchedContent(null);
      });
      fetch(`/knowledge/docs/${selectedDoc}`)
        .then(res => res.text())
        .then(text => {
          if (!cancelled) {
            setFetchedContent(text);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFetchedContent('# Error al cargar el documento');
            setLoading(false);
          }
        });
      return () => { cancelled = true; };
    }
  }, [selectedDoc]);

  const docContent = fetchedContent ?? currentDoc.content;

  const isGallery = !selectedDoc || selectedDoc === 'user_help';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:h-[800px]">
        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-4 flex flex-col">
           <div className="p-8 rounded-[40px] bg-card border border-border/50 shadow-sm flex-1 overflow-hidden flex flex-col">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-8 flex items-center gap-2">
                 <Hash className="w-3 h-3" />
                 Documentación Viva
              </h4>

              <div className="flex-1 overflow-auto no-scrollbar space-y-2 pr-2">
                 {docs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all group",
                        (selectedDoc === doc.id || (!selectedDoc && doc.id === 'user_help'))
                          ? "bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                          : "text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-border/50"
                      )}
                    >
                      <div className="flex items-center gap-3 truncate">
                         <doc.icon className={cn("w-4 h-4 shrink-0", (selectedDoc === doc.id || (!selectedDoc && doc.id === 'user_help')) ? "text-white" : "text-primary/40")} />
                         <span className="truncate">{doc.title}</span>
                      </div>
                      <ChevronRight className={cn("w-3 h-3 transition-transform", (selectedDoc === doc.id || (!selectedDoc && doc.id === 'user_help')) ? "translate-x-1" : "opacity-0 group-hover:opacity-100")} />
                    </button>
                 ))}
              </div>

              <div className="mt-8 pt-6 border-t border-border/50">
                 <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase leading-relaxed tracking-widest text-center">
                      Base de conocimiento v9.0 actualizada en tiempo real.
                    </p>
                 </div>
              </div>
           </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9 flex flex-col p-1 rounded-[40px] bg-card border border-border/50 overflow-hidden shadow-2xl bg-background/50 backdrop-blur-sm">
           <div className="px-10 py-8 border-b border-border/50 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner border border-primary/20">
                    <currentDoc.icon className="w-6 h-6 text-primary" />
                 </div>
                 <div>
                    <h2 className="text-xl font-black uppercase tracking-tighter leading-none mb-1">{currentDoc.title}</h2>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Documento de Clase {currentDoc.type}</p>
                 </div>
              </div>
              <button disabled title="Próximamente" aria-label="Imprimir documento" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-background border border-border/50 text-[9px] font-black uppercase tracking-widest opacity-50 cursor-not-allowed">
                 <ExternalLink className="w-3 h-3 text-primary" />
                 Imprimir Documento
              </button>
           </div>

           <div className="flex-1 overflow-auto p-12 no-scrollbar bg-background/30 selection:bg-primary/20">
              <div className={cn("max-w-4xl mx-auto transition-opacity duration-500", loading ? "opacity-30" : "opacity-100")}>
                 {isGallery ? (
                    <UserHelpGallery data={data.userHelp || []} />
                 ) : (
                    <MarkdownViewer content={docContent} />
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
