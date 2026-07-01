'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useUIStore } from '@/store';

export interface HelpDoc {
  path: string;
  title: string;
  content: string;
  type: 'getting-started' | 'tutorial' | 'how-to' | 'reference';
}

export interface TocItem {
  id: string;
  level: number;
  text: string;
}

export interface AdjacentDoc {
  path: string;
  title: string;
}

export interface SectionEntry {
  id: string;
  dir: string;
  label: string;
  icon: string;
  files: { filename: string; title: string }[];
}

export interface HelpStructure {
  sections: SectionEntry[];
  compliance: {
    id: string;
    label: string;
    icon: string;
    files: { filename: string; title: string }[];
  };
  user_help: boolean;
}

export interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
  type: HelpDoc['type'];
}

export const useHelpContent = () => {
  const [structure, setStructure] = useState<HelpStructure | null>(null);
  const [currentDoc, setCurrentDoc] = useState<HelpDoc | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [glossary, setGlossary] = useState<Record<string, string>>({});
  const [isReadingMode, setIsReadingModeLocal] = useState(false);
  // Sincronizar con el store global para que TerminalShell oculte Header y Sidebar.
  const isHelpReadingMode = useUIStore(s => s.isHelpReadingMode);
  const setIsHelpReadingMode = useUIStore(s => s.setIsHelpReadingMode);
  const setIsReadingMode = useCallback((open: boolean) => {
    setIsReadingModeLocal(open);
    setIsHelpReadingMode(open);
  }, [setIsHelpReadingMode]);
  // Si el store global dice que no estamos en modo lectura (ej: cambió de vista), sincronizar local.
  useEffect(() => {
    if (!isHelpReadingMode && isReadingMode) {
      setIsReadingModeLocal(false);
    }
  }, [isHelpReadingMode, isReadingMode]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ label: string; path: string | null }[]>([]);
  const [adjacentDocs, setAdjacentDocs] = useState<{ prev: AdjacentDoc | null; next: AdjacentDoc | null }>({
    prev: null,
    next: null,
  });

  const fetchStructure = useCallback(async () => {
    try {
      const res = await fetch('/api/help-docs');
      if (!res.ok) throw new Error('Failed to fetch help structure');
      const data = await res.json();
      setStructure(data);
    } catch (err) {
      console.error('Error fetching structure:', err);
      toast.error('Error al cargar la estructura de ayuda');
    }
  }, []);

  const fetchGlossary = useCallback(async () => {
    try {
      const res = await fetch('/api/help-docs?path=help/03-referencia/01-glosario.md');
      if (!res.ok) return;
      const data = await res.json();
      const content = data.content || '';
      const lines = content.split('\n');
      const terms: Record<string, string> = {};

      lines.forEach((line: string) => {
        const match = line.match(/^\*\*(.*?)\*\*:(.*)/);
        if (match) {
          terms[match[1].toLowerCase()] = match[2].trim();
        }
      });
      setGlossary(terms);
    } catch (err) {
      console.error('Error fetching glossary:', err);
    }
  }, []);

  const generateToc = (content: string) => {
    if (!content) return;
    const lines = content.split('\n');
    const items: TocItem[] = [];
    lines.forEach(line => {
      const match = line.match(/^(#{2,3})\s+(.*)/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text.toLowerCase().replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-');
        items.push({ id, level, text });
      }
    });
    setToc(items);
  };

  // Get section info for a given path
  const getSectionInfo = useCallback((docPath: string) => {
    if (!structure) return null;
    const allSections = [...structure.sections, ...(structure.compliance.files.length > 0 ? [structure.compliance as SectionEntry] : [])];
    for (const sec of allSections) {
      const found = sec.files.find(f => `${sec.dir}/${f.filename}` === docPath);
      if (found) return { section: sec, file: found };
    }
    return null;
  }, [structure]);

  // Build breadcrumbs from path
  const buildBreadcrumbs = useCallback((docPath: string) => {
    const crumbs: { label: string; path: string | null }[] = [
      { label: 'Centro de Ayuda', path: null },
    ];

    const info = getSectionInfo(docPath);
    if (info) {
      crumbs.push({ label: info.section.label, path: null });
      crumbs.push({ label: info.file.title, path: docPath });
    }

    setBreadcrumbs(crumbs);
  }, [getSectionInfo]);

  // Build adjacent docs (prev/next)
  const buildAdjacentDocs = useCallback((docPath: string) => {
    if (!structure) return;
    const allSections = [...structure.sections, ...(structure.compliance.files.length > 0 ? [structure.compliance as SectionEntry] : [])];
    let allFiles: { path: string; title: string }[] = [];

    for (const sec of allSections) {
      for (const f of sec.files) {
        allFiles.push({ path: `${sec.dir}/${f.filename}`, title: f.title });
      }
    }

    const idx = allFiles.findIndex(f => f.path === docPath);
    setAdjacentDocs({
      prev: idx > 0 ? allFiles[idx - 1] : null,
      next: idx >= 0 && idx < allFiles.length - 1 ? allFiles[idx + 1] : null,
    });
  }, [structure]);

  const loadDocument = useCallback(async (path: string) => {
    setLoading(true);
    try {
      // Sincronizar la URL con el documento que se va a cargar.
      // CRÍTICO: si no sincronizamos, el useEffect de HelpView que observa ?doc= 
      // detectará que la URL tiene un path viejo y re-cargará el documento anterior,
      // pisando el que el usuario acaba de pedir desde el sidebar interno.
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        const currentDocParam = url.searchParams.get('doc');
        if (currentDocParam !== path) {
          url.searchParams.set('doc', path);
          // replaceState (no pushState) para no llenar el historial de pasos intermedios.
          window.history.replaceState({}, '', url.toString());
        }
      }

      const res = await fetch(`/api/help-docs?path=${path}`);
      if (!res.ok) throw new Error('Document not found');
      const data = await res.json();

      if (!data.content) throw new Error('Document content is empty');

      let type: HelpDoc['type'] = 'getting-started';
      if (path.includes('01-tutoriales')) type = 'tutorial';
      else if (path.includes('02-como-hacer')) type = 'how-to';
      else if (path.includes('03-referencia')) type = 'reference';
      else if (path.includes('04-explicacion')) type = 'reference';

      const title = data.content.split('\n')[0].replace(/^#+\s+/, '') || path;

      const doc: HelpDoc = {
        path,
        title,
        content: typeof data.content === 'string' ? data.content : JSON.stringify(data.content ?? ''),
        type
      };

      setCurrentDoc(doc);
      generateToc(data.content);
      buildBreadcrumbs(path);
      buildAdjacentDocs(path);
    } catch (err) {
      console.error('Error loading document:', err);
      toast.error('No se pudo cargar el documento');
    } finally {
      setLoading(false);
    }
  }, [buildBreadcrumbs, buildAdjacentDocs]);

  useEffect(() => {
    fetchStructure();
    fetchGlossary();
  }, [fetchStructure, fetchGlossary]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    const performSearch = async () => {
      try {
        const res = await fetch(`/api/help-docs?search=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) return;
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (err) {
        console.error('Search error:', err);
      }
    };

    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  return {
    structure,
    loading,
    currentDoc,
    loadDocument,
    toc,
    searchQuery,
    setSearchQuery,
    searchResults,
    glossary,
    isReadingMode,
    setIsReadingMode,
    breadcrumbs,
    adjacentDocs,
  };
};
