'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Info,
  CheckCircle2,
  Lightbulb,
  XCircle,
  Copy,
  ArrowRight,
  BookA,
  Check,
  Minus,
} from 'lucide-react';

interface HelpSectionRendererProps {
  content: string;
  glossary?: Record<string, string>;
}

// ── HelpTable: rediseño mobile-first de tablas markdown ────────────────────
//
// FIX-HELP-TABLES (2026-07-04): antes las tablas usaban overflow-x-auto que
// en mobile rompía la UX (scroll horizontal, texto ilegible). Ahora:
//
// 1. Detecta si es "tabla de permisos" (celdas con ✅/❌/—/✓/✗ solo) →
//    renderiza como matriz visual con checks grandes y coloridos.
// 2. En mobile: cards apiladas (cada fila = una card con su label + grid
//    de checks por rol).
// 3. En desktop: tabla con mejor contraste, bordes laterales, hover.
// 4. Headers sticky en desktop para tablas largas.
// 5. Texto justificado solo en párrafos, no en celdas.

/** Detecta si una celda es un "check" (✅, ✓, yes, sí) o "no" (❌, ✗, —, -, no). */
function parseCheckCell(text: string): { type: 'yes' | 'no' | 'partial' | 'text'; value: string } | null {
  const t = text.trim().toLowerCase();
  if (t === '✅' || t === '✓' || t === 'yes' || t === 'sí' || t === 'si') {
    return { type: 'yes', value: text };
  }
  if (t === '❌' || t === '✗' || t === 'no' || t === 'x') {
    return { type: 'no', value: text };
  }
  if (t === '—' || t === '-' || t === '' || t === 'n/a') {
    return { type: 'no', value: '—' };
  }
  if (t.startsWith('✅') || t.startsWith('✓')) {
    // Caso "✅ (propias)" o "✅ (lectura)" — permiso parcial/condicional
    return { type: 'partial', value: text };
  }
  return null; // texto normal, no es check
}

/** Extrae texto plano de un nodo React (para detectar checks). */
function extractText(node: React.ReactNode): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    return extractText((node.props as any).children);
  }
  return '';
}

interface ParsedTable {
  headers: string[];
  rows: React.ReactNode[][];
  isPermissionsTable: boolean;
}

/** Parsea el children de un <table> de react-markdown a headers + rows. */
function parseTableNode(tableChildren: React.ReactNode): ParsedTable | null {
  // react-markdown pasa thead > tr > th y tbody > tr > td como children
  const headers: string[] = [];
  const rows: React.ReactNode[][] = [];
  let isPermissionsTable = false;
  let checkCellCount = 0;
  let totalDataCells = 0;

  React.Children.forEach(tableChildren, (child) => {
    if (!React.isValidElement(child)) return;
    const tag = (child.type as any);
    // thead
    if (tag === 'thead') {
      React.Children.forEach((child.props as any).children, (trChild) => {
        if (React.isValidElement(trChild) && (trChild.type as any) === 'tr') {
          React.Children.forEach((trChild.props as any).children, (thChild) => {
            if (React.isValidElement(thChild) && ((thChild.type as any) === 'th' || (thChild.type as any) === 'td')) {
              headers.push(extractText((thChild.props as any).children).trim());
            }
          });
        }
      });
    }
    // tbody (a veces react-markdown no envuelve en tbody)
    if (tag === 'tbody' || tag === 'thead') {
      React.Children.forEach((child.props as any).children, (trChild) => {
        if (React.isValidElement(trChild) && (trChild.type as any) === 'tr') {
          const row: React.ReactNode[] = [];
          React.Children.forEach((trChild.props as any).children, (cellChild) => {
            if (React.isValidElement(cellChild) && ((cellChild.type as any) === 'td' || (cellChild.type as any) === 'th')) {
              const cellChildren = (cellChild.props as any).children;
              row.push(cellChildren);
              // Detectar si es check
              const text = extractText(cellChildren);
              if (parseCheckCell(text)) {
                checkCellCount++;
              }
              totalDataCells++;
            }
          });
          if (row.length > 0) rows.push(row);
        }
      });
    }
  });

  // Es tabla de permisos si >50% de las celdas (excluyendo la primera columna)
  // son checks, y hay al menos 2 columnas de datos
  if (headers.length >= 3 && rows.length > 0) {
    const dataCellCount = totalDataCells - rows.length; // restamos primera columna
    if (dataCellCount > 0 && checkCellCount / dataCellCount > 0.5) {
      isPermissionsTable = true;
    }
  }

  return { headers, rows, isPermissionsTable };
}

