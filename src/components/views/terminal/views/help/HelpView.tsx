'use client';

import React, { useState, useEffect } from 'react';
import { HelpCircle, Book, Layout, Search, BookOpen } from 'lucide-react';
import { useUIStore } from '@/store';
import { ThemeToggle } from '@/components/ThemeToggle';
import HelpLayout from './HelpLayout';
import HelpSidebar from './HelpSidebar';
import HelpContent from './HelpContent';
import { useHelpContent } from './hooks/useHelpContent';

export default function HelpView() {
  const { viewQueries } = useUIStore();
  const {
    structure,
    loading,
    currentDoc,
    loadDocument,
    toc,
    searchQuery,
    setSearchQuery,
    searchResults,
    isReadingMode,
    glossary
  } = useHelpContent();

  useEffect(() => {
    // Default load introduction
    if (!currentDoc && structure?.iso_manual?.includes('introduction.md')) {
        loadDocument('iso_manual/introduction.md');
    }
  }, [structure, currentDoc, loadDocument]);

  return (
    <HelpLayout
        sidebar={<HelpSidebar structure={structure} toc={toc} onSelect={loadDocument} activePath={currentDoc?.path} />}
        header={
            <div className="flex items-center justify-between w-full px-6 py-4 border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <HelpCircle className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black uppercase tracking-tighter">Centro de Ayuda ISO/IEC 26514</h1>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Documentación Oficial CostPro</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative hidden md:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Buscar en el manual..."
                            className="pl-10 pr-4 py-2 bg-background border rounded-xl text-sm focus:ring-2 ring-primary/20 outline-none w-64"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <ThemeToggle />
                </div>
            </div>
        }
    >
        <HelpContent
            doc={currentDoc}
            loading={loading}
            searchQuery={searchQuery}
            searchResults={searchResults}
            glossary={glossary}
        />
    </HelpLayout>
  );
}
