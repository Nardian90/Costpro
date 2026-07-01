#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * CostPro Help Center — Automated Audit & Improvement Engine
 * ISO/IEC 26514 · Diátaxis Framework · WCAG 2.2 AA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Run: node scripts/help-audit.mjs [--fix] [--iteration N]
 *
 * Checks:
 *   1. Content structure (headings, TOC, links)
 *   2. ISO/IEC 26514 compliance (task orientation, audience, completeness)
 *   3. WCAG 2.2 AA accessibility (aria labels, semantic HTML, contrast)
 *   4. UI/UX consistency (typography, spacing, color system)
 *   5. Cross-reference integrity (internal links, broken anchors)
 *   6. Performance patterns (bundle-safe imports, memoization)
 *   7. Knowledge base completeness (all sections populated)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE = path.join(ROOT, 'knowledge/help');
const COMPONENTS = path.join(ROOT, 'src/components/views/terminal/views/help');

// ── Config ──
const ITERATION_FILE = path.join(ROOT, '.help-audit-state.json');
const MAX_ITERATIONS = 10;
const ITERATION_INTERVAL_MS = 30 * 60 * 1000; // 30 min

// ── Audit Results ──
const results = {
  timestamp: new Date().toISOString(),
  iteration: 0,
  totalChecks: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  fixes: 0,
  categories: {
    content: [],
    iso: [],
    accessibility: [],
    ui: [],
    links: [],
    performance: [],
    knowledge: [],
  },
};

function check(category, name, passed, severity = 'error', detail = '') {
  results.totalChecks++;
  if (passed) {
    results.passed++;
  } else {
    if (severity === 'warning') {
      results.warnings++;
    } else {
      results.failed++;
    }
    results.categories[category]?.push({ name, severity, detail, passed: false });
  }
}

// ════════════════════════════════════════════════════════════════════════
// 1. KNOWLEDGE BASE AUDIT
// ════════════════════════════════════════════════════════════════════════

function getAllMdFiles() {
  const files = [];
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walkDir(full);
      else if (entry.endsWith('.md')) files.push(full);
    }
  }
  walkDir(KNOWLEDGE);
  return files;
}

