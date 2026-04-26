import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const handler = withAuth(async (req, session) => {
  try {
    const readJson = (relPath: string) => {
      const fullPath = path.join(/*turbopackIgnore: true*/process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      }
      return null;
    };

    const knowledgeGraph = readJson('knowledge/knowledge_graph.json');
    const systemArchitecture = readJson('public/system_architecture.json');
    const pipelineState = readJson('docs/automation/pipeline_state.yaml'); // Note: this is actually YAML, but keeping for compatibility

    return NextResponse.json({
      knowledgeGraph,
      systemArchitecture,
      pipelineState,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in system-health/knowledge API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});

export async function GET(req: NextRequest) {
  return handler(req);
}
