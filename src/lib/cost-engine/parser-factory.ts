import { Parser } from 'expr-eval';
import Decimal from 'decimal.js';

export function createSafeParser(): Parser {
  const parser = new Parser();

  // Register safe math functions
  parser.functions.REDONDEO = (val: number, decimals: number = 2) =>
    new Decimal(val || 0).toDecimalPlaces(decimals).toNumber();
  parser.functions.round = parser.functions.REDONDEO;
  parser.functions.ROUND2 = (val: any) => new Decimal(val || 0).toDecimalPlaces(2).toNumber();
  parser.functions.SUMA = (...args: any[]) => args.reduce((a, b) => new Decimal(a || 0).add(b || 0).toNumber(), 0);
  parser.functions.SUM = parser.functions.SUMA;
  parser.functions.SI = (cond: any, t: any, f: any) => cond ? t : f;
  parser.functions.IF = parser.functions.SI;

  return parser;
}

export function safeEvaluate(parser: Parser, expression: string, context?: Record<string, unknown>, timeoutMs: number = 5000): { result: number; error?: string } {
  try {
    const compiled = parser.parse(expression);
    const start = Date.now();
    const result = compiled.evaluate(context as any);
    if (Date.now() - start > timeoutMs) {
      console.warn(`[Parser] Expression evaluation exceeded ${timeoutMs}ms: "${expression.substring(0, 50)}"`);
    }

    if (typeof result === 'number') return { result };
    if (typeof result === 'string') {
        const num = parseFloat(result);
        return { result: isNaN(num) ? result as any : num };
    }
    return { result: 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { result: 0, error: msg };
  }
}
