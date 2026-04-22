
'use client';

import React, { useState } from 'react';
import { useUIStore, useAuthStore } from '@/store';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Search, ChevronDown, ChevronUp, Code, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const QueryInspector: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const { viewQueries, currentView, showQueries } = useUIStore();
  const lastQuery = viewQueries[currentView];
  const [isOpen, setIsOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const [copied, setCopied] = useState(false);

  /* FIX #060: Gate entire component to development only */
  if (process.env.NODE_ENV !== 'development') return null;
  if (!isAdmin || !showQueries) return null;

  const handleCopy = () => {
    if (!lastQuery) return;
    navigator.clipboard.writeText(lastQuery);
    setCopied(true);
    toast.success('Consulta copiada al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full mb-6">
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          data-testid="query-inspector-trigger"
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all w-fit",
            isOpen
              ? "bg-primary/10 border-primary text-primary shadow-lg shadow-primary/10"
              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
          )}
        >
          <Search className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-widest">
            {isOpen ? 'Ocultar Query' : 'Ver Query'}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isOpen && (
          <div className="neu-card !p-0 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 border-primary/20">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Inspector de Consultas Supabase
                </span>
              </div>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-primary/10 rounded transition-colors"
                title="Copiar consulta"
              >
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
            <div className="p-1 bg-[#1e1e1e]">
              {lastQuery ? (
                <SyntaxHighlighter
                  language="sql"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    fontSize: '0.8rem',
                    backgroundColor: 'transparent',
                  }}
                  wrapLines={true}
                  wrapLongLines={true}
                >
                  {lastQuery}
                </SyntaxHighlighter>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic">
                    Esperando la próxima consulta...
                  </p>
                </div>
              )}
            </div>
            <div className="px-4 py-1 border-t border-border bg-muted/10">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">
                * Muestra la última operación de base de datos interceptada en esta vista.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