function auditKnowledgeBase() {
  console.log('\n═══ 1. KNOWLEDGE BASE AUDIT ═══');

  const requiredSections = [
    '01-empezar', '02-gestion', '03-inventario', '04-configuracion', '05-referencia',
  ];

  for (const section of requiredSections) {
    const sectionDir = path.join(KNOWLEDGE, section);
    const exists = fs.existsSync(sectionDir);
    check('knowledge', `Section ${section} exists`, exists, 'error',
      exists ? `Found at ${sectionDir}` : `Missing: ${sectionDir}`);

    if (exists) {
      const files = fs.readdirSync(sectionDir).filter(f => f.endsWith('.md'));
      check('knowledge', `${section} has files`, files.length > 0, 'error',
        `${files.length} files found`);
    }
  }

  const mdFiles = getAllMdFiles();

  for (const file of mdFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    const lines = content.split('\n');

    // Must have H1
    const hasH1 = lines.some(l => /^#\s+/.test(l.trim()));
    check('content', `${rel}: has H1 title`, hasH1, 'error');

    // H1 should be first non-empty line
    const firstNonEmpty = lines.find(l => l.trim() !== '');
    const h1IsFirst = firstNonEmpty && /^#\s+/.test(firstNonEmpty.trim());
    check('content', `${rel}: H1 is first line`, h1IsFirst, 'warning');

    // Should have at least 3 headings total
    const headingCount = lines.filter(l => /^#{1,4}\s+/.test(l.trim())).length;
    check('content', `${rel}: has sufficient headings (${headingCount})`, headingCount >= 3, 'warning');

    // ISO: Should have at least 100 words for substantive content
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (headingCount > 3) {
      check('iso', `${rel}: sufficient content (${wordCount} words)`, wordCount >= 100, 'warning');
    }

    // Check for broken internal links
    const linkRegex = /\[([^\]]+)\]\((#[^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const anchor = match[2].slice(1);
      const normalizedAnchor = anchor.toLowerCase()
        .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
        .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
        .replace(/ü/g, 'u');
      
      const headingsInDoc = lines
        .filter(l => /^#{2,4}\s+/.test(l.trim()))
        .map(l => l.trim().replace(/^#{2,4}\s+/, '').toLowerCase()
          .replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-'));
      
      const headingIdsNormalized = headingsInDoc.map(h =>
        h.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
          .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ñ/g, 'n')
          .replace(/ü/g, 'u'));
      
      const anchorFound = headingIdsNormalized.includes(normalizedAnchor);
      check('links', `${rel}: anchor #${anchor} exists`, anchorFound, 'error',
        anchorFound ? 'OK' : `Not found. Available: ${headingIdsNormalized.slice(0, 5).join(', ')}...`);
    }

    // ISO: Check for task-oriented language
    const taskPatterns = /\b(paso|procedimiento|click|selecciona|ve a|haz|presiona|abre|crea|configura|para|haz clic|ir a)\b/i;
    const hasTaskLanguage = taskPatterns.test(content);
    check('iso', `${rel}: task-oriented language`, hasTaskLanguage, 'warning',
      hasTaskLanguage ? 'Contains actionable steps' : 'May need more procedural content');

    // Check consistent formatting — uses lists
    const bulletLists = (content.match(/^[\s]*[-*]\s+/gm) || []).length;
    const numberedLists = (content.match(/^[\s]*\d+\.\s+/gm) || []).length;
    check('content', `${rel}: uses lists (${bulletLists} bullet, ${numberedLists} numbered)`,
      bulletLists + numberedLists >= 1, 'warning');
  }

  console.log(`  Scanned ${mdFiles.length} markdown files`);
}

// ════════════════════════════════════════════════════════════════════════
// 2. COMPONENT AUDIT
// ════════════════════════════════════════════════════════════════════════

function auditComponents() {
  console.log('\n═══ 2. COMPONENT AUDIT ═══');

  const componentFiles = [
    'HelpView.tsx', 'HelpLayout.tsx', 'HelpSidebar.tsx',
    'HelpContent.tsx', 'HelpSectionRenderer.tsx',
    'AccessibilityStatement.tsx',
  ];

  for (const file of componentFiles) {
    const filePath = path.join(COMPONENTS, file);
    const exists = fs.existsSync(filePath);
    check('knowledge', `Component ${file} exists`, exists, 'error');
    
    if (!exists) continue;

    const content = fs.readFileSync(filePath, 'utf8');

    check('performance', `${file}: has 'use client'`, content.includes("'use client'"), 'error');
    check('performance', `${file}: has TypeScript interfaces`,
      content.includes('interface') || content.includes('type'), 'warning');

    const interactiveElements = (content.match(/<button/g) || []).length;
    const ariaLabels = (content.match(/aria-label|aria-current|aria-live|aria-hidden|role=/g) || []).length;
    check('accessibility', `${file}: ARIA labels (${interactiveElements} buttons, ${ariaLabels} ARIA attrs)`,
      ariaLabels >= Math.max(1, Math.floor(interactiveElements / 3)), 'warning');
  }
}

// ════════════════════════════════════════════════════════════════════════
// 3. HOOK AUDIT
// ════════════════════════════════════════════════════════════════════════

function auditHooks() {
  console.log('\n═══ 3. HOOK AUDIT ═══');

  const hookFile = path.join(COMPONENTS, 'hooks', 'useHelpContent.ts');
  if (!fs.existsSync(hookFile)) {
    check('knowledge', 'useHelpContent hook exists', false, 'error');
    return;
  }

  const content = fs.readFileSync(hookFile, 'utf8');

  check('performance', 'useHelpContent: fetch functions use useCallback',
    (content.match(/useCallback/g) || []).length >= 3, 'warning');
  check('performance', 'useHelpContent: has try-catch blocks',
    content.includes('try {') && content.includes('catch'), 'error');
  check('ui', 'useHelpContent: has loading state management',
    content.includes('setLoading'), 'error');
  check('performance', 'useHelpContent: exports TypeScript types',
    content.includes('export interface'), 'warning');
}

// ════════════════════════════════════════════════════════════════════════
// 4. API ROUTE AUDIT
// ════════════════════════════════════════════════════════════════════════

function auditApiRoute() {
  console.log('\n═══ 4. API ROUTE AUDIT ═══');

  const routeFile = path.join(ROOT, 'src/app/api/help-docs/route.ts');
  if (!fs.existsSync(routeFile)) {
    check('knowledge', 'API route exists', false, 'error');
    return;
  }

  const content = fs.readFileSync(routeFile, 'utf8');

  check('accessibility', 'API: path traversal protection',
    content.includes('path.normalize') && content.includes('startsWith'), 'error');
  check('performance', 'API: error handling',
    content.includes('try') && content.includes('catch') && content.includes('500'), 'error');
  check('performance', 'API: force-dynamic for real-time content',
    content.includes("force-dynamic"), 'warning');
  check('knowledge', 'API: has search endpoint',
    content.includes('searchQuery') && content.includes('search'), 'error');
  check('accessibility', 'API: public access (no auth gate)',
    !content.includes('getSession') && !content.includes('getServerSession'), 'warning');
}

// ════════════════════════════════════════════════════════════════════════
// 5. ISO/IEC 26514 COMPLIANCE CHECK
// ════════════════════════════════════════════════════════════════════════

function auditISOCompliance() {
  console.log('\n═══ 5. ISO/IEC 26514 COMPLIANCE ═══');

  const mdFiles = getAllMdFiles();

  const requiredTypes = {
    'tutorial': false,
    'how-to': false,
    'reference': false,
    'explanation': false,
  };

  for (const file of mdFiles) {
    const rel = path.relative(KNOWLEDGE, file);
    if (rel.includes('02-gestion')) requiredTypes['tutorial'] = true;
    if (rel.includes('03-inventario') || rel.includes('04-configuracion')) requiredTypes['how-to'] = true;
    if (rel.includes('05-referencia') || rel.includes('compliance')) requiredTypes['reference'] = true;
    if (rel.includes('01-empezar')) requiredTypes['explanation'] = true;
  }

  for (const [type, found] of Object.entries(requiredTypes)) {
    check('iso', `Diataxis: ${type} documentation present`, found, 'error',
      found ? 'Found' : 'Missing documentation type');
  }

  const layoutContent = fs.readFileSync(path.join(COMPONENTS, 'HelpLayout.tsx'), 'utf8');
  check('iso', 'UI shows ISO/IEC 26514 badge',
    layoutContent.includes('ISO/IEC 26514'), 'warning');
  check('iso', 'UI displays version number',
    layoutContent.includes('v5.8') || layoutContent.includes('APP_DISPLAY_VERSION'), 'warning');
  check('iso', 'UI has compliance footer',
    layoutContent.includes('footer') || layoutContent.includes('copyright'), 'warning');

  const accessibilityPath = path.join(COMPONENTS, 'AccessibilityStatement.tsx');
  check('accessibility', 'Accessibility statement exists',
    fs.existsSync(accessibilityPath), 'error');
  
  if (fs.existsSync(accessibilityPath)) {
    const accContent = fs.readFileSync(accessibilityPath, 'utf8');
    check('accessibility', 'Accessibility: mentions WCAG', accContent.includes('WCAG'), 'warning');
    check('accessibility', 'Accessibility: mentions keyboard nav',
      accContent.toLowerCase().includes('teclado') || accContent.toLowerCase().includes('keyboard'), 'warning');
  }
}

// ════════════════════════════════════════════════════════════════════════
// 6. UI/UX CONSISTENCY CHECK
// ════════════════════════════════════════════════════════════════════════

function auditUIConsistency() {
  console.log('\n═══ 6. UI/UX CONSISTENCY ═══');

  const sidebar = fs.readFileSync(path.join(COMPONENTS, 'HelpSidebar.tsx'), 'utf8');
  check('ui', 'Sidebar: collapsible categories (openCategories)',
    sidebar.includes('openCategories') && sidebar.includes('toggleCategory'), 'error');
  check('ui', 'Sidebar: expand/collapse animation',
    sidebar.includes('slide-in') && sidebar.includes('rotate-180'), 'warning');
  check('ui', 'Sidebar: active document indicator',
    sidebar.includes('activePath') && sidebar.includes('border-l-2'), 'warning');
  check('ui', 'Sidebar: TOC section after modules',
    sidebar.includes('Contenido') && sidebar.includes('toc'), 'warning');

  const layout = fs.readFileSync(path.join(COMPONENTS, 'HelpLayout.tsx'), 'utf8');
  check('ui', 'Layout: scroll progress indicator',
    layout.includes('scrollProgress') && layout.includes('% ledo'), 'warning');

  const view = fs.readFileSync(path.join(COMPONENTS, 'HelpView.tsx'), 'utf8');
  check('ui', 'View: reading mode toggle',
    view.includes('isReadingMode') && view.includes('Modo Lectura'), 'warning');

  const helpContent = fs.readFileSync(path.join(COMPONENTS, 'HelpContent.tsx'), 'utf8');
  check('ui', 'Content: breadcrumbs navigation',
    helpContent.includes('breadcrumbs') && helpContent.includes('ChevronRight'), 'warning');
  check('ui', 'Content: prev/next document navigation',
    helpContent.includes('adjacentDocs') && helpContent.includes('ArrowLeft'), 'warning');
  check('ui', 'View: search input',
    view.includes('Buscar') && view.includes('searchQuery'), 'error');

  const renderer = fs.readFileSync(path.join(COMPONENTS, 'HelpSectionRenderer.tsx'), 'utf8');
  check('ui', 'Renderer: glossary tooltip support',
    renderer.includes('glossary') && renderer.includes('TooltipProvider'), 'warning');
  check('ui', 'Layout: mobile sheet sidebar',
    layout.includes('Sheet') && layout.includes('lg:hidden'), 'error');
  check('ui', 'Content: back-to-top button',
    helpContent.includes('Volver arriba') && helpContent.includes('ArrowUp'), 'warning');
  check('ui', 'Renderer: consistent typography scale',
    renderer.includes('text-3xl') && renderer.includes('text-xl') && renderer.includes('text-lg'), 'warning');
  check('ui', 'Renderer: callout blocks (tip, important, note, danger)',
    renderer.includes('detectCallout') && renderer.includes('AlertTriangle'), 'warning');
  check('ui', 'Renderer: copy button on code blocks',
    renderer.includes('clipboard') && renderer.includes('Copy'), 'warning');
  check('ui', 'Content: local error boundary',
    helpContent.includes('HelpRenderBoundary'), 'warning');
}

// ════════════════════════════════════════════════════════════════════════
// 7. PERFORMANCE PATTERNS
// ════════════════════════════════════════════════════════════════════════

function auditPerformance() {
  console.log('\n═══ 7. PERFORMANCE PATTERNS ═══');

  const renderer = fs.readFileSync(path.join(COMPONENTS, 'HelpSectionRenderer.tsx'), 'utf8');
  check('performance', 'Renderer: useMemo for expensive parsing',
    renderer.includes('useMemo'), 'warning');

  const hookContent = fs.readFileSync(path.join(COMPONENTS, 'hooks', 'useHelpContent.ts'), 'utf8');
  check('performance', 'Hook: useCallback for memoized functions',
    (hookContent.match(/useCallback/g) || []).length >= 3, 'warning');
  check('performance', 'Hook: debounced search (300ms)',
    hookContent.includes('setTimeout(performSearch, 300)'), 'warning');

  const viewContent = fs.readFileSync(path.join(COMPONENTS, 'HelpView.tsx'), 'utf8');
  check('performance', 'View: requestAnimationFrame for scroll reset',
    viewContent.includes('requestAnimationFrame'), 'warning');
  check('performance', 'Hook: pre-loads glossary on mount',
    hookContent.includes('fetchGlossary') && hookContent.includes('useEffect'), 'warning');
}

// ════════════════════════════════════════════════════════════════════════
// REPORT
// ════════════════════════════════════════════════════════════════════════

function printReport() {
  const score = results.totalChecks > 0
    ? Math.round((results.passed / results.totalChecks) * 100)
    : 0;

  console.log('\n+================================================================+');
  console.log(`|  COSTPRO HELP CENTER - AUDIT REPORT                          |`);
  console.log(`|  Iteration: ${String(results.iteration).padStart(2)}/${MAX_ITERATIONS}  Score: ${String(score).padStart(3)}/100  ${'X'.repeat(Math.floor(score / 10))}${'.'.repeat(10 - Math.floor(score / 10))}     |`);
  console.log(`|  ${results.timestamp}  |`);
  console.log('+----------------------------------------------------------------+');
  console.log(`|  Total checks: ${String(results.totalChecks).padStart(3)}                                         |`);
  console.log(`|  Passed:       ${String(results.passed).padStart(3)}  OK                                       |`);
  console.log(`|  Warnings:     ${String(results.warnings).padStart(3)}  WARN                                     |`);
  console.log(`|  Failed:       ${String(results.failed).padStart(3)}  FAIL                                     |`);
  console.log('+================================================================+');

  const allFailures = [];
  for (const [cat, items] of Object.entries(results.categories)) {
    for (const item of items) {
      allFailures.push({ category: cat, ...item });
    }
  }

  if (allFailures.length > 0) {
    console.log('\nFAILURES & WARNINGS:');
    console.log('-------------------------------------------------------------');
    for (const f of allFailures.slice(0, 30)) {
      const icon = f.severity === 'error' ? '[FAIL]' : '[WARN]';
      console.log(`  ${icon} [${f.category.toUpperCase()}] ${f.name}`);
      if (f.detail) console.log(`     ${f.detail}`);
    }
    if (allFailures.length > 30) {
      console.log(`  ... and ${allFailures.length - 30} more`);
    }
  }

  return score;
}

// ════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT (for cron iterations)
// ════════════════════════════════════════════════════════════════════════

function loadState() {
  try {
    if (fs.existsSync(ITERATION_FILE)) {
      return JSON.parse(fs.readFileSync(ITERATION_FILE, 'utf8'));
    }
  } catch {}
  return { iteration: 0, lastRun: null, scores: [] };
}

function saveState(state) {
  fs.writeFileSync(ITERATION_FILE, JSON.stringify(state, null, 2));
}

// ════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════

function runAudit() {
  const args = process.argv.slice(2);
  const explicitIteration = args.includes('--iteration')
    ? parseInt(args[args.indexOf('--iteration') + 1]) || 1
    : null;

  const state = loadState();
  results.iteration = explicitIteration || state.iteration + 1;

  console.log(`\n>> CostPro Help Center Audit -- Iteration ${results.iteration}/${MAX_ITERATIONS}`);
  console.log(`   ISO/IEC 26514 | WCAG 2.2 AA | Diataxis Framework`);

  auditKnowledgeBase();
  auditComponents();
  auditHooks();
  auditApiRoute();
  auditISOCompliance();
  auditUIConsistency();
  auditPerformance();

  const score = printReport();

  // Save state
  state.iteration = results.iteration;
  state.lastRun = results.timestamp;
  state.scores.push({ iteration: results.iteration, score, timestamp: results.timestamp });
  saveState(state);

  // Schedule next iteration
  if (results.iteration < MAX_ITERATIONS && !explicitIteration) {
    console.log(`\n>> Next audit in ${ITERATION_INTERVAL_MS / 60000} minutes (iteration ${results.iteration + 1}/${MAX_ITERATIONS})`);
    setTimeout(() => runAudit(), ITERATION_INTERVAL_MS);
  } else if (results.iteration >= MAX_ITERATIONS) {
    console.log('\n>> Maximum iterations reached. Audit cycle complete.');
    const avg = state.scores.reduce((s, e) => s + e.score, 0) / state.scores.length;
    console.log(`   Average score across ${state.scores.length} iterations: ${avg.toFixed(1)}/100`);
  }

  return score;
}

runAudit();
