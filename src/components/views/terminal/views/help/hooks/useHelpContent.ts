'use client';

import { useState, useEffect, useCallback } from 'react';

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

export interface HelpStructure {
  iso_manual: string[];
  docs: {
    tutorials: string[];
    howTo: string[];
    reference: string[];
    explanation: string[];
  };
  user_help: boolean;
}

export const useHelpContent = () => {
  const [structure, setStructure] = useState<HelpStructure | null>(null);
  const [currentDoc, setCurrentDoc] = useState<HelpDoc | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HelpDoc[]>([]);
  const [glossary, setGlossary] = useState<Record<string, string>>({});

  const fetchStructure = useCallback(async () => {
    try {
      const res = await fetch('/api/help-docs');
      const data = await res.json();
      setStructure(data);
    } catch (err) {
      console.error('Error fetching structure:', err);
    }
  }, []);

  const fetchGlossary = useCallback(async () => {
    try {
      const res = await fetch('/api/help-docs?path=iso_manual/glossary.md');
      const { content } = await res.json();

      const lines = content.split('\n');
      const terms: Record<string, string> = {};
      let currentTerm = '';

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
      const data = await res.json();

      // Determine type based on path
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStructure();
    fetchGlossary();
  }, [fetchStructure, fetchGlossary]);

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
    isReadingMode: false // Placeholder for now
  };
};
