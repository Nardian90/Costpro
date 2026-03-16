import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const knowledgeDir = path.join(process.cwd(), 'knowledge');
    const publicDir = path.join(process.cwd(), 'public');

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

    return NextResponse.json({
      // Knowledge files
      components: readJson(knowledgeDir, 'components.json'),
      views: readJson(knowledgeDir, 'views.json'),
      workflows: readJson(knowledgeDir, 'workflows.json'),
      master_manual: readJson(knowledgeDir, 'master_user_manual.json'),
      user_help: readJson(knowledgeDir, 'user_help.json'),
      knowledge_graph: readJson(knowledgeDir, 'knowledge_graph.json'),
      ai_context: readJson(knowledgeDir, 'ai_context_index.json'),

      // Public files
      manifest: readJson(publicDir, 'architecture_manifest.json'),
      arch: readJson(publicDir, 'system_architecture.json'),
      graph: readJson(publicDir, 'architecture_graph.json'),
      audit: readJson(publicDir, 'architecture_audit.json'),
    });
  } catch (error) {
    console.error('Error reading knowledge files:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
