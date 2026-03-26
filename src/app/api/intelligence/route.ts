import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const readFile = (relPath: string) => {
      const fullPath = path.join(/*turbopackIgnore: true*/process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf8');
      }
      return null;
    };

    const readJson = (relPath: string) => {
      const content = readFile(relPath);
      if (!content) return null;
      try {
        return JSON.parse(content);
      } catch (e) {
        return null;
      }
    };

    // Simple YAML to JSON for pipeline_state.yaml
    const readYaml = (relPath: string) => {
      const content = readFile(relPath);
      if (!content) return null;
      const lines = content.split('\n');
      const obj: any = {};
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join(':').trim();
          // basic types
          if (value === 'true') obj[key] = true;
          else if (value === 'false') obj[key] = false;
          else if (!isNaN(Number(value))) obj[key] = Number(value);
          else obj[key] = value;
        }
      });
      return obj;
    };

    const data = {
      audit: readJson('public/architecture_audit.json'),
      metrics: readJson('public/architecture_metrics.json'),
      graph: readJson('public/architecture_graph.json'),
      system: readJson('public/system_architecture.json'),
      reviewQueue: readJson('docs/automation/review_queue.json'),
      integrityReport: readFile('docs/architecture/INTEGRITY_REPORT.md'),
      pipelineState: readYaml('docs/automation/pipeline_state.yaml'),
      knowledgeGraph: readJson('knowledge/knowledge_graph.json'),
      userHelp: readJson('knowledge/user_help.json'),
      views: readJson('knowledge/views.json'),
      workflows: readJson('knowledge/workflows.json'),
      components: readJson('knowledge/components.json'),
      // Removed recursion to avoid Turbopack tracing issues
      docsList: fs.existsSync(path.join(/*turbopackIgnore: true*/process.cwd(), 'knowledge/docs'))
        ? fs.readdirSync(path.join(/*turbopackIgnore: true*/process.cwd(), 'knowledge/docs'))
            .filter(f => (f as any).endsWith('.md'))
        : []
    };

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Intelligence API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
