'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export interface HelpDoc {
  path: string;
  title: string;
  content: string;
  type: 'tutorial' | 'how-to' | 'reference' | 'explanation' | 'iso';
}

export interface TocItem {
  id: string;
  level: number;
  text: string;
}

interface FileEntry {
  filename: string;
  title: string;
}

export interface HelpStructure {
  iso_manual: FileEntry[];
  docs: {
    tutorials: FileEntry[];
    howTo: FileEntry[];
    reference: FileEntry[];
    explanation: FileEntry[];
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
  const [isReadingMode, setIsReadingMode] = useState(false);

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
      const res = await fetch('/api/help-docs?path=iso_manual/glosario.md');
      if (!res.ok) return; // Silent fail if glossary not found
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
      const match = line.match(/^(#{1,3})\s+(.*)/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        items.push({ id, level, text });
      }
    });
    setToc(items);
  };

  const loadDocument = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/help-docs?path=${path}`);
      if (!res.ok) throw new Error('Document not found');
      const data = await res.json();

      if (!data.content) throw new Error('Document content is empty');

      let type: HelpDoc['type'] = 'iso';
      if (path.includes('tutorials')) type = 'tutorial';
      else if (path.includes('how-to')) type = 'how-to';
      else if (path.includes('reference')) type = 'reference';
      else if (path.includes('explanation')) type = 'explanation';

      const title = data.content.split('\n')[0].replace(/^#+\s+/, '') || path;

      const doc: HelpDoc = {
        path,
        title,
        content: data.content,
        type
      };

      setCurrentDoc(doc);
      generateToc(data.content);
    } catch (err) {
      console.error('Error loading document:', err);
      toast.error('No se pudo cargar el documento');
    } finally {
      setLoading(false);
    }
  }, []);

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
    setIsReadingMode
  };
};
