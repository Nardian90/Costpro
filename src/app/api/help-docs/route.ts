import { NextRequest, NextResponse } from 'next/server';
import { withTracing } from '@/lib/observability';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const KNOWLEDGE_BASE = path.join(/*turbopackIgnore: true*/process.cwd(), 'knowledge');

// Section metadata mapping — Diataxis framework
const SECTION_META: Record<string, { label: string; icon: string }> = {
  '01-tutoriales': { label: 'Tutoriales', icon: 'GraduationCap' },
  '02-como-hacer': { label: 'Cómo Hacer', icon: 'Wrench' },
  '03-referencia': { label: 'Referencia', icon: 'BookOpen' },
  '04-explicacion': { label: 'Explicación', icon: 'Lightbulb' },
};

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

interface SectionEntry {
  id: string;
  dir: string;
  label: string;
  icon: string;
  files: FileEntry[];
}

interface HelpResponse {
  sections: SectionEntry[];
  compliance: { id: string; label: string; icon: string; files: FileEntry[] };
  user_help: boolean;
}

// Helper: read first heading from a markdown file to use as title
function extractTitle(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0];
    const match = firstLine.match(/^#+\s+(.+)/);
    return match ? match[1].trim() : path.basename(filePath, '.md').replace(/[-_]/g, ' ');
  } catch {
    return path.basename(filePath, '.md').replace(/[-_]/g, ' ');
  }
}

function buildStructure(): HelpResponse {
  const helpDir = path.join(KNOWLEDGE_BASE, 'help');

  // Scan numbered section directories
  const dirs = fs.existsSync(helpDir)
    ? fs.readdirSync(helpDir)
        .filter(f => {
          const fullPath = path.join(helpDir, f);
          return fs.statSync(fullPath).isDirectory() && /^\d{2}-/.test(f);
        })
        .sort()
    : [];

  const sections: SectionEntry[] = dirs.map(dirName => {
    const dirPath = path.join(helpDir, dirName);
    const meta = SECTION_META[dirName] || { label: dirName, icon: 'FileText' };
    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => ({
        filename: f,
        title: extractTitle(path.join(dirPath, f)),
      }));

    return {
      id: dirName.replace(/^\d{2}-/, ''),
      dir: `help/${dirName}`,
      label: meta.label,
      icon: meta.icon,
      files,
    };
  });

  // Scan compliance directory
  const complianceDir = path.join(helpDir, 'compliance');
  const complianceFiles = fs.existsSync(complianceDir)
    ? fs.readdirSync(complianceDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .map(f => ({
          filename: f,
          title: extractTitle(path.join(complianceDir, f)),
        }))
    : [];

  const compliance = {
    id: 'compliance',
    label: 'Cumplimiento Normativo',
    icon: 'Shield',
    files: complianceFiles,
  };

  const user_help = fs.existsSync(path.join(helpDir, 'user_help.json'));

  return { sections, compliance, user_help };
}

async function getHandler(request: NextRequest) {
  // Help docs are public knowledge files — no auth required

  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');
  const searchQuery = searchParams.get('search');

  try {
    // ── Search ──
    if (searchQuery && searchQuery.length >= 3) {
      const results: SearchResult[] = [];
      const query = searchQuery.toLowerCase();
      const helpDir = path.join(KNOWLEDGE_BASE, 'help');

      const walk = (dir: string, depth = 0, maxDepth = 10) => {
        if (depth >= maxDepth) return;
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const fullPath = path.join(dir, file);
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            walk(fullPath, depth + 1, maxDepth);
          } else if (file.endsWith('.md')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.toLowerCase().includes(query)) {
              const relativePath = path.relative(KNOWLEDGE_BASE, fullPath);
              const title = content.split('\n')[0].replace(/^#+\s+/, '') || file;
              const index = content.toLowerCase().indexOf(query);
              const start = Math.max(0, index - 40);
              const end = Math.min(content.length, index + query.length + 80);
              const excerpt = (start > 0 ? '...' : '') + content.substring(start, end).replace(/\n/g, ' ') + (end < content.length ? '...' : '');

              let type = 'getting-started';
              if (relativePath.includes('01-tutoriales')) type = 'tutorial';
              else if (relativePath.includes('02-como-hacer')) type = 'how-to';
              else if (relativePath.includes('03-referencia')) type = 'reference';
              else if (relativePath.includes('04-explicacion')) type = 'reference';

              results.push({ path: relativePath, title, excerpt, type });
            }
          }
        });
      };

      walk(helpDir);
      return NextResponse.json({ results: results.slice(0, 10) });
    }

    // ── Structure listing ──
    if (!filePath) {
      return NextResponse.json(buildStructure());
    }

    // ── Single file ──
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

export const GET = withTracing(getHandler, 'GET /api/help-docs');
