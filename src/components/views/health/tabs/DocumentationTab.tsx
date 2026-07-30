import React, { useState, useEffect, useMemo } from 'react';
import { HealthData } from '../hooks/useHealthData';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { Book, FileText, Info, Search, ChevronRight, Hash, FolderOpen, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentationTabProps {
  data: HealthData;
}

interface DocItem {
  id: string;
  title: string;
  type: string;
  icon: React.ElementType;
  category?: string;
}

function categorizeDocs(docsList: string[]): DocItem[] {
  const categories: Record<string, string> = {
    '01-empezar': 'Primeros Pasos',
    '02-gestion': 'Gestión',
    '03-inventario': 'Inventario y Ventas',
    '04-configuracion': 'Configuración',
    '05-referencia': 'Referencia Técnica',
    'compliance': 'Cumplimiento',
    'docs': 'Documentación General',
  };

  const items: DocItem[] = [
    { id: 'user_help', title: 'Explorador de Ayuda', type: 'INTERACTIVO', icon: Book },
  ];

  for (const doc of docsList) {
    const parts = doc.replace('.md', '').split('/');
    const fileName = parts[parts.length - 1];
    // Support both "help/01-empezar/file" and "01-empezar/file" formats
    const sectionIdx = parts.length >= 3 && (parts[0] === 'help' || parts[0] === 'docs') ? 1 : 0;
    const category = parts.length > (sectionIdx + 1) ? parts[sectionIdx] : (parts[0] || '');

    items.push({
      id: doc,
      title: fileName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      type: category ? categories[category] || category.toUpperCase() : 'DOCUMENTO',
      icon: FileText,
      category,
    });
  }

  return items;
}

export const DocumentationTab: React.FC<DocumentationTabProps> = ({ data }) => {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const docsList = data.docsList || [];
  const docs = useMemo(() => categorizeDocs(docsList), [docsList]);
  const currentDoc = docs.find(d => d.id === selectedDoc) || docs[0];

  // Group by category
  const groupedDocs = useMemo(() => {
    const groups: Record<string, DocItem[]> = {};
    for (const doc of docs) {
      const cat = doc.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(doc);
    }
    return groups;
  }, [docs]);

  // Fetch markdown content for selected doc
  useEffect(() => {
    if (selectedDoc && selectedDoc.endsWith('.md')) {
      let cancelled = false;
      queueMicrotask(() => {
        setLoading(true);
        setFetchedContent(null);
      });

      fetch(`/api/help-docs?path=${encodeURIComponent(selectedDoc)}`)
        .then(res => {
          if (!res.ok) throw new Error('Not found');
          return res.json();
        })
        .then(json => {
          if (!cancelled) {
            const content = json.content || '# Documento vacío';
            setFetchedContent(content);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFetchedContent('# Error al cargar el documento\n\nNo se pudo encontrar el archivo solicitado. Es posible que el archivo haya sido movido o eliminado.');
            setLoading(false);
          }
        });

      return () => { cancelled = true; };
    }
  }, [selectedDoc]);

  const docContent = fetchedContent ?? (currentDoc as any)?.content ?? null;
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

              <div className="flex-1 overflow-auto no-scrollbar space-y-4 pr-2">
                {/* Help Explorer */}
                <button
                  onClick={() => setSelectedDoc(null)}
                  className={cn(
                    "w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all group",
                    !selectedDoc
                      ? "bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                      : "text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-border/50"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                     <Book className={cn("w-4 h-4 shrink-0", !selectedDoc ? "text-white" : "text-primary/40")} />
                     <span className="truncate">Explorador de Ayuda</span>
                  </div>
                  <ChevronRight className={cn("w-3 h-3 transition-transform", !selectedDoc ? "translate-x-1" : "opacity-0 group-hover:opacity-100")} />
                </button>

                {/* Grouped docs */}
                {Object.entries(groupedDocs).map(([category, items]) => (
                  items.length > 0 && (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center gap-2 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">
                        <FolderOpen className="w-2.5 h-2.5" />
                        {category}
                      </div>
                      {items.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => setSelectedDoc(doc.id)}
                          className={cn(
                            "w-full flex items-center justify-between px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all group",
                            selectedDoc === doc.id
                              ? "bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                              : "text-muted-foreground hover:bg-muted/50 border border-transparent hover:border-border/50"
                          )}
                        >
                          <div className="flex items-center gap-3 truncate">
                             <FileText className={cn("w-3.5 h-3.5 shrink-0", selectedDoc === doc.id ? "text-white" : "text-primary/40")} />
                             <span className="truncate text-[9px]">{doc.title}</span>
                          </div>
                          <ChevronRight className={cn("w-3 h-3 transition-transform shrink-0", selectedDoc === doc.id ? "translate-x-1" : "opacity-0 group-hover:opacity-100")} />
                        </button>
                      ))}
                    </div>
                  )
                ))}

                {docs.length <= 1 && (
                  <div className="p-6 rounded-2xl bg-muted/20 border border-border/50 text-center">
                    <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest italic">
                      No hay documentos indexados
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-border/50">
                 <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                    <span className="text-[8px] font-bold text-muted-foreground uppercase leading-relaxed tracking-widest">
                      {docsList.length} documentos indexados
                    </span>
                    <Clock className="w-3 h-3 text-primary/30" />
                 </div>
              </div>
           </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9 flex flex-col p-1 rounded-[40px] bg-card border border-border/50 overflow-hidden shadow-2xl bg-background/50 backdrop-blur-sm">
           <div className="px-10 py-8 border-b border-border/50 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-inner border border-primary/20">
                    {(() => { const DocIcon = currentDoc?.icon || FileText; return <DocIcon className="w-6 h-6 text-primary" />; })()}
                 </div>
                 <div>
                    <h2 className="text-xl font-black uppercase tracking-tighter leading-none mb-1">{currentDoc?.title || 'Documento'}</h2>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {currentDoc?.type || 'Documento'} · v9.0
                    </p>
                 </div>
              </div>
              {loading && (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              )}
           </div>

           <div className="flex-1 overflow-auto p-12 no-scrollbar bg-background/30 selection:bg-primary/20">
              <div className={cn("max-w-4xl mx-auto transition-opacity duration-500", loading ? "opacity-30" : "opacity-100")}>
                 {isGallery ? (
                    <div className="text-center py-16">
                      <div className="w-20 h-20 rounded-[32px] bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-8">
                        <Book className="w-10 h-10 text-primary" />
                      </div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter italic mb-4">Centro de Documentación</h3>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest max-w-md mx-auto leading-relaxed mb-8">
                        Seleccione un documento del panel izquierdo para visualizar su contenido. Los documentos están organizados por categoría temática.
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                        {Object.entries(groupedDocs).map(([category, items]) => (
                          <div key={category} className="p-6 rounded-2xl bg-card border border-border/50 text-center hover:border-primary/30 transition-all cursor-pointer"
                            onClick={() => items[0] && setSelectedDoc(items[0].id)}>
                            <div className="text-lg font-black text-primary mb-1">{items.length}</div>
                            <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{category}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                 ) : (
                    <MarkdownViewer content={docContent || '# Cargando documento...'} />
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
