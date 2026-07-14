/**
 * RAG — Retrieval-Augmented Generation para el bot de CostPro.
 *
 * Indexa los documentos de knowledge/help/ y permite buscar los más
 * relevantes para una consulta del usuario.
 *
 * FIX-RAG (2026-07-14): antes el bot leía de docs/knowledge/resolutions/
 * (path inexistente). Ahora lee de knowledge/help/ donde están los
 * tutoriales, guías how-to, referencia y explicaciones reales.
 */

import * as fs from 'fs';
import * as path from 'path';

interface KnowledgeDoc {
  filename: string;
  filepath: string;
  content: string;
  title: string;
  category: string;
  keywords: string[];
}

let cachedDocs: KnowledgeDoc[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 300000; // 5 minutos

function loadKnowledgeDocs(): KnowledgeDoc[] {
  const now = Date.now();
  if (cachedDocs && (now - lastCacheTime < CACHE_TTL)) {
    return cachedDocs;
  }

  const basePath = path.join(process.cwd(), 'knowledge', 'help');
  if (!fs.existsSync(basePath)) {
    console.warn('[RAG] knowledge/help/ no existe');
    return [];
  }

  const docs: KnowledgeDoc[] = [];

  function walkDir(dir: string, category: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, entry.name);
      } else if (entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const title = extractTitle(content) || entry.name.replace('.md', '');
        const keywords = extractKeywords(content, title);
        const relativePath = path.relative(basePath, fullPath);
        docs.push({ filename: entry.name, filepath: relativePath, content, title, category, keywords });
      }
    }
  }

  walkDir(basePath, 'root');

  const helpJsonPath = path.join(basePath, 'user_help.json');
  if (fs.existsSync(helpJsonPath)) {
    try {
      const helpData = JSON.parse(fs.readFileSync(helpJsonPath, 'utf-8'));
      for (const item of helpData) {
        docs.push({
          filename: `user_help:${item.feature}`, filepath: 'user_help.json',
          content: JSON.stringify(item, null, 2), title: item.feature, category: 'features',
          keywords: [item.feature, ...(item.acciones || []), ...(item.resultados || [])],
        });
      }
    } catch (e) { console.warn('[RAG] Error leyendo user_help.json:', e); }
  }

  cachedDocs = docs;
  lastCacheTime = now;
  return docs;
}

function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractKeywords(content: string, title: string): string[] {
  const stopwords = new Set(['para','como','los','las','con','por','que','una','uno','del','desde','hasta','cuando','donde','este','esta','estos','estas','pero','mas','muy','puede','pueden','tiene','tienen','sistema','costpro','usuario']);
  const words = (content.toLowerCase() + ' ' + title.toLowerCase())
    .replace(/[^\w\sáéíóúñ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
  const freq: Record<string, number> = {};
  for (const w of words) { freq[w] = (freq[w] || 0) + 1; }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w]) => w);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchKnowledge(query: string, maxResults: number = 3): Array<{
  title: string; content: string; filepath: string; score: number;
}> {
  const docs = loadKnowledgeDocs();
  if (docs.length === 0) return [];

  const queryWords = query.toLowerCase().replace(/[^\w\sáéíóúñ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return [];

  const scored = docs.map(doc => {
    let score = 0;
    const contentLower = doc.content.toLowerCase();
    const titleLower = doc.title.toLowerCase();
    for (const word of queryWords) {
      if (titleLower.includes(word)) score += 10;
      if (doc.keywords.includes(word)) score += 5;
      const matches = (contentLower.match(new RegExp(escapeRegExp(word), 'g')) || []).length;
      score += matches;
    }
    if (query.toLowerCase().includes('cómo') || query.toLowerCase().includes('como hacer')) {
      if (doc.category.includes('como-hacer')) score += 5;
    }
    if (query.toLowerCase().includes('aprender') || query.toLowerCase().includes('tutorial')) {
      if (doc.category.includes('tutoriales') || doc.category.includes('empezar')) score += 5;
    }
    return { title: doc.title, content: doc.content, filepath: doc.filepath, score };
  });

  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults);
}

export function buildRagContext(messages: Array<{ role: string; content: string }>): string {
  const userMessages = messages.filter(m => m.role === 'user').slice(-3).map(m => m.content).join(' ');
  if (!userMessages || userMessages.length < 5) return '';

  const results = searchKnowledge(userMessages, 3);
  if (results.length === 0) return '';

  let context = '\n\n## 📚 Documentación relevante recuperada (RAG)\n';
  context += 'Usa esta información para responder al usuario. Si la docs describen una vista específica, OFRECE navegar a ella usando la herramienta `open_view`.\n\n';

  for (const r of results) {
    const truncated = r.content.length > 1500 ? r.content.substring(0, 1500) + '\n[...continúa]' : r.content;
    context += `### 📄 ${r.title} (relevancia: ${r.score})\n> Archivo: ${r.filepath}\n\n${truncated}\n\n---\n\n`;
  }

  return context;
}

export function invalidateRagCache(): void {
  cachedDocs = null;
  lastCacheTime = 0;
}
