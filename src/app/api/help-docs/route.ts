import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const KNOWLEDGE_BASE = path.join(/*turbopackIgnore: true*/process.cwd(), 'knowledge');

interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
  type: string;
}

interface FileEntry {
  filename: string;
  title: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');
  const searchQuery = searchParams.get('search');

  try {
    if (searchQuery && searchQuery.length >= 3) {
      const results: SearchResult[] = [];
      const query = searchQuery.toLowerCase();

      const walk = (dir: string) => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const fullPath = path.join(dir, file);
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            walk(fullPath);
          } else if (file.endsWith('.md')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.toLowerCase().includes(query)) {
              const relativePath = path.relative(KNOWLEDGE_BASE, fullPath);
              const title = content.split('\n')[0].replace(/^#+\s+/, '') || file;

              // Simple excerpt generation
              const index = content.toLowerCase().indexOf(query);
              const start = Math.max(0, index - 40);
              const end = Math.min(content.length, index + query.length + 80);
              const excerpt = (start > 0 ? '...' : '') + content.substring(start, end).replace(/\n/g, ' ') + (end < content.length ? '...' : '');

              let type = 'iso';
              if (relativePath.includes('tutorials')) type = 'tutorial';
              else if (relativePath.includes('how-to')) type = 'how-to';
              else if (relativePath.includes('reference')) type = 'reference';
              else if (relativePath.includes('explanation')) type = 'explanation';

              results.push({
                path: relativePath,
                title,
                excerpt,
                type
              });
            }
          }
        });
      };

      walk(KNOWLEDGE_BASE);
      return NextResponse.json({ results: results.slice(0, 10) }); // Limit to top 10 results
    }

    if (!filePath) {
      // Helper: read first heading from a markdown file to use as title
      const extractTitle = (dir: string, filename: string): string => {
        try {
          const content = fs.readFileSync(path.join(dir, filename), 'utf8');
          const firstLine = content.split('\n')[0];
          const match = firstLine.match(/^#+\s+(.+)/);
          return match ? match[1].trim() : filename.replace('.md', '').replace(/[-_]/g, ' ');
        } catch {
          return filename.replace('.md', '').replace(/[-_]/g, ' ');
        }
      };

      // List all relevant files for the help system with proper titles
      const isoDir = path.join(KNOWLEDGE_BASE, 'iso_manual');
      const tutorialsDir = path.join(KNOWLEDGE_BASE, 'docs/tutorials');
      const howToDir = path.join(KNOWLEDGE_BASE, 'docs/how-to');
      const refDir = path.join(KNOWLEDGE_BASE, 'docs/reference');
      const explDir = path.join(KNOWLEDGE_BASE, 'docs/explanation');

      const toFileEntries = (dir: string, files: string[]): FileEntry[] =>
        files.map(f => ({ filename: f, title: extractTitle(dir, f) }));

      const structure = {
        iso_manual: fs.existsSync(isoDir) ? toFileEntries(isoDir, fs.readdirSync(isoDir).filter(f => f.endsWith('.md')).sort()) : [],
        docs: {
          tutorials: fs.existsSync(tutorialsDir) ? toFileEntries(tutorialsDir, fs.readdirSync(tutorialsDir).filter(f => f.endsWith('.md')).sort()) : [],
          howTo: fs.existsSync(howToDir) ? toFileEntries(howToDir, fs.readdirSync(howToDir).filter(f => f.endsWith('.md')).sort()) : [],
          reference: fs.existsSync(refDir) ? toFileEntries(refDir, fs.readdirSync(refDir).filter(f => f.endsWith('.md')).sort()) : [],
          explanation: fs.existsSync(explDir) ? toFileEntries(explDir, fs.readdirSync(explDir).filter(f => f.endsWith('.md')).sort()) : [],
        },
        user_help: fs.existsSync(path.join(KNOWLEDGE_BASE, 'user_help.json'))
      };
      return NextResponse.json(structure);
    }

    // Safety check: prevent path traversal
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(KNOWLEDGE_BASE, safePath);

    if (!fullPath.startsWith(KNOWLEDGE_BASE)) {
       return NextResponse.json({ error: 'Unauthorized path' }, { status: 403 });
    }

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
        return NextResponse.json({ error: 'Path is a directory' }, { status: 400 });
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    if (fullPath.endsWith('.json')) {
        return NextResponse.json(JSON.parse(content));
    }

    return NextResponse.json({ content });

  } catch (error) {
    console.error('Error in help-docs API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
