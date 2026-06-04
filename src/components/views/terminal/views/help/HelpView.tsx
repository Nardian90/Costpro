'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X, Eye, EyeOff, BookOpen } from 'lucide-react';
import { useUIStore } from '@/store';
import HelpLayout from './HelpLayout';
import HelpSidebar from './HelpSidebar';
import HelpContent from './HelpContent';
import { AccessibilityStatement } from './AccessibilityStatement';
import { useHelpContent } from './hooks/useHelpContent';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import HelpScrollFab from './HelpScrollFab';

// ── Scroll to top utility (finds the visible help scroll container) ──
function scrollToHelpTop() {
  const mains = document.querySelectorAll<HTMLElement>('main[data-help-scroll]');
  for (const main of mains) {
    if (main.offsetHeight > 0) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export default function HelpView() {
  const { setCurrentView } = useUIStore();
  const searchParams = useSearchParams();
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeHeadingId, setActiveHeadingId] = useState('');
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
    glossary,
    breadcrumbs,
    adjacentDocs,
  } = useHelpContent();

  // Pre-load document from ?doc= query param (e.g., from legal page links)
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam && !currentDoc) {
      loadDocument(docParam);
    }
  }, [searchParams]);

  // Auto-load intro document when no query param
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam) return;
    if (!structure?.sections) return;

    const empezarSection = structure.sections.find(s => s.id === 'empezar');
    const introFile = empezarSection?.files.find(f => f.filename === 'introduccion.md');
    if (!currentDoc && introFile) {
      loadDocument(`help/01-empezar/${introFile.filename}`);
    }
  }, [structure, currentDoc, loadDocument, searchParams]);

  // ── Reading progress + Scroll-spy handler ──
  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight - container.clientHeight;

    if (scrollHeight > 0) {
      setScrollProgress(Math.min((scrollTop / scrollHeight) * 100, 100));
    } else {
      setScrollProgress(0);
    }

    const containerRect = container.getBoundingClientRect();
    const headings = container.querySelectorAll<HTMLElement>('h2[id], h3[id]');
    let newActiveId = '';
    for (const heading of headings) {
      const rect = heading.getBoundingClientRect();
      if (rect.top <= containerRect.top + 120) {
        newActiveId = heading.id;
      } else {
        break;
      }
    }
    setActiveHeadingId(newActiveId);
  }, []);

  // Expose scrollToHelpTop globally for child components
  useEffect(() => {
    (window as any).__helpScrollToTop = scrollToHelpTop;
    return () => { delete (window as any).__helpScrollToTop; };
  }, []);

  // Reset progress + scroll to top when document changes
  useEffect(() => {
    requestAnimationFrame(() => {
      setScrollProgress(0);
      setActiveHeadingId('');
      const mains = document.querySelectorAll<HTMLElement>('main[data-help-scroll]');
      mains.forEach(m => { if (m.offsetHeight > 0) m.scrollTo({ top: 0 }); });
    });
  }, [currentDoc?.path]);

  return (
    <>
      <HelpLayout
        sidebar={
          <HelpSidebar
            structure={structure}
            toc={toc}
            onSelect={(path) => { setShowAccessibility(false); loadDocument(path); }}
            activePath={currentDoc?.path}
            isAccessibilityActive={showAccessibility}
            onSelectAccessibility={() => setShowAccessibility(true)}
            autoExpandForPath={currentDoc?.path || null}
            activeHeadingId={activeHeadingId}
          />
        }
        isReadingMode={isReadingMode}
        scrollProgress={scrollProgress}
        onMainScroll={handleMainScroll}
      >
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between mb-8 pb-5 border-b border-border/30 flex-wrap gap-3 px-6 md:px-10 xl:px-14 pt-6 md:pt-8">
          <div className="flex items-center gap-2.5">
            {currentDoc && (
              <Badge variant="outline" className="text-[9px] font-bold tracking-widest uppercase px-2.5 py-1 bg-muted/40 border-border/40 hidden sm:inline-flex items-center gap-1.5">
                <BookOpen className="w-3 h-3 text-primary" />
                {currentDoc.type === 'getting-started' ? 'Para Empezar' : currentDoc.type === 'tutorial' ? 'Tutorial' : currentDoc.type === 'how-to' ? 'Guía Práctica' : currentDoc.type === 'reference' ? 'Referencia Técnica' : 'Para Empezar'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Buscar documentación..."
                className="pl-9 pr-8 py-2.5 bg-muted/30 border border-border/40 rounded-xl text-xs font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary/30 focus:bg-background outline-none w-36 sm:w-48 lg:w-56 transition-all placeholder:text-muted-foreground/40"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Buscar documentación"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Reading mode toggle */}
            <button
              onClick={() => setIsReadingMode(!isReadingMode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border",
                isReadingMode
                  ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                  : "bg-muted/30 hover:bg-muted/50 border-border/40 text-muted-foreground hover:text-foreground"
              )}
              title={isReadingMode ? 'Salir del modo lectura' : 'Modo lectura (sin sidebar)'}
            >
              {isReadingMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span className="hidden sm:inline">{isReadingMode ? 'Salir Lectura' : 'Modo Lectura'}</span>
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        {showAccessibility ? (
          <div className="px-6 md:px-10 xl:px-14">
            <AccessibilityStatement />
          </div>
        ) : (
          <HelpContent
            doc={currentDoc}
            loading={loading}
            searchQuery={searchQuery}
            searchResults={searchResults}
            glossary={glossary}
            breadcrumbs={breadcrumbs}
            adjacentDocs={adjacentDocs}
            onSelectResult={(path) => { setShowAccessibility(false); loadDocument(path); }}
            onClearSearch={() => setSearchQuery('')}
            onSearch={setSearchQuery}
            onNavigate={(path) => loadDocument(path)}
          />
        )}
      </HelpLayout>

      {/* ── Floating Scroll FAB (outside scroll container, always fixed to viewport) ── */}
      <HelpScrollFab scrollProgress={scrollProgress} />
    </>
  );
}
