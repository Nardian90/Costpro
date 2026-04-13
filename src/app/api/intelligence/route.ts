import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

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
        console.error(`Error parsing JSON from ${relPath}:`, e);
        return null;
      }
    };

    const readYaml = (relPath: string) => {
      const content = readFile(relPath);
      if (!content) return null;
      try {
        return yaml.load(content) as any;
      } catch (e) {
        console.error(`Error parsing YAML from ${relPath}:`, e);
        return null;
      }
    };

    // V9.0 Architecture Paths
    const ARCH_DIR = 'knowledge/architecture';
    const AUTOMATION_DIR = 'docs/automation';
    const AUDIT_DIR = 'docs/audits';
    const KNOWLEDGE_DIR = 'knowledge';

    const data = {
      // Core Architecture (v9.0 Locations)
      audit: readJson('docs/architecture_audit.json') || readJson('public/architecture_audit.json') || { phaseExecutions: [] },
      metrics: readJson(`${ARCH_DIR}/architecture_metrics.json`),
      graph: readJson(`${ARCH_DIR}/architecture_graph.json`),
      system: readJson(`${ARCH_DIR}/system_architecture.json`),
      manifest: readJson(`${ARCH_DIR}/architecture_manifest.json`),
      changes: readJson(`${ARCH_DIR}/architecture_changes.json`),

      // Automation & Governance
      reviewQueue: readJson(`${AUDIT_DIR}/review_queue.json`) || readJson(`${AUTOMATION_DIR}/review_queue.json`) || { queue: [] },
      pipelineState: readYaml(`${AUTOMATION_DIR}/pipeline_state.yaml`),
      integrityReport: readFile('docs/architecture/INTEGRITY_REPORT.md') || readFile('docs/audits/INTEGRITY_REPORT.md'),

      // Living Knowledge
      knowledgeGraph: readJson(`${KNOWLEDGE_DIR}/knowledge_graph.json`),
      userHelp: readJson(`${KNOWLEDGE_DIR}/user_help.json`),
      views: readJson(`${KNOWLEDGE_DIR}/views.json`),
      workflows: readJson(`${KNOWLEDGE_DIR}/workflows.json`),
      components: readJson(`${KNOWLEDGE_DIR}/components.json`),

      // Docs Indexing
      docsList: fs.existsSync(path.join(/*turbopackIgnore: true*/process.cwd(), 'knowledge/docs'))
        ? fs.readdirSync(path.join(/*turbopackIgnore: true*/process.cwd(), 'knowledge/docs'))
            .filter(f => f.endsWith('.md'))
        : [],

      // Real-time Health Indicators (Aggregated)
      healthSummary: {
        timestamp: new Date().toISOString(),
        integrityScore: 0,
        status: 'STABLE'
      }
    };

    // Basic Integrity Scoring
    if (data.metrics?.summary) {
       const avgInstability = data.metrics.summary.avg_instability || 0;
       data.healthSummary.integrityScore = Math.round((1 - avgInstability) * 100);
       if (avgInstability > 0.8) data.healthSummary.status = 'CRITICAL';
       else if (avgInstability > 0.5) data.healthSummary.status = 'DEGRADED';
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Intelligence API Error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