/** Renderiza un check cell (✅/❌/—) como icono visual grande. */
function CheckCell({ type, value }: { type: 'yes' | 'no' | 'partial' | 'text'; value: string }) {
  if (type === 'yes') {
    return (
      <div className="flex items-center justify-center" title={value}>
        <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
        </div>
      </div>
    );
  }
  if (type === 'partial') {
    // "✅ (propias)" — permiso con condición
    const condition = value.replace(/^[✅✓]\s*/, '').trim();
    return (
      <div className="flex items-center justify-center" title={value}>
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
            <Check className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeWidth={3} />
          </div>
          {condition && (
            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider leading-none text-center max-w-[80px]">
              {condition}
            </span>
          )}
        </div>
      </div>
    );
  }
  if (type === 'no') {
    return (
      <div className="flex items-center justify-center" title={value}>
        <div className="w-6 h-6 rounded-md bg-muted/30 flex items-center justify-center">
          <Minus className="w-4 h-4 text-muted-foreground/50" strokeWidth={2.5} />
        </div>
      </div>
    );
  }
  // text
  return <span className="text-sm font-medium text-foreground">{value}</span>;
}

/** Renderiza tabla de permisos en mobile como cards apiladas. */
function PermissionsTableMobile({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  const roles = headers.slice(1); // primera columna es "Permiso"
  return (
    <div className="sm:hidden space-y-3">
      {rows.map((row, rowIdx) => {
        const label = extractText(row[0]);
        return (
          <div key={rowIdx} className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            {/* Header de la card: nombre del permiso */}
            <div className="px-4 py-3 bg-muted/30 border-b border-border/40">
              <p className="text-sm font-black text-foreground leading-tight">{label}</p>
            </div>
            {/* Grid de roles con sus checks */}
            <div className="grid grid-cols-2 gap-px bg-border/30">
              {roles.map((role, colIdx) => {
                const cellValue = extractText(row[colIdx + 1] ?? '');
                const parsed = parseCheckCell(cellValue);
                return (
                  <div key={colIdx} className="bg-card px-3 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                      {role}
                    </span>
                    {parsed ? (
                      <CheckCell type={parsed.type} value={parsed.value} />
                    ) : (
                      <span className="text-xs text-foreground">{cellValue}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Renderiza tabla de permisos en desktop como matriz visual. */
function PermissionsTableDesktop({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  const roles = headers.slice(1);
  return (
    <div className="hidden sm:block overflow-x-auto rounded-xl border border-border/50 shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/40 border-b-2 border-border/60">
            <th className="px-4 py-3.5 text-left text-[11px] font-black uppercase tracking-widest text-foreground sticky left-0 bg-muted/40 z-10 min-w-[200px]">
              {headers[0]}
            </th>
            {roles.map((role, i) => (
              <th key={i} className="px-3 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground min-w-[80px]">
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className={cn('border-b border-border/20 transition-colors', rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
              <td className="px-4 py-3 text-left text-sm font-bold text-foreground sticky left-0 z-10 min-w-[200px]" style={{ background: rowIdx % 2 === 0 ? 'var(--background)' : 'var(--muted-2)' }}>
                {extractText(row[0])}
              </td>
              {roles.map((_, colIdx) => {
                const cellValue = extractText(row[colIdx + 1] ?? '');
                const parsed = parseCheckCell(cellValue);
                return (
                  <td key={colIdx} className="px-3 py-3 text-center">
                    {parsed ? (
                      <CheckCell type={parsed.type} value={parsed.value} />
                    ) : (
                      <span className="text-xs text-foreground">{cellValue}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tabla genérica (no de permisos) con mejor contraste mobile-first. */
function GenericTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-8">
      {/* Mobile: cards apiladas */}
      <div className="sm:hidden space-y-3">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            {headers.map((header, colIdx) => {
              const cellValue = row[colIdx];
              const cellText = extractText(cellValue);
              return (
                <div key={colIdx} className={cn(
                  'flex gap-3 px-4 py-2.5',
                  colIdx > 0 && 'border-t border-border/20'
                )}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0 w-24">
                    {header}
                  </span>
                  <span className="text-sm font-medium text-foreground flex-1 break-words">
                    {cellValue ?? cellText}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {/* Desktop: tabla tradicional mejorada */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border/50 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/40 border-b-2 border-border/60">
              {headers.map((header, i) => (
                <th key={i} className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-foreground">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className={cn('border-b border-border/20 transition-colors hover:bg-primary/5', rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/15')}>
                {row.map((cell, colIdx) => (
                  <td key={colIdx} className="px-5 py-3.5 text-sm font-medium text-foreground/90 leading-relaxed align-top">
                    {cell ?? extractText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Componente principal de tabla — detecta tipo y renderiza accordingly. */
function HelpTable({ children }: { children?: React.ReactNode }) {
  const parsed = useMemo(() => parseTableNode(children), [children]);
  if (!parsed || parsed.headers.length === 0) {
    // Fallback: tabla nativa si no podemos parsear
    return (
      <div className="overflow-x-auto my-8 rounded-xl border border-border/40 shadow-sm">
        <table className="w-full text-left">{children}</table>
      </div>
    );
  }

  if (parsed.isPermissionsTable) {
    return (
      <div className="my-8">
        <PermissionsTableMobile headers={parsed.headers} rows={parsed.rows} />
        <PermissionsTableDesktop headers={parsed.headers} rows={parsed.rows} />
      </div>
    );
  }

  return <GenericTable headers={parsed.headers} rows={parsed.rows} />;
}

// ── Callout Detection ──────────────────────────────────────────────────────

function detectCallout(text: string): { type: string; label: string; icon: React.ElementType; color: string } | null {
  const lower = text.trimStart().toLowerCase();
  if (lower.startsWith('**tip:**') || lower.startsWith('**💡 tip:**') || lower.startsWith('**consejo:**')) {
    return { type: 'tip', label: 'Consejo', icon: Lightbulb, color: 'text-warning dark:text-amber-400 border-warning/30 bg-warning/5' };
  }
  if (lower.startsWith('**importante:**') || lower.startsWith('**⚠️ importante:**') || lower.startsWith('**⚠ importante:**')) {
    return { type: 'important', label: 'Importante', icon: AlertTriangle, color: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/5' };
  }
  if (lower.startsWith('**nota:**') || lower.startsWith('**ℹ️ nota:**') || lower.startsWith('**note:**')) {
    return { type: 'note', label: 'Nota', icon: Info, color: 'text-primary dark:text-blue-400 border-primary/30 bg-primary/5' };
  }
  if (lower.startsWith('**danger:**') || lower.startsWith('**❌ danger:**') || lower.startsWith('**🚫 danger:**')) {
    return { type: 'danger', label: 'Peligro', icon: XCircle, color: 'text-destructive dark:text-red-400 border-destructive/30 bg-destructive/5' };
  }
  if (lower.startsWith('**success:**') || lower.startsWith('**✅ success:**') || lower.startsWith('**check:**') || lower.startsWith('**check:**')) {
    return { type: 'success', label: 'Completado', icon: CheckCircle2, color: 'text-success dark:text-emerald-400 border-success/30 bg-success/5' };
  }
  return null;
}

// ── Glossary Detector ───────────────────────────────────────────────────────

interface GlossaryEntry {
  term: string;
  definition: string;
}

interface GlossarySection {
  heading: string;
  entries: GlossaryEntry[];
}

/**
 * Detects if the content is a glossary (has 3+ entries matching **Term**: definition pattern).
 * Supports ### Section headings to group entries thematically.
 */
function parseGlossary(content: string): {
  isGlossary: boolean;
  sections: GlossarySection[];
  preContent: string;
  postContent: string;
  totalEntries: number;
} {
  const lines = content.split('\n');
  const sections: GlossarySection[] = [];
  let preContent = '';
  let postContent = '';
  let inGlossary = false;
  let glossaryStarted = false;
  let glossaryEnded = false;
  const preLines: string[] = [];
  const postLines: string[] = [];
  let currentSection: GlossarySection = { heading: '', entries: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip title (h1) and blank lines before glossary entries
    if (!glossaryStarted && (trimmed === '' || /^#{1,2}\s/.test(trimmed))) {
      preLines.push(line);
      continue;
    }

    // Detect ### Section headings within glossary
    const sectionMatch = trimmed.match(/^###\s+(.+)/);
    if (sectionMatch && (glossaryStarted || !glossaryEnded)) {
      if (currentSection.entries.length > 0 || currentSection.heading) {
        sections.push({ ...currentSection });
      }
      currentSection = { heading: sectionMatch[1].trim(), entries: [] };
      if (!glossaryStarted) {
        glossaryStarted = true;
        inGlossary = true;
      }
      continue;
    }

    // Detect glossary entry **Term**: Definition
    const match = trimmed.match(/^\*\*(.+?)\*\*:\s*(.+)/);
    if (match && !glossaryEnded) {
      if (!glossaryStarted) {
        glossaryStarted = true;
        inGlossary = true;
      }
      if (inGlossary) {
        currentSection.entries.push({ term: match[1].trim(), definition: match[2].trim() });
        continue;
      }
    }

    // If we were in glossary and hit a non-entry, non-blank, non-section line, glossary ended
    if (inGlossary && !match && !sectionMatch && trimmed !== '' && !trimmed.startsWith('>') && !trimmed.startsWith('---')) {
      inGlossary = false;
      glossaryEnded = true;
      postLines.push(line);
      continue;
    }

    if (inGlossary && trimmed === '') continue;
    if (glossaryEnded) postLines.push(line);
    else preLines.push(line);
  }

  // Push last section
  if (currentSection.entries.length > 0 || currentSection.heading) {
    sections.push(currentSection);
  }

  preContent = preLines.join('\n').trim();
  postContent = postLines.join('\n').trim();

  const totalEntries = sections.reduce((sum, s) => sum + s.entries.length, 0);

  return {
    isGlossary: totalEntries >= 3,
    sections,
    preContent,
    postContent,
    totalEntries,
  };
}

// ── Glossary Card Component ──────────────────────────────────────────────────

function GlossaryCard({ entry, index, glossaryTooltip }: { entry: GlossaryEntry; index: number; glossaryTooltip: (text: string) => React.ReactNode }) {
  const isEven = index % 2 === 0;

  return (
    <div className={cn(
      "group relative rounded-xl p-5 transition-all duration-200",
      "hover:shadow-md hover:border-primary/20",
      isEven
        ? "bg-muted/20 border border-border/30"
        : "bg-background border border-border/20"
    )}>
      {/* Accent bar */}
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-primary/20 group-hover:bg-primary/40 transition-colors" />

      <dt className="flex items-start gap-2 mb-2">
        <BookA className="w-4 h-4 text-primary/60 mt-0.5 shrink-0" />
        <h4 className="text-sm font-bold tracking-tight text-foreground">
          {entry.term}
        </h4>
      </dt>
      <dd className="text-[13px] leading-[1.8] font-medium text-muted-foreground pl-6 text-justify hyphens-auto">
        {glossaryTooltip(entry.definition)}
      </dd>
    </div>
  );
}

// ── TOC Detector ──────────────────────────────────────────────────────────

/**
 * Detects a TOC section: ## Contenido / ## Tabla de Contenido / ## Índice
 * followed by only link list items `- [text](#anchor)`.
 * Returns { isToc, preContent, tocContent, postContent }
 */
function parseTocSection(content: string) {
  const lines = content.split('\n');
  const tocHeadings = /^(##+)\s+(contenido|tabla de contenido|índice|table of contents|index)/i;

  let tocStartIdx = -1;
  let tocEndIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (tocStartIdx === -1 && tocHeadings.test(lines[i].trim())) {
      tocStartIdx = i;
      continue;
    }
    if (tocStartIdx !== -1) {
      const trimmed = lines[i].trim();
      // End of TOC: next heading, blank line followed by non-list, or non-list content
      if (/^#{1,2}\s+(?!\[-)/.test(trimmed) && !trimmed.startsWith('- ')) {
        tocEndIdx = i;
        break;
      }
      if (trimmed !== '' && !trimmed.startsWith('- ') && !trimmed.startsWith('  - ')) {
        tocEndIdx = i;
        break;
      }
    }
  }

  if (tocStartIdx === -1) return { isToc: false, preContent: content, tocContent: '', postContent: '' };
  if (tocEndIdx === -1) tocEndIdx = lines.length;

  return {
    isToc: true,
    preContent: lines.slice(0, tocStartIdx).join('\n').trim(),
    tocContent: lines.slice(tocStartIdx, tocEndIdx).join('\n').trim(),
    postContent: lines.slice(tocEndIdx).join('\n').trim(),
  };
}

// ── Styled TOC Component ────────────────────────────────────────────────────

function StyledTableOfContents({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  const items: { text: string; href: string; depth: number }[] = [];

  for (const line of lines) {
    // Match `- [text](#anchor)` at depth 0 or 2 spaces (sub-items)
    const match = line.match(/^(- |  - )\[(.+?)\]\((.+?)\)/);
    if (match) {
      const depth = line.startsWith('  -') ? 1 : 0;
      items.push({ text: match[2].trim(), href: match[3], depth });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="my-10 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 to-primary/2 overflow-hidden">
      {/* TOC Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-primary/10 bg-primary/5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Índice</h3>
          <p className="text-[10px] font-medium text-muted-foreground/60 mt-0.5">Navega por las secciones de este documento</p>
        </div>
        <div className="ml-auto px-2.5 py-1 rounded-full bg-primary/10 text-[9px] font-bold text-primary">
          {items.length} secciones
        </div>
      </div>

      {/* TOC Items */}
      <div className="px-4 py-4">
        <div className="space-y-0.5">
          {items.map((item, idx) => (
            <a
              key={`${item.href}-${idx}`}
              href={`#${item.href}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(item.href);
                if (el) {
                  // Find the scrollable main container
                  const scrollMain = el.closest('main.overflow-y-auto');
                  if (scrollMain) {
                    const mainRect = scrollMain.getBoundingClientRect();
                    const elRect = el.getBoundingClientRect();
                    const offset = elRect.top - mainRect.top + scrollMain.scrollTop - 80;
                    scrollMain.scrollTo({ top: offset, behavior: 'smooth' });
                  } else {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }
              }}
              className={cn(
                'group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 hover:bg-primary/8',
                item.depth === 0
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground font-medium pl-10',
              )}
            >
              {item.depth === 0 && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors shrink-0" />
              )}
              {item.depth === 1 && (
                <div className="w-1 h-1 rounded-full bg-muted-foreground/30 group-hover:bg-primary/60 transition-colors shrink-0" />
              )}
              <span className="truncate flex-1 group-hover:text-primary transition-colors">{item.text}</span>
              <ArrowRight className="w-3 h-3 text-primary/0 group-hover:text-primary/60 transition-all -translate-x-1 group-hover:translate-x-0 shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function HelpSectionRenderer({ content, glossary }: HelpSectionRendererProps) {
  // ── Defensive: ensure content is always a string ──
  const safeContent = typeof content === 'string' ? content : (content != null ? String(content) : '');

  // Detect if content is a glossary with thematic sections
  const parsed = useMemo(() => parseGlossary(safeContent), [safeContent]);
  const tocParsed = useMemo(() => parseTocSection(safeContent), [safeContent]);

  const renderTextWithGlossary = (text: string) => {
    if (!glossary || Object.keys(glossary).length === 0) return text;

    const sortedTerms = Object.keys(glossary).sort((a, b) => b.length - a.length);
    const escapedTerms = sortedTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');

    const parts = text.split(pattern);
    if (parts.length === 1) return text;

    const result: React.ReactNode[] = [];

    parts.forEach((part, i) => {
      const lowerPart = part.toLowerCase();
      if (glossary[lowerPart]) {
        result.push(
          <TooltipProvider key={i}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help border-b border-primary/30 text-primary font-semibold hover:bg-primary/5 transition-colors px-0.5 rounded">
                  {part}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-4 rounded-xl bg-card border border-primary/15 shadow-xl">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary">Glosario</p>
                  <p className="text-xs font-medium text-foreground leading-relaxed">{glossary[lowerPart]}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      } else {
        result.push(part);
      }
    });

    return <>{result}</>;
  };

  // ── Glossary Renderer (with thematic sections) ──
  if (parsed.isGlossary) {
    const headerContent = parsed.preContent ? (
      <div className="mb-8">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ node, ...props }) => (
              <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight text-foreground mb-4 pb-6 border-b border-border/30" {...props} />
            ),
            p: ({ node, ...props }) => (
              <p className="text-[14px] leading-[1.8] font-medium text-muted-foreground mb-6 text-justify hyphens-auto" {...props} />
            ),
          }}
        >
          {sanitizeHtml(parsed.preContent)}
        </ReactMarkdown>
      </div>
    ) : null;

    const hasSections = parsed.sections.some(s => s.heading);
    let globalIndex = 0;

    return (
      <article className="max-w-none">
        {headerContent}

        {/* Glossary stats */}
        <div className="flex items-center gap-3 mb-8">
          <div className="px-3 py-1.5 rounded-lg bg-primary/8 border border-primary/15 text-[10px] font-bold uppercase tracking-widest text-primary">
            {parsed.totalEntries} terminos
          </div>
          {hasSections && (
            <div className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border/30 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {parsed.sections.filter(s => s.heading).length} secciones
            </div>
          )}
          <div className="h-px flex-1 bg-border/20" />
        </div>

        {/* Glossary sections */}
        {parsed.sections.map((section, si) => (
          <div key={section.heading || `section-${si}`} className={cn(si > 0 && 'mt-10')}>
            {section.heading && (
              <div className="flex items-center gap-3 mb-5 pb-3 border-b border-border/20">
                <div className="w-2 h-2 rounded-full bg-primary/50" />
                <h3 className="text-sm font-black uppercase tracking-[0.15em] text-foreground">{section.heading}</h3>
                <div className="ml-auto px-2 py-0.5 rounded text-[9px] font-bold text-muted-foreground/50 bg-muted/30">
                  {section.entries.length}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {section.entries.map((entry) => {
                const idx = globalIndex++;
                return (
                  <GlossaryCard
                    key={entry.term}
                    entry={entry}
                    index={idx}
                    glossaryTooltip={renderTextWithGlossary}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Render any post-content as regular markdown */}
        {parsed.postContent && (
          <div className="mt-10 pt-8 border-t border-border/30">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ node, ...props }) => (
                  <p className="text-[14px] leading-[1.8] font-medium text-muted-foreground text-justify hyphens-auto mb-6" {...props} />
                ),
                blockquote: ({ node, children, ...props }: any) => {
                  const textContent = React.Children.toArray(children)
                    .map(c => typeof c === 'string' ? c : '')
                    .join('');
                  const callout = detectCallout(textContent);
                  if (callout) {
                    const IconComp = callout.icon;
                    return (
                      <div className={cn("mt-6 rounded-xl border-l-4 px-6 py-4", callout.color)} {...props}>
                        <div className="flex items-start gap-3">
                          <IconComp className="w-4 h-4 mt-0.5 shrink-0" />
                          <div className="flex-1 text-[14px] font-medium leading-[1.8] italic text-foreground/80 text-justify">
                            {children}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <blockquote className="border-l-4 border-primary/30 bg-primary/3 rounded-r-xl px-6 py-5 not-italic" {...props}>
                      <div className="text-[14px] font-medium leading-[1.8] italic text-muted-foreground/80 text-justify">{children}</div>
                    </blockquote>
                  );
                },
              }}
            >
              {sanitizeHtml(parsed.postContent)}
            </ReactMarkdown>
          </div>
        )}
      </article>
    );
  }

  // ── Standard Markdown Renderer (possibly with extracted TOC) ──
  const mainContent = tocParsed.isToc
    ? (typeof tocParsed.postContent === 'string' ? tocParsed.postContent : '')
    : safeContent;

  return (
    <article className="max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── HEADINGS ──────────────────────────────────────────────────
          h1: ({ node, ...props }) => {
            const text = props.children?.toString().toLowerCase().replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-') || '';
            return (
              <h1
                id={text}
                className="text-3xl md:text-4xl font-black tracking-tight leading-tight text-foreground mb-8 pb-6 border-b border-border/30 scroll-mt-4"
                {...props}
              />
            );
          },
          h2: ({ node, ...props }) => {
            const text = props.children?.toString().toLowerCase().replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-') || '';
            return (
              <h2
                id={text}
                className="group flex items-center gap-3 text-xl md:text-2xl font-black tracking-tight text-foreground mt-14 mb-8 pt-6 border-t border-dashed border-border/40 scroll-mt-4"
                {...props}
              >
                <div className="w-1 h-7 rounded-full bg-primary/25 group-hover:bg-primary/50 transition-colors shrink-0" />
                <span className="leading-tight">{props.children}</span>
              </h2>
            );
          },
          h3: ({ node, ...props }) => {
            const text = props.children?.toString().toLowerCase().replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-') || '';
            return (
              <h3
                id={text}
                className="group flex items-center gap-2 text-lg font-bold tracking-tight text-foreground mt-10 mb-5 scroll-mt-4"
                {...props}
              >
                <div className="w-0.5 h-5 rounded-full bg-primary/20 group-hover:bg-primary/40 transition-colors shrink-0" />
                <span className="leading-tight">{props.children}</span>
              </h3>
            );
          },
          h4: ({ node, ...props }) => {
            const text = props.children?.toString().toLowerCase().replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-') || '';
            return (
              <h4
                id={text}
                className="group flex items-center gap-2 text-base font-semibold tracking-tight text-foreground mt-8 mb-4 scroll-mt-4"
                {...props}
              >
                <div className="w-0.5 h-4 rounded-full bg-primary/15 group-hover:bg-primary/30 transition-colors shrink-0" />
                <span className="leading-tight">{props.children}</span>
              </h4>
            );
          },

          // ── PARAGRAPHS — Professional documentation style ─────────────
          // FIX-HELP-READABILITY (2026-07-04): en mobile el texto de 14px con
          // leading 1.8 es muy denso. Subimos a 15px en mobile, mantenemos
          // 14px en desktop. Color foreground/80 en vez de muted-foreground
          // para mayor contraste WCAG AA. Eliminado text-justify (mejor
          // left-align en mobile para lectura cómoda).
          p: ({ node, children, ...props }) => {
            const processedChildren = React.Children.map(children, child => {
              if (typeof child === 'string') {
                return renderTextWithGlossary(child);
              }
              return child;
            });
            return (
              <p
                className="text-[15px] sm:text-[14px] leading-[1.75] font-medium text-foreground/80 mb-6 hyphens-auto indent-0"
                {...props}
              >
                {processedChildren}
              </p>
            );
          },

          // ── STRONG / EMPHASIS ──────────────────────────────────────────
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-foreground" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic text-foreground/90" {...props} />
          ),

          // ── TABLES — rediseño mobile-first (FIX-HELP-TABLES) ─────────
          // Antes: overflow-x-auto con celdas densas y texto justificado.
          // Ahora: HelpTable detecta tablas de permisos (✅/❌/—) y renderiza
          // como matriz visual en desktop + cards apiladas en mobile.
          table: ({ node, ...props }) => (
            <HelpTable {...props} />
          ),
          thead: ({ node, ...props }) => <thead {...props} />,
          tbody: ({ node, ...props }) => <tbody {...props} />,
          tr: ({ node, ...props }) => <tr {...props} />,
          th: ({ node, ...props }) => <th {...props} />,
          td: ({ node, ...props }) => <td {...props} />,

          // ── BLOCKQUOTES / CALLOUTS ────────────────────────────────────
          // FIX-HELP-CALLOUTS (2026-07-04): callouts más visuales en mobile
          // con icono más grande, padding más generoso, y label visible.
          blockquote: ({ node, children, ...props }: any) => {
            const textContent = React.Children.toArray(children)
              .map(c => typeof c === 'string' ? c : '')
              .join('');
            const callout = detectCallout(textContent);

            if (callout) {
              const IconComp = callout.icon;
              return (
                <div className={cn(
                  "my-6 sm:my-8 rounded-xl border-l-4 px-4 sm:px-6 py-4 sm:py-5 shadow-sm",
                  callout.color
                )} {...props}>
                  <div className="flex items-start gap-3">
                    <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", callout.color.split(' ').find(c => c.startsWith('bg-')))}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="flex-1 text-[14px] sm:text-[14px] font-medium leading-[1.7] text-foreground/85 hyphens-auto">
                      {/* Quitar el prefijo "**Tip:**" etc. del contenido renderizado */}
                      {(() => {
                        const childArray = React.Children.toArray(children);
                        // El primer child suele ser <p>**Tip:** ...</p> — lo limpiamos
                        return childArray.map((child, idx) => {
                          if (idx === 0 && React.isValidElement(child) && (child.type as any) === 'p') {
                            const cleanedText = React.Children.toArray((child.props as any).children)
                              .map(c => {
                                if (typeof c === 'string') {
                                  // Quitar "**Tip:**", "**Importante:**", etc. del inicio
                                  return c.replace(/^\s*\*\*(tip|importante|nota|danger|consejo|warning|💡|⚠️?|ℹ️|❌|🚫)\s*:?\s*\*\*\s*/i, '');
                                }
                                return c;
                              });
                            return React.cloneElement(child, {} as any, ...cleanedText);
                          }
                          return child;
                        });
                      })()}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <blockquote className="border-l-4 border-primary/30 bg-primary/3 rounded-r-xl px-4 sm:px-6 py-4 sm:py-5 my-6 sm:my-8 not-italic shadow-sm" {...props}>
                <div className="text-[14px] font-medium leading-[1.8] italic text-muted-foreground/80 text-justify hyphens-auto">
                  {children}
                </div>
              </blockquote>
            );
          },

          // ── CODE ─────────────────────────────────────────────────────
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline || !className) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-muted/60 border border-border/30 font-bold text-xs text-primary"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("rounded-lg font-mono text-xs", className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node, children, ...props }) => (
            <div className="relative group my-8">
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button type="button"
                  onClick={(e) => {
                    const container = (e.currentTarget as HTMLElement).closest('pre');
                    const codeEl = container?.querySelector('code');
                    if (codeEl) navigator.clipboard.writeText(codeEl.textContent || '');
                  }}
                  className="w-7 h-7 rounded-md bg-muted/80 border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <pre
                className="rounded-xl bg-muted/50 border border-border/40 p-5 overflow-x-auto shadow-sm text-xs leading-[1.8]"
                {...props}
              >
                {children}
              </pre>
            </div>
          ),

          // ── LISTS — Professional item rendering with justify ─────────
          ul: ({ node, ...props }) => (
            <ul className="space-y-3 my-8 list-none pl-0" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="space-y-3 my-8 list-none pl-0" {...props} />
          ),
          li: ({ node, index, children, ...props }: any) => {
            const isOrdered = node?.parent?.type === 'list' && node?.parent?.ordered;
            return (
              <li className="flex items-start gap-3" {...props}>
                {isOrdered ? (
                  <span className="mt-1 w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-black text-primary shrink-0">
                    {(index ?? 0) + 1}
                  </span>
                ) : (
                  <div className="mt-2 w-2 h-2 rounded-full bg-primary/40 shrink-0" />
                )}
                {/* Use div (block-level) so text-justify works correctly */}
                <div className="flex-1 text-[14px] font-medium leading-[1.8] text-muted-foreground text-justify hyphens-auto">
                  {children}
                </div>
              </li>
            );
          },

          // ── HORIZONTAL RULE ──────────────────────────────────────────
          hr: ({ node, ...props }) => (
            <hr className="my-12 border-border/20" {...props} />
          ),

          // ── LINKS ───────────────────────────────────────────────────
          a: ({ node, children, ...props }) => (
            <a
              className="text-primary font-semibold hover:underline inline-flex items-center gap-1 transition-colors"
              {...props}
            >
              {children}
              <ArrowRight className="w-3 h-3" />
            </a>
          ),

          // ── IMAGES ────────────────────────────────────────────────────
          img: ({ node, ...props }) => (
            <figure className="my-8">
              <img
                className="rounded-xl border border-border/40 shadow-sm max-w-full"
                {...props}
                alt={props.alt || ''}
              />
            </figure>
          ),
        }}
      >
        {sanitizeHtml(String(mainContent ?? ''))}
      </ReactMarkdown>

      {/* TOC section extracted and removed from content — available via sidebar */}
    </article>
  );
}
