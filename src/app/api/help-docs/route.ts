import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const KNOWLEDGE_BASE = path.join(/*turbopackIgnore:true*/process.cwd(), 'knowledge');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  try {
    if (!filePath) {
      // List all relevant files for the help system
      const structure = {
        iso_manual: fs.readdirSync(path.join(KNOWLEDGE_BASE, 'iso_manual')).filter(f => f.endsWith('.md')),
        docs: {
          tutorials: fs.existsSync(path.join(KNOWLEDGE_BASE, 'docs/tutorials')) ? fs.readdirSync(path.join(KNOWLEDGE_BASE, 'docs/tutorials')).filter(f => f.endsWith('.md')) : [],
          howTo: fs.existsSync(path.join(KNOWLEDGE_BASE, 'docs/how-to')) ? fs.readdirSync(path.join(KNOWLEDGE_BASE, 'docs/how-to')).filter(f => f.endsWith('.md')) : [],
          reference: fs.existsSync(path.join(KNOWLEDGE_BASE, 'docs/reference')) ? fs.readdirSync(path.join(KNOWLEDGE_BASE, 'docs/reference')).filter(f => f.endsWith('.md')) : [],
          explanation: fs.existsSync(path.join(KNOWLEDGE_BASE, 'docs/explanation')) ? fs.readdirSync(path.join(KNOWLEDGE_BASE, 'docs/explanation')).filter(f => f.endsWith('.md')) : [],
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
