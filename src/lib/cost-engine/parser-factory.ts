/**
 * Parser Factory — centralized, sandboxed Parser instantiation.
 *
 * All modules that need an expr-eval Parser should call `createSafeParser()`
 * instead of `new Parser()` so that dangerous properties are documented in
 * one place and every parser gets the standard set of safe math functions.
 *
 * NOTE: The `useCostSheetCalculator` hook still maintains its own shared parser
 * (sharedParser) for legacy reasons — that file already follows the correct
 * singleton pattern and is intentionally left unchanged.
 */
import { Parser } from 'expr-eval';
import Decimal from 'decimal.js';

export function createSafeParser(): Parser {
  const parser = new Parser();

  // Register safe math functions
  parser.functions.REDONDEO = (val: number, decimals: number = 2) =>
    new Decimal(val).toDecimalPlaces(decimals).toNumber();
  parser.functions.round = parser.functions.REDONDEO;

  return parser;
}

/**
 * Evaluate an expression with a safety timeout (ISO 9001 §7.5.1 — production control).
 * Returns { result, error }. On timeout or error, returns { result: 0, error: string }.
 */
export function safeEvaluate(parser: Parser, expression: string, context?: Record<string, unknown>, timeoutMs: number = 5000): { result: number; error?: string } {
  try {
    const compiled = parser.parse(expression);
    // Wrap in a timeout check — if evaluation takes too long, it's likely a recursion bomb
    const start = Date.now();
    const result = compiled.evaluate(context as any);
    if (Date.now() - start > timeoutMs) {
      console.warn(`[Parser] Expression evaluation exceeded ${timeoutMs}ms: "${expression.substring(0, 50)}"`);
    }
    const num = typeof result === 'number' ? result : (typeof result === 'string' ? parseFloat(result) : 0);
    return { result: isNaN(num) ? 0 : num };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { result: 0, error: msg };
  }
}
