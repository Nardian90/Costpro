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

  parser.functions.REDONDEO = (val: any, decimals: any = 2) =>
    new Decimal(val || 0).toDecimalPlaces(Number(decimals)).toNumber();
  parser.functions.round = parser.functions.REDONDEO;
  parser.functions.ROUND2 = (val: any) => new Decimal(val || 0).toDecimalPlaces(2).toNumber();
  parser.functions.round2 = parser.functions.ROUND2;

  parser.functions.SUMA = (...args: any[]) => args.reduce((a, b) => new Decimal(a || 0).add(new Decimal(b || 0)).toNumber(), 0);
  parser.functions.SUM = parser.functions.SUMA;
  parser.functions.sum = parser.functions.SUMA;

  parser.functions.SI = (cond: unknown, t: unknown, f: unknown) => cond ? t : f;
  parser.functions.IF = parser.functions.SI;
  parser.functions.if = parser.functions.SI;

  parser.functions.valor = (x: any) => x;
  parser.functions.pct = (val: any, p: any) => new Decimal(val || 0).times(new Decimal(p || 0)).dividedBy(100).toNumber();

  parser.functions.average = (...args: any[]) => {
      if (args.length === 0) return 0;
      const sum = args.reduce((a, b) => new Decimal(a || 0).add(new Decimal(b || 0)).toNumber(), 0);
      return new Decimal(sum).dividedBy(args.length).toNumber();
  };

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
  knownAnnexes: string[] = []
): string {
  if (!formula) return '0';
  let translated = formula.trim();
  if (translated.startsWith('=')) translated = translated.substring(1);
  translated = translateFormulaFromSpanish(translated);

  translated = translated.replace(/pror\s*\(\s*vh\s*\(\s*['"]?([^'"]+)['"]?\s*\)\s*\)/gi, (match, id) => {
    return `(VH / vh('${id.trim()}')) * ref('${id.trim()}')`;
  });

  const placeholders: string[] = [];
  const phKey = (i: number) => `__PH${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}__`;

  // Protect calls
  let prevLength = 0;
  while (translated.length !== prevLength) {
    prevLength = translated.length;
    translated = translated.replace(
      /\b(ref|vh|SUM_ANEXO|round|REDONDEO|ROUND2|round2|pct|sum|average|IF|SI|if|valor)\s*\(([^)]+)\)/gi,
      (match) => {
        if (match.includes('__PH')) return match;
        placeholders.push(match);
        return phKey(placeholders.length - 1);
      }
    );
  }

  // Handle bare IDs/Classes (numeric only identifiers)
  // We only translate tokens that are purely digits and dots to avoid clashing with identifiers like "A1"
  const tokenRegex = /(?<![a-zA-Z0-9_.])(\d+(?:\.\d+)?)(?![a-zA-Z0-9_.])/g;
  translated = translated.replace(tokenRegex, (match) => {
    if (knownIds.has(match) || knownClasses.has(match)) {
      return `ref('${match}')`;
    }
    return match;
  });

  // Restore placeholders
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
    parser?: Parser,
    warnings?: any[]
): any {
    try {
        if (expression === null || expression === undefined) return 0;
        const p = parser || createSharedParser();
        let formula = String(expression).trim();
        if (formula.startsWith('=')) formula = formula.substring(1);
        if (!isNaN(Number(formula)) && formula !== '') return Number(formula);

        const expr = p.parse(formula);
        const context: any = { ...row, header, QUANTITY: Number(header?.quantity || 0) };

        if (annexes) {
            annexes.forEach(a => {
                let sum = new Decimal(0);
                (a.data || []).forEach((r: any) => {
                   const val = [r.importe, r.total, r.amount, r.value, r.cost].find(v => typeof v === 'number' && !isNaN(v)) ?? 0;
                   sum = sum.plus(new Decimal(Number(val) || 0));
                });
                context[`TotalAnexo${a.id}`] = sum.toNumber();
                context[`Total${a.id}`] = sum.toNumber();
            });
        }

        return expr.evaluate(context);
    } catch (e) {
        if (warnings) warnings.push(String(e));
        return 0;
    }
}

export function evaluateHeaderExpressionShared(
    expression: string,
    header: any,
    annexes: any[],
    meta: any,
    parser?: Parser
): any {
    try {
        if (!expression || typeof expression !== 'string' || !expression.startsWith('=')) return expression;
        const p = parser || createSharedParser();
        const formula = expression.substring(1);
        const expr = p.parse(formula);
        const context = { ...header, ...meta };
        return expr.evaluate(context);
    } catch (e) {
        return expression;
    }
}
