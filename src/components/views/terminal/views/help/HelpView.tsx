'use client';

import React, { useState, useEffect } from 'react';
import { HelpCircle, Book, Layout, Search, BookOpen, X, Menu, ArrowLeft, LayoutGrid } from 'lucide-react';
import { useUIStore } from '@/store';
import { ThemeToggle } from '@/components/ThemeToggle';
import HelpLayout from './HelpLayout';
import HelpSidebar from './HelpSidebar';
import HelpContent from './HelpContent';
import { useHelpContent } from './hooks/useHelpContent';
import { cn } from '@/lib/utils';

export default function HelpView() {
  const { viewQueries, setCurrentView, previousView, toggleSidebar } = useUIStore();
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
    setIsReadingMode,
    glossary
  } = useHelpContent();

  useEffect(() => {
    // Default load introduction
    if (!currentDoc && structure?.iso_manual?.includes('introduction.md')) {
        loadDocument('iso_manual/introduction.md');
    }
  }, [structure, currentDoc, loadDocument]);

  const handleReturn = () => {
    setCurrentView(previousView || 'dashboard');
  };

  return (
    <HelpLayout
        sidebar={
            <HelpSidebar
                structure={structure}
                toc={toc}
                onSelect={loadDocument}
                activePath={currentDoc?.path}
            />
        }
        isReadingMode={isReadingMode}
        header={
            <div className="flex items-center justify-between w-full px-6 py-4 border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    {/* Hamburger for global navigation access */}
                    <button
                        onClick={toggleSidebar}
                        className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                        title="Abrir Menú Principal"
                    >
                        <Menu className="w-5 h-5" />
                    </button>

                    {/* Grid icon for quick dashboard return */}
                    <button
                        onClick={handleReturn}
                        className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                        title="Volver al Dashboard"
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </button>

                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center hidden sm:flex">
                        <HelpCircle className="w-6 h-6 text-primary" />
                    </div>
                    <div className="hidden sm:block">
                        <h1 className="text-lg font-black uppercase tracking-tighter leading-none mb-1">Centro de Ayuda</h1>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ISO/IEC 26514 • v5.8</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative hidden md:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Buscar en manuales..."
                            className="pl-10 pr-10 py-2 bg-background border rounded-xl text-xs font-bold uppercase tracking-wider focus:ring-2 ring-primary/20 outline-none w-64 transition-all focus:w-80"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                            >
                                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setIsReadingMode(!isReadingMode)}
                        className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            isReadingMode ? "bg-primary text-white" : "bg-secondary hover:bg-secondary/80 text-foreground"
                        )}
                    >
                        {isReadingMode ? 'Salir Lectura' : 'Modo Lectura'}
                    </button>

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
            onSelectResult={loadDocument}
            onClearSearch={() => setSearchQuery('')}
        />
    </HelpLayout>
  );
}
