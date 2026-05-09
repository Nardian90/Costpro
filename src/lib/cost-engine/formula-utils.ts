import { Parser } from 'expr-eval';
import Decimal from 'decimal.js';

export const RESERVED_FORMULA_NAMES: ReadonlySet<string> = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'log', 'ln', 'sqrt', 'abs', 'ceil', 'floor', 'round',
  'max', 'min', 'pow', 'exp', 'random', 'sign', 'trunc',
  'typeof', 'constrain', 'map', 'lerp', 'clamp',
  'hypot', 'log2', 'log10', 'cbrt',
  'PI', 'E', 'e', 'i',
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'VH', 'BASE_TOTAL', 'COEF', 'QUANTITY', 'cantidad',
  'header', 'children', 'hijos',
  'ref', 'vh', 'pct', 'round2', 'sum', 'average',
  'valor', 'REDONDEO',
  'SUM_ANEXO', 'GET_ANEXO_FILA_DATO', 'GET_ANEXO_DATO', 'GET_FILA_DATO',
  'SUMA', 'SUM', 'PROMEDIO', 'MAX', 'MIN', 'PCT', 'ROUND2',
  'HIJOS', 'VALOR', 'PROR',
]);

export function getFormulaReferenceIssue(name: string): string | null {
  if (!name || !name.trim()) return 'El nombre no puede estar vacío.';
  const trimmed = name.trim();
  if (trimmed.length === 1) return `El identificador "${trimmed}" es demasiado corto (1 carácter).`;
  if (RESERVED_FORMULA_NAMES.has(trimmed) || RESERVED_FORMULA_NAMES.has(trimmed.toLowerCase())) {
    return `"${trimmed}" es una palabra reservada del motor de fórmulas.`;
  }
  return null;
}

export function createSafeParser(): Parser {
  const parser = new Parser();
  parser.functions.REDONDEO = (val: number, decimals: number = 2) =>
    new Decimal(val || 0).toDecimalPlaces(decimals).toNumber();
  parser.functions.round = parser.functions.REDONDEO;
  parser.functions.ROUND2 = (val: number) => new Decimal(val || 0).toDecimalPlaces(2).toNumber();
  parser.functions.SUMA = (...args: number[]) => args.reduce((a, b) => new Decimal(a || 0).add(b || 0).toNumber(), 0);
  parser.functions.SUM = parser.functions.SUMA;
  parser.functions.SI = (cond: unknown, t: unknown, f: unknown) => cond ? t : f;
  parser.functions.IF = parser.functions.SI;
  parser.functions.valor = (x: any) => x;
  return parser;
}

export function createSharedParser(): Parser {
    return createSafeParser();
}

export function translateFormulaFromSpanish(formula: string): string {
  if (!formula) return formula;
  const mapping: Record<string, string> = {
    'SUMA': 'sum',
    'SUM': 'sum',
    'REDONDEO': 'REDONDEO',
    'PROMEDIO': 'average',
    'MAX': 'max',
    'MIN': 'min',
    'PCT': 'pct',
    'ROUND2': 'round2',
    'HIJOS': 'children',
    'VALOR': 'valor',
    'PROR': 'pror',
  };
  let translated = formula;
  translated = translated.replace(/\b(vh|ref)\s*\(([^)]+)\)/gi, (match, fn, p1) => {
    const id = p1.trim().replace(/['"]/g, '');
    return `${fn.toLowerCase()}('${id}')`;
  });
  Object.entries(mapping).forEach(([spanish, english]) => {
    const regex = new RegExp(`\\b${spanish}\\b`, 'gi');
    translated = translated.replace(regex, english);
  });
  return translated;
}

export function smartTranslate(
  formula: string,
  knownIds: Set<string>,
  knownClasses: Set<string>,
  knownAnnexes: Set<string> = new Set()
): string {
  if (!formula) return '0';
  let translated = translateFormulaFromSpanish(formula);

  translated = translated.replace(/pror\s*\(\s*vh\s*\(\s*['"]?([^'"]+)['"]?\s*\)\s*\)/gi, (match, id) => {
    return `(VH / vh('${id.trim()}')) * ref('${id.trim()}')`;
  });

  const placeholders: string[] = [];
  const phKey = (i: number) => `__PH${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}__`;

  if (knownAnnexes.size > 0) {
    const sortedAnnexes = Array.from(knownAnnexes).sort((a, b) => b.length - a.length);
    const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const idTokenRegex = /\b([a-zA-Z0-9]+)\b/g;
    translated = translated.replace(idTokenRegex, (match, id) => {
      const normId = normalize(id);
      const found = sortedAnnexes.find(a => {
          const na = normalize(a);
          return na === normId || `anexo${na}` === normId;
      });
      if (found) return `SUM_ANEXO('${found}')`;
      return match;
    });
  }

  let prevLength = 0;
  while (translated.length !== prevLength) {
    prevLength = translated.length;
    translated = translated.replace(
      /\b(ref|vh)\s*\('([^']+?)'\)/gi,
      (match) => {
        if (match.includes('__PH')) return match;
        placeholders.push(match);
        return phKey(placeholders.length - 1);
      }
    );
  }

  translated = translated.replace(/\bvalor\s*\(([^)]+)\)/gi, (_match, content) => {
    if (content.includes('__PH')) return _match;
    placeholders.push(content);
    return `valor(${phKey(placeholders.length - 1)})`;
  });

  const tokenRegex = /(?<![*/+\-\.\(d])(\d+(?:\.\d+)?)(?![*/+\-\.\)d])/g;
  translated = translated.replace(tokenRegex, (match) => {
    if (knownIds.has(match) || knownClasses.has(match)) {
      return `ref('${match}')`;
    }
    return match;
  });

  for (let i = placeholders.length - 1; i >= 0; i--) {
    translated = translated.replace(new RegExp(phKey(i), 'g'), placeholders[i]);
  }
  return translated;
}

export function evaluateAnnexExpressionShared(
    expression: string,
    row: Record<string, any>,
    header: any,
    annexes: any[],
    parser: Parser,
    warnings: any[]
): any {
    try {
        const formula = expression.startsWith('=') ? expression.substring(1) : expression;
        const expr = parser.parse(formula);
        const context = { ...row, header };
        return expr.evaluate(context);
    } catch (e) {
        return 0;
    }
}

export function evaluateHeaderExpressionShared(
    expression: string,
    header: any,
    annexes: any[],
    meta: any,
    parser: Parser
): any {
    try {
        const formula = expression.startsWith('=') ? expression.substring(1) : expression;
        const expr = parser.parse(formula);
        const context = { ...header, ...meta };
        return expr.evaluate(context);
    } catch (e) {
        return expression;
    }
}
