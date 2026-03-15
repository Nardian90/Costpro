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
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      }
      return null;
    };

    return NextResponse.json({
      arch: readJson(publicDir, 'system_architecture.json'),
      audit: readJson(publicDir, 'architecture_audit.json'),
      knowledge: readJson(knowledgeDir, 'components.json'),
      help: readJson(knowledgeDir, 'user_help.json'),
      workflows: readJson(knowledgeDir, 'workflows.json'),
    });
  } catch (error) {
    console.error('Error reading knowledge files:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
