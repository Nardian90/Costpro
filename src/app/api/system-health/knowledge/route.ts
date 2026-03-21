import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const knowledgeDir = path.join(/*turbopackIgnore:true*/ process.cwd(), 'knowledge');
    const publicDir = path.join(/*turbopackIgnore:true*/ process.cwd(), 'public');
    const automationDir = path.join(/*turbopackIgnore:true*/ process.cwd(), 'docs/automation');

    const readJson = (dir: string, file: string) => {
      const fullPath = path.join(dir, file);
      if (fs.existsSync(fullPath)) {
        try {
          return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        } catch (e) {
          console.error(`Error parsing ${file}:`, e);
          return null;
        }
      }
      return null;
    };

    // Load components metadata from public/_meta/ if needed, but components.json usually has the core info
    const components = readJson(knowledgeDir, 'components.json');
    const views = readJson(knowledgeDir, 'views.json');
    const graph = readJson(publicDir, 'architecture_graph.json');
    const reviewQueue = readJson(automationDir, 'review_queue.json');

    return NextResponse.json({
      components,
      views,
      graph,
      reviewQueue,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error reading knowledge files:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
