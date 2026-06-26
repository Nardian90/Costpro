import { logger } from '@/lib/logger';
import { Parser, type Expression } from './safe-parser';
import Decimal from 'decimal.js';

type ExprValue = string | number | boolean | null | undefined;

export function createSafeParser(): Parser {
  const parser = new Parser();

  // Register safe math functions
  parser.functions.REDONDEO = (val: number, decimals: number = 2) =>
    new Decimal(val || 0).toDecimalPlaces(decimals).toNumber();
  parser.functions.round = parser.functions.REDONDEO;
  parser.functions.ROUND2 = (val: number) => new Decimal(val || 0).toDecimalPlaces(2).toNumber();
  parser.functions.SUMA = (...args: number[]) => args.reduce((a, b) => new Decimal(a || 0).add(b || 0).toNumber(), 0);
  parser.functions.SUM = parser.functions.SUMA;
  parser.functions.SI = (cond: unknown, t: unknown, f: unknown) => cond ? t : f;
  parser.functions.IF = parser.functions.SI;

  return parser;
}

export function safeEvaluate(parser: Parser, expression: string, context?: Record<string, ExprValue>, timeoutMs: number = 5000): { result: number; error?: string } {
  try {
    const compiled = parser.parse(expression);
    const start = Date.now();
    // expr-eval Expression.evaluate expects { [key: string]: Value }
    const result = (compiled as { evaluate(ctx?: Record<string, ExprValue>): ExprValue }).evaluate(context);
    if (Date.now() - start > timeoutMs) {
      logger.warn('COST_SHEET', `[Parser] Expression evaluation exceeded ${timeoutMs}ms: "${expression.substring(0, 50)}"`);
    }

    if (typeof result === 'number') return { result };
    if (typeof result === 'string') {
        const num = parseFloat(result);
        return { result: isNaN(num) ? parseFloat(String(result)) || 0 : num };
    }
    return { result: 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { result: 0, error: msg };
  }
}
